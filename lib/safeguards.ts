// Kid safeguards on the hub (handoff section 5): each kid profile's rules, time accounting per kid per day (limit by
// day of the week plus approved extra minutes, less what was watched), viewing hours, the weekly bonus cap, the
// watch log and the alerts. The playback engine (lib/playback.ts) enforces these; the app only shows them.
//
// Days and weeks are the hub's local time. Watching is counted by the hub (paused time does not count) and is
// approximate, as the watch log says: streaming apps do not reliably report playback position.
import { getDb } from './db';
import type { AlertsRow, KidSafeguardsRow, PlaybackRow, ProfilesRow, WatchLogRow } from './db/types.gen';
import { BadRequest, HttpError } from './route';
import { DAYS, durationWords, timeWords, type Day } from './playlists';
import { isTitleKey } from './catalog/types';

const db = () => getDb();
const MIN = 60_000;

export const RATINGS = ['TV-Y', 'TV-Y7', 'TV-G', 'G', 'PG', 'TV-PG', 'PG-13', 'TV-14', 'R', 'TV-MA'] as const;

/** The bundled task pictures (no uploads): key, label, and the picture shown in the app. */
export const PICTURES = {
  toys: { label: 'Toys', emoji: '🧸' },
  teeth: { label: 'Brushing teeth', emoji: '🪥' },
  table: { label: 'Setting the table', emoji: '🍽️' },
  pajamas: { label: 'Pajamas', emoji: '🌙' },
  book: { label: 'Reading', emoji: '📚' },
  bed: { label: 'Making the bed', emoji: '🛏️' },
  plant: { label: 'Watering plants', emoji: '🪴' },
  pet: { label: 'Feeding the pet', emoji: '🐶' },
  laundry: { label: 'Laundry', emoji: '🧺' },
  shoes: { label: 'Shoes away', emoji: '👟' },
} as const;
export type Picture = keyof typeof PICTURES;
export function isPicture(v: unknown): v is Picture {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PICTURES, v);
}

// ---------------------------------------------------------------------------------------------- local time

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayKey(at: number): Day {
  return DAYS[(new Date(at).getDay() + 6) % 7];
}

/** The local date of the Monday of the week `at` is in (the weekly bonus cap resets Monday). */
export function weekOf(at: number): string {
  const d = new Date(at);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(monday.getTime());
}

