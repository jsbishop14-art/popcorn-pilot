// Routines (handoff 7): one button sets a TV up. Steps run in order (turn on, profile, volume, playlist, timer, as
// the routine lists them) and the run stops at the first step that fails, with a message saying which step and why.
// A routine runs from Run, from Test now in the editor (the steps as they are in the editor, saved or not), on its
// schedule (days and a time, on the hub clock), or from the TV home screen (the Roku channel, PP6). A timer step
// turns the TV off after its minutes. Every run goes into Activity history.
//
// Kid rules still apply: a playlist step goes through the playback engine, which refuses a kid start outside
// viewing hours or with no time left, and the channel cannot run a routine on a TV in kid mode.
import { getDb, getSetting } from './db';
import { now } from './clock';
import { BadRequest, HttpError } from './route';
import { getTv, type Tv } from './tvs';
import { driverFor } from './devices';
import { DeviceError } from './devices/types';
import { logActivity, type ActivityPin } from './activity';
import { DAYS, daysWords, timeWords, type Day } from './playlists';
import { SCHEDULE_GRACE_MS, playbackView, startPlaylist, switchProfile, turnOff, type Actor } from './playback';
import { kidModeProfile, tvState } from './tvstate';
import type { RoutineRunsRow, RoutineStepsRow, RoutinesRow } from './db/types.gen';

const MIN = 60_000;
const db = () => getDb();

export const STEP_KINDS = ['power_on', 'profile', 'volume', 'playlist', 'timer'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const STEP_NAMES: Record<StepKind, string> = { power_on: 'Turn on', profile: 'Profile', volume: 'Volume', playlist: 'Playlist', timer: 'Timer' };
export const ICONS = ['sun', 'tv', 'moon', 'star'] as const;
export type Icon = (typeof ICONS)[number];

export type RunBy = 'adult' | 'hub' | 'channel';

// ---------------------------------------------------------------------------------------------- definitions

export interface Step {
  kind: StepKind;
  profileId: number | null;
  volume: number | null;
  playlistId: number | null;
  minutes: number | null;
}

export interface Definition {
  name: string;
  icon: Icon;
  tvId: number;
  steps: Step[];
  schedule: { on: boolean; days: Day[]; time: string | null };
}

function intIn(v: unknown, lo: number, hi: number, what: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) throw new BadRequest(`${what} is a whole number from ${lo} to ${hi}.`);
  return n;
}

function liveProfile(id: number): { id: number; name: string; type: string } | undefined {
  return db().prepare('SELECT id, name, type FROM profiles WHERE id = ? AND deleted_at IS NULL').get(id) as { id: number; name: string; type: string } | undefined;
}

function livePlaylist(id: number): { id: number; name: string } | undefined {
  return db().prepare('SELECT id, name FROM playlists WHERE id = ? AND deleted_at IS NULL AND quick = 0').get(id) as { id: number; name: string } | undefined;
}

/** Check a routine from the editor. Each step kind at most once; at least one step. */
export function cleanDefinition(input: Record<string, unknown>): Definition {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new BadRequest('Give the routine a name.');
  if (name.length > 40) throw new BadRequest('A routine name is at most 40 letters.');
  const icon = (ICONS as readonly string[]).includes(String(input.icon)) ? (input.icon as Icon) : 'tv';
  const tvId = Number(input.tvId);
  if (!Number.isInteger(tvId) || tvId < 1 || !getTv(tvId)) throw new BadRequest('Pick the TV this routine sets up.');
  if (!Array.isArray(input.steps) || input.steps.length === 0) throw new BadRequest('Add at least one step.');
  const seen = new Set<StepKind>();
  const steps: Step[] = input.steps.map((raw) => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind = s.kind as StepKind;
    if (!(STEP_KINDS as readonly string[]).includes(kind)) throw new BadRequest('A step is turn on, profile, volume, playlist or timer.');
    if (seen.has(kind)) throw new BadRequest(`A routine has one ${STEP_NAMES[kind]} step.`);
    seen.add(kind);
    const step: Step = { kind, profileId: null, volume: null, playlistId: null, minutes: null };
    if (kind === 'profile') {
      const id = Number(s.profileId);
      if (!Number.isInteger(id) || !liveProfile(id)) throw new BadRequest('Pick a profile for the Profile step.');
      step.profileId = id;
    }
    if (kind === 'volume') step.volume = intIn(s.volume, 0, 100, 'Volume');
    if (kind === 'playlist') {
      const id = Number(s.playlistId);
      if (!Number.isInteger(id) || !livePlaylist(id)) throw new BadRequest('Pick a playlist for the Playlist step.');
      step.playlistId = id;
    }
    if (kind === 'timer') step.minutes = intIn(s.minutes, 1, 600, 'Timer minutes');
    return step;
  });
  const sch = (input.schedule && typeof input.schedule === 'object' ? input.schedule : {}) as Record<string, unknown>;
  const on = sch.on === true;
  const days = Array.isArray(sch.days) ? DAYS.filter((d) => (sch.days as unknown[]).includes(d)) : [];
  const time = typeof sch.time === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(sch.time) ? sch.time : null;
  if (on && !days.length) throw new BadRequest('Pick at least one day for the schedule.');
  if (on && !time) throw new BadRequest('Pick a time for the schedule.');
  return { name, icon, tvId, steps, schedule: { on, days, time } };
}

