// Snap back (handoff 5.7): every 2 seconds the hub asks each TV in kid mode which app is on, and compares it with
// what the hub launched there. Anything else (the Home button, the Netflix, Hulu or Prime buttons on the remote, any
// other channel) is reversed: the hub relaunches the playlist's title, or the Popcorn Pilot channel when nothing is
// playing, and the adults get an alert (in the app only) when that kid's "Alert me" is on. Roku does not let an app
// disable those buttons; this is how they are neutralized. A TV in adult use is never touched.
import { getDb } from './db';
import { now } from './clock';
import { getTv } from './tvs';
import { driverFor, lastHubWake } from './devices';
import { logActivity } from './activity';
import { addAlert, kidRules } from './safeguards';
import { channelAppId, kidModeProfile } from './tvstate';
import { openAtPowerOn, snapBackRelaunch } from './playback';
import { routineRunning } from './routines';

/** After the hub launches something, how long the TV gets to show it before a different app counts as a change. */
export const LAUNCH_GRACE_MS = 6_000;
const OFFLINE_BACKOFF_MS = 10_000;
const FAIL_BACKOFF_MS = 30_000;

interface Watch {
  lastOkAt: number | null;
  standby: boolean;
  backoffUntil: number;
  failing: boolean;
}

const watches = new Map<number, Watch>();

/** Tests only: forget what the watcher knew about each TV. */
export function resetSnapBackForTests(): void {
  watches.clear();
}

interface Row {
  tv_id: number;
  profile_id: number;
  expected_app: string | null;
  expected_at: number | null;
}

export interface SnapBack {
  tvId: number;
  from: string;
  to: string;
  alerted: boolean;
}

