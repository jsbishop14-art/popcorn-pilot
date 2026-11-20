// The playback engine on the hub (handoff 6): plays a playlist on one or both TVs, moves through the titles by each
// title's mode, loop and shuffle, scheduled starts, the live queue per TV, Send to, and the remote. Kid rules are
// checked again here at every launch (a kid profile never gets a title its rules do not allow), and every control
// action goes into Activity history.
//
// Timing is approximate: streaming apps do not reliably report playback position, so the hub counts playing time
// itself (paused time does not count) and moves on when a title's time is up. All times come from now(), which the
// tests replace with a fake clock.
//
// Kid safeguards (PP4, handoff 5) are enforced here too: a kid start outside viewing hours or with no time left is
// refused; the time warning; the stop at the episode boundary nearest the limit, then the TV turns off; bedtime
// wind-down (calm titles only, the volume steps down); the watch log; and the TV's kid mode for snap back.
import { getDb } from './db';
import { now, setClockForTests } from './clock';
import type { PlaybackRow, PlaylistsRow, QueueItemsRow } from './db/types.gen';
import { BadRequest, HttpError } from './route';
import { getTv, listTvs, type Tv } from './tvs';
import { driverFor } from './devices';
import { DeviceError, type RemoteKey } from './devices/types';
import { CatalogUnavailable, EVERYONE, SERVICE_INFO, allows, artUrl, playOnTv, taggedTitles, viewerForProfile, type Viewer } from './catalog';
import { logActivity, type ActivityPin } from './activity';
import { DAYS, ITEM_COLUMNS, cleanMode, itemAllowed, itemMinutes, itemValues, modeLabel, quickId, rowFields, titleFields, type ItemFields, type ModeInput } from './playlists';
import { addAlert, checkKidStart, kidRules, openWatch, syncWatch, timeStatus, type KidRules, type TimeStatus } from './safeguards';
import { addVolumeSteps, channelAppId, kidModeProfile, noteLaunch, setTvProfile, tvState, type SetBy } from './tvstate';

const MIN = 60_000;

// ---------------------------------------------------------------------------------------------- clock, order

let randomFn: () => number = Math.random;

export { now, setClockForTests };

/** Tests only: a fixed random source for shuffle (null puts Math.random back). */
export function setRandomForTests(fn: (() => number) | null): void {
  randomFn = fn ?? Math.random;
}

// Engine changes run one at a time (API calls and the timer), so two of them never launch on a TV at once.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = chain.then(fn, fn) as Promise<T>;
  chain = run.catch(() => undefined);
  return run;
}

export interface Actor {
  pinType: 'adult' | 'guest' | 'hub';
  device: string;
}

export const HUB: Actor = { pinType: 'hub', device: 'Hub' };

/** The actor for a signed-in request (the routes only let the Adult and Guest PINs reach the engine). */
export function actorOf(auth: { role: string; device: string }): Actor {
  if (auth.role !== 'adult' && auth.role !== 'guest') throw new HttpError(403, 'Not allowed.');
  return { pinType: auth.role, device: auth.device };
}

function log(actor: Actor, action: string, summary: string) {
  logActivity({ pinType: actor.pinType as ActivityPin, device: actor.device, action, summary });
}

// ---------------------------------------------------------------------------------------------- rows

const db = () => getDb();

function livePlayback(tvId: number): PlaybackRow | undefined {
  return db().prepare("SELECT * FROM playback WHERE tv_id = ? AND state IN ('playing', 'paused')").get(tvId) as PlaybackRow | undefined;
}

function playbackRow(id: number): PlaybackRow {
  return db().prepare('SELECT * FROM playback WHERE id = ?').get(id) as PlaybackRow;
}

function queue(pbId: number): QueueItemsRow[] {
  return db().prepare('SELECT * FROM queue_items WHERE playback_id = ? ORDER BY position, id').all(pbId) as QueueItemsRow[];
}

function itemRow(id: number): QueueItemsRow | undefined {
  return db().prepare('SELECT * FROM queue_items WHERE id = ?').get(id) as QueueItemsRow | undefined;
}

function tvOr400(id: unknown): Tv {
  const n = Number(id);
  const tv = Number.isInteger(n) && n > 0 ? getTv(n) : null;
  if (!tv) throw new BadRequest('Pick a TV.');
  return tv;
}

function liveOr404(tv: Tv): PlaybackRow {
  const pb = livePlayback(tv.id);
  if (!pb) throw new HttpError(404, `Nothing is playing on ${tv.name}.`);
  return pb;
}

function profileName(id: number | null): string | null {
  if (id === null) return null;
  const r = db().prepare('SELECT name FROM profiles WHERE id = ?').get(id) as { name: string } | undefined;
  return r?.name ?? null;
}

/** The rules a playback plays under. A profile deleted since the start fails closed (nothing is allowed). */
function viewerOf(pb: Pick<PlaybackRow, 'profile_id'>): Viewer {
  if (pb.profile_id === null) return EVERYONE;
  return viewerForProfile(pb.profile_id) ?? { profileId: pb.profile_id, profileName: 'a deleted profile', kid: true, allowedRatings: new Set(), blocked: new Set() };
}

