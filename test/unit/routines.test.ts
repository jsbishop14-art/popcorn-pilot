// PP5 check 1, through the real route handlers, with a fake clock and a fake Roku: a routine runs its steps in order
// on the fake Roku (turn on, profile, volume, playlist, timer); a scheduled routine starts at its time; a step that
// fails stops the routine with a clear message and the steps after it do not run; Test now runs every step but does
// not set the timer; the timer turns the TV off at its time and can be cancelled; the channel runs a routine for
// its own TV only, never in kid mode; and the Guest PIN cannot make, run or test routines.
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { createProfile } from '@/lib/profiles';
import { getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';
import { newChannelToken } from '@/lib/tvs';
import { EVERYONE } from '@/lib/catalog';
import { appendItem, createPlaylist, titleFields } from '@/lib/playlists';
import { control, setClockForTests, tvView, type Actor } from '@/lib/playback';
import { getTv } from '@/lib/tvs';
import { updateRules } from '@/lib/safeguards';
import { routineTick, volumePressesToZero } from '@/lib/routines';
import { setTvProfile } from '@/lib/tvstate';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
type Who = 'adult' | 'guest' | { channel: string };

const ADULT: Actor = { pinType: 'adult', device: 'Computer' };
const MIN = 60_000;
const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };
let T = 0;

/** A local time: 2026-11-16 is a Monday. */
function local(day: number, h: number, m = 0): number {
  return new Date(2026, 10, day, h, m).getTime();
}