/** Epoch ms of a local HH:MM on the day of `at` ("24:00" is the end of the day). */
function clockOn(at: number, hhmm: string): number {
  const d = new Date(at);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

export function clockWords(at: number): string {
  const d = new Date(at);
  return timeWords(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
}

function hoursWords(hhmm: string): string {
  return hhmm === '24:00' ? 'midnight' : timeWords(hhmm);
}

// ---------------------------------------------------------------------------------------------- rules

export interface KidRules {
  profileId: number;
  name: string;
  allowedRatings: string[];
  /** This kid's own block list (title keys). Titles blocked for every kid are in the household tags. */
  blockedTitles: string[];
  dailyLimits: Record<Day, number>;
  hoursStart: string;
  hoursEnd: string;
  warningMinutes: number;
  finishEpisode: boolean;
  windDown: boolean;
  windDownMinutes: number;
  snapBack: boolean;
  alertOnSnapBack: boolean;
  canAskForTime: boolean;
  weeklyBonusCap: number;
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function toRules(p: ProfilesRow, s: KidSafeguardsRow): KidRules {
  const limits = parseJson<Record<string, unknown>>(s.daily_limits, {});
  const dailyLimits = Object.fromEntries(DAYS.map((d) => [d, typeof limits[d] === 'number' ? (limits[d] as number) : 0])) as Record<Day, number>;
  const list = (j: string) => {
    const v = parseJson<unknown>(j, []);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  };
  return {
    profileId: p.id,
    name: p.name,
    allowedRatings: list(s.allowed_ratings),
    blockedTitles: list(s.blocked_titles),
    dailyLimits,
    hoursStart: s.hours_start,
    hoursEnd: s.hours_end,
    warningMinutes: s.warning_minutes,
    finishEpisode: s.finish_episode === 1,
    windDown: s.wind_down === 1,
    windDownMinutes: s.wind_down_minutes,
    snapBack: s.snap_back === 1,
    alertOnSnapBack: s.alert_on_snap_back === 1,
    canAskForTime: s.can_ask_for_time === 1,
    weeklyBonusCap: s.weekly_bonus_cap,
  };
}

/** The rules of a live kid profile, or null for an adult profile or one that does not exist. */
export function kidRules(profileId: number): KidRules | null {
  const p = db().prepare("SELECT * FROM profiles WHERE id = ? AND deleted_at IS NULL AND type = 'kid'").get(profileId) as ProfilesRow | undefined;
  if (!p) return null;
  db().prepare('INSERT OR IGNORE INTO kid_safeguards (profile_id) VALUES (?)').run(p.id);
  const s = db().prepare('SELECT * FROM kid_safeguards WHERE profile_id = ?').get(p.id) as KidSafeguardsRow;
  return toRules(p, s);
}

export function kidRulesOr404(profileId: number): KidRules {
  const r = kidRules(profileId);
  if (!r) throw new HttpError(404, 'No such kid profile.');
  return r;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function int(v: unknown, lo: number, hi: number, what: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new BadRequest(`${what} must be a whole number from ${lo} to ${hi}.`);
  return n;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new BadRequest(`${what} is on or off.`);
  return v;
}

const DAY_NAMES: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export interface RulesInput {
  allowedRatings?: unknown;
  blockedTitles?: unknown;
  dailyLimits?: unknown;
  hoursStart?: unknown;
  hoursEnd?: unknown;
  warningMinutes?: unknown;
  finishEpisode?: unknown;
  windDown?: unknown;
  windDownMinutes?: unknown;
  snapBack?: unknown;
  alertOnSnapBack?: unknown;
  canAskForTime?: unknown;
  weeklyBonusCap?: unknown;
}

const onOff = (b: boolean) => (b ? 'on' : 'off');

/** Change a kid's rules. Returns the rules after and the changes in plain words (for Activity history). */
export function updateRules(profileId: number, input: RulesInput): { rules: KidRules; changes: string[] } {
  const before = kidRulesOr404(profileId);
  const r: KidRules = { ...before, dailyLimits: { ...before.dailyLimits } };
  const changes: string[] = [];
  if (input.allowedRatings !== undefined) {
    if (!Array.isArray(input.allowedRatings) || !input.allowedRatings.every((x) => (RATINGS as readonly string[]).includes(x as string)))
      throw new BadRequest('Allowed ratings must come from the rating list.');
    r.allowedRatings = RATINGS.filter((x) => (input.allowedRatings as string[]).includes(x));
    if (r.allowedRatings.join() !== before.allowedRatings.join()) changes.push(`allowed ratings ${r.allowedRatings.join(', ') || 'none'}`);
  }
  if (input.blockedTitles !== undefined) {
    if (!Array.isArray(input.blockedTitles) || input.blockedTitles.length > 500 || !input.blockedTitles.every(isTitleKey))
      throw new BadRequest('The block list holds titles from the catalog.');
    r.blockedTitles = [...new Set(input.blockedTitles as string[])];
    const added = r.blockedTitles.filter((k) => !before.blockedTitles.includes(k)).length;
    const removed = before.blockedTitles.filter((k) => !r.blockedTitles.includes(k)).length;
    if (added) changes.push(`blocked ${added} title${added === 1 ? '' : 's'}`);
    if (removed) changes.push(`unblocked ${removed} title${removed === 1 ? '' : 's'}`);
  }
  if (input.dailyLimits !== undefined) {
    const v = input.dailyLimits;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BadRequest('Daily screen time is minutes for each day.');
    for (const d of DAYS) {
      const x = (v as Record<string, unknown>)[d];
      if (x === undefined) continue;
      r.dailyLimits[d] = int(x, 0, 720, `${DAY_NAMES[d]} screen time`);
      if (r.dailyLimits[d] !== before.dailyLimits[d]) changes.push(`${DAY_NAMES[d]} ${durationWords(r.dailyLimits[d])}`);
    }
  }
  if (input.hoursStart !== undefined) {
    if (typeof input.hoursStart !== 'string' || !HHMM.test(input.hoursStart)) throw new BadRequest('Viewing hours start is a time like 07:00.');
    r.hoursStart = input.hoursStart;
  }
  if (input.hoursEnd !== undefined) {
    if (typeof input.hoursEnd !== 'string' || !(HHMM.test(input.hoursEnd) || input.hoursEnd === '24:00')) throw new BadRequest('Viewing hours end is a time like 19:30.');
    r.hoursEnd = input.hoursEnd;
  }
  if (r.hoursStart >= r.hoursEnd) throw new BadRequest('Viewing hours must end after they start.');
  if (r.hoursStart !== before.hoursStart || r.hoursEnd !== before.hoursEnd) changes.push(`viewing hours ${hoursWords(r.hoursStart)} to ${hoursWords(r.hoursEnd)}`);
  if (input.warningMinutes !== undefined) {
    r.warningMinutes = int(input.warningMinutes, 1, 30, 'The warning');
    if (r.warningMinutes !== before.warningMinutes) changes.push(`warning ${r.warningMinutes} min before`);
  }
  if (input.finishEpisode !== undefined) {
    r.finishEpisode = bool(input.finishEpisode, 'Finish the current episode');
    if (r.finishEpisode !== before.finishEpisode) changes.push(`finish the current episode ${onOff(r.finishEpisode)}`);
  }
  if (input.windDown !== undefined) {
    r.windDown = bool(input.windDown, 'Bedtime wind-down');
    if (r.windDown !== before.windDown) changes.push(`wind-down ${onOff(r.windDown)}`);
  }
  if (input.windDownMinutes !== undefined) {
    r.windDownMinutes = int(input.windDownMinutes, 5, 60, 'Wind-down length');
    if (r.windDownMinutes !== before.windDownMinutes) changes.push(`wind-down ${r.windDownMinutes} min`);
  }
  if (input.snapBack !== undefined) {
    r.snapBack = bool(input.snapBack, 'Snap back');
    if (r.snapBack !== before.snapBack) changes.push(`snap back ${onOff(r.snapBack)}`);
  }
  if (input.alertOnSnapBack !== undefined) {
    r.alertOnSnapBack = bool(input.alertOnSnapBack, 'Alert me');
    if (r.alertOnSnapBack !== before.alertOnSnapBack) changes.push(`snap back alerts ${onOff(r.alertOnSnapBack)}`);
  }
  if (input.canAskForTime !== undefined) {
    r.canAskForTime = bool(input.canAskForTime, 'Can ask for more time');
    if (r.canAskForTime !== before.canAskForTime) changes.push(`asking for more time ${onOff(r.canAskForTime)}`);
  }
  if (input.weeklyBonusCap !== undefined) {
    r.weeklyBonusCap = int(input.weeklyBonusCap, 0, 600, 'The weekly bonus cap');
    if (r.weeklyBonusCap !== before.weeklyBonusCap) changes.push(`weekly bonus cap ${durationWords(r.weeklyBonusCap)}`);
  }
  db()
    .prepare(
      `UPDATE kid_safeguards SET allowed_ratings = ?, blocked_titles = ?, daily_limits = ?, hours_start = ?, hours_end = ?,
       warning_minutes = ?, finish_episode = ?, wind_down = ?, wind_down_minutes = ?, snap_back = ?, alert_on_snap_back = ?,
       can_ask_for_time = ?, weekly_bonus_cap = ? WHERE profile_id = ?`,
    )
    .run(
      JSON.stringify(r.allowedRatings),
      JSON.stringify(r.blockedTitles),
      JSON.stringify(r.dailyLimits),
      r.hoursStart,
      r.hoursEnd,
      r.warningMinutes,
      r.finishEpisode ? 1 : 0,
      r.windDown ? 1 : 0,
      r.windDownMinutes,
      r.snapBack ? 1 : 0,
      r.alertOnSnapBack ? 1 : 0,
      r.canAskForTime ? 1 : 0,
      r.weeklyBonusCap,
      profileId,
    );
  return { rules: r, changes };
}

// ---------------------------------------------------------------------------------------------- viewing hours

export function inViewingHours(r: KidRules, at: number): boolean {
  return at >= clockOn(at, r.hoursStart) && at < clockOn(at, r.hoursEnd);
}

export function viewingHoursWords(r: KidRules): string {
  return `${hoursWords(r.hoursStart)} to ${hoursWords(r.hoursEnd)}`;
}

// ---------------------------------------------------------------------------------------------- time accounting

/** The hub's count of a playback's playing time on its current title (the engine's formula). */
export function playedMs(pb: Pick<PlaybackRow, 'item_played_ms' | 'state' | 'item_resumed_at'>, at: number): number {
  return pb.item_played_ms + (pb.state === 'playing' && pb.item_resumed_at !== null ? Math.max(0, at - pb.item_resumed_at) : 0);
}

function rowPlayedMs(w: WatchLogRow, at: number): number {
  if (w.ended_at !== null) return w.played_ms;
  const pb = db().prepare("SELECT * FROM playback WHERE id = ? AND state IN ('playing', 'paused')").get(w.playback_id) as PlaybackRow | undefined;
  if (!pb || pb.current_item_id !== w.queue_item_id) return w.played_ms;
  return Math.max(0, playedMs(pb, at) - w.base_ms);
}

/** What a kid watched on a local day, in ms (approximate). */
export function usedMs(profileId: number, day: string, at: number): number {
  const rows = db().prepare('SELECT * FROM watch_log WHERE profile_id = ? AND day = ?').all(profileId, day) as WatchLogRow[];
  return rows.reduce((sum, w) => sum + rowPlayedMs(w, at), 0);
}

export function grantedMinutes(profileId: number, day: string): number {
  return (db().prepare('SELECT coalesce(sum(minutes), 0) AS n FROM time_grants WHERE profile_id = ? AND day = ?').get(profileId, day) as { n: number }).n;
}

export function weeklyBonusUsed(profileId: number, week: string): number {
  return (db().prepare("SELECT coalesce(sum(minutes), 0) AS n FROM time_grants WHERE profile_id = ? AND week = ? AND source = 'task'").get(profileId, week) as { n: number }).n;
}

export interface TimeStatus {
  profileId: number;
  name: string;
  /** Today's limit (by day of the week) and the extra minutes approved today. */
  limitMin: number;
  bonusMin: number;
  usedMin: number;
  leftMin: number;
  leftMs: number;
  /** Time left as a share of today's total, 0 to 100, for the bar. */
  percent: number;
  /** The bar color: green with plenty left, through yellow, to red near the end (handoff 5.4). */
  color: string;
  inHours: boolean;
  /** What is really left now: the smaller of time left and the time until viewing hours end. */
  remainingMs: number;
  hoursWords: string;
}

export function barColor(percent: number): string {
  const hue = Math.round(120 * Math.max(0, Math.min(100, percent)) / 100);
  return `hsl(${hue}, 72%, 42%)`;
}

export function timeStatus(r: KidRules, at: number): TimeStatus {
  const day = localDay(at);
  const limitMin = r.dailyLimits[dayKey(at)];
  const bonusMin = grantedMinutes(r.profileId, day);
  const used = usedMs(r.profileId, day, at);
  const totalMs = (limitMin + bonusMin) * MIN;
  const leftMs = Math.max(0, totalMs - used);
  const inHours = inViewingHours(r, at);
  const untilEnd = inHours ? clockOn(at, r.hoursEnd) - at : 0;
  const percent = totalMs > 0 ? Math.round((leftMs / totalMs) * 100) : 0;
  return {
    profileId: r.profileId,
    name: r.name,
    limitMin,
    bonusMin,
    usedMin: Math.floor(used / MIN),
    leftMin: Math.ceil(leftMs / MIN),
    leftMs,
    percent,
    color: barColor(percent),
    inHours,
    remainingMs: Math.min(leftMs, untilEnd),
    hoursWords: viewingHoursWords(r),
  };
}

/**
 * The kid rules at a start (handoff 5.3): a start outside viewing hours is refused and alerted; a start with no time
 * left today is refused. Throws 403 with the reason in plain words.
 */
export function checkKidStart(profileId: number, tv: { id: number; name: string }, at: number): void {
  const r = kidRules(profileId);
  if (!r) return;
  if (!inViewingHours(r, at)) {
    addAlert({ kind: 'outside_hours', profileId, tvId: tv.id, title: 'Outside viewing hours', detail: `${r.name} · blocked a start at ${clockWords(at)} · ${tv.name}` }, at);
    throw new HttpError(403, `Outside ${r.name}'s viewing hours (${viewingHoursWords(r)}).`);
  }
  if (timeStatus(r, at).leftMs <= 0) throw new HttpError(403, `No time left today for ${r.name}.`);
}

// ---------------------------------------------------------------------------------------------- watch log

/** A kid's title started on a TV: open its watch log row. */
export function openWatch(pb: PlaybackRow, item: { id: number; title_key: string | null; name: string; service: string | null; title_kind: string | null; episode_minutes: number | null }, at: number): void {
  if (pb.profile_id === null || !kidRules(pb.profile_id)) return;
  db()
    .prepare(
      `INSERT INTO watch_log (profile_id, tv_id, playback_id, queue_item_id, title_key, name, service, title_kind, episode_minutes, day, started_at, base_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(pb.profile_id, pb.tv_id, pb.id, item.id, item.title_key, item.name, item.service, item.title_kind, item.episode_minutes, localDay(at), at, pb.item_played_ms);
}

/** Bring a playback's open watch log row up to date; with `close`, the title has ended there. */
export function syncWatch(pb: PlaybackRow, at: number, close = false): void {
  if (pb.current_item_id === null) return;
  db()
    .prepare(`UPDATE watch_log SET played_ms = max(0, ? - base_ms)${close ? ', ended_at = ?' : ''} WHERE playback_id = ? AND queue_item_id = ? AND ended_at IS NULL`)
    .run(...(close ? [playedMs(pb, at), at, pb.id, pb.current_item_id] : [playedMs(pb, at), pb.id, pb.current_item_id]));
}

export interface WatchEntry {
  id: number;
  name: string;
  service: string | null;
  tvName: string;
  startedAt: number;
  minutes: number;
  /** "2 episodes" for shows, by the episode length (approximate); null for movies. */
  episodes: string | null;
}

export interface WatchWeek {
  profileId: number;
  name: string;
  week: string;
  totalMin: number;
  limitMin: number;
  days: { day: Day; date: string; minutes: number; limitMin: number; today: boolean }[];
  entries: { date: string; label: string; items: WatchEntry[] }[];
}

const SERVICE_NAMES: Record<string, string> = { netflix: 'Netflix', prime: 'Prime Video', hulu: 'Hulu' };

/** One week of a kid's watch log (the week of `weekDate`, default this week): totals by day and every title. */
export function watchWeek(profileId: number, at: number, weekDate?: string): WatchWeek {
  const r = kidRulesOr404(profileId);
  const week = weekDate && /^\d{4}-\d{2}-\d{2}$/.test(weekDate) ? weekOf(new Date(`${weekDate}T12:00:00`).getTime()) : weekOf(at);
  const [y, m, d] = week.split('-').map(Number);
  const dates = DAYS.map((_, i) => localDay(new Date(y, m - 1, d + i, 12).getTime()));
  const rows = db()
    .prepare(`SELECT w.*, coalesce(t.name, 'a TV') AS tv_name FROM watch_log w LEFT JOIN tvs t ON t.id = w.tv_id WHERE w.profile_id = ? AND w.day IN (${dates.map(() => '?').join(',')}) ORDER BY w.started_at DESC, w.id DESC`)
    .all(profileId, ...dates) as (WatchLogRow & { tv_name: string })[];
  const today = localDay(at);
  const byDate = new Map<string, WatchEntry[]>();
  for (const w of rows) {
    const ms = rowPlayedMs(w, at);
    const minutes = Math.round(ms / MIN);
    const eps = w.title_kind === 'show' ? Math.max(1, Math.round(ms / ((w.episode_minutes ?? 30) * MIN))) : null;
    const e: WatchEntry = {
      id: w.id,
      name: w.name,
      service: w.service ? (SERVICE_NAMES[w.service] ?? w.service) : null,
      tvName: w.tv_name,
      startedAt: w.started_at,
      minutes,
      episodes: eps === null ? null : `${eps} episode${eps === 1 ? '' : 's'}`,
    };
    byDate.set(w.day, [...(byDate.get(w.day) ?? []), e]);
  }
  const days = DAYS.map((day, i) => ({
    day,
    date: dates[i],
    minutes: (byDate.get(dates[i]) ?? []).reduce((s, e) => s + e.minutes, 0),
    limitMin: r.dailyLimits[day],
    today: dates[i] === today,
  }));
  const entries = [...dates]
    .reverse()
    .filter((dt) => byDate.has(dt))
    .map((dt) => ({ date: dt, label: dt === today ? 'Today' : DAY_NAMES[DAYS[dates.indexOf(dt)]], items: byDate.get(dt) as WatchEntry[] }));
  return {
    profileId,
    name: r.name,
    week,
    totalMin: days.reduce((s, x) => s + x.minutes, 0),
    limitMin: days.reduce((s, x) => s + x.limitMin, 0),
    days,
    entries,
  };
}

// ---------------------------------------------------------------------------------------------- extra time

export interface Grant {
  minutes: number;
  asked: number;
  capped: boolean;
}

/**
 * Add minutes to a kid's time today. A task's minutes count toward the weekly bonus cap (resets Monday): only what
 * still fits under the cap is added, and nothing once it is reached. An approved request for more time is the
 * adult's own decision and is not capped.
 */
export function grantTime(profileId: number, minutes: number, source: 'request' | 'task', ref: { taskId?: number; requestId?: number }, device: string, at: number): Grant {
  const r = kidRulesOr404(profileId);
  const week = weekOf(at);
  let m = minutes;
  if (source === 'task') m = Math.max(0, Math.min(minutes, r.weeklyBonusCap - weeklyBonusUsed(profileId, week)));
  db()
    .prepare('INSERT INTO time_grants (profile_id, day, week, source, minutes, asked, task_id, request_id, at, by_pin, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(profileId, localDay(at), week, source, m, minutes, ref.taskId ?? null, ref.requestId ?? null, at, 'adult', device);
  if (m > 0) {
    // More time: the warning and wind-down can come again later, once the new time runs low.
    const s = timeStatus(r, at);
    if (s.remainingMs > r.warningMinutes * MIN) db().prepare("UPDATE playback SET kid_warned_at = NULL WHERE profile_id = ? AND state IN ('playing', 'paused')").run(profileId);
    if (s.remainingMs > r.windDownMinutes * MIN) db().prepare("UPDATE playback SET kid_wind_down_at = NULL WHERE profile_id = ? AND state IN ('playing', 'paused')").run(profileId);
  }
  return { minutes: m, asked: minutes, capped: m < minutes };
}

// ---------------------------------------------------------------------------------------------- alerts

export type AlertKind = AlertsRow['kind'] & ('left_playlist' | 'home' | 'other_app' | 'outside_hours' | 'time_warning' | 'time_up');

export function addAlert(a: { kind: AlertKind; profileId: number | null; tvId: number | null; title: string; detail: string }, at: number): number {
  return Number(
    db()
      .prepare('INSERT INTO alerts (at, kind, profile_id, tv_id, title, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(at, a.kind, a.profileId, a.tvId, a.title.slice(0, 80), a.detail.slice(0, 200)).lastInsertRowid,
  );
}

export interface AlertView {
  id: number;
  at: number;
  kind: AlertKind;
  title: string;
  detail: string;
  tvId: number | null;
  tvName: string | null;
  profileName: string | null;
  time: string;
}

export function listAlerts(opts: { tvId?: number; limit?: number } = {}): AlertView[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const rows = db()
    .prepare(
      `SELECT a.*, t.name AS tv_name, p.name AS profile_name FROM alerts a LEFT JOIN tvs t ON t.id = a.tv_id LEFT JOIN profiles p ON p.id = a.profile_id
       ${opts.tvId ? 'WHERE a.tv_id = ?' : ''} ORDER BY a.at DESC, a.id DESC LIMIT ${limit}`,
    )
    .all(...(opts.tvId ? [opts.tvId] : [])) as (AlertsRow & { tv_name: string | null; profile_name: string | null })[];
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind as AlertKind,
    title: r.title,
    detail: r.detail,
    tvId: r.tv_id,
    tvName: r.tv_name,
    profileName: r.profile_name,
    time: clockWords(r.at),
  }));
}

export function alertsToday(at: number): number {
  const d = new Date(at);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return (db().prepare('SELECT count(*) AS n FROM alerts WHERE at >= ?').get(start) as { n: number }).n;
}
