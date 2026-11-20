// Requests and earn time tasks (handoff 5.6, 5.12). A kid asks from the TV (the Roku channel, PP6) for more time, a
// new title, or marks a task done; an adult approves or denies in the app, or with the Adult PIN on the TV. Adults
// make the tasks (name, minutes, picture) from the phone or computer, and may mark a task done for a kid themselves.
// Task minutes count toward the kid's weekly bonus cap (resets Monday). Every request and decision is kept, and
// every decision is in Activity history.
import { getDb } from './db';
import type { KidRequestsRow, TasksRow } from './db/types.gen';
import { BadRequest, HttpError } from './route';
import { getTv } from './tvs';
import { logActivity } from './activity';
import { SERVICE_INFO, isService, viewerForProfile, visibleTitle } from './catalog';
import { durationWords } from './playlists';
import { PICTURES, clockWords, grantTime, isPicture, kidRules, kidRulesOr404, localDay, timeStatus, weekOf, weeklyBonusUsed } from './safeguards';
import { kidModeProfile } from './tvstate';
import { playRequestedTitle } from './playback';

const db = () => getDb();

export interface Decider {
  device: string;
}

// ---------------------------------------------------------------------------------------------- tasks

export interface Task {
  id: number;
  name: string;
  minutes: number;
  picture: string;
  emoji: string;
}

function toTask(r: TasksRow): Task {
  const pic = isPicture(r.picture) ? r.picture : 'toys';
  return { id: r.id, name: r.name, minutes: r.minutes, picture: pic, emoji: PICTURES[pic].emoji };
}

export function listTasks(): Task[] {
  return (db().prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id').all() as TasksRow[]).map(toTask);
}

export function getTask(id: number): Task | null {
  const r = db().prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').get(id) as TasksRow | undefined;
  return r ? toTask(r) : null;
}

function taskOr404(id: number): Task {
  const t = getTask(id);
  if (!t) throw new HttpError(404, 'No such task.');
  return t;
}

export interface TaskInput {
  name?: unknown;
  minutes?: unknown;
  picture?: unknown;
}

function cleanTaskName(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (s.length < 1 || s.length > 40) throw new BadRequest('A task needs a name of 1 to 40 characters.');
  return s;
}

function cleanTaskMinutes(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 120) throw new BadRequest('A task earns 1 to 120 minutes.');
  return n;
}

function cleanPicture(v: unknown): string {
  if (!isPicture(v)) throw new BadRequest('Pick one of the pictures.');
  return v;
}

export function createTask(input: TaskInput): Task {
  const name = cleanTaskName(input.name);
  const minutes = cleanTaskMinutes(input.minutes);
  const picture = input.picture === undefined ? 'toys' : cleanPicture(input.picture);
  const id = Number(db().prepare('INSERT INTO tasks (name, minutes, picture) VALUES (?, ?, ?)').run(name, minutes, picture).lastInsertRowid);
  return getTask(id) as Task;
}

export function updateTask(id: number, input: TaskInput): { before: Task; after: Task } {
  const before = taskOr404(id);
  const name = input.name === undefined ? before.name : cleanTaskName(input.name);
  const minutes = input.minutes === undefined ? before.minutes : cleanTaskMinutes(input.minutes);
  const picture = input.picture === undefined ? before.picture : cleanPicture(input.picture);
  db().prepare('UPDATE tasks SET name = ?, minutes = ?, picture = ? WHERE id = ?').run(name, minutes, picture, id);
  return { before, after: getTask(id) as Task };
}