/** One pass over the TVs in kid mode. Returns the snap backs it made. Uses real time for its own waits. */
export async function snapBackPass(): Promise<SnapBack[]> {
  const rows = getDb()
    .prepare(
      `SELECT s.tv_id, s.profile_id, s.expected_app, s.expected_at FROM tv_state s
       JOIN profiles p ON p.id = s.profile_id AND p.type = 'kid' AND p.deleted_at IS NULL
       JOIN tvs t ON t.id = s.tv_id AND t.deleted_at IS NULL`,
    )
    .all() as Row[];
  const out: SnapBack[] = [];
  for (const r of rows) {
    const rules = kidRules(r.profile_id);
    const tv = getTv(r.tv_id);
    if (!rules || !rules.snapBack || !tv) continue;
    const w = watches.get(tv.id) ?? { lastOkAt: null, standby: false, backoffUntil: 0, failing: false };
    watches.set(tv.id, w);
    const real = Date.now();
    if (real < w.backoffUntil) continue;
    const expected = r.expected_app ?? channelAppId();
    if (r.expected_at !== null && now() - r.expected_at < LAUNCH_GRACE_MS) {
      w.lastOkAt = real;
      continue;
    }
    const d = driverFor(tv, 1500);
    let app: { id: string | null; name: string };
    try {
      app = await d.activeApp();
    } catch {
      w.backoffUntil = real + OFFLINE_BACKOFF_MS;
      continue;
    }
    if (app.id === expected) {
      w.lastOkAt = Date.now();
      w.standby = false;
      w.failing = false;
      continue;
    }
    // A different app. A TV that is off (standby) is left alone until it is turned on again.
    let power: string;
    try {
      power = (await d.deviceInfo()).powerMode;
    } catch {
      w.backoffUntil = real + OFFLINE_BACKOFF_MS;
      continue;
    }
    if (power === 'standby') {
      w.standby = true;
      continue;
    }
    const justTurnedOn = w.standby;
    w.standby = false;
    let back: { what: 'title' | 'channel'; name: string } | null;
    try {
      back = await snapBackRelaunch(tv.id, r.expected_at);
      if (!back) continue; // the hub launched something meanwhile
    } catch (err) {
      if (!w.failing) {
        logActivity({ pinType: 'hub', device: 'Hub', action: 'snapback.failed', summary: `Snap back on ${tv.name} could not relaunch: ${err instanceof Error ? err.message : 'error'}` });
      }
      w.failing = true;
      w.backoffUntil = Date.now() + FAIL_BACKOFF_MS;
      continue;
    }
    w.failing = false;
    const secs = Math.max(1, Math.round((Date.now() - (w.lastOkAt ?? real - 2_000)) / 1000));
    w.lastOkAt = Date.now();
    const target = back.what === 'title' ? `back to ${back.name}` : 'back to Popcorn Pilot';
    if (justTurnedOn) {
      logActivity({ pinType: 'hub', device: 'Hub', action: 'snapback.power_on', summary: `${tv.name} was turned on in kid mode (${rules.name}): opened ${back.name}` });
      out.push({ tvId: tv.id, from: app.name, to: back.name, alerted: false });
      continue;
    }
    const pressedHome = app.id === null;
    const kind = pressedHome ? 'home' : back.what === 'title' ? 'left_playlist' : 'other_app';
    const title = pressedHome ? 'Pressed Home' : back.what === 'title' ? 'Left the playlist' : `Opened ${app.name}`;
    const detail = `${pressedHome ? '' : `Opened ${app.name} · `}${target} in ${secs} s · ${rules.name} · ${tv.name}`;
    const summary = `Snap back on ${tv.name} (${rules.name}): ${pressedHome ? 'Home was pressed' : `${app.name} was opened`}, ${target}`;
    logActivity({ pinType: 'hub', device: 'Hub', action: 'snapback', summary });
    if (rules.alertOnSnapBack) addAlert({ kind, profileId: rules.profileId, tvId: tv.id, title, detail: detail.charAt(0).toUpperCase() + detail.slice(1) }, now());
    out.push({ tvId: tv.id, from: app.name, to: back.name, alerted: rules.alertOnSnapBack });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- power on

const power = new Map<number, 'on' | 'standby'>();

/** A TV that comes on within this long after the hub opened something on it or turned it on was woken by the hub. */
export const HUB_WAKE_GRACE_MS = 30_000;

/** Tests only: forget what the power-on watcher knew about each TV. */
export function resetPowerOnForTests(): void {
  power.clear();
}

/**
 * The hub opens the Popcorn Pilot channel when a TV is turned on (handoff 9.4), so the TV starts on the Popcorn Pilot
 * home screen on its default profile. For TVs with the channel paired and not in kid mode (snap back handles those):
 * each pass asks the TV whether it is on; a change from standby to on opens the channel, unless a routine is running
 * there (it sets the TV up itself) or something is playing. The first look at a TV only records its state.
 */
export async function powerOnPass(): Promise<string[]> {
  const rows = getDb().prepare('SELECT id FROM tvs WHERE deleted_at IS NULL AND channel_token_hash IS NOT NULL').all() as { id: number }[];
  const out: string[] = [];
  for (const { id } of rows) {
    const tv = getTv(id);
    if (!tv) continue;
    let mode: 'on' | 'standby';
    try {
      mode = (await driverFor(tv, 1500).deviceInfo()).powerMode === 'standby' ? 'standby' : 'on';
    } catch {
      continue;
    }
    const was = power.get(id);
    power.set(id, mode);
    if (was !== 'standby' || mode !== 'on') continue;
    if (kidModeProfile(id) !== null || routineRunning(id)) continue;
    // The hub woke it itself (a trailer, a playlist, a routine): not a person turning it on.
    const woke = lastHubWake(tv);
    if (woke !== null && Date.now() - woke < HUB_WAKE_GRACE_MS) continue;
    try {
      const words = await openAtPowerOn(id);
      if (words) out.push(words);
    } catch (err) {
      logActivity({ pinType: 'hub', device: 'Hub', action: 'tv.power_on_failed', summary: `${tv.name} was turned on; could not open Popcorn Pilot: ${err instanceof Error ? err.message : 'error'}` });
    }
  }
  return out;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Start the watcher on the hub (instrumentation.ts). PP_SNAPBACK_MS sets the interval (default 2000; 0 turns it off). */
export function startSnapBackWatcher(ms = Number(process.env.PP_SNAPBACK_MS ?? 2_000)): void {
  if (timer || !(ms > 0)) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    snapBackPass()
      .catch((err) => console.error('snap back:', err instanceof Error ? err.message : err))
      .then(() => powerOnPass())
      .catch((err) => console.error('power on:', err instanceof Error ? err.message : err))
      .finally(() => {
        running = false;
      });
  }, ms);
  timer.unref();
}

export function stopSnapBackWatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