async function call(who: Who, method: string, urlPath: string, body?: unknown) {
  const segs = urlPath.split('?')[0].split('/');
  const id = segs.find((s) => /^\d+$/.test(s));
  const route = segs.map((s) => (/^\d+$/.test(s) ? '[id]' : s)).join('/');
  const mod = (await import(path.join(process.cwd(), 'app', route, 'route.ts'))) as Record<string, Handler>;
  const headers: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json' };
  if (typeof who === 'string') headers.cookie = cookies[who];
  else headers.authorization = `Bearer ${who.channel}`;
  const res = await mod[method](new Request(`http://hub.test${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: id ? { id } : {} });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let roku: FakeRoku;
let roku2: FakeRoku;
let tv: number;
let tv2: number;
let deadTv: number;
let kid: number;
let grown: number;
let cartoons: number;

function lastActivity() {
  const a = listActivity({ limit: 1 })[0];
  return { summary: a.summary, pinType: a.pin_type };
}

/** The ECP calls the fake Roku got, in order, with runs of the same key folded: "VolumeDown x100". */
function ecp(r: FakeRoku): string[] {
  const out: string[] = [];
  let last = '';
  let n = 0;
  const flush = () => {
    if (last) out.push(n > 1 ? `${last} x${n}` : last);
  };
  for (const c of r.calls.filter((c) => c.method === 'POST')) {
    const s = c.path.startsWith('/keypress/') ? c.path.slice('/keypress/'.length) : c.path.startsWith('/launch/') ? `launch ${c.path.slice(8)}${c.query.contentId ? `:${c.query.contentId}` : ''}` : `search ${c.query['provider-id']}:${c.query.keyword}`;
    if (s === last) n++;
    else {
      flush();
      last = s;
      n = 1;
    }
  }
  flush();
  return out;
}

const MORNING = () => ({
  name: 'Morning cartoons',
  icon: 'sun',
  tvId: tv,
  steps: [
    { kind: 'power_on' },
    { kind: 'profile', profileId: kid },
    { kind: 'volume', volume: 18 },
    { kind: 'playlist', playlistId: cartoons },
    { kind: 'timer', minutes: 45 },
  ],
  schedule: { on: true, days: ['mon', 'tue', 'wed', 'thu', 'fri'], time: '07:00' },
});

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
  // The kid may watch from 7:00 to 20:00, 3 hours a day.
  const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 180]));
  updateRules(kid, { hoursStart: '07:00', hoursEnd: '20:00', dailyLimits: days });
  grown = createProfile({ name: 'Family', color: '#FFC94A', type: 'adult' }).id;
  roku = await startFakeRoku({ name: 'Living room' });
  roku2 = await startFakeRoku({ name: 'Guest room' });
  const ins = getDb().prepare('INSERT INTO tvs (name, address, port, online) VALUES (?, ?, ?, 1)');
  tv = Number(ins.run('Living room', '127.0.0.1', roku.port).lastInsertRowid);
  tv2 = Number(ins.run('Guest room', '127.0.0.1', roku2.port).lastInsertRowid);
  // A TV that does not answer (nothing listens on port 9).
  deadTv = Number(ins.run('Garage', '127.0.0.1', 9).lastInsertRowid);
  const p = createPlaylist({ name: 'Saturday Cartoons' });
  appendItem(p.id, await titleFields(EVERYONE, 'tv-9001', undefined, { mode: 'episodes', episodes: 4 })); // Rocket Pals, 22 min episodes
  cartoons = p.id;
});

beforeEach(async () => {
  // The tests follow one another on the same TVs (a run, then its timer): only the call lists are reset.
  roku.calls.length = 0;
  roku2.calls.length = 0;
  roku.state.power = 'standby';
  roku.state.volume = 30;
});

afterAll(async () => {
  setClockForTests(null);
  await roku?.close();
  await roku2?.close();
});

describe('check 1: a routine runs its steps in order on the fake Roku', () => {
  let id: number;

  it('make it (mockup RoutineEditor); the list shows its schedule, TV and profile', async () => {
    const r = await call('adult', 'POST', '/api/routines', MORNING());
    expect(r.status).toBe(201);
    id = r.body.routine.id;
    expect(r.body.routine.summary).toBe('Weekdays 7:00 AM · Living room · Kid one');
    expect(r.body.routine.steps.map((s: any) => `${s.n} ${s.name} ${s.value}`)).toEqual(['1 Turn on Living room', '2 Profile Kid one', '3 Volume 18', '4 Playlist Saturday Cartoons', '5 Timer 45 min']);
    expect(lastActivity().summary).toBe(
      'Made the routine Morning cartoons for Living room: Turn on Living room, Profile Kid one, Volume 18, Playlist Saturday Cartoons, Timer 45 min; Weekdays 7:00 AM',
    );
  });

  it('Run: turn on, profile, volume 18, playlist, timer, in that order', async () => {
    const r = await call('adult', 'POST', `/api/routines/${id}/run`);
    expect(r.status).toBe(200);
    expect(r.body.result.ok).toBe(true);
    expect(r.body.result.message).toBe('Morning cartoons: all 5 steps done on Living room.');
    expect(r.body.result.steps.map((s: any) => s.words)).toEqual([
      'Turned Living room on',
      'Switched Living room to Kid one (kid mode)',
      'Set the volume on Living room to 18',
      'Started Saturday Cartoons on Living room (Rocket Pals)',
      'Living room turns off at 10:45 AM',
    ]);
    // The fake Roku saw the steps in order: on; the kid home screen (the profile switch); the volume to 0 then up
    // to 18; the playlist's first title.
    expect(ecp(roku)).toEqual(['PowerOn', 'launch dev', `VolumeDown x${volumePressesToZero()}`, 'VolumeUp x18', 'launch 12:81000001']);
    expect(roku.state.power).toBe('on');
    expect(roku.state.volume).toBe(18);
    const v = tvView(getTv(tv)!, T);
    expect(v.profile).toEqual({ id: kid, name: 'Kid one', kid: true });
    expect(v.playback?.name).toBe('Saturday Cartoons');
    expect(v.playback?.profileName).toBe('Kid one');
    expect(r.body.routine.timer.words).toBe('Turns Living room off at 10:45 AM');
    expect(lastActivity().summary).toMatch(/^Ran Morning cartoons on Living room: Turned Living room on; .*; Living room turns off at 10:45 AM$/);
  });

  it('the timer turns the TV off at its time (fake clock), and what it played stops', async () => {
    T += 45 * MIN - 1;
    expect((await routineTick()).timers).toBe(0);
    expect(ecp(roku)).not.toContain('PowerOff');
    T += 1;
    expect((await routineTick()).timers).toBe(1);
    expect(ecp(roku).at(-1)).toBe('PowerOff');
    expect(tvView(getTv(tv)!, T).playback).toBeNull();
    expect(lastActivity().summary).toBe('Timer from Morning cartoons: turned Living room off and stopped Saturday Cartoons');
    // Once only.
    T += MIN;
    expect((await routineTick()).timers).toBe(0);
    expect((await call('adult', 'GET', `/api/routines/${id}`)).body.routine.timer).toBeNull();
  });

  it('a scheduled routine starts at its time (fake clock), once a day, on its days only', async () => {
    T = local(17, 6, 59); // Tuesday 6:59
    expect((await routineTick()).started).toBe(0);
    expect(ecp(roku)).toEqual([]);
    T = local(17, 7, 0);
    expect((await routineTick()).started).toBe(1);
    expect(ecp(roku)).toEqual(['PowerOn', 'launch dev', `VolumeDown x${volumePressesToZero()}`, 'VolumeUp x18', 'launch 12:81000001']);
    expect(lastActivity().summary).toMatch(/^Ran \(schedule\) Morning cartoons on Living room: /);
    expect(lastActivity().pinType).toBe('hub');
    T = local(17, 7, 5);
    expect((await routineTick()).started).toBe(0);
    // Saturday is not one of its days. Tuesday's 45 min timer was missed (no tick ran since): it is dropped, not
    // carried out days late.
    await control(ADULT, tv, 'stop');
    roku.calls.length = 0;
    T = local(21, 7, 0);
    expect(await routineTick()).toEqual({ timers: 0, started: 0 });
    expect(ecp(roku)).toEqual([]);
    const missed = getDb().prepare("SELECT timer_note FROM routine_runs WHERE started_by = 'hub' ORDER BY id DESC LIMIT 1").get() as { timer_note: string };
    expect(missed.timer_note).toBe('missed: the hub was not running at that time');
    // Too late: a hub that comes back at 7:30 does not start a morning routine.
    T = local(24, 7, 30);
    expect((await routineTick()).started).toBe(0);
  });

  it('a step that fails stops the routine with a clear message; the steps after it do not run', async () => {
    // The kid may not watch before 7:00: the playlist step is refused by the kid rules on the hub, so no timer.
    T = local(25, 6, 30);
    const r = await call('adult', 'POST', `/api/routines/${id}/run`);
    expect(r.status).toBe(200);
    expect(r.body.result.ok).toBe(false);
    expect(r.body.result.steps.map((s: any) => [s.n, s.ok])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ]);
    expect(r.body.result.message).toMatch(/^Morning cartoons stopped at step 4 \(Playlist\): .*viewing hours/);
    expect(r.body.routine.timer).toBeNull();
    expect(r.body.routine.lastRun.status).toBe('failed');
    expect(lastActivity().summary).toMatch(/^Ran Morning cartoons stopped at step 4 \(Playlist\)/);
    // A TV that does not answer: step 1 fails, nothing else is tried.
    const dead = (await call('adult', 'POST', '/api/routines', { ...MORNING(), name: 'Garage', tvId: deadTv, schedule: { on: false } })).body.routine.id;
    const d = await call('adult', 'POST', `/api/routines/${dead}/run`);
    expect(d.body.result.steps).toHaveLength(1);
    expect(d.body.result.message).toBe('Garage stopped at step 1 (Turn on): Garage did not answer. Check it is plugged in and on the home Wi-Fi.');
  });

  it('Test now runs the editor steps (unsaved) but does not set the timer', async () => {
    T = local(25, 10);
    const def = { ...MORNING(), name: 'Movie night', tvId: tv2, steps: [{ kind: 'power_on' }, { kind: 'volume', volume: 5 }, { kind: 'timer', minutes: 90 }] };
    const r = await call('adult', 'POST', '/api/routines/test', def);
    expect(r.status).toBe(200);
    expect(r.body.result.ok).toBe(true);
    expect(r.body.result.message).toBe('Test of Movie night: all 3 steps done on Guest room.');
    expect(r.body.result.steps[2].words).toBe('Would turn Guest room off at 11:30 AM (not set in a test)');
    expect(roku2.state.volume).toBe(5);
    T += 91 * MIN;
    expect((await routineTick()).timers).toBe(0);
    expect(ecp(roku2)).not.toContain('PowerOff');
    expect(lastActivity().summary).toMatch(/^Tested Movie night on Guest room: /);
  });

  it('a timer can be cancelled; a newer timer on the same TV replaces an older one', async () => {
    T = local(25, 12);
    const a = (await call('adult', 'POST', '/api/routines', { name: 'Nap', tvId: tv2, steps: [{ kind: 'timer', minutes: 30 }] })).body.routine.id;
    const b = (await call('adult', 'POST', '/api/routines', { name: 'Quiet', tvId: tv2, steps: [{ kind: 'timer', minutes: 60 }] })).body.routine.id;
    await call('adult', 'POST', `/api/routines/${a}/run`);
    await call('adult', 'POST', `/api/routines/${b}/run`);
    expect((await call('adult', 'GET', `/api/routines/${a}`)).body.routine.timer).toBeNull();
    expect((await call('adult', 'GET', `/api/routines/${b}`)).body.routine.timer.words).toBe('Turns Guest room off at 1:00 PM');
    const c = await call('adult', 'DELETE', `/api/routines/${b}/timer`);
    expect(c.status).toBe(200);
    expect(lastActivity().summary).toBe('Cancelled the Quiet timer (Guest room stays on)');
    T += 61 * MIN;
    expect((await routineTick()).timers).toBe(0);
    expect((await call('adult', 'DELETE', `/api/routines/${b}/timer`)).status).toBe(404);
  });

  it('the editor refuses a routine with no steps, a step twice, or a volume out of range', async () => {
    const bad = async (over: Record<string, unknown>) => (await call('adult', 'POST', '/api/routines', { ...MORNING(), ...over })).body.error;
    expect(await bad({ steps: [] })).toBe('Add at least one step.');
    expect(await bad({ steps: [{ kind: 'timer', minutes: 5 }, { kind: 'timer', minutes: 9 }] })).toBe('A routine has one Timer step.');
    expect(await bad({ steps: [{ kind: 'volume', volume: 101 }] })).toBe('Volume is a whole number from 0 to 100.');
    expect(await bad({ name: '' })).toBe('Give the routine a name.');
    expect(await bad({ tvId: 999 })).toBe('Pick the TV this routine sets up.');
    expect(await bad({ schedule: { on: true, days: [], time: '07:00' } })).toBe('Pick at least one day for the schedule.');
  });

  it('edit and delete; each change is in Activity history', async () => {
    const r = await call('adult', 'PATCH', `/api/routines/${id}`, { ...MORNING(), name: 'Early cartoons', schedule: { on: false } });
    expect(r.status).toBe(200);
    expect(r.body.routine.summary).toBe('Manual · Living room · Kid one');
    expect(lastActivity().summary).toBe('Edited the routine Early cartoons: renamed to Early cartoons, schedule off');
    const tmp = (await call('adult', 'POST', '/api/routines', { name: 'Gone soon', tvId: tv, steps: [{ kind: 'power_on' }] })).body.routine.id;
    expect((await call('adult', 'DELETE', `/api/routines/${tmp}`)).status).toBe(200);
    expect((await call('adult', 'GET', '/api/routines')).body.routines.map((x: any) => x.name)).not.toContain('Gone soon');
    expect((await call('adult', 'POST', `/api/routines/${tmp}/run`)).status).toBe(404);
  });
});

describe('who may run routines', () => {
  it('the Guest PIN cannot see, make, run or test routines (403 from the hub)', async () => {
    const id = (await call('adult', 'GET', '/api/routines')).body.routines[0].id;
    for (const [m, p, b] of [
      ['GET', '/api/routines', undefined],
      ['POST', '/api/routines', MORNING()],
      ['POST', `/api/routines/${id}/run`, undefined],
      ['POST', '/api/routines/test', MORNING()],
    ] as const)
      expect(`${m} ${p} ${(await call('guest', m, p, b)).status}`).toBe(`${m} ${p} 403`);
  });

  it('the TV home screen runs a routine for its own TV, never in kid mode, never another TV', async () => {
    T = local(26, 10);
    const mine = (await call('adult', 'POST', '/api/routines', { name: 'Movie night', tvId: tv2, steps: [{ kind: 'profile', profileId: grown }, { kind: 'volume', volume: 25 }] })).body.routine.id;
    const other = (await call('adult', 'GET', '/api/routines')).body.routines.find((x: any) => x.tvId === tv).id;
    const token = newChannelToken(tv2) as string;
    const home = await call({ channel: token }, 'GET', '/api/channel/home');
    expect(home.body.routines.map((x: any) => x.name)).toEqual(['Movie night', 'Nap', 'Quiet']);
    const ok = await call({ channel: token }, 'POST', `/api/channel/routines/${mine}/run`);
    expect([ok.status, ok.body.result.ok]).toEqual([200, true]);
    expect(roku2.state.volume).toBe(25);
    expect(lastActivity().summary).toMatch(/^Ran \(from the TV\) Movie night on Guest room/);
    expect((await call({ channel: token }, 'POST', `/api/channel/routines/${other}/run`)).status).toBe(404);
    // In kid mode: no routines on the home screen, and running one is refused.
    setTvProfile(tv2, kid, 'adult', T);
    expect((await call({ channel: token }, 'GET', '/api/channel/home')).body.routines).toEqual([]);
    const kidRun = await call({ channel: token }, 'POST', `/api/channel/routines/${mine}/run`);
    expect([kidRun.status, kidRun.body.error]).toEqual([403, 'Leaving kid mode needs the Adult PIN.']);
  });
});