export function deleteTask(id: number): Task | null {
  const t = getTask(id);
  if (!t) return null;
  db().prepare("UPDATE tasks SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  // A task marked done on the TV and still waiting goes with it.
  db().prepare("UPDATE kid_requests SET status = 'denied', decided_at = ?, outcome = 'the task was deleted' WHERE task_id = ? AND status = 'pending'").run(Date.now(), id);
  return t;
}

export type TaskState = 'approved' | 'pending' | null;

export interface KidTask extends Task {
  /** Today, for this kid: approved (minutes added), waiting for an adult, or still to do. */
  state: TaskState;
  /** What was added when approved (less than the task's minutes when the weekly cap was reached). */
  granted: number | null;
  requestId: number | null;
}

export interface KidTasks {
  profileId: number;
  name: string;
  bonus: { usedMin: number; capMin: number };
  tasks: KidTask[];
}

export function kidTasks(profileId: number, at: number): KidTasks {
  const r = kidRulesOr404(profileId);
  const day = localDay(at);
  const tasks = listTasks().map((t): KidTask => {
    const g = db().prepare("SELECT minutes FROM time_grants WHERE profile_id = ? AND task_id = ? AND day = ? AND source = 'task' ORDER BY id DESC LIMIT 1").get(profileId, t.id, day) as { minutes: number } | undefined;
    if (g) return { ...t, state: 'approved', granted: g.minutes, requestId: null };
    const p = db().prepare("SELECT id FROM kid_requests WHERE profile_id = ? AND task_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(profileId, t.id) as { id: number } | undefined;
    return { ...t, state: p ? 'pending' : null, granted: null, requestId: p?.id ?? null };
  });
  return { profileId, name: r.name, bonus: { usedMin: weeklyBonusUsed(profileId, weekOf(at)), capMin: r.weeklyBonusCap }, tasks };
}

function capWords(g: { minutes: number; asked: number }): string {
  if (g.minutes === g.asked) return `+${g.minutes} min`;
  return g.minutes === 0 ? 'weekly cap reached, no minutes added' : `+${g.minutes} min (weekly cap reached)`;
}

/** An adult marks a task done for a kid (from the phone or computer): the minutes are added at once, up to the cap. */
export function adultMarksDone(taskId: number, profileId: unknown, by: Decider, at: number): string {
  const t = taskOr404(taskId);
  const pid = Number(profileId);
  const r = Number.isInteger(pid) ? kidRules(pid) : null;
  if (!r) throw new BadRequest('Pick a kid profile.');
  const state = kidTasks(r.profileId, at).tasks.find((x) => x.id === t.id);
  if (state?.state === 'approved') throw new HttpError(409, `${t.name} is already done today for ${r.name}.`);
  if (state?.requestId) return decide(state.requestId, 'approve', by, at).words;
  const g = grantTime(r.profileId, t.minutes, 'task', { taskId: t.id }, by.device, at);
  const words = `Marked ${t.name} done for ${r.name}: ${capWords(g)}`;
  logActivity({ pinType: 'adult', device: by.device, action: 'task.done', summary: words });
  return words;
}

// ---------------------------------------------------------------------------------------------- requests

export interface RequestInput {
  kind?: unknown;
  minutes?: unknown;
  titleKey?: unknown;
  service?: unknown;
  taskId?: unknown;
}

/** A kid asks from the TV. The TV must be in kid mode; the request is for that kid. */
export async function createRequest(tvId: number, input: RequestInput, at: number): Promise<RequestView> {
  const tv = getTv(tvId);
  if (!tv) throw new HttpError(404, 'No such TV.');
  const pid = kidModeProfile(tv.id);
  const r = pid !== null ? kidRules(pid) : null;
  if (!r) throw new HttpError(403, 'This TV is not in kid mode.');
  const ins = (cols: Record<string, string | number | null>) => {
    const keys = Object.keys(cols);
    return Number(
      db()
        .prepare(`INSERT INTO kid_requests (profile_id, tv_id, created_at, ${keys.join(', ')}) VALUES (?, ?, ?, ${keys.map(() => '?').join(', ')})`)
        .run(r.profileId, tv.id, at, ...Object.values(cols)).lastInsertRowid,
    );
  };
  let id: number;
  let words: string;
  switch (input.kind) {
    case 'time': {
      if (!r.canAskForTime) throw new HttpError(403, `${r.name} cannot ask for more time (turned off in the profile).`);
      const m = Number(input.minutes);
      if (!Number.isInteger(m) || m < 5 || m > 120) throw new BadRequest('Ask for 5 to 120 minutes.');
      const same = db().prepare("SELECT id FROM kid_requests WHERE profile_id = ? AND kind = 'time' AND status = 'pending'").get(r.profileId) as { id: number } | undefined;
      if (same) return requestView(same.id, at);
      id = ins({ kind: 'time', minutes: m });
      words = `${r.name} asked for ${m} more min on ${tv.name}`;
      break;
    }
    case 'title': {
      if (typeof input.titleKey !== 'string') throw new BadRequest('Pick a title.');
      const viewer = viewerForProfile(r.profileId);
      if (!viewer) throw new HttpError(403, 'This TV is not in kid mode.');
      // Only a title this kid's rules allow can be asked for (the hub refuses the rest as not found).
      const t = await visibleTitle(viewer, input.titleKey);
      const service = isService(input.service) && t.services.includes(input.service) ? input.service : t.services[0];
      const same = db().prepare("SELECT id FROM kid_requests WHERE profile_id = ? AND kind = 'title' AND title_key = ? AND status = 'pending'").get(r.profileId, t.key) as { id: number } | undefined;
      if (same) return requestView(same.id, at);
      id = ins({ kind: 'title', title_key: t.key, title_name: t.name, service, rating: t.rating });
      words = `${r.name} asked to watch ${t.name} on ${tv.name}`;
      break;
    }
    case 'task': {
      const t = taskOr404(Number(input.taskId));
      const state = kidTasks(r.profileId, at).tasks.find((x) => x.id === t.id);
      if (state?.state === 'approved') throw new HttpError(409, `${t.name} is already done today.`);
      if (state?.requestId) return requestView(state.requestId, at);
      id = ins({ kind: 'task', task_id: t.id });
      words = `${r.name} marked ${t.name} done on ${tv.name}`;
      break;
    }
    default:
      throw new BadRequest('A request is for more time, a title or a task.');
  }
  logActivity({ pinType: 'kid', device: `${tv.name} TV`, action: 'request.create', summary: words });
  return requestView(id, at);
}

function row(id: number): KidRequestsRow | undefined {
  return db().prepare('SELECT * FROM kid_requests WHERE id = ?').get(id) as KidRequestsRow | undefined;
}

/** Approve or deny a waiting request. Approving adds the minutes (a task: up to the weekly cap) or plays the title. */
export function decide(id: number, decision: unknown, by: Decider, at: number): { words: string; view: RequestView } {
  if (decision !== 'approve' && decision !== 'deny') throw new BadRequest('Approve or deny.');
  const q = row(id);
  if (!q) throw new HttpError(404, 'No such request.');
  if (q.status !== 'pending') throw new HttpError(409, 'This request was already answered.');
  const r = kidRules(q.profile_id);
  const name = r?.name ?? 'a deleted profile';
  const what = describe(q);
  let outcome: string | null = null;
  if (decision === 'approve') {
    if (!r) throw new HttpError(409, 'That kid profile was deleted.');
    if (q.kind === 'time') outcome = capWords(grantTime(r.profileId, q.minutes as number, 'request', { requestId: q.id }, by.device, at));
    else if (q.kind === 'task') {
      const t = db().prepare('SELECT * FROM tasks WHERE id = ?').get(q.task_id) as TasksRow;
      outcome = capWords(grantTime(r.profileId, t.minutes, 'task', { taskId: t.id, requestId: q.id }, by.device, at));
    } else outcome = 'approved';
  }
  db().prepare('UPDATE kid_requests SET status = ?, decided_at = ?, decided_by = ?, decided_device = ?, outcome = ? WHERE id = ?').run(decision === 'approve' ? 'approved' : 'denied', at, 'adult', by.device, outcome, id);
  const words = `${decision === 'approve' ? 'Approved' : 'Denied'} ${name}'s request: ${what}${outcome && outcome !== 'approved' ? ` (${outcome})` : ''}`;
  logActivity({ pinType: 'adult', device: by.device, action: `request.${decision}`, summary: words });
  return { words, view: requestView(id, at) };
}

/** After approving a title request, play it on the TV it was asked from (the engine applies the kid rules). */
export async function playApprovedTitle(id: number): Promise<string | null> {
  const q = row(id);
  if (!q || q.kind !== 'title' || q.status !== 'approved' || q.tv_id === null) return null;
  const viewer = viewerForProfile(q.profile_id);
  if (!viewer) return null;
  let words: string;
  try {
    words = await playRequestedTitle(viewer, q.tv_id, q.title_key as string, q.service);
  } catch (err) {
    words = `Could not start ${q.title_name}: ${err instanceof Error ? err.message.replace(/\.$/, '') : 'error'}.`;
  }
  db().prepare('UPDATE kid_requests SET outcome = ? WHERE id = ?').run(words.slice(0, 200), id);
  return words;
}

function describe(q: KidRequestsRow): string {
  if (q.kind === 'time') return `${q.minutes} more min`;
  if (q.kind === 'title') return `watch ${q.title_name}`;
  const t = db().prepare('SELECT name FROM tasks WHERE id = ?').get(q.task_id) as { name: string } | undefined;
  return `task done: ${t?.name ?? 'a task'}`;
}

export interface RequestView {
  id: number;
  kind: 'time' | 'title' | 'task';
  status: 'pending' | 'approved' | 'denied';
  profileId: number;
  profileName: string;
  tvName: string | null;
  /** "Kid wants 20 more min", "Kid wants to watch Moon Camp", "Task done: Pick up toys". */
  title: string;
  sub: string;
  createdAt: number;
  decidedAt: number | null;
  outcome: string | null;
  emoji: string | null;
}

function agoWords(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
}

export function requestView(id: number, at: number): RequestView {
  const q = row(id) as KidRequestsRow;
  const p = db().prepare('SELECT name FROM profiles WHERE id = ?').get(q.profile_id) as { name: string } | undefined;
  const name = p?.name ?? 'A deleted profile';
  const tvName = q.tv_id !== null ? (getTv(q.tv_id)?.name ?? null) : null;
  const task = q.task_id !== null ? (db().prepare('SELECT * FROM tasks WHERE id = ?').get(q.task_id) as TasksRow | undefined) : undefined;
  let title: string;
  let sub: string;
  if (q.status === 'pending') {
    if (q.kind === 'time') {
      const r = kidRules(q.profile_id);
      const left = r ? timeStatus(r, at).leftMin : 0;
      title = `${name} wants ${q.minutes} more min`;
      sub = `${tvName ?? 'a TV'} · ${agoWords(at - q.created_at)} · ${left} min left today`;
    } else if (q.kind === 'title') {
      title = `${name} wants to watch ${q.title_name}`;
      sub = [q.service && isService(q.service) ? SERVICE_INFO[q.service].name : null, q.rating, tvName, agoWords(at - q.created_at)].filter(Boolean).join(' · ');
    } else {
      title = `Task done: ${task?.name ?? 'a task'}`;
      sub = `Earns ${task?.minutes ?? 0} min · ${name} · marked done on the TV · ${agoWords(at - q.created_at)}`;
    }
  } else {
    const who = `${q.status === 'approved' ? 'Approved' : 'Denied'} by Adult PIN · ${clockWords(q.decided_at as number)}`;
    if (q.kind === 'time') title = `${name}: ${q.minutes} more min${q.status === 'approved' && q.outcome ? ` · ${q.outcome}` : ''}`;
    else if (q.kind === 'title') title = `${name}: ${q.title_name}`;
    else title = `${name}: ${task?.name ?? 'a task'}${q.status === 'approved' && q.outcome ? ` · ${q.outcome}` : ''}`;
    sub = q.kind === 'title' && q.status === 'approved' && q.outcome && q.outcome !== 'approved' ? `${who} · ${q.outcome}` : who;
  }
  return {
    id: q.id,
    kind: q.kind as RequestView['kind'],
    status: q.status as RequestView['status'],
    profileId: q.profile_id,
    profileName: name,
    tvName,
    title,
    sub,
    createdAt: q.created_at,
    decidedAt: q.decided_at,
    outcome: q.outcome,
    emoji: task && isPicture(task.picture) ? PICTURES[task.picture].emoji : null,
  };
}

/** Waiting requests (oldest first), and those answered today (newest first). */
export function listRequests(at: number, opts: { tvId?: number } = {}): { pending: RequestView[]; earlier: RequestView[] } {
  const tvClause = opts.tvId ? ' AND tv_id = ?' : '';
  const args = opts.tvId ? [opts.tvId] : [];
  const pending = (db().prepare(`SELECT id FROM kid_requests WHERE status = 'pending'${tvClause} ORDER BY created_at, id`).all(...args) as { id: number }[]).map((x) => requestView(x.id, at));
  const d = new Date(at);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const earlier = (db().prepare(`SELECT id FROM kid_requests WHERE status != 'pending' AND decided_at >= ?${tvClause} ORDER BY decided_at DESC, id DESC`).all(start, ...args) as { id: number }[]).map((x) => requestView(x.id, at));
  return { pending, earlier };
}

export function pendingCount(): number {
  return (db().prepare("SELECT count(*) AS n FROM kid_requests WHERE status = 'pending'").get() as { n: number }).n;
}

// ---------------------------------------------------------------------------------------------- the kid screens on the TV

/** What the channel's kid screens show (PP6): time left with its bar, the warning, tasks, the bonus, requests. */
export function channelKid(tvId: number, at: number) {
  const pid = kidModeProfile(tvId);
  const r = pid !== null ? kidRules(pid) : null;
  if (!r) return { kidMode: false as const };
  const s = timeStatus(r, at);
  const t = kidTasks(r.profileId, at);
  const p = db().prepare('SELECT color, initial FROM profiles WHERE id = ?').get(r.profileId) as { color: string; initial: string };
  return {
    kidMode: true as const,
    profile: { id: r.profileId, name: r.name, color: p.color, initial: p.initial },
    time: {
      leftMin: s.leftMin,
      limitMin: s.limitMin,
      bonusMin: s.bonusMin,
      percent: s.percent,
      color: s.color,
      inHours: s.inHours,
      viewingHours: s.hoursWords,
      warning: s.remainingMs > 0 && s.remainingMs <= r.warningMinutes * 60_000,
      timeUp: s.remainingMs <= 0,
      words: s.inHours ? `${durationWords(s.leftMin)} left today` : `Viewing hours are ${s.hoursWords}`,
    },
    canAskForTime: r.canAskForTime,
    bonus: t.bonus,
    tasks: t.tasks.map((x) => ({ id: x.id, name: x.name, minutes: x.minutes, picture: x.picture, emoji: x.emoji, state: x.state })),
    requests: listRequests(at, { tvId }).pending.filter((q) => q.profileId === r.profileId).map((q) => ({ id: q.id, kind: q.kind, title: q.title })),
  };
}