function stepsOf(routineId: number): Step[] {
  return (db().prepare('SELECT * FROM routine_steps WHERE routine_id = ? ORDER BY position, id').all(routineId) as RoutineStepsRow[]).map((r) => ({
    kind: r.kind as StepKind,
    profileId: r.profile_id,
    volume: r.volume,
    playlistId: r.playlist_id,
    minutes: r.minutes,
  }));
}

function parseDays(s: string): Day[] {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? DAYS.filter((d) => v.includes(d)) : [];
  } catch {
    return [];
  }
}

function row(id: number): RoutinesRow | undefined {
  return db().prepare('SELECT * FROM routines WHERE id = ? AND deleted_at IS NULL').get(id) as RoutinesRow | undefined;
}

function definitionOf(r: RoutinesRow): Definition | null {
  if (r.tv_id === null) return null;
  return { name: r.name, icon: r.icon as Icon, tvId: r.tv_id, steps: stepsOf(r.id), schedule: { on: r.schedule_on === 1, days: parseDays(r.schedule_days), time: r.schedule_time } };
}

// ---------------------------------------------------------------------------------------------- views

export interface StepView extends Step {
  n: number;
  name: string;
  value: string;
}

export interface StepResult {
  n: number;
  kind: StepKind;
  name: string;
  value: string;
  ok: boolean;
  words: string;
}

export interface RunView {
  id: number;
  at: number;
  status: 'running' | 'done' | 'failed';
  test: boolean;
  by: RunBy;
  message: string | null;
  steps: StepResult[];
  timer: { offAt: number; done: boolean; note: string | null } | null;
}

export interface RoutineView {
  id: number;
  name: string;
  icon: Icon;
  tvId: number | null;
  tvName: string | null;
  steps: StepView[];
  schedule: { on: boolean; days: Day[]; time: string | null; label: string };
  /** "Weekdays 7:00 AM · Living room · [profile]" (mockup Routines). */
  summary: string;
  lastRun: RunView | null;
  /** A timer from this routine that is still to turn the TV off. */
  timer: { runId: number; offAt: number; words: string } | null;
}

