// PP4 through the real route handlers, with a fake clock and a fake Roku:
// check 3: request flow: the kid asks for 20 min on the TV, an adult approves, time left goes up by 20; a denial
//          changes nothing; both are logged (the request record and Activity history);
// check 4: task flow: the kid marks a task done, an adult approves, minutes are added up to the weekly cap and no
//          further; the cap resets Monday;
// and: the Guest PIN cannot approve or change safeguards (the hub refuses, whatever the app shows); approving on the
// TV needs the Adult PIN (the Guest PIN and wrong PINs are refused, wrong ones count toward the lockout); a title
// request; the safeguards editor's API; switching a TV's profile with each PIN.
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { lockState, setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { createProfile } from '@/lib/profiles';
import { getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';
import { newChannelToken } from '@/lib/tvs';
import { setClockForTests } from '@/lib/playback';
import { kidRules, timeStatus, updateRules } from '@/lib/safeguards';
import { setTvProfile } from '@/lib/tvstate';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
type Who = 'adult' | 'guest' | { channel: string };

const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };
let T = 0;

/** A local time: 2026-11-16 is a Monday. */
function local(day: number, h: number, m = 0): number {
  return new Date(2026, 10, day, h, m).getTime();
}

async function call(who: Who, method: string, urlPath: string, body?: unknown) {
  const clean = urlPath.split('?')[0];
  const segs = clean.split('/');
  // /api/<a>/<id>/... : numeric segments become [id]
  const id = segs.find((s) => /^\d+$/.test(s));
  const route = segs.map((s) => (/^\d+$/.test(s) ? '[id]' : s)).join('/');
  const mod = (await import(path.join(process.cwd(), 'app', route, 'route.ts'))) as Record<string, Handler>;
  const headers: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json' };
  if (typeof who === 'string') headers.cookie = cookies[who];
  else headers.authorization = `Bearer ${who.channel}`;
  const res = await mod[method](new Request(`http://hub.test${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: id ? { id } : {},
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let roku: FakeRoku;
let tv: number;
let kid: number;
let grown: number;
let token: string;
const channel = () => ({ channel: token });

function left() {
  return timeStatus(kidRules(kid)!, T).leftMin;
}

beforeAll(async () => {
  freshDataDir();
  T = local(16, 10); // Monday 10:00
  setClockForTests(() => T);
  expect((await setUpPins('1357', '2468', 'Computer')).status).toBe('ok');
  for (const role of ['adult', 'guest'] as const) {
    resetLockout();
    const r = await signInWithPin(role === 'adult' ? '1357' : '2468', 'Computer');
    if (r.status !== 'ok') throw new Error(r.status);
    cookies[role] = `${SESSION_COOKIE}=${encodeURIComponent(r.token)}`;
  }
  kid = createProfile({ name: 'Kid one', color: '#7FC8A9', type: 'kid' }).id;
  grown = createProfile({ name: 'Family', color: '#FFC94A', type: 'adult' }).id;
  roku = await startFakeRoku({ name: 'Living room' });
  tv = Number(getDb().prepare("INSERT INTO tvs (name, address, port, online) VALUES ('Living room', '127.0.0.1', ?, 1)").run(roku.port).lastInsertRowid);
  token = newChannelToken(tv) as string;
});

afterAll(async () => {
  setClockForTests(null);
  await roku?.close();
});

describe('kid screens on the TV (channel API)', () => {
  it('a TV not in kid mode has no kid screens and cannot ask', async () => {
    expect((await call(channel(), 'GET', '/api/channel/kid')).body).toEqual({ kidMode: false });
    const r = await call(channel(), 'POST', '/api/channel/requests', { kind: 'time', minutes: 20 });
    expect([r.status, r.body.error]).toEqual([403, 'This TV is not in kid mode.']);
  });

  it('switching a TV to a profile: the Guest PIN to a kid profile only; the Adult PIN to any', async () => {
    const g = await call('guest', 'POST', `/api/tvs/${tv}/profile`, { profileId: grown });
    expect([g.status, g.body.error]).toEqual([403, 'With the Guest PIN, switch a TV to a kid profile.']);
    const g2 = await call('guest', 'POST', `/api/tvs/${tv}/profile`, { profileId: null });
    expect(g2.status).toBe(403);
    const ok = await call('guest', 'POST', `/api/tvs/${tv}/profile`, { profileId: kid });
    expect([ok.status, ok.body.message]).toEqual([200, 'Switched Living room to Kid one (kid mode)']);
    expect(ok.body.tvs[0].profile).toEqual({ id: kid, name: 'Kid one', kid: true });
    expect(ok.body.tvs[0].kidTime.leftMin).toBe(60);
    // The adult takes it out of kid mode, then back.
    expect((await call('adult', 'POST', `/api/tvs/${tv}/profile`, { profileId: null })).body.message).toBe('Switched Living room to no profile');
    expect((await call('adult', 'POST', `/api/tvs/${tv}/profile`, { profileId: kid })).status).toBe(200);
    const k = (await call(channel(), 'GET', '/api/channel/kid')).body;
    expect(k.kidMode).toBe(true);
    expect(k.profile.name).toBe('Kid one');
    expect(k.time).toMatchObject({ leftMin: 60, limitMin: 60, percent: 100, color: 'hsl(120, 72%, 42%)', warning: false, timeUp: false, words: '1 hr left today' });
  });
});

describe('check 3: request flow', () => {
  it('kid asks for 20 min, adult approves: time left goes up by 20; logged', async () => {
    const before = left();
    const ask = await call(channel(), 'POST', '/api/channel/requests', { kind: 'time', minutes: 20 });
    expect([ask.status, ask.body.request.title]).toEqual([201, 'Kid one wants 20 more min']);
    const id = ask.body.request.id;
    // Asking twice does not make a second request.
    expect((await call(channel(), 'POST', '/api/channel/requests', { kind: 'time', minutes: 20 })).body.request.id).toBe(id);
    const list = (await call('adult', 'GET', '/api/requests')).body;
    expect(list.pending.map((r: any) => `${r.title} · ${r.sub}`)).toEqual([`Kid one wants 20 more min · Living room · just now · ${before} min left today`]);
    // The Guest PIN cannot see or answer requests (refused on the hub).
    expect((await call('guest', 'GET', '/api/requests')).status).toBe(403);
    expect((await call('guest', 'POST', `/api/requests/${id}`, { decision: 'approve' })).status).toBe(403);
    expect(left()).toBe(before);
    const ok = await call('adult', 'POST', `/api/requests/${id}`, { decision: 'approve' });
    expect([ok.status, ok.body.message]).toEqual([200, "Approved Kid one's request: 20 more min (+20 min)"]);
    expect(left()).toBe(before + 20);
    expect(ok.body.pending).toEqual([]);
    expect(ok.body.earlier[0].sub).toBe('Approved by Adult PIN · 10:00 AM');
    // Answered once only.
    expect((await call('adult', 'POST', `/api/requests/${id}`, { decision: 'deny' })).status).toBe(409);
    const row = getDb().prepare('SELECT status, decided_by, decided_device, outcome FROM kid_requests WHERE id = ?').get(id);
    expect(row).toEqual({ status: 'approved', decided_by: 'adult', decided_device: 'Computer', outcome: '+20 min' });
    const acts = listActivity({ limit: 10 }).map((a) => `${a.pin_type} ${a.device} ${a.action}: ${a.summary}`);
    expect(acts).toContain("adult Computer request.approve: Approved Kid one's request: 20 more min (+20 min)");
    expect(acts).toContain('kid Living room TV request.create: Kid one asked for 20 more min on Living room');
  });

  it('deny changes nothing; logged', async () => {
    const before = left();
    const id = (await call(channel(), 'POST', '/api/channel/requests', { kind: 'time', minutes: 15 })).body.request.id;
    const no = await call('adult', 'POST', `/api/requests/${id}`, { decision: 'deny' });
    expect(no.body.message).toBe("Denied Kid one's request: 15 more min");
    expect(left()).toBe(before);
    expect(getDb().prepare('SELECT status FROM kid_requests WHERE id = ?').get(id)).toEqual({ status: 'denied' });
    expect(listActivity({ limit: 3 }).map((a) => a.action)).toContain('request.deny');
    expect(no.body.earlier.map((r: any) => r.sub)).toContain('Denied by Adult PIN · 10:00 AM');
  });

  it('approving on the TV needs the Adult PIN: Guest PIN and wrong PIN refused (wrong counts toward the lockout)', async () => {
    resetLockout();
    const before = left();
    const id = (await call(channel(), 'POST', '/api/channel/requests', { kind: 'time', minutes: 10 })).body.request.id;
    const guest = await call(channel(), 'POST', `/api/channel/requests/${id}`, { pin: '2468', decision: 'approve' });
    expect([guest.status, guest.body.error]).toEqual([403, 'Approvals need the Adult PIN.']);
    const wrong = await call(channel(), 'POST', `/api/channel/requests/${id}`, { pin: '0000', decision: 'approve' });
    expect([wrong.status, wrong.body.error, wrong.body.triesLeft]).toEqual([403, 'Wrong PIN.', 4]);
    expect(lockState().failures).toBe(1);
    expect(left()).toBe(before);
    const ok = await call(channel(), 'POST', `/api/channel/requests/${id}`, { pin: '1357', decision: 'approve' });
    expect([ok.status, ok.body.message]).toEqual([200, "Approved Kid one's request: 10 more min (+10 min)"]);
    expect(left()).toBe(before + 10);
    expect(lockState().failures).toBe(0);
    expect(listActivity({ limit: 1 })[0]).toMatchObject({ pin_type: 'adult', device: 'Living room TV', action: 'request.approve' });
    // A request from another TV cannot be answered here.
    expect((await call(channel(), 'POST', `/api/channel/requests/9999`, { pin: '1357', decision: 'approve' })).status).toBe(404);
  });

  it('"can ask for more time" off: the hub refuses the request', async () => {
    updateRules(kid, { canAskForTime: false });
    const r = await call(channel(), 'POST', '/api/channel/requests', { kind: 'time', minutes: 20 });
    expect([r.status, r.body.error]).toEqual([403, 'Kid one cannot ask for more time (turned off in the profile).']);
    updateRules(kid, { canAskForTime: true });
  });

  it('a title request: only titles the kid may watch; approved, it starts on that TV', async () => {
    const adultTitle = await call(channel(), 'POST', '/api/channel/requests', { kind: 'title', titleKey: 'tv-9007' }); // Night Harbor, TV-MA
    expect(adultTitle.status).toBe(404);
    const ask = await call(channel(), 'POST', '/api/channel/requests', { kind: 'title', titleKey: 'tv-9006' }); // Moon Camp, TV-G
    expect(ask.body.request.title).toBe('Kid one wants to watch Moon Camp');
    roku.calls.length = 0;
    const ok = await call('adult', 'POST', `/api/requests/${ask.body.request.id}`, { decision: 'approve' });
    expect(ok.body.message).toBe("Approved Kid one's request: watch Moon Camp. Started Moon Camp on Living room.");
    expect(roku.calls.filter((c) => c.method === 'POST').map((c) => `${c.path} ${c.query.keyword ?? ''}`)).toEqual(['/search/browse Moon Camp']);
    expect((await call('adult', 'POST', `/api/tvs/${tv}/playback`, { action: 'stop' })).status).toBe(200);
  });
});

describe('check 4: task flow', () => {
  let toys: number;
  let teeth: number;
  let table: number;

  it('adults make tasks with a picture (Adult PIN only)', async () => {
    expect((await call('guest', 'POST', '/api/tasks', { name: 'Pick up toys', minutes: 15, picture: 'toys' })).status).toBe(403);
    const bad = await call('adult', 'POST', '/api/tasks', { name: 'Pick up toys', minutes: 15, picture: 'rocket' });
    expect([bad.status, bad.body.error]).toEqual([400, 'Pick one of the pictures.']);
    toys = (await call('adult', 'POST', '/api/tasks', { name: 'Pick up toys', minutes: 15, picture: 'toys' })).body.task.id;
    teeth = (await call('adult', 'POST', '/api/tasks', { name: 'Brush teeth', minutes: 20, picture: 'teeth' })).body.task.id;
    table = (await call('adult', 'POST', '/api/tasks', { name: 'Help set the table', minutes: 30, picture: 'table' })).body.task.id;
    const list = (await call('adult', 'GET', '/api/tasks')).body;
    expect(list.tasks.map((t: any) => `${t.emoji} ${t.name} +${t.minutes}`)).toEqual(['🪥 Brush teeth +20', '🍽️ Help set the table +30', '🧸 Pick up toys +15']);
    expect(list.kids[0].bonus).toEqual({ usedMin: 0, capMin: 60 });
  });

  it('kid marks done, adult approves: minutes added up to the weekly cap (60) and no further', async () => {
    const before = left();
    const r1 = await call(channel(), 'POST', '/api/channel/requests', { kind: 'task', taskId: toys });
    expect(r1.body.request.title).toBe('Task done: Pick up toys');
    expect((await call(channel(), 'GET', '/api/channel/kid')).body.tasks.find((t: any) => t.id === toys).state).toBe('pending');
    expect(left()).toBe(before); // nothing until an adult approves
    expect((await call('adult', 'POST', `/api/requests/${r1.body.request.id}`, { decision: 'approve' })).body.message).toBe("Approved Kid one's request: task done: Pick up toys (+15 min)");
    expect(left()).toBe(before + 15);
    // Done today: asking again is refused.
    expect((await call(channel(), 'POST', '/api/channel/requests', { kind: 'task', taskId: toys })).status).toBe(409);
    // The adult marks one done from the app: added at once.
    const m = await call('adult', 'POST', `/api/tasks/${teeth}/done`, { profileId: kid });
    expect(m.body.message).toBe('Marked Brush teeth done for Kid one: +20 min');
    expect(m.body.kid.bonus).toEqual({ usedMin: 35, capMin: 60 });
    expect(left()).toBe(before + 35);
    // 30 more would pass the cap: only 25 fit.
    const r3 = await call(channel(), 'POST', '/api/channel/requests', { kind: 'task', taskId: table });
    expect((await call('adult', 'POST', `/api/requests/${r3.body.request.id}`, { decision: 'approve' })).body.message).toBe("Approved Kid one's request: task done: Help set the table (+25 min (weekly cap reached))");
    expect(left()).toBe(before + 60);
    // The next day of the same week: the cap is reached, nothing more is added.
    T = local(17, 10);
    const beforeTue = left();
    const r4 = await call(channel(), 'POST', '/api/channel/requests', { kind: 'task', taskId: toys });
    expect((await call('adult', 'POST', `/api/requests/${r4.body.request.id}`, { decision: 'approve' })).body.message).toBe("Approved Kid one's request: task done: Pick up toys (weekly cap reached, no minutes added)");
    expect(left()).toBe(beforeTue);
    expect((await call(channel(), 'GET', '/api/channel/kid')).body.bonus).toEqual({ usedMin: 60, capMin: 60 });
    // Monday: the cap resets.
    T = local(23, 10);
    expect((await call(channel(), 'GET', '/api/channel/kid')).body.bonus).toEqual({ usedMin: 0, capMin: 60 });
    const r5 = await call(channel(), 'POST', '/api/channel/requests', { kind: 'task', taskId: toys });
    expect((await call('adult', 'POST', `/api/requests/${r5.body.request.id}`, { decision: 'approve' })).body.message).toBe("Approved Kid one's request: task done: Pick up toys (+15 min)");
    const grants = getDb().prepare("SELECT day, minutes, asked FROM time_grants WHERE source = 'task' ORDER BY id").all();
    expect(grants).toEqual([
      { day: '2026-11-16', minutes: 15, asked: 15 },
      { day: '2026-11-16', minutes: 20, asked: 20 },
      { day: '2026-11-16', minutes: 25, asked: 30 },
      { day: '2026-11-17', minutes: 0, asked: 15 },
      { day: '2026-11-23', minutes: 15, asked: 15 },
    ]);
  });

  it('tasks can be renamed and deleted; Activity history has each change', async () => {
    expect((await call('adult', 'PATCH', `/api/tasks/${table}`, { name: 'Set the table', minutes: 10 })).body.task.name).toBe('Set the table');
    expect((await call('adult', 'DELETE', `/api/tasks/${table}`)).status).toBe(200);
    expect((await call('adult', 'GET', '/api/tasks')).body.tasks.map((t: any) => t.name)).toEqual(['Brush teeth', 'Pick up toys']);
    const acts = listActivity({ limit: 4 }).map((a) => a.summary);
    expect(acts).toContain('Changed task Set the table: renamed Help set the table to Set the table, +10 min');
    expect(acts).toContain('Deleted task Set the table');
  });
});

describe('safeguards editor API', () => {
  it('the Adult PIN reads and changes the safeguards; the Guest PIN is refused; each change is logged', async () => {
    expect((await call('guest', 'GET', `/api/profiles/${kid}/safeguards`)).status).toBe(403);
    expect((await call('guest', 'PATCH', `/api/profiles/${kid}/safeguards`, { dailyLimits: { mon: 600 } })).status).toBe(403);
    const g = (await call('adult', 'GET', `/api/profiles/${kid}/safeguards`)).body;
    expect(g.rules.allowedRatings).toEqual(['TV-Y', 'TV-Y7', 'TV-G', 'G']);
    expect(g.ratings).toContain('PG-13');
    const p = await call('adult', 'PATCH', `/api/profiles/${kid}/safeguards`, {
      allowedRatings: ['TV-Y', 'G', 'PG'],
      dailyLimits: { mon: 45, fri: 90 },
      hoursStart: '08:00',
      hoursEnd: '20:00',
      warningMinutes: 10,
      windDown: false,
      blockedTitles: ['tv-9001'],
    });
    expect(p.status).toBe(200);
    expect(p.body.blocked).toEqual([{ key: 'tv-9001', name: 'Rocket Pals', rating: 'TV-Y', everyKid: false }]);
    expect(listActivity({ limit: 1 })[0].summary).toBe("Changed Kid one's safeguards: allowed ratings TV-Y, G, PG, blocked 1 title, Monday 45 min, viewing hours 8:00 AM to 8:00 PM, warning 10 min before, wind-down off");
    // Blocked and rating rules apply to the kid at once (the hub filters Browse).
    const browse = await call('guest', 'GET', `/api/catalog/browse?service=netflix&profile=${kid}`);
    const names = browse.body.rows.flatMap((r: any) => r.titles.map((t: any) => t.name));
    expect(names).not.toContain('Rocket Pals');
    expect(names).toContain('Robot Recess'); // PG, allowed now
    // Bad input is refused.
    expect((await call('adult', 'PATCH', `/api/profiles/${kid}/safeguards`, { hoursStart: '21:00', hoursEnd: '20:00' })).body.error).toBe('Viewing hours must end after they start.');
    expect((await call('adult', 'PATCH', `/api/profiles/${kid}/safeguards`, { allowedRatings: ['X'] })).status).toBe(400);
    expect((await call('adult', 'GET', `/api/profiles/${grown}/safeguards`)).status).toBe(404);
  });

  it('alerts and the watch log are Adult only', async () => {
    expect((await call('guest', 'GET', '/api/alerts')).status).toBe(403);
    expect((await call('adult', 'GET', '/api/alerts')).status).toBe(200);
    expect((await call('guest', 'GET', `/api/profiles/${kid}/watch-log`)).status).toBe(403);
    const w = (await call('adult', 'GET', `/api/profiles/${kid}/watch-log?week=2026-11-18`)).body.log;
    expect(w.week).toBe('2026-11-16');
    expect(w.days.map((d: any) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });

  it('a TV set to an adult profile is not in kid mode for the channel', async () => {
    setTvProfile(tv, grown, 'adult', T);
    expect((await call(channel(), 'GET', '/api/channel/kid')).body).toEqual({ kidMode: false });
  });
});