function insertQueueItem(pbId: number, position: number, f: ItemFields, status = 'pending', note: string | null = null): number {
  const cols = ITEM_COLUMNS.split(',').map(() => '?').join(', ');
  return Number(
    db()
      .prepare(`INSERT INTO queue_items (playback_id, position, ${ITEM_COLUMNS}, status, note) VALUES (?, ?, ${cols}, ?, ?)`)
      .run(pbId, position, ...itemValues(f), status, note).lastInsertRowid,
  );
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Give the pending items new positions after everything else, in a random order. */
function shufflePending(pbId: number) {
  const items = queue(pbId);
  const pending = items.filter((i) => i.status === 'pending');
  let pos = Math.max(0, ...items.filter((i) => i.status !== 'pending').map((i) => i.position));
  for (const i of shuffled(pending)) db().prepare('UPDATE queue_items SET position = ? WHERE id = ?').run(++pos, i.id);
}

function playedMs(pb: PlaybackRow, at: number): number {
  return pb.item_played_ms + (pb.state === 'playing' && pb.item_resumed_at !== null ? Math.max(0, at - pb.item_resumed_at) : 0);
}

// ---------------------------------------------------------------------------------------------- moving through titles

/** Plain words for why a title did not start (the full detail is kept in the queue item's note). */
function failReason(err: unknown, viewer: Viewer): string {
  if (err instanceof HttpError && err.status === 404) return viewer.kid ? `not allowed for ${viewer.profileName}` : 'it is not in the catalog any more';
  if (err instanceof HttpError && err.status === 502) return /did not answer/.test(err.message) ? 'the TV did not answer' : 'the TV did not start it';
  if (err instanceof CatalogUnavailable) return 'the catalog could not be reached';
  if (err instanceof Error) return err.message.replace(/\.$/, '');
  return 'it did not start';
}

/**
 * Launch the next pending title. A title that fails to launch is marked failed, the household is told why (the
 * playback's message), and the next title is tried. With loop on, the titles played so far start again (reshuffled
 * when shuffle is on). Ends the playback when nothing is left.
 */
async function advance(pbId: number, at: number): Promise<void> {
  const tv = getTv(playbackRow(pbId).tv_id);
  for (let guard = 0; guard < 1000; guard++) {
    const pb = playbackRow(pbId);
    if (pb.state !== 'playing' && pb.state !== 'paused') return;
    const next = db().prepare("SELECT * FROM queue_items WHERE playback_id = ? AND status = 'pending' ORDER BY position, id LIMIT 1").get(pbId) as QueueItemsRow | undefined;
    if (!next) {
      if (pb.loop) {
        // Titles a person played or skipped start again; ones the hub could not play (failed, not allowed, the
        // Family Album before PP5) do not, so a loop of titles that all fail still ends.
        const reset = db().prepare("UPDATE queue_items SET status = 'pending' WHERE playback_id = ? AND status IN ('done', 'skipped') AND note IS NULL").run(pbId);
        if (reset.changes > 0) {
          if (pb.shuffle) shufflePending(pbId);
          continue;
        }
      }
      db().prepare("UPDATE playback SET state = 'ended', ended_at = ?, current_item_id = NULL, item_resumed_at = NULL WHERE id = ?").run(at, pbId);
      log(HUB, 'playback.end', `${pb.name} finished on ${tv?.name ?? 'a TV'}`);
      return;
    }
    const f = rowFields(next);
    if (f.kind === 'album') {
      const note = 'The Family Album arrives in a later build (PP5); skipped for now.';
      db().prepare("UPDATE queue_items SET status = 'skipped', note = ? WHERE id = ?").run(note, next.id);
      db().prepare('UPDATE playback SET message = ? WHERE id = ?').run(`Skipped the Family Album: it arrives in a later build.`, pbId);
      continue;
    }
    const rules = pb.profile_id !== null ? kidRules(pb.profile_id) : null;
    if (rules) {
      const gate = await kidGate(pb, rules, next, f, at);
      if (gate === 'stopped') return;
      if (gate === 'skip') continue;
    }
    const viewer = viewerOf(pb);
    try {
      if (!tv) throw new Error('the TV was removed');
      const r = await playOnTv(viewer, f.titleKey as string, { tvId: tv.id, service: f.service });
      db().prepare("UPDATE queue_items SET status = 'playing', launch_route = ? WHERE id = ?").run(r.route, next.id);
      db().prepare("UPDATE playback SET current_item_id = ?, item_played_ms = 0, item_resumed_at = ?, state = 'playing', kid_ep_seen = -1 WHERE id = ?").run(next.id, at, pbId);
      openWatch(playbackRow(pbId), next, at);
      log(HUB, 'playback.next', `Started ${f.name} on ${tv.name} (${pb.name}, ${SERVICE_INFO[r.service as keyof typeof SERVICE_INFO]?.name ?? r.service}, ${r.route === 'deep_link' ? 'direct link' : 'search launch'})`);
      return;
    } catch (err) {
      const reason = failReason(err, viewer);
      const detail = err instanceof Error && !(err instanceof HttpError && err.status === 404) ? `${reason} (${err.message.replace(/\.$/, '')})` : reason;
      db().prepare("UPDATE queue_items SET status = 'failed', note = ? WHERE id = ?").run(detail, next.id);
      const msg = `Could not start ${f.name} on ${tv?.name ?? 'the TV'}: ${reason}. Moved to the next title.`;
      db().prepare('UPDATE playback SET message = ?, current_item_id = NULL WHERE id = ?').run(msg, pbId);
      log(HUB, 'playback.launch_failed', msg);
    }
  }
}

function finishCurrent(pb: PlaybackRow, status: 'done' | 'skipped', at: number) {
  syncWatch(pb, at, true);
  if (pb.current_item_id !== null) db().prepare("UPDATE queue_items SET status = ? WHERE id = ? AND status = 'playing'").run(status, pb.current_item_id);
  db().prepare('UPDATE playback SET current_item_id = NULL, item_played_ms = 0, item_resumed_at = NULL WHERE id = ?').run(pb.id);
}

function stopLive(tv: Tv, at: number, message: string): PlaybackRow | null {
  const pb = livePlayback(tv.id);
  if (!pb) return null;
  finishCurrent(pb, 'done', at);
  db().prepare("UPDATE playback SET state = 'stopped', ended_at = ?, message = ? WHERE id = ?").run(at, message, pb.id);
  return pb;
}

// ---------------------------------------------------------------------------------------------- kid rules

/** One episode of a title (a movie is one long episode), for the episode aware stop. */
function episodeMs(f: Pick<ItemFields, 'titleKind' | 'episodeMinutes' | 'runtimeMinutes'>): number {
  return (f.titleKind === 'movie' ? (f.runtimeMinutes ?? 90) : (f.episodeMinutes ?? 30)) * MIN;
}

function isCalm(key: string | null): boolean {
  if (!key) return false;
  return !!db().prepare('SELECT 1 FROM title_tags WHERE title_key = ? AND calm = 1').get(key);
}

function windingDown(rules: KidRules, s: TimeStatus): boolean {
  return rules.windDown && s.remainingMs <= rules.windDownMinutes * MIN;
}

/** Why the kid's time ran out: the end of viewing hours when that came before the end of today's minutes. */
function stopReason(s: TimeStatus): 'time' | 'hours' {
  return s.leftMs > s.remainingMs ? 'hours' : 'time';
}

/** Launch the Popcorn Pilot channel on a TV (the kid home screen), and expect it there. */
async function launchChannel(tv: Tv, at: number): Promise<void> {
  const id = channelAppId();
  noteLaunch(tv.id, id, at);
  await driverFor(tv).launch({ channelId: id });
}

/**
 * Time is up (or viewing hours ended): the playback stops, the TV turns off, and the adults get an alert. The TV
 * stays in kid mode, so snap back still brings Popcorn Pilot back if the TV is turned on again.
 */
async function timeUp(pbId: number, rules: KidRules, at: number, reason: 'time' | 'hours' | 'calm'): Promise<void> {
  const pb = playbackRow(pbId);
  const tv = getTv(pb.tv_id);
  const cur = pb.current_item_id !== null ? itemRow(pb.current_item_id) : undefined;
  finishCurrent(pb, 'done', at);
  const why = reason === 'hours' ? `Viewing hours ended for ${rules.name}` : reason === 'calm' ? `Time is up for ${rules.name} (no calm titles left for wind-down)` : `Time is up for ${rules.name}`;
  let off = false;
  if (tv) {
    noteLaunch(tv.id, channelAppId(), at);
    try {
      await driverFor(tv).keypress('PowerOff');
      off = true;
    } catch {
      off = false;
    }
  }
  db().prepare("UPDATE playback SET state = 'stopped', ended_at = ?, message = ? WHERE id = ?").run(at, `${why}. ${off ? 'The TV was turned off.' : 'The TV did not answer to turn off.'}`, pb.id);
  const detail = `${cur ? `Finished ${cur.name}` : 'Stopped'}, ${off ? 'TV turned off' : 'the TV did not answer to turn off'} · ${rules.name} · ${tv?.name ?? 'a TV'}`;
  addAlert({ kind: 'time_up', profileId: rules.profileId, tvId: pb.tv_id, title: reason === 'hours' ? 'Viewing hours ended' : 'Time is up', detail }, at);
  log(HUB, 'kid.time_up', `${why}: stopped ${pb.name} on ${tv?.name ?? 'a TV'}${off ? ' and turned the TV off' : ''}`);
}

/**
 * Before a kid's next title starts: outside viewing hours, or not enough time left for (the nearest boundary of) an
 * episode, time is up. In wind-down only calm titles play: others are skipped, and when the queue has no calm title
 * left, one from the household's calm list (that this kid may watch) is added.
 */
async function kidGate(pb: PlaybackRow, rules: KidRules, next: QueueItemsRow, f: ItemFields, at: number): Promise<'ok' | 'skip' | 'stopped'> {
  const s = timeStatus(rules, at);
  if (!s.inHours) {
    await timeUp(pb.id, rules, at, 'hours');
    return 'stopped';
  }
  // The episode aware stop: the boundary nearest the limit. Before an episode starts, that is "now" when less than
  // half of it fits; with "finish the current episode" off, time is up only at the limit itself.
  if (rules.finishEpisode ? s.remainingMs <= episodeMs(f) / 2 : s.remainingMs <= 0) {
    await timeUp(pb.id, rules, at, stopReason(s));
    return 'stopped';
  }
  if (windingDown(rules, s)) {
    if (pb.kid_wind_down_at === null) startWindDown(pb, rules, at);
    if (!isCalm(f.titleKey)) {
      db().prepare("UPDATE queue_items SET status = 'skipped', note = ? WHERE id = ?").run('not a calm title (bedtime wind-down)', next.id);
      const calmLeft = (db().prepare("SELECT title_key FROM queue_items WHERE playback_id = ? AND status = 'pending' AND kind = 'title'").all(pb.id) as { title_key: string }[]).some((r) => isCalm(r.title_key));
      if (!calmLeft) {
        const viewer = viewerOf(pb);
        const pick = taggedTitles('calm').find((t) => allows(viewer, { key: t.key, rating: t.rating } as Parameters<typeof allows>[1]) && t.key !== f.titleKey);
        let added: ItemFields | null = null;
        if (pick) {
          try {
            added = await titleFields(viewer, pick.key, undefined, { mode: 'indefinite' });
          } catch {
            added = null;
          }
        }
        if (!added) {
          await timeUp(pb.id, rules, at, 'calm');
          return 'stopped';
        }
        const pos = Math.max(0, ...queue(pb.id).map((x) => x.position)) + 1;
        insertQueueItem(pb.id, pos, added);
        log(HUB, 'kid.wind_down_add', `Bedtime wind-down: added ${added.name} (calm) for ${rules.name} on ${getTv(pb.tv_id)?.name ?? 'a TV'}`);
      }
      return 'skip';
    }
  }
  return 'ok';
}

function startWindDown(pb: PlaybackRow, rules: KidRules, at: number) {
  db().prepare('UPDATE playback SET kid_wind_down_at = ? WHERE id = ?').run(at, pb.id);
  log(HUB, 'kid.wind_down', `Bedtime wind-down began for ${rules.name} on ${getTv(pb.tv_id)?.name ?? 'a TV'}: calm titles only, the volume steps down`);
}

/** How often the volume steps down during wind-down. */
export const VOLUME_STEP_MS = 3 * MIN;

/**
 * The kid rules on each engine step, for a kid's playback with a title on: the watch log, the time warning,
 * wind-down (and its volume steps), and the stop at the episode boundary nearest the limit. Returns whether the
 * playback moved on (stopped, or went to the next title).
 */
async function kidTick(pb: PlaybackRow, rules: KidRules, cur: QueueItemsRow, at: number): Promise<boolean> {
  syncWatch(pb, at);
  const tv = getTv(pb.tv_id);
  const s = timeStatus(rules, at);
  if (pb.kid_warned_at === null && s.remainingMs <= rules.warningMinutes * MIN) {
    const mins = Math.max(1, Math.ceil(s.remainingMs / MIN));
    db().prepare('UPDATE playback SET kid_warned_at = ? WHERE id = ?').run(at, pb.id);
    addAlert({ kind: 'time_warning', profileId: rules.profileId, tvId: pb.tv_id, title: `${mins} minute${mins === 1 ? '' : 's'} left`, detail: `${rules.name} · ${tv?.name ?? 'a TV'}` }, at);
    log(HUB, 'kid.warning', `Time warning for ${rules.name} on ${tv?.name ?? 'a TV'}: ${mins} min left`);
  }
  const wind = windingDown(rules, s);
  if (wind) {
    if (pb.kid_wind_down_at === null) startWindDown(pb, rules, at);
    if (tv && (pb.kid_volume_at === null || at - pb.kid_volume_at >= VOLUME_STEP_MS)) {
      db().prepare('UPDATE playback SET kid_volume_at = ? WHERE id = ?').run(at, pb.id);
      try {
        await driverFor(tv).keypress('VolumeDown');
        addVolumeSteps(tv.id, 1);
      } catch {
        // the next step tries again
      }
    }
  }
  const f = rowFields(cur);
  const p = playedMs(pb, at);
  if (!rules.finishEpisode) {
    if (s.remainingMs <= 0) {
      await timeUp(pb.id, rules, at, stopReason(s));
      return true;
    }
    return false;
  }
  const e = episodeMs(f);
  const k = Math.floor(p / e);
  if (k > pb.kid_ep_seen) {
    db().prepare('UPDATE playback SET kid_ep_seen = ? WHERE id = ?').run(k, pb.id);
    if (k > 0) {
      // An episode just ended. What was left at that boundary decides: stop here when the limit is nearer to this
      // boundary than to the next one.
      const leftAtBoundary = s.remainingMs + (p - k * e);
      if (leftAtBoundary <= e / 2) {
        await timeUp(pb.id, rules, at, stopReason(s));
        return true;
      }
      if (wind && !isCalm(f.titleKey)) {
        finishCurrent(pb, 'done', at);
        await advance(pb.id, at);
        return true;
      }
    }
  }
  return false;
}

/** Set the TV's profile when something starts there for a profile (kid mode follows it). */
function followProfile(tv: Tv, profileId: number | null, actor: Actor, at: number) {
  setTvProfile(tv.id, profileId, actor.pinType as SetBy, at);
}

/** After a wind-down turned the volume down on a TV, the next start there turns it back up by the same steps. */
async function restoreVolume(tv: Tv) {
  const steps = tvState(tv.id)?.volume_steps ?? 0;
  if (steps <= 0) return;
  addVolumeSteps(tv.id, -steps);
  try {
    for (let i = 0; i < steps; i++) await driverFor(tv).keypress('VolumeUp');
    log(HUB, 'kid.volume_restore', `Turned the volume on ${tv.name} back up ${steps} step${steps === 1 ? '' : 's'} (after bedtime wind-down)`);
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------------------------- start

export interface StartInput {
  playlistId: number;
  tvIds: unknown;
  /** Profile id; empty means the TV's default profile. The Guest PIN starts for a kid profile only. */
  profile?: unknown;
}

function startProfile(actor: Actor, tv: Tv, profile: unknown): Viewer {
  let v: Viewer;
  if (profile === undefined || profile === null || profile === '') {
    v = tv.defaultProfileId ? (viewerForProfile(tv.defaultProfileId) ?? EVERYONE) : EVERYONE;
  } else {
    const n = Number(profile);
    const got = Number.isInteger(n) && n > 0 ? viewerForProfile(n) : null;
    if (!got) throw new BadRequest('That profile does not exist.');
    v = got;
  }
  if (actor.pinType === 'guest' && !v.kid) throw new HttpError(403, 'With the Guest PIN, start for a kid profile.');
  return v;
}

async function startLocked(actor: Actor, input: StartInput, at: number): Promise<number[]> {
  const pl = db().prepare('SELECT * FROM playlists WHERE id = ? AND deleted_at IS NULL').get(input.playlistId) as PlaylistsRow | undefined;
  if (!pl) throw new HttpError(404, 'No such playlist.');
  const ids = Array.isArray(input.tvIds) ? [...new Set(input.tvIds.map(Number))] : [];
  if (!ids.length) throw new BadRequest('Pick a TV.');
  const tvs = ids.map(tvOr400);
  const viewers = tvs.map((tv) => startProfile(actor, tv, input.profile));
  const items = db().prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position, id').all(pl.id) as Parameters<typeof rowFields>[0][];
  if (!items.length) throw new BadRequest('This playlist has no titles yet.');
  const name = pl.quick ? 'Quick playlist' : pl.name;
  // Kid rules first, for every TV, before anything changes: viewing hours and time left.
  tvs.forEach((tv, i) => {
    if (viewers[i].kid && viewers[i].profileId !== null) checkKidStart(viewers[i].profileId as number, tv, at);
  });
  const out: number[] = [];
  for (const [i, tv] of tvs.entries()) {
    const v = viewers[i];
    stopLive(tv, at, `Replaced by ${name}`);
    followProfile(tv, v.profileId, actor, at);
    await restoreVolume(tv);
    const pbId = Number(
      db()
        .prepare("INSERT INTO playback (tv_id, playlist_id, name, profile_id, state, loop, shuffle, started_by, started_at) VALUES (?, ?, ?, ?, 'playing', ?, ?, ?, ?)")
        .run(tv.id, pl.id, name, v.profileId, pl.loop, pl.shuffle, actor.pinType, at).lastInsertRowid,
    );
    items.forEach((r, n) => {
      const f = rowFields(r);
      // The kid rules on the hub: a title this profile may not watch is in the queue as not allowed, never launched.
      if (itemAllowed(v, f)) insertQueueItem(pbId, n + 1, f);
      else insertQueueItem(pbId, n + 1, f, 'failed', `not allowed for ${v.profileName}`);
    });
    if (pl.shuffle) shufflePending(pbId);
    const who = v.profileName ? ` for ${v.profileName}` : '';
    log(actor, 'playback.start', `Started ${name} on ${tv.name}${who}${actor.pinType === 'hub' ? ' (schedule)' : ''}`);
    await advance(pbId, at);
    out.push(pbId);
  }
  return out;
}

export function startPlaylist(actor: Actor, input: StartInput): Promise<number[]> {
  return serial(() => startLocked(actor, input, now()));
}

// ---------------------------------------------------------------------------------------------- the timer

/** One engine step: move on from titles whose time is up, and start scheduled playlists. */
export function tick(): Promise<{ advanced: number; started: number }> {
  return serial(async () => {
    const at = now();
    let advanced = 0;
    const live = db().prepare("SELECT * FROM playback WHERE state = 'playing'").all() as PlaybackRow[];
    for (const pb of live) {
      const cur = pb.current_item_id !== null ? itemRow(pb.current_item_id) : undefined;
      if (!cur) {
        await advance(pb.id, at);
        advanced++;
        continue;
      }
      const rules = pb.profile_id !== null ? kidRules(pb.profile_id) : null;
      if (rules && (await kidTick(pb, rules, cur, at))) {
        advanced++;
        continue;
      }
      const mins = itemMinutes(rowFields(cur));
      if (mins !== null && playedMs(pb, at) >= mins * 60_000) {
        finishCurrent(playbackRow(pb.id), 'done', at);
        await advance(pb.id, at);
        advanced++;
      }
    }
    const started = await runSchedules(at);
    return { advanced, started };
  });
}

/** How far after its time a scheduled start still happens (a hub restarted later does not start a morning list). */
export const SCHEDULE_GRACE_MS = 10 * 60_000;

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function runSchedules(at: number): Promise<number> {
  const d = new Date(at);
  const day = DAYS[(d.getDay() + 6) % 7];
  const today = localDate(d);
  const rows = db().prepare('SELECT * FROM playlists WHERE schedule_on = 1 AND deleted_at IS NULL AND quick = 0').all() as PlaylistsRow[];
  let started = 0;
  for (const p of rows) {
    if (!p.schedule_time || !p.schedule_tv_id || p.schedule_last_run === today) continue;
    let days: string[] = [];
    try {
      days = JSON.parse(p.schedule_days) as string[];
    } catch {
      continue;
    }
    if (!days.includes(day)) continue;
    const [h, m] = p.schedule_time.split(':').map(Number);
    const when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    if (at < when || at - when > SCHEDULE_GRACE_MS) continue;
    db().prepare('UPDATE playlists SET schedule_last_run = ? WHERE id = ?').run(today, p.id);
    try {
      await startLocked(HUB, { playlistId: p.id, tvIds: [p.schedule_tv_id], profile: p.schedule_profile_id ?? undefined }, at);
      started++;
    } catch (err) {
      log(HUB, 'playback.schedule_failed', `Could not start ${p.name} on schedule: ${err instanceof Error ? err.message : 'error'}`);
    }
  }
  return started;
}

let timer: NodeJS.Timeout | null = null;

/** Start the engine timer on the hub (instrumentation.ts). PP_ENGINE_TICK_MS=0 turns it off. */
export function startEngineTimer(): void {
  const ms = Number(process.env.PP_ENGINE_TICK_MS ?? 15_000);
  if (timer || !(ms > 0)) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error('playback engine:', err instanceof Error ? err.message : err));
  }, ms);
  timer.unref();
}