function stepValue(s: Step, tv: Tv | null): string {
  switch (s.kind) {
    case 'power_on':
      return tv?.name ?? 'the TV';
    case 'profile':
      return (s.profileId !== null ? liveProfile(s.profileId)?.name : null) ?? 'a deleted profile';
    case 'volume':
      return String(s.volume);
    case 'playlist':
      return (s.playlistId !== null ? livePlaylist(s.playlistId)?.name : null) ?? 'a deleted playlist';
    case 'timer':
      return `${s.minutes} min`;
  }
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function scheduleLabel(s: { on: boolean; days: Day[]; time: string | null }): string {
  return s.on && s.days.length && s.time ? `${daysWords(s.days)} ${timeWords(s.time)}` : 'Manual';
}

function runView(r: RoutineRunsRow): RunView {
  let steps: StepResult[] = [];
  try {
    steps = JSON.parse(r.steps) as StepResult[];
  } catch {
    steps = [];
  }
  return {
    id: r.id,
    at: r.started_at,
    status: r.status as RunView['status'],
    test: r.test === 1,
    by: r.started_by as RunBy,
    message: r.message,
    steps,
    timer: r.timer_off_at !== null ? { offAt: r.timer_off_at, done: r.timer_done_at !== null, note: r.timer_note } : null,
  };
}

function view(r: RoutinesRow): RoutineView {
  const tv = r.tv_id !== null ? getTv(r.tv_id) : null;
  const steps = stepsOf(r.id).map((s, i) => ({ ...s, n: i + 1, name: STEP_NAMES[s.kind], value: stepValue(s, tv) }));
  const schedule = { on: r.schedule_on === 1, days: parseDays(r.schedule_days), time: r.schedule_time };
  const prof = steps.find((s) => s.kind === 'profile');
  const last = db().prepare('SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC, id DESC LIMIT 1').get(r.id) as RoutineRunsRow | undefined;
  const t = db().prepare('SELECT * FROM routine_runs WHERE routine_id = ? AND timer_off_at IS NOT NULL AND timer_done_at IS NULL ORDER BY timer_off_at LIMIT 1').get(r.id) as RoutineRunsRow | undefined;
  return {
    id: r.id,
    name: r.name,
    icon: r.icon as Icon,
    tvId: tv ? tv.id : null,
    tvName: tv ? tv.name : null,
    steps,
    schedule: { ...schedule, label: scheduleLabel(schedule) },
    summary: [scheduleLabel(schedule), tv ? tv.name : 'No TV (pick one)', ...(prof ? [prof.value] : [])].join(' · '),
    lastRun: last ? runView(last) : null,
    timer: t && t.timer_off_at !== null ? { runId: t.id, offAt: t.timer_off_at, words: `Turns ${tv?.name ?? 'the TV'} off at ${clock(t.timer_off_at)}` } : null,
  };
}

export function listRoutines(): RoutineView[] {
  return (db().prepare('SELECT * FROM routines WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id').all() as RoutinesRow[]).map(view);
}

export function getRoutine(id: number): RoutineView | null {
  const r = row(id);
  return r ? view(r) : null;
}

export function routineOr404(id: number): RoutineView {
  const r = getRoutine(id);
  if (!r) throw new HttpError(404, 'No such routine.');
  return r;
}

/** The routines that set up one TV (the TV home screen lists them). */
export function routinesForTv(tvId: number): { id: number; name: string; icon: Icon; summary: string }[] {
  return listRoutines()
    .filter((r) => r.tvId === tvId)
    .map((r) => ({ id: r.id, name: r.name, icon: r.icon, summary: r.summary }));
}

// ---------------------------------------------------------------------------------------------- saving

function writeSteps(routineId: number, steps: Step[]) {
  db().prepare('DELETE FROM routine_steps WHERE routine_id = ?').run(routineId);
  steps.forEach((s, i) =>
    db()
      .prepare('INSERT INTO routine_steps (routine_id, position, kind, profile_id, volume, playlist_id, minutes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(routineId, i + 1, s.kind, s.profileId, s.volume, s.playlistId, s.minutes),
  );
}

function stepsWords(steps: Step[], tv: Tv | null): string {
  return steps.map((s) => `${STEP_NAMES[s.kind]} ${stepValue(s, tv)}`).join(', ');
}

export function createRoutine(input: Record<string, unknown>): { routine: RoutineView; words: string } {
  const d = cleanDefinition(input);
  const id = db().transaction(() => {
    const id = Number(
      db()
        .prepare('INSERT INTO routines (name, icon, tv_id, schedule_on, schedule_days, schedule_time) VALUES (?, ?, ?, ?, ?, ?)')
        .run(d.name, d.icon, d.tvId, d.schedule.on ? 1 : 0, JSON.stringify(d.schedule.days), d.schedule.time).lastInsertRowid,
    );
    writeSteps(id, d.steps);
    return id;
  })();
  const r = getRoutine(id) as RoutineView;
  return { routine: r, words: `Made the routine ${r.name} for ${r.tvName}: ${stepsWords(d.steps, getTv(d.tvId))}; ${scheduleLabel(d.schedule)}` };
}

export function updateRoutine(id: number, input: Record<string, unknown>): { routine: RoutineView; changes: string[] } {
  const before = row(id);
  if (!before) throw new HttpError(404, 'No such routine.');
  const d = cleanDefinition(input);
  const old = definitionOf(before);
  const changes: string[] = [];
  if (d.name !== before.name) changes.push(`renamed to ${d.name}`);
  if (d.icon !== before.icon) changes.push('new picture');
  if (d.tvId !== before.tv_id) changes.push(`TV ${getTv(d.tvId)?.name}`);
  const tv = getTv(d.tvId);
  if (!old || JSON.stringify(old.steps) !== JSON.stringify(d.steps)) changes.push(`steps ${stepsWords(d.steps, tv)}`);
  const wasLabel = old ? scheduleLabel(old.schedule) : 'Manual';
  if (scheduleLabel(d.schedule) !== wasLabel) changes.push(d.schedule.on ? `schedule ${scheduleLabel(d.schedule)}` : 'schedule off');
  db().transaction(() => {
    db()
      .prepare('UPDATE routines SET name = ?, icon = ?, tv_id = ?, schedule_on = ?, schedule_days = ?, schedule_time = ?, updated_at = ? WHERE id = ?')
      .run(d.name, d.icon, d.tvId, d.schedule.on ? 1 : 0, JSON.stringify(d.schedule.days), d.schedule.time, new Date().toISOString(), id);
    writeSteps(id, d.steps);
  })();
  return { routine: getRoutine(id) as RoutineView, changes };
}

/** Soft delete. A timer it set that is still to come is cancelled. */
export function deleteRoutine(id: number): RoutinesRow | null {
  const r = row(id);
  if (!r) return null;
  db().prepare('UPDATE routines SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  db().prepare("UPDATE routine_runs SET timer_done_at = ?, timer_note = 'cancelled: the routine was deleted' WHERE routine_id = ? AND timer_off_at IS NOT NULL AND timer_done_at IS NULL").run(now(), id);
  return r;
}

/** Cancel a routine's timer that is still to turn the TV off. Returns the words, or null when there was none. */
export function cancelTimer(routineId: number, by: string): string | null {
  const r = routineOr404(routineId);
  if (!r.timer) return null;
  db().prepare('UPDATE routine_runs SET timer_done_at = ?, timer_note = ? WHERE id = ?').run(now(), `cancelled by ${by}`, r.timer.runId);
  return `Cancelled the ${r.name} timer (${r.tvName ?? 'the TV'} stays on)`;
}

// ---------------------------------------------------------------------------------------------- running

/** Roku has no "set volume to": the volume step presses Volume down enough times to reach 0, then up to the level. */
export function volumePressesToZero(): number {
  const n = Number(getSetting('volume_presses_to_zero', '100'));
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 100;
}

function powerWaitMs(): number {
  const n = Number(process.env.PP_ROUTINE_POWER_WAIT_MS ?? 20_000);
  return Number.isFinite(n) && n >= 0 ? n : 20_000;
}

function deviceWords(tv: Tv, err: unknown): string {
  if (err instanceof DeviceError && !err.offline) return `${tv.name}: ${err.message.replace(/\.$/, '')}`;
  if (err instanceof HttpError || err instanceof BadRequest) return err.message.replace(/\.$/, '');
  if (err instanceof DeviceError) return `${tv.name} did not answer. Check it is plugged in and on the home Wi-Fi`;
  return err instanceof Error ? err.message.replace(/\.$/, '') : 'it did not work';
}

async function powerOn(tv: Tv): Promise<string> {
  const d = driverFor(tv);
  const before = await d.deviceInfo().catch(() => null);
  if (before?.powerMode === 'on') return `${tv.name} is on`;
  await d.keypress('PowerOn');
  const until = Date.now() + powerWaitMs();
  for (;;) {
    const info = await d.deviceInfo().catch(() => null);
    if (info?.powerMode === 'on') return `Turned ${tv.name} on`;
    if (Date.now() >= until) {
      if (info) return `Turned ${tv.name} on`;
      throw new DeviceError('did not answer after Turn on', true);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function setVolume(tv: Tv, level: number): Promise<string> {
  const d = driverFor(tv);
  for (let i = 0; i < volumePressesToZero(); i++) await d.keypress('VolumeDown');
  for (let i = 0; i < level; i++) await d.keypress('VolumeUp');
  // The volume is now a known level: a bedtime wind-down's steps down no longer need undoing.
  db().prepare('UPDATE tv_state SET volume_steps = 0 WHERE tv_id = ?').run(tv.id);
  return `Set the volume on ${tv.name} to ${level}`;
}

/** The profile a playlist step starts for: the routine's profile step, else the profile the TV is on, else its default. */
function playlistProfile(def: Definition, tv: Tv): number | undefined {
  const p = def.steps.find((s) => s.kind === 'profile');
  if (p?.profileId) return p.profileId;
  return tvState(tv.id)?.profile_id ?? undefined;
}

const busy = new Set<number>();

export interface RunResult {
  runId: number;
  ok: boolean;
  steps: StepResult[];
  message: string;
}

/**
 * Run a routine's steps in order on its TV. The first step that fails stops the run. A test run does every step
 * except setting the timer (it says when the timer would turn the TV off). Throws 409 while another routine runs on
 * the same TV.
 */
export async function runDefinition(def: Definition, opts: { routineId: number | null; by: RunBy; device: string; test: boolean }): Promise<RunResult> {
  const tv = getTv(def.tvId);
  if (!tv) throw new BadRequest('Pick the TV this routine sets up.');
  if (busy.has(tv.id)) throw new HttpError(409, `A routine is already running on ${tv.name}. Try again in a moment.`);
  busy.add(tv.id);
  const actor: Actor = { pinType: opts.by === 'adult' ? 'adult' : 'hub', device: opts.device };
  const at = now();
  const runId = Number(
    db()
      .prepare("INSERT INTO routine_runs (routine_id, name, tv_id, started_at, status, started_by, test) VALUES (?, ?, ?, ?, 'running', ?, ?)")
      .run(opts.routineId, def.name, tv.id, at, opts.by, opts.test ? 1 : 0).lastInsertRowid,
  );
  const results: StepResult[] = [];
  let failed: StepResult | null = null;
  let timerOffAt: number | null = null;
  try {
    for (const [i, s] of def.steps.entries()) {
      const base = { n: i + 1, kind: s.kind, name: STEP_NAMES[s.kind], value: stepValue(s, tv) };
      try {
        let words: string;
        switch (s.kind) {
          case 'power_on':
            words = await powerOn(tv);
            break;
          case 'profile':
            words = await switchProfile(actor, tv.id, s.profileId);
            break;
          case 'volume':
            words = await setVolume(tv, s.volume ?? 0);
            break;
          case 'playlist': {
            const [pbId] = await startPlaylist(actor, { playlistId: s.playlistId as number, tvIds: [tv.id], profile: playlistProfile(def, tv) });
            const pb = db().prepare('SELECT * FROM playback WHERE id = ?').get(pbId) as Parameters<typeof playbackView>[0];
            if (pb.state !== 'playing' && pb.state !== 'paused') throw new Error(pb.message ?? `${base.value} did not start`);
            const v = playbackView(pb);
            words = `Started ${base.value} on ${tv.name}${v.now ? ` (${v.now.item.name})` : ''}`;
            break;
          }
          case 'timer': {
            const off = now() + (s.minutes ?? 0) * MIN;
            if (opts.test) words = `Would turn ${tv.name} off at ${clock(off)} (not set in a test)`;
            else {
              timerOffAt = off;
              words = `${tv.name} turns off at ${clock(off)}`;
            }
            break;
          }
        }
        results.push({ ...base, ok: true, words });
      } catch (err) {
        failed = { ...base, ok: false, words: deviceWords(tv, err) };
        results.push(failed);
        break;
      }
    }
  } finally {
    busy.delete(tv.id);
  }
  const end = now();
  const ok = failed === null;
  const label = opts.test ? `Test of ${def.name}` : def.name;
  const message = ok
    ? `${label}: all ${results.length} step${results.length === 1 ? '' : 's'} done on ${tv.name}.`
    : `${label} stopped at step ${failed!.n} (${failed!.name}): ${failed!.words}.`;
  if (timerOffAt !== null) {
    // A new timer on this TV replaces one set earlier.
    db().prepare("UPDATE routine_runs SET timer_done_at = ?, timer_note = 'replaced by a newer timer' WHERE tv_id = ? AND timer_off_at IS NOT NULL AND timer_done_at IS NULL").run(end, tv.id);
  }
  db()
    .prepare('UPDATE routine_runs SET ended_at = ?, status = ?, steps = ?, message = ?, timer_off_at = ? WHERE id = ?')
    .run(end, ok ? 'done' : 'failed', JSON.stringify(results), message, timerOffAt, runId);
  const pin: ActivityPin = opts.by === 'adult' ? 'adult' : 'hub';
  const how = opts.test ? 'Tested' : opts.by === 'hub' ? 'Ran (schedule)' : opts.by === 'channel' ? 'Ran (from the TV)' : 'Ran';
  logActivity({ pinType: pin, device: opts.device, action: ok ? 'routine.run' : 'routine.failed', summary: ok ? `${how} ${def.name} on ${tv.name}: ${results.map((r) => r.words).join('; ')}` : `${how} ${message}` });
  return { runId, ok, steps: results, message };
}

export async function runRoutine(id: number, opts: { by: RunBy; device: string; test?: boolean }): Promise<RunResult> {
  const r = row(id);
  if (!r) throw new HttpError(404, 'No such routine.');
  const def = definitionOf(r);
  if (!def) throw new BadRequest('Pick the TV this routine sets up (the one it had was removed).');
  return runDefinition(def, { routineId: id, by: opts.by, device: opts.device, test: opts.test ?? false });
}

/** From the TV home screen: only a routine for this TV, and never while the TV is in kid mode. */
export async function runFromChannel(tv: Tv, id: number): Promise<RunResult> {
  const r = row(id);
  if (!r || r.tv_id !== tv.id) throw new HttpError(404, 'No such routine on this TV.');
  if (kidModeProfile(tv.id) !== null) throw new HttpError(403, 'Leaving kid mode needs the Adult PIN.');
  return runRoutine(id, { by: 'channel', device: tv.name });
}

// ---------------------------------------------------------------------------------------------- schedule and timers

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Turn TVs off whose timer is due. */
async function runTimers(at: number): Promise<number> {
  const due = db().prepare('SELECT * FROM routine_runs WHERE timer_done_at IS NULL AND timer_off_at IS NOT NULL AND timer_off_at <= ?').all(at) as RoutineRunsRow[];
  for (const r of due) {
    // Marked first, so a TV that does not answer is not tried again on every tick.
    db().prepare("UPDATE routine_runs SET timer_done_at = ?, timer_note = 'turning off' WHERE id = ?").run(at, r.id);
    let note: string;
    try {
      await turnOff({ pinType: 'hub', device: 'Hub' }, r.tv_id, `Timer from ${r.name}`);
      note = 'turned the TV off';
    } catch (err) {
      note = `the TV did not turn off: ${err instanceof Error ? err.message : 'error'}`;
      logActivity({ pinType: 'hub', device: 'Hub', action: 'routine.timer_failed', summary: `Timer from ${r.name}: ${note}` });
    }
    db().prepare('UPDATE routine_runs SET timer_note = ? WHERE id = ?').run(note, r.id);
  }
  return due.length;
}

async function runSchedules(at: number): Promise<number> {
  const d = new Date(at);
  const day = DAYS[(d.getDay() + 6) % 7];
  const today = localDate(d);
  let started = 0;
  for (const r of db().prepare('SELECT * FROM routines WHERE schedule_on = 1 AND deleted_at IS NULL').all() as RoutinesRow[]) {
    if (!r.schedule_time || r.schedule_last_run === today || !parseDays(r.schedule_days).includes(day)) continue;
    const [h, m] = r.schedule_time.split(':').map(Number);
    const when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    if (at < when || at - when > SCHEDULE_GRACE_MS) continue;
    db().prepare('UPDATE routines SET schedule_last_run = ? WHERE id = ?').run(today, r.id);
    try {
      await runRoutine(r.id, { by: 'hub', device: 'Hub' });
      started++;
    } catch (err) {
      logActivity({ pinType: 'hub', device: 'Hub', action: 'routine.schedule_failed', summary: `Could not run ${r.name} on schedule: ${err instanceof Error ? err.message : 'error'}` });
    }
  }
  return started;
}

let ticking: Promise<{ timers: number; started: number }> | null = null;

/** One routine step of the hub clock: timers that are due, then scheduled routines. One at a time. */
export function routineTick(): Promise<{ timers: number; started: number }> {
  if (ticking) return ticking;
  ticking = (async () => {
    const at = now();
    const timers = await runTimers(at);
    const started = await runSchedules(at);
    return { timers, started };
  })().finally(() => {
    ticking = null;
  });
  return ticking;
}

let timer: NodeJS.Timeout | null = null;

/** Start the routine timer on the hub (instrumentation.ts), every 15 s. PP_ENGINE_TICK_MS=0 turns it off. */
export function startRoutineTimer(): void {
  const ms = Number(process.env.PP_ENGINE_TICK_MS ?? 15_000);
  if (timer || !(ms > 0)) return;
  timer = setInterval(() => {
    routineTick().catch((err) => console.error('routines:', err instanceof Error ? err.message : err));
  }, ms);
  timer.unref();
}
