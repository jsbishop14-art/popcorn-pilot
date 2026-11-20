// PP6 check 3: the hub API contract for every call the Roku channel makes, through the real route handlers, with
// the channel token (allow) and without it, with a wrong token, another TV's token and each PIN (deny). And what
// those calls do: pairing (the token reaches the channel by a launch on the TV; the old one stops working), the TV's
// profile picker (PIN rules), the picker board (6 tiles for a kid, only titles it may watch), picking a title,
// starting a playlist, the Now playing bridge (countdown, Play now, Skip), the time warning screen in the middle of
// an episode, and the channel opening when a TV is turned on. Against fake Rokus and a fake clock.
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { lockState, setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { createProfile } from '@/lib/profiles';
import { getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';
import { newChannelToken } from '@/lib/tvs';
import { EVERYONE } from '@/lib/catalog';
import { appendItem, createPlaylist, titleFields } from '@/lib/playlists';
import { BRIDGE_MS, WARNING_SCREEN_MS, control, setClockForTests, tick, type Actor } from '@/lib/playback';
import { updateRules } from '@/lib/safeguards';
import { kidModeProfile, setTvProfile } from '@/lib/tvstate';
import { powerOnPass, resetPowerOnForTests } from '@/lib/snapback';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
type Who = 'adult' | 'guest' | 'none' | { channel: string };

const ADULT: Actor = { pinType: 'adult', device: 'Computer' };
const MIN = 60_000;
const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };
let T = 0;

function local(day: number, h: number, m = 0): number {
  return new Date(2026, 10, day, h, m).getTime();
}

/** Call a route handler. Numeric path segments become [id]; so does the picture id after /art/. */
async function call(who: Who, method: string, urlPath: string, body?: unknown) {
  const segs = urlPath.split('?')[0].split('/');
  const artAt = segs.indexOf('art');
  const id = artAt > 0 ? segs[artAt + 1] : segs.find((s) => /^\d+$/.test(s));
  const routeDir = segs.map((s, i) => (/^\d+$/.test(s) || (artAt > 0 && i === artAt + 1) ? '[id]' : s)).join('/');
  const mod = (await import(path.join(process.cwd(), 'app', routeDir, 'route.ts'))) as Record<string, Handler>;
  const headers: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json' };
  if (who === 'adult' || who === 'guest') headers.cookie = cookies[who];
  else if (who !== 'none') headers.authorization = `Bearer ${who.channel}`;
  const res = await mod[method](new Request(`http://hub.test${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), {
    params: id ? { id } : {},
  });
  const text = await res.text();
  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(text) as Record<string, any>;
  } catch {
    parsed = { raw: text.length };
  }
  return { status: res.status, denied: res.headers.get('x-pp-denied'), type: res.headers.get('content-type'), body: parsed };
}

function launches(r: FakeRoku): string[] {
  return r.calls
    .filter((c) => c.method === 'POST' && (c.path.startsWith('/launch/') || c.path === '/search/browse'))
    .map((c) => (c.path === '/search/browse' ? `search:${c.query['provider-id']}:${c.query.keyword}` : `${c.path.slice(8)}:${c.query.contentId ?? ''}`));
}

function since<T>(xs: T[], n: number): T[] {
  return xs.slice(n);
}

const RP = 'tv-9001'; // Rocket Pals, Netflix, TV-Y, 22 min episodes, direct link
const PJ = 'tv-9101'; // Puddle Jumpers, Prime Video, TV-Y, 11 min episodes, search launch
const NH = 'tv-9007'; // Night Harbor, Netflix, TV-MA
const L_RP = '12:81000001';
const L_PJ = 'search:13:Puddle Jumpers';

let roku: FakeRoku;
let roku2: FakeRoku;
let tv: number;
let tv2: number;
let kid: number;
let grown: number;
let token: string;
let token2: string;
let listId: number;
const channel = () => ({ channel: token });

async function playlist(name: string, items: { key: string; mode?: string; episodes?: number }[]) {
  const p = createPlaylist({ name });
  for (const it of items) appendItem(p.id, await titleFields(EVERYONE, it.key, undefined, { mode: it.mode ?? 'episodes', episodes: it.episodes ?? 1 }));
  return p.id;
}

beforeAll(async () => {
  freshDataDir();
  process.env.PP_HUB_URL = 'http://192.168.1.50:3000';
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
  const allDay = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 720]));
  // Wind-down off here: these checks are the bridge and the warning (wind-down is checked in safeguards.test).
  updateRules(kid, { hoursStart: '00:00', hoursEnd: '24:00', dailyLimits: allDay, allowedRatings: ['TV-Y', 'G'], windDown: false });
  roku = await startFakeRoku({ name: 'Living room' });
  roku2 = await startFakeRoku({ name: 'Guest room' });
  const ins = getDb().prepare("INSERT INTO tvs (name, room, address, port, online) VALUES (?, ?, '127.0.0.1', ?, 1)");
  tv = Number(ins.run('Living room', 'Living room', roku.port).lastInsertRowid);
  tv2 = Number(ins.run('Guest room', 'Guest room', roku2.port).lastInsertRowid);
  token = newChannelToken(tv) as string;
  token2 = newChannelToken(tv2) as string;
  listId = await playlist('Saturday Cartoons', [{ key: RP }, { key: PJ }, { key: NH }]);
});

afterAll(async () => {
  setClockForTests(null);
  delete process.env.PP_HUB_URL;
  await roku?.close();
  await roku2?.close();
});

// Every call the channel makes (roku/source and roku/components: grep "hub.request" and "/api/channel/"), with a
// body that passes the route wrapper. The art id is a stub poster.
const CALLS: [string, string, unknown?][] = [
  ['GET', '/api/channel/hello'],
  ['GET', '/api/channel/home'],
  ['GET', '/api/channel/now-playing'],
  ['GET', '/api/channel/kid'],
  ['GET', '/api/channel/album'],
  ['GET', '/api/channel/album/999'],
  ['GET', '/api/channel/board'],
  ['GET', '/api/channel/art/stub-9001.svg'],
  ['POST', '/api/channel/profile', { profileId: 999 }],
  ['POST', '/api/channel/playlists/999/start', {}],
  ['POST', '/api/channel/play', { titleKey: 'none' }],
  ['POST', '/api/channel/bridge', { action: 'play' }],
  ['POST', '/api/channel/requests', { kind: 'time', minutes: 20 }],
  ['POST', '/api/channel/requests/999', { pin: '0000', decision: 'approve' }],
  ['POST', '/api/channel/routines/999/run', {}],
];

describe('check 3: every channel call, with the channel token (allow) and without (deny)', () => {
  for (const [method, p, b] of CALLS) {
    it(`${method} ${p}: channel token allowed; no token, a wrong token, the Adult PIN and the Guest PIN denied`, async () => {
      // Allowed: the route wrapper lets the token through to the handler (which may still answer 404 or 409 for
      // these placeholder ids, or 403 for asking outside kid mode: refusals decided by the rules, not the role).
      const ok = await call(channel(), method, p, b);
      expect(ok.denied).toBeNull();
      expect(ok.status).not.toBe(401);
      for (const who of ['none', { channel: 'wrong-token' }] as Who[]) {
        const r = await call(who, method, p, b);
        expect([r.status, r.denied]).toEqual([401, 'signed_out']);
      }
      for (const who of ['adult', 'guest'] as const) {
        const r = await call(who, method, p, b);
        expect([r.status, r.denied]).toEqual([403, who]);
      }
    });
  }

  it('the channel answers only for its own TV (each token sees its own TV)', async () => {
    expect((await call(channel(), 'GET', '/api/channel/hello')).body.tv.id).toBe(tv);
    expect((await call({ channel: token2 }, 'GET', '/api/channel/hello')).body.tv.id).toBe(tv2);
    expect((await call({ channel: token2 }, 'GET', '/api/channel/home')).body.tv.name).toBe('Guest room');
  });

  it('cover art for the channel is the picture itself; the home screen sends the channel art addresses', async () => {
    const art = await call(channel(), 'GET', '/api/channel/art/stub-9001.svg');
    expect(art.status).toBe(200);
    expect(art.type).toMatch(/^image\//);
    const home = (await call(channel(), 'GET', '/api/channel/home')).body;
    expect(home.playlists[0].covers.length).toBeGreaterThan(0);
    for (const c of home.playlists[0].covers) expect(c).toMatch(/^\/api\/channel\/art\//);
  });
});

describe('pairing the channel (Adult PIN, Settings > TV)', () => {
  it('a new token reaches the channel by a launch on the TV with the hub address; the old one stops working', async () => {
    const before = roku.calls.length;
    const r = await call('adult', 'POST', `/api/tvs/${tv}/pair`, {});
    expect([r.status, r.body.message]).toEqual([200, 'Paired the Popcorn Pilot channel on Living room']);
    const launch = since(roku.calls, before).find((c) => c.path === '/launch/dev');
    expect(launch?.query.contentId).toBe('pair');
    expect(launch?.query.pp_hub).toBe('http://192.168.1.50:3000');
    const fresh = launch?.query.pp_token as string;
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await call({ channel: token }, 'GET', '/api/channel/hello')).status).toBe(401);
    expect((await call({ channel: fresh }, 'GET', '/api/channel/hello')).body.tv.id).toBe(tv);
    token = fresh;
    // Activity history says it was paired, and never holds the token.
    const a = listActivity({ limit: 5 }).find((x) => x.action === 'tv.channel_pair');
    expect(a?.summary).toBe('Paired the Popcorn Pilot channel on Living room');
    expect(JSON.stringify(listActivity({ limit: 50 }))).not.toContain(fresh);
  });

  it('the Guest PIN cannot pair; a TV that does not answer keeps its old token', async () => {
    expect((await call('guest', 'POST', `/api/tvs/${tv}/pair`, {})).status).toBe(403);
    roku.state.failChannels = ['dev'];
    const r = await call('adult', 'POST', `/api/tvs/${tv}/pair`, {});
    roku.state.failChannels = [];
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/^Living room did not open the Popcorn Pilot channel/);
    expect((await call(channel(), 'GET', '/api/channel/hello')).status).toBe(200);
  });
});

describe('the TV profile picker (handoff 3.4): PINs checked on the hub', () => {
  it('a kid profile needs no PIN and puts the TV in kid mode', async () => {
    const r = await call(channel(), 'POST', '/api/channel/profile', { profileId: kid });
    expect([r.status, r.body.message]).toEqual([200, 'Switched Living room to Kid one (kid mode)']);
    expect(kidModeProfile(tv)).toBe(kid);
    const home = (await call(channel(), 'GET', '/api/channel/home')).body;
    expect([home.kidMode, home.profile.name, home.routines]).toEqual([true, 'Kid one', []]);
  });

  it('leaving kid mode needs the Adult PIN: no PIN, the Guest PIN and a wrong PIN are refused (wrong counts)', async () => {
    resetLockout();
    const none = await call(channel(), 'POST', '/api/channel/profile', { profileId: grown });
    expect([none.status, none.body.error, none.body.needPin]).toEqual([401, 'Leaving kid mode needs the Adult PIN.', 'adult']);
    const g = await call(channel(), 'POST', '/api/channel/profile', { profileId: grown, pin: '2468' });
    expect([g.status, g.body.error]).toEqual([403, 'Leaving kid mode needs the Adult PIN.']);
    const g2 = await call(channel(), 'POST', '/api/channel/profile', { profileId: null, pin: '2468' });
    expect(g2.status).toBe(403);
    const w = await call(channel(), 'POST', '/api/channel/profile', { profileId: grown, pin: '0000' });
    expect([w.status, w.body.error, w.body.triesLeft]).toEqual([403, 'Wrong PIN.', 4]);
    expect(lockState().failures).toBe(1);
    expect(kidModeProfile(tv)).toBe(kid);
    const ok = await call(channel(), 'POST', '/api/channel/profile', { profileId: grown, pin: '1357' });
    expect([ok.status, ok.body.message]).toEqual([200, 'Switched Living room to Family']);
    expect(kidModeProfile(tv)).toBeNull();
    expect(listActivity({ limit: 3 }).find((x) => x.action === 'tv.profile')).toMatchObject({ pin_type: 'adult', device: 'Living room TV' });
  });

  it('out of kid mode: an adult profile needs the Adult PIN; Guest (no profile) takes either PIN', async () => {
    resetLockout();
    const g = await call(channel(), 'POST', '/api/channel/profile', { profileId: grown, pin: '2468' });
    expect([g.status, g.body.error]).toEqual([403, 'This profile needs the Adult PIN.']);
    const none = await call(channel(), 'POST', '/api/channel/profile', { profileId: null });
    expect([none.status, none.body.needPin]).toEqual([401, 'any']);
    const guest = await call(channel(), 'POST', '/api/channel/profile', { profileId: null, pin: '2468' });
    expect([guest.status, guest.body.message]).toEqual([200, 'Switched Living room to no profile']);
    expect((await call(channel(), 'GET', '/api/channel/home')).body.profile).toBeNull();
  });
});

describe('the picker board and picking a title', () => {
  it('a kid gets 6 tiles, all titles it may watch, the playlists\' titles first; an adult gets 12', async () => {
    await call(channel(), 'POST', '/api/channel/profile', { profileId: kid });
    const k = (await call(channel(), 'GET', '/api/channel/board')).body;
    expect(k.kid).toBe(true);
    expect(k.tiles).toHaveLength(6);
    expect(k.tiles.slice(0, 2).map((t: { key: string }) => t.key)).toEqual([RP, PJ]);
    const stub = ((await import('../../catalog-stub/titles.json')).default as unknown as { titles: { key: string; rating: string | null }[] }).titles;
    for (const t of k.tiles) expect(['TV-Y', 'G']).toContain(stub.find((s) => s.key === t.key)?.rating);
    expect(k.tiles.map((t: { key: string }) => t.key)).not.toContain(NH);
    for (const t of k.tiles) if (t.poster) expect(t.poster).toMatch(/^\/api\/channel\/art\//);
    const a = (await call({ channel: token2 }, 'GET', '/api/channel/board')).body;
    expect([a.kid, a.tiles.length]).toEqual([false, 12]);
    expect(a.tiles.map((t: { key: string }) => t.key)).toContain(NH);
  });

  it('a kid picks an allowed title: it plays; a title its rules do not allow is refused and never launched', async () => {
    const before = roku.calls.length;
    const bad = await call(channel(), 'POST', '/api/channel/play', { titleKey: NH });
    expect([bad.status >= 400, bad.status === 401 || bad.status === 403 ? 'route' : 'handler']).toEqual([true, 'handler']);
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([]);
    const ok = await call(channel(), 'POST', '/api/channel/play', { titleKey: RP });
    expect([ok.status, ok.body.message]).toEqual([200, 'Started Rocket Pals on Living room']);
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP]);
    await control(ADULT, tv, 'stop');
  });

  it('a playlist started from the TV plays for the TV\'s kid: titles it may not watch are never launched', async () => {
    const before = roku.calls.length;
    const r = await call(channel(), 'POST', `/api/channel/playlists/${listId}/start`, {});
    expect(r.status).toBe(200);
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP]);
    const np = (await call(channel(), 'GET', '/api/channel/now-playing')).body;
    expect(np.nowPlaying.title.name).toBe('Rocket Pals');
    expect(np.upNext.name).toBe('Puddle Jumpers');
    expect((await call(channel(), 'GET', '/api/channel/home')).body.keepWatching).toEqual({ playlistId: listId, name: 'Saturday Cartoons' });
    await control(ADULT, tv, 'stop');
  });
});

describe('the Now playing bridge between titles (handoff 6.7), on a TV with the channel paired', () => {
  it('a title ends: the channel shows the bridge, the next title starts when the countdown ends', async () => {
    await call(channel(), 'POST', '/api/channel/profile', { profileId: kid });
    const t0 = T;
    let before = roku.calls.length;
    await call(channel(), 'POST', `/api/channel/playlists/${listId}/start`, {});
    T = t0 + 22 * MIN + 1000;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP, 'dev:bridge']);
    const np = (await call(channel(), 'GET', '/api/channel/now-playing')).body;
    expect(np.nowPlaying.title).toBeNull();
    expect(np.upNext).toMatchObject({ name: 'Puddle Jumpers', service: 'Prime Video', position: '2 of 3' });
    expect(np.bridge).toEqual({ startsInSec: BRIDGE_MS / 1000, warning: null });
    before = roku.calls.length;
    T += BRIDGE_MS - 3000;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([]);
    T += 3000;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_PJ]);
    expect((await call(channel(), 'GET', '/api/channel/now-playing')).body.bridge).toBeNull();
    // Not on the bridge: Play now and Skip have nothing to do.
    expect((await call(channel(), 'POST', '/api/channel/bridge', { action: 'play' })).status).toBe(409);
    await control(ADULT, tv, 'stop');
  });

  it('Play now starts the next title at once; Skip skips it (the playlist moves on when none is left)', async () => {
    const two = await playlist('Two', [{ key: RP }, { key: PJ }, { key: RP }]);
    const t0 = T;
    let before = roku.calls.length;
    await call(channel(), 'POST', `/api/channel/playlists/${two}/start`, {});
    T = t0 + 22 * MIN + 1000;
    await tick();
    const now1 = await call(channel(), 'POST', '/api/channel/bridge', { action: 'play' });
    expect([now1.status, now1.body.message]).toEqual([200, 'Play now on Living room: Puddle Jumpers (Two)']);
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP, 'dev:bridge', L_PJ]);
    before = roku.calls.length;
    T += 11 * MIN + 1000;
    await tick();
    const skip = await call(channel(), 'POST', '/api/channel/bridge', { action: 'skip' });
    expect([skip.status, skip.body.message]).toEqual([200, 'Skipped Rocket Pals on Living room (Two, from the TV)']);
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual(['dev:bridge']);
    expect((await call(channel(), 'GET', '/api/channel/now-playing')).body.nowPlaying).toBeNull();
    expect((await call(channel(), 'POST', '/api/channel/bridge', { action: 'rewind' })).status).toBe(404);
  });

  it('a TV without the channel paired goes straight to the next title (as before PP6)', async () => {
    getDb().prepare('UPDATE tvs SET channel_token_hash = NULL WHERE id = ?').run(tv2);
    const t0 = T;
    const before = roku2.calls.length;
    const { startPlaylist } = await import('@/lib/playback');
    await startPlaylist(ADULT, { playlistId: listId, tvIds: [tv2], profile: grown });
    T = t0 + 22 * MIN + 1000;
    await tick();
    expect(launches({ ...roku2, calls: since(roku2.calls, before) })).toEqual([L_RP, L_PJ]);
    await control(ADULT, tv2, 'stop');
    token2 = newChannelToken(tv2) as string;
  });
});

describe('the time warning (handoff 9.5)', () => {
  it('on the bridge before the last episode: the warning and "last episode" are on the bridge screen', async () => {
    // 35 minutes today: after Rocket Pals (22), 13 are left, so Puddle Jumpers (11 min) is the last episode (after it,
    // less than half an episode would be left).
    const day = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 720]));
    T = local(17, 10);
    updateRules(kid, { dailyLimits: { ...day, tue: 35 }, warningMinutes: 10 });
    setTvProfile(tv, kid, 'adult', T);
    const t0 = T;
    await call(channel(), 'POST', `/api/channel/playlists/${listId}/start`, {});
    T = t0 + 22 * MIN + 1000;
    await tick();
    const np = (await call(channel(), 'GET', '/api/channel/now-playing')).body;
    expect(np.bridge).toEqual({ startsInSec: 8, warning: { leftMin: 13, lastEpisode: true } });
    const kidView = (await call(channel(), 'GET', '/api/channel/kid')).body;
    // 13 minutes left is more than the 10 minute warning: the kid screens do not warn yet; the bridge does, because
    // the next title is the last one today.
    expect([kidView.time.warning, kidView.time.leftMin]).toEqual([false, 13]);
    await control(ADULT, tv, 'stop');
  });

  it('still due in the middle of an episode: the warning screen comes up briefly, then the title opens again', async () => {
    const day = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 720]));
    T = local(18, 10);
    updateRules(kid, { dailyLimits: { ...day, wed: 40 }, warningMinutes: 5 });
    const stay = await playlist('Stay', [{ key: RP, mode: 'stay' }]);
    const t0 = T;
    const before = roku.calls.length;
    await call(channel(), 'POST', `/api/channel/playlists/${stay}/start`, {});
    T = t0 + 30 * MIN;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP]);
    T = t0 + 35 * MIN + 1000;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP, 'dev:time-warning']);
    expect(listActivity({ limit: 5 }).some((a) => a.action === 'kid.warning')).toBe(true);
    T += WARNING_SCREEN_MS;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP, 'dev:time-warning', L_RP]);
    T += 60_000;
    await tick();
    expect(launches({ ...roku, calls: since(roku.calls, before) })).toEqual([L_RP, 'dev:time-warning', L_RP]);
    await control(ADULT, tv, 'stop');
  });
});

describe('the channel opens when a TV is turned on (handoff 9.4)', () => {
  it('a paired TV turned on goes to its default profile and opens Popcorn Pilot; an unpaired one is left alone', async () => {
    resetPowerOnForTests();
    await call('adult', 'POST', `/api/channel/profile`, {}).catch(() => undefined);
    getDb().prepare('UPDATE tvs SET default_profile_id = ? WHERE id = ?').run(kid, tv2);
    setTvProfile(tv2, grown, 'adult', T);
    getDb().prepare('UPDATE tvs SET channel_token_hash = NULL WHERE id = ?').run(tv);
    roku.state.power = 'standby';
    roku2.state.power = 'standby';
    expect(await powerOnPass()).toEqual([]);
    roku.state.power = 'on';
    roku2.state.power = 'on';
    const b1 = roku.calls.length;
    const b2 = roku2.calls.length;
    expect(await powerOnPass()).toEqual(['Guest room was turned on: opened Popcorn Pilot on Kid one (kid mode)']);
    expect(launches({ ...roku2, calls: since(roku2.calls, b2) })).toEqual(['dev:']);
    expect(launches({ ...roku, calls: since(roku.calls, b1) })).toEqual([]);
    expect(kidModeProfile(tv2)).toBe(kid);
    // Already on: nothing more.
    expect(await powerOnPass()).toEqual([]);
  });
});