// ---------------------------------------------------------------------------------------------- controls

async function key(tv: Tv, k: RemoteKey): Promise<void> {
  try {
    await driverFor(tv).keypress(k);
  } catch (err) {
    if (err instanceof DeviceError && !err.offline) throw new HttpError(502, `${tv.name}: ${err.message}`);
    throw new HttpError(502, `${tv.name} did not answer. Check it is on and on the home Wi-Fi.`);
  }
}

export type PlaybackAction = 'pause' | 'resume' | 'skip' | 'stop';

/** Pause, resume, skip or stop what a TV is playing. */
export function control(actor: Actor, tvId: number, action: unknown): Promise<string> {
  return serial(async () => {
    const at = now();
    const tv = tvOr400(tvId);
    const pb = liveOr404(tv);
    const cur = pb.current_item_id !== null ? itemRow(pb.current_item_id) : undefined;
    const what = cur ? `${cur.name} (${pb.name})` : pb.name;
    let words: string;
    switch (action) {
      case 'pause':
        if (pb.state !== 'playing') throw new BadRequest('It is already paused.');
        await key(tv, 'Play');
        syncWatch(pb, at);
        db().prepare("UPDATE playback SET state = 'paused', item_played_ms = ?, item_resumed_at = NULL WHERE id = ?").run(playedMs(pb, at), pb.id);
        words = `Paused ${what} on ${tv.name}`;
        break;
      case 'resume':
        if (pb.state !== 'paused') throw new BadRequest('It is already playing.');
        if (cur) {
          await key(tv, 'Play');
          db().prepare("UPDATE playback SET state = 'playing', item_resumed_at = ? WHERE id = ?").run(at, pb.id);
        } else {
          db().prepare("UPDATE playback SET state = 'playing' WHERE id = ?").run(pb.id);
          await advance(pb.id, at);
        }
        words = `Resumed ${what} on ${tv.name}`;
        break;
      case 'skip':
        finishCurrent(pb, 'skipped', at);
        db().prepare("UPDATE playback SET state = 'playing', message = NULL WHERE id = ?").run(pb.id);
        await advance(pb.id, at);
        words = `Skipped ${cur?.name ?? 'to the next title'} on ${tv.name} (${pb.name})`;
        break;
      case 'stop':
        stopLive(tv, at, `Stopped`);
        // In kid mode the TV goes back to the Popcorn Pilot kid home screen; otherwise to the Roku home screen.
        if (kidModeProfile(tv.id) !== null) await launchChannel(tv, at).catch(() => undefined);
        else await key(tv, 'Home').catch(() => undefined);
        words = `Stopped ${pb.name} on ${tv.name}`;
        break;
      default:
        throw new BadRequest('Action is pause, resume, skip or stop.');
    }
    log(actor, `playback.${action}`, words);
    return words;
  });
}

/**
 * Send to (handoff 2.5): pause on one TV, resume on the other. The playback on the first TV stays, paused; the other
 * TV gets the same queue and picks up the current title where it was. Anything already playing there stops.
 */
export function sendTo(actor: Actor, fromTvId: number, toTvId: unknown): Promise<string> {
  return serial(async () => {
    const at = now();
    const from = tvOr400(fromTvId);
    const to = tvOr400(toTvId);
    if (from.id === to.id) throw new BadRequest('Pick the other TV.');
    const pb = liveOr404(from);
    let note = '';
    if (pb.state === 'playing') {
      try {
        await key(from, 'Play');
      } catch (err) {
        note = ` (${from.name} could not be paused: ${err instanceof Error ? err.message : 'error'})`;
      }
    }
    const played = playedMs(pb, at);
    syncWatch(pb, at);
    db().prepare("UPDATE playback SET state = 'paused', item_played_ms = ?, item_resumed_at = NULL, message = ? WHERE id = ?").run(played, `Sent to ${to.name}`, pb.id);
    stopLive(to, at, `Replaced by ${pb.name}, sent from ${from.name}`);
    followProfile(to, pb.profile_id, actor, at);
    const curRow = pb.current_item_id !== null ? itemRow(pb.current_item_id) : undefined;
    const epSeen = curRow ? Math.floor(played / episodeMs(rowFields(curRow))) : -1;
    const newId = Number(
      db()
        .prepare("INSERT INTO playback (tv_id, playlist_id, name, profile_id, state, loop, shuffle, item_played_ms, started_by, started_at, kid_ep_seen, kid_warned_at, kid_wind_down_at, kid_volume_at) VALUES (?, ?, ?, ?, 'playing', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(to.id, pb.playlist_id, pb.name, pb.profile_id, pb.loop, pb.shuffle, played, actor.pinType, at, epSeen, pb.kid_warned_at, pb.kid_wind_down_at, pb.kid_volume_at).lastInsertRowid,
    );
    let current: QueueItemsRow | null = null;
    for (const r of queue(pb.id)) {
      const isCur = r.id === pb.current_item_id;
      const id = insertQueueItem(newId, r.position, rowFields(r), isCur ? 'pending' : r.status, r.note);
      if (isCur) current = { ...r, id };
    }
    const viewer = viewerOf(pb);
    if (current) {
      try {
        const r = await playOnTv(viewer, current.title_key as string, { tvId: to.id, service: current.service });
        db().prepare("UPDATE queue_items SET status = 'playing', launch_route = ? WHERE id = ?").run(r.route, current.id);
        db().prepare('UPDATE playback SET current_item_id = ?, item_resumed_at = ? WHERE id = ?').run(current.id, at, newId);
        openWatch(playbackRow(newId), current, at);
      } catch (err) {
        const reason = failReason(err, viewer);
        db().prepare("UPDATE queue_items SET status = 'failed', note = ? WHERE id = ?").run(reason, current.id);
        db().prepare('UPDATE playback SET message = ?, item_played_ms = 0 WHERE id = ?').run(`Could not start ${current.name} on ${to.name}: ${reason}. Moved to the next title.`, newId);
        await advance(newId, at);
      }
    } else {
      db().prepare('UPDATE playback SET item_played_ms = 0 WHERE id = ?').run(newId);
      await advance(newId, at);
    }
    const words = `Sent ${pb.name} from ${from.name} to ${to.name}${note}`;
    log(actor, 'playback.send', words);
    return words;
  });
}

// ---------------------------------------------------------------------------------------------- live queue

export interface QueueEdit extends ModeInput {
  action?: unknown;
  itemId?: unknown;
  direction?: unknown;
  titleKey?: unknown;
  service?: unknown;
}

/** Change the live queue of a TV: move a title up or down, remove it, change its mode, or add a title. */
export function editQueue(actor: Actor, tvId: number, input: QueueEdit): Promise<string> {
  return serial(async () => {
    const at = now();
    const tv = tvOr400(tvId);
    const pb = liveOr404(tv);
    const item = () => {
      const r = itemRow(Number(input.itemId));
      if (!r || r.playback_id !== pb.id || r.status === 'removed') throw new HttpError(404, 'That title is not in the queue.');
      return r;
    };
    let words: string;
    switch (input.action) {
      case 'move': {
        const r = item();
        if (r.status !== 'pending') throw new BadRequest('Only titles still to come can be moved.');
        const pending = queue(pb.id).filter((x) => x.status === 'pending');
        const i = pending.findIndex((x) => x.id === r.id);
        const j = input.direction === 'up' ? i - 1 : input.direction === 'down' ? i + 1 : NaN;
        if (Number.isNaN(j)) throw new BadRequest('Direction is up or down.');
        if (j < 0 || j >= pending.length) throw new BadRequest(`${r.name} is already ${input.direction === 'up' ? 'first' : 'last'}.`);
        const other = pending[j];
        // Positions within a queue are distinct (start, shuffle, copy and add all keep them so): swap them.
        db().prepare('UPDATE queue_items SET position = ? WHERE id = ?').run(other.position, r.id);
        db().prepare('UPDATE queue_items SET position = ? WHERE id = ?').run(r.position, other.id);
        words = `Moved ${r.name} ${input.direction} in the ${tv.name} queue`;
        break;
      }
      case 'remove': {
        const r = item();
        if (r.id === pb.current_item_id) {
          finishCurrent(pb, 'skipped', at);
          db().prepare("UPDATE queue_items SET status = 'removed' WHERE id = ?").run(r.id);
          db().prepare("UPDATE playback SET state = 'playing' WHERE id = ?").run(pb.id);
          await advance(pb.id, at);
        } else db().prepare("UPDATE queue_items SET status = 'removed' WHERE id = ?").run(r.id);
        words = `Removed ${r.name} from the ${tv.name} queue`;
        break;
      }
      case 'mode': {
        const r = item();
        const f = rowFields(r);
        const m = cleanMode(f, input, f);
        db().prepare('UPDATE queue_items SET mode = ?, episodes = ?, minutes = ? WHERE id = ?').run(m.mode, m.episodes, m.minutes, r.id);
        words = `Set ${r.name} to ${modeLabel({ ...f, ...m })} in the ${tv.name} queue`;
        break;
      }
      case 'add': {
        // The kid rules of the playback's profile apply: a title it may not watch is refused here.
        const f = await titleFields(viewerOf(pb), input.titleKey, input.service, input);
        const pos = Math.max(0, ...queue(pb.id).map((x) => x.position)) + 1;
        insertQueueItem(pb.id, pos, f);
        words = `Added ${f.name} to the ${tv.name} queue (${modeLabel(f)})`;
        break;
      }
      default:
        throw new BadRequest('Action is move, remove, mode or add.');
    }
    log(actor, `queue.${String(input.action)}`, words);
    return words;
  });
}

// ---------------------------------------------------------------------------------------------- quick playlist

/**
 * Add a title to the quick playlist. The first pick makes the quick playlist (the app then asks whether to start
 * it now, and on which TV); later picks append, and also go to the end of any TV already playing it.
 */
export function quickAdd(actor: Actor, viewer: Viewer, input: { titleKey?: unknown; service?: unknown; startFrom?: unknown } & ModeInput): Promise<{ first: boolean; name: string; playingOn: string[] }> {
  return serial(async () => {
    const f = await titleFields(viewer, input.titleKey, input.service, input, input.startFrom);
    const qid = quickId(true) as number;
    const count = (db().prepare('SELECT count(*) AS n FROM playlist_items WHERE playlist_id = ?').get(qid) as { n: number }).n;
    const cols = ITEM_COLUMNS.split(',').map(() => '?').join(', ');
    db().prepare(`INSERT INTO playlist_items (playlist_id, position, ${ITEM_COLUMNS}) VALUES (?, ?, ${cols})`).run(qid, count + 1, ...itemValues(f));
    const playingOn: string[] = [];
    for (const pb of db().prepare("SELECT * FROM playback WHERE playlist_id = ? AND state IN ('playing', 'paused')").all(qid) as PlaybackRow[]) {
      const pos = Math.max(0, ...queue(pb.id).map((x) => x.position)) + 1;
      const v = viewerOf(pb);
      if (itemAllowed(v, f)) insertQueueItem(pb.id, pos, f);
      else insertQueueItem(pb.id, pos, f, 'failed', `not allowed for ${v.profileName}`);
      playingOn.push(getTv(pb.tv_id)?.name ?? 'a TV');
    }
    const who = viewer.profileName ? ` for ${viewer.profileName}` : '';
    log(actor, 'quick.add', `Added ${f.name} to the quick playlist${who}${playingOn.length ? ` (playing on ${playingOn.join(', ')})` : ''}`);
    return { first: count === 0, name: f.name, playingOn };
  });
}

// ---------------------------------------------------------------------------------------------- remote

export const REMOTE_KEYS = ['Up', 'Down', 'Left', 'Right', 'Select', 'Back', 'Play', 'VolumeUp', 'VolumeDown', 'VolumeMute', 'PowerOn', 'PowerOff'] as const;
const KEY_WORDS: Record<(typeof REMOTE_KEYS)[number], string> = {
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  Select: 'OK',
  Back: 'Back',
  Play: 'Play/Pause',
  VolumeUp: 'Volume up',
  VolumeDown: 'Volume down',
  VolumeMute: 'Mute',
  PowerOn: 'Turn on',
  PowerOff: 'Turn off',
};

/** A remote button. Turn off also stops what the TV was playing. */
export function remote(actor: Actor, tvId: number, k: unknown): Promise<string> {
  return serial(async () => {
    const tv = tvOr400(tvId);
    if (typeof k !== 'string' || !(REMOTE_KEYS as readonly string[]).includes(k)) throw new BadRequest('Not a remote button.');
    const rk = k as (typeof REMOTE_KEYS)[number];
    await key(tv, rk);
    let extra = '';
    if (rk === 'PowerOff' && stopLive(tv, now(), 'The TV was turned off')) extra = ' and stopped what it was playing';
    const words = `Pressed ${KEY_WORDS[rk]} on ${tv.name} (remote)${extra}`;
    log(actor, 'remote.key', words);
    return words;
  });
}

// ---------------------------------------------------------------------------------------------- kid mode, one title

async function startTitleLocked(actor: Actor, viewer: Viewer, tv: Tv, titleKey: unknown, service: unknown, at: number, label?: string): Promise<PlaybackRow> {
  const f = await titleFields(viewer, titleKey, service, { mode: 'indefinite' });
  if (viewer.kid && viewer.profileId !== null) checkKidStart(viewer.profileId, tv, at);
  stopLive(tv, at, `Replaced by ${f.name}`);
  followProfile(tv, viewer.profileId, actor, at);
  await restoreVolume(tv);
  const pbId = Number(
    db()
      .prepare("INSERT INTO playback (tv_id, playlist_id, name, profile_id, state, loop, shuffle, started_by, started_at) VALUES (?, NULL, ?, ?, 'playing', 0, 0, ?, ?)")
      .run(tv.id, label ?? f.name, viewer.profileId, actor.pinType, at).lastInsertRowid,
  );
  insertQueueItem(pbId, 1, f);
  await advance(pbId, at);
  return playbackRow(pbId);
}

/**
 * Play one title on a TV for a kid profile (Browse "Play on a TV", or an approved title request). It runs as a
 * playback, so the kid rules apply to it like to a playlist: time is counted, the warning, the stop, snap back.
 * Throws when the hub could not start it.
 */
export function startTitle(actor: Actor, viewer: Viewer, input: { tvId: unknown; titleKey: unknown; service?: unknown }): Promise<{ tvName: string; service: string; route: string; name: string }> {
  return serial(async () => {
    const at = now();
    const tv = tvOr400(input.tvId);
    const pb = await startTitleLocked(actor, viewer, tv, input.titleKey, input.service, at);
    const item = queue(pb.id)[0];
    if (item.status !== 'playing') throw new HttpError(item.status === 'failed' ? 502 : 403, pb.message ?? `${item.name} did not start.`);
    return { tvName: tv.name, service: item.service as string, route: item.launch_route as string, name: item.name };
  });
}

/**
 * An approved title request: the title plays next on the TV the kid asked from (after the title on now), or starts
 * there when nothing is playing for that kid. Returns what happened, in plain words.
 */
export function playRequestedTitle(viewer: Viewer, tvId: number, titleKey: string, service: string | null): Promise<string> {
  return serial(async () => {
    const at = now();
    const tv = tvOr400(tvId);
    const pb = livePlayback(tv.id);
    if (pb && pb.profile_id === viewer.profileId) {
      const f = await titleFields(viewer, titleKey, service ?? undefined, { mode: 'indefinite' });
      const items = queue(pb.id);
      const cur = items.find((x) => x.id === pb.current_item_id);
      const pos = cur ? cur.position : 0;
      // Make room right after the current title.
      db().prepare("UPDATE queue_items SET position = position + 1 WHERE playback_id = ? AND position > ?").run(pb.id, pos);
      insertQueueItem(pb.id, pos + 1, f);
      log(HUB, 'queue.add', `Added ${f.name} to play next on ${tv.name} (approved request)`);
      return `${f.name} plays next on ${tv.name}.`;
    }
    const started = await startTitleLocked(HUB, viewer, tv, titleKey, service ?? undefined, at, undefined);
    const item = queue(started.id)[0];
    log(HUB, 'playback.start', `Started ${item.name} on ${tv.name} for ${viewer.profileName} (approved request)`);
    return item.status === 'playing' ? `Started ${item.name} on ${tv.name}.` : (started.message ?? `${item.name} did not start.`);
  });
}

/**
 * Switch a TV to a profile (null: no profile). A kid profile puts the TV in kid mode, and the TV goes to the Popcorn
 * Pilot kid home screen. The Guest PIN may switch a TV to a kid profile only, so it can never take a TV out of kid
 * mode. Whatever was playing for another profile stops.
 */
export function switchProfile(actor: Actor, tvId: unknown, profile: unknown): Promise<string> {
  return serial(async () => {
    const at = now();
    const tv = tvOr400(tvId);
    let v: Viewer = EVERYONE;
    if (profile !== null && profile !== undefined && profile !== '') {
      const n = Number(profile);
      const got = Number.isInteger(n) && n > 0 ? viewerForProfile(n) : null;
      if (!got) throw new BadRequest('That profile does not exist.');
      v = got;
    }
    if (actor.pinType === 'guest' && !v.kid) throw new HttpError(403, 'With the Guest PIN, switch a TV to a kid profile.');
    const pb = livePlayback(tv.id);
    let stopped = '';
    if (pb && pb.profile_id !== v.profileId) {
      stopLive(tv, at, `Stopped: ${tv.name} was switched to ${v.profileName ?? 'no profile'}`);
      stopped = ` and stopped ${pb.name}`;
    }
    followProfile(tv, v.profileId, actor, at);
    if (v.kid && (stopped || !pb)) await launchChannel(tv, at).catch(() => undefined);
    const words = `Switched ${tv.name} to ${v.profileName ?? 'no profile'}${v.kid ? ' (kid mode)' : ''}${stopped}`;
    log(actor, 'tv.profile', words);
    return words;
  });
}

/**
 * Snap back (handoff 5.7): the TV is showing something the hub did not start. Relaunch what should be on: the
 * playlist's current title, or the Popcorn Pilot channel when nothing is playing. Returns what was relaunched.
 */
export function snapBackRelaunch(tvId: number): Promise<{ what: 'title' | 'channel'; name: string }> {
  return serial(async () => {
    const at = now();
    const tv = tvOr400(tvId);
    const pb = livePlayback(tv.id);
    const cur = pb && pb.current_item_id !== null ? itemRow(pb.current_item_id) : undefined;
    if (pb && cur && cur.title_key) {
      await playOnTv(viewerOf(pb), cur.title_key, { tvId: tv.id, service: cur.service });
      return { what: 'title', name: cur.name };
    }
    await launchChannel(tv, at);
    return { what: 'channel', name: 'Popcorn Pilot' };
  });
}

// ---------------------------------------------------------------------------------------------- views

export interface QueueView {
  id: number;
  name: string;
  kind: 'title' | 'album';
  titleKey: string | null;
  service: string | null;
  serviceName: string;
  rating: string | null;
  poster: string | null;
  mode: string;
  episodes: number;
  minutes: number;
  titleKind: 'show' | 'movie' | null;
  modeLabel: string;
  status: QueueItemsRow['status'];
  note: string | null;
  launchRoute: string | null;
}

export interface NowPlaying {
  item: QueueView;
  playedMin: number;
  totalMin: number | null;
  leftMin: number | null;
  percent: number | null;
  /** Which episode the hub thinks is on (approximate), and of how many, for shows. */
  episode: number | null;
  episodes: number | null;
}

export interface PlaybackView {
  id: number;
  tvId: number;
  name: string;
  playlistId: number | null;
  quick: boolean;
  profileId: number | null;
  profileName: string | null;
  kid: boolean;
  state: 'playing' | 'paused';
  loop: boolean;
  shuffle: boolean;
  message: string | null;
  /** "3 of 6": the current title's place among the titles. */
  index: number | null;
  count: number;
  now: NowPlaying | null;
  upNext: QueueView[];
  past: QueueView[];
}

export interface TvView {
  tv: { id: number; name: string; room: string; online: boolean; defaultProfileName: string | null };
  playback: PlaybackView | null;
  /** Why the last playback on this TV ended, when it ended with a message in the last 30 minutes. */
  lastMessage: string | null;
  /** The profile the TV is on (set by a start or a switch), and whether that puts it in kid mode. */
  profile: { id: number; name: string; kid: boolean } | null;
  /** For a TV in kid mode: that kid's time today (the bar fades green to yellow to red). */
  kidTime: { name: string; leftMin: number; limitMin: number; bonusMin: number; percent: number; color: string; inHours: boolean } | null;
}

function queueView(r: QueueItemsRow): QueueView {
  const f = rowFields(r);
  return {
    id: r.id,
    name: f.name,
    kind: f.kind,
    titleKey: f.titleKey,
    service: f.service,
    serviceName: f.service ? SERVICE_INFO[f.service].name : 'Family Album',
    rating: f.rating,
    poster: artUrl(f.poster),
    mode: f.mode,
    episodes: f.episodes,
    minutes: f.minutes,
    titleKind: f.titleKind,
    modeLabel: modeLabel(f),
    status: r.status,
    note: r.note,
    launchRoute: r.launch_route,
  };
}

export function playbackView(pb: PlaybackRow, at = now()): PlaybackView {
  const items = queue(pb.id).filter((r) => r.status !== 'removed');
  const cur = items.find((r) => r.id === pb.current_item_id);
  let np: NowPlaying | null = null;
  if (cur) {
    const f = rowFields(cur);
    const total = itemMinutes(f);
    const playedMin = Math.floor(playedMs(pb, at) / 60_000);
    const ep = f.titleKind === 'show' ? (f.episodeMinutes ?? 30) : null;
    const episodes = ep && f.mode === 'episodes' ? f.episodes : ep && f.mode === 'time' ? Math.ceil(f.minutes / ep) : null;
    const episode = ep ? Math.floor(playedMs(pb, at) / (ep * 60_000)) + 1 : null;
    np = {
      item: queueView(cur),
      playedMin,
      totalMin: total,
      leftMin: total === null ? null : Math.max(0, total - playedMin),
      percent: total ? Math.min(100, Math.round((playedMs(pb, at) / (total * 60_000)) * 100)) : null,
      episode: episode && episodes ? Math.min(episode, episodes) : episode,
      episodes,
    };
  }
  const quick = pb.playlist_id !== null && (db().prepare('SELECT quick FROM playlists WHERE id = ?').get(pb.playlist_id) as { quick: number } | undefined)?.quick === 1;
  const v = viewerOf(pb);
  return {
    id: pb.id,
    tvId: pb.tv_id,
    name: pb.name,
    playlistId: pb.playlist_id,
    quick,
    profileId: pb.profile_id,
    profileName: profileName(pb.profile_id),
    kid: v.kid,
    state: pb.state as 'playing' | 'paused',
    loop: pb.loop === 1,
    shuffle: pb.shuffle === 1,
    message: pb.message,
    index: cur ? items.indexOf(cur) + 1 : null,
    count: items.length,
    now: np,
    upNext: items.filter((r) => r.status === 'pending').map(queueView),
    past: items.filter((r) => r.status !== 'pending' && r.id !== pb.current_item_id).map(queueView),
  };
}

export function tvView(tv: Tv, at = now()): TvView {
  const pb = livePlayback(tv.id);
  let lastMessage: string | null = null;
  if (!pb) {
    const last = db().prepare("SELECT * FROM playback WHERE tv_id = ? AND state IN ('ended', 'stopped') ORDER BY ended_at DESC, id DESC LIMIT 1").get(tv.id) as PlaybackRow | undefined;
    if (last?.message && last.ended_at && at - last.ended_at < 30 * 60_000) lastMessage = last.message;
  }
  return {
    tv: { id: tv.id, name: tv.name, room: tv.room, online: tv.online, defaultProfileName: tv.defaultProfileName },
    playback: pb ? playbackView(pb, at) : null,
    lastMessage,
    ...kidModeView(tv.id, at),
  };
}

function kidModeView(tvId: number, at: number): Pick<TvView, 'profile' | 'kidTime'> {
  const pid = tvState(tvId)?.profile_id ?? null;
  const row = pid !== null ? (db().prepare('SELECT id, name, type FROM profiles WHERE id = ? AND deleted_at IS NULL').get(pid) as { id: number; name: string; type: string } | undefined) : undefined;
  if (!row) return { profile: null, kidTime: null };
  const rules = row.type === 'kid' ? kidRules(row.id) : null;
  const s = rules ? timeStatus(rules, at) : null;
  return {
    profile: { id: row.id, name: row.name, kid: row.type === 'kid' },
    kidTime: s ? { name: s.name, leftMin: s.leftMin, limitMin: s.limitMin, bonusMin: s.bonusMin, percent: s.percent, color: s.color, inHours: s.inHours } : null,
  };
}

export function allTvViews(): TvView[] {
  const at = now();
  return listTvs().map((tv) => tvView(tv, at));
}
