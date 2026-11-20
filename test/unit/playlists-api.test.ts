// PP3 through the real route handlers: playlists (make, add, edit, schedule, delete) with Activity history, the
// quick playlist (check 4 over the API), start and controls with each PIN, kid filtering on every route that returns
// playlist titles (including the Roku channel's home screen), and the channel token answering only for its own TV.
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { createProfile } from '@/lib/profiles';
import { getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';
import { newChannelToken } from '@/lib/tvs';
import { setClockForTests } from '@/lib/playback';
import { updateRules } from '@/lib/safeguards';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
type Who = 'adult' | 'guest' | { channel: string };

const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };

async function call(who: Who, method: string, urlPath: string, body?: unknown) {
  const clean = urlPath.split('?')[0];
  const id = clean.match(/^\/api\/(?:playlists|tvs)\/(\d+)/)?.[1];
  const route = clean.replace(/^\/api\/(playlists|tvs)\/\d+/, '/api/$1/[id]');
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
let tv2: number;
let kid: number;
let grown: number;

beforeAll(async () => {
  freshDataDir();
  setClockForTests(null);
  expect((await setUpPins('1357', '2468', 'Computer')).status).toBe('ok');
  for (const role of ['adult', 'guest'] as const) {
    resetLockout();
    const r = await signInWithPin(role === 'adult' ? '1357' : '2468', 'Computer');
    if (r.status !== 'ok') throw new Error(r.status);
    cookies[role] = `${SESSION_COOKIE}=${encodeURIComponent(r.token)}`;
  }
  kid = createProfile({ name: 'Kid one', color: '#7FC8A9', type: 'kid' }).id;
  // PP4: this file runs on the real clock, so the kid may watch all day (viewing hours are tested in safeguards.test).
  updateRules(kid, { hoursStart: '00:00', hoursEnd: '24:00', dailyLimits: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 720])) });
  grown = createProfile({ name: 'Family', color: '#FFC94A', type: 'adult' }).id;
  roku = await startFakeRoku({ name: 'Living room' });
  const ins = getDb().prepare('INSERT INTO tvs (name, address, port, online, default_profile_id) VALUES (?, ?, ?, 1, ?)');
  tv = Number(ins.run('Living room', '127.0.0.1', roku.port, kid).lastInsertRowid);
  tv2 = Number(ins.run('Guest room', '127.0.0.1', 1, null).lastInsertRowid);
});

afterAll(async () => {
  await roku?.close();
});

describe('playlists over the API', () => {
  let id: number;

  it('make a playlist, add titles and the Family Album, edit it; each change is in Activity history', async () => {
    const made = await call('adult', 'POST', '/api/playlists', { name: 'Saturday Cartoons' });
    expect(made.status).toBe(201);
    id = made.body.playlist.id;
    for (const b of [{ titleKey: 'tv-9001' }, { titleKey: 'tv-9007' }, { titleKey: 'movie-8001', service: 'prime' }, { kind: 'album' }]) {
      expect((await call('adult', 'POST', `/api/playlists/${id}/items`, b)).status).toBe(201);
    }
    let p = (await call('adult', 'GET', `/api/playlists/${id}`)).body.playlist;
    expect(p.items.map((i: any) => `${i.name} · ${i.serviceName} · ${i.modeLabel}`)).toEqual([
      'Rocket Pals · Netflix · 3 episodes',
      'Night Harbor · Netflix · 3 episodes',
      'Snow Pups · Prime Video · Whole movie',
      'Family Album · iCloud album · 15 min',
    ]);
    expect(p.covers).toHaveLength(3);
    expect(p.meta).toBe('4 titles · Netflix, Prime Video, Family Album · 5 hr 21 min');
    // A movie cannot be set to a number of episodes other than whole; bad input is refused.
    expect((await call('adult', 'POST', `/api/playlists/${id}/items`, { titleKey: 'movie-8001', mode: 'stay' })).status).toBe(400);
    expect((await call('adult', 'POST', `/api/playlists/${id}/items`, { titleKey: 'tv-9001', service: 'hulu' })).status).toBe(400);

    const [rp, nh, sp, fa] = p.items;
    const edit = await call('adult', 'PATCH', `/api/playlists/${id}`, {
      name: 'Weekend Cartoons',
      loop: true,
      shuffle: false,
      items: [
        { id: sp.id, mode: 'episodes' },
        { id: rp.id, mode: 'time', minutes: 45 },
        { id: nh.id, mode: 'stay' },
      ],
      schedule: { on: true, days: ['sat', 'sun'], time: '08:00', tvId: tv, profileId: kid },
    });
    expect(edit.status).toBe(200);
    p = edit.body.playlist;
    expect(p.name).toBe('Weekend Cartoons');
    expect(p.items.map((i: any) => `${i.name}: ${i.modeLabel}`)).toEqual(['Snow Pups: Whole movie', 'Rocket Pals: 45 min', 'Night Harbor: Stay on show']);
    expect(p.schedule.label).toBe('Weekends 8:00 AM · Living room');
    expect(p.loop).toBe(true);
    expect(fa.id).toBeGreaterThan(0);
    const log = listActivity({ limit: 10 }).map((a) => a.summary);
    expect(log).toContain(
      'Edited the playlist Saturday Cartoons: renamed to Weekend Cartoons, loop on, schedule Weekends 8:00 AM · Living room, Rocket Pals: 45 min, Night Harbor: Stay on show, removed Family Album, changed the order',
    );
    expect(log).toContain('Added Rocket Pals to the playlist Saturday Cartoons (3 episodes)');
    // A schedule needs a day, a time and a TV.
    expect((await call('adult', 'PATCH', `/api/playlists/${id}`, { schedule: { on: true, days: [], time: '08:00', tvId: tv } })).status).toBe(400);
  });

  it('kid filtering: a kid profile never receives a title above its ratings', async () => {
    const forKid = (await call('guest', 'GET', `/api/playlists?profile=${kid}`)).body.playlists;
    expect(forKid).toHaveLength(1);
    expect(forKid[0].items.map((i: any) => i.name)).toEqual(['Snow Pups', 'Rocket Pals']);
    expect(forKid[0].hiddenCount).toBe(1);
    expect(JSON.stringify(forKid)).not.toContain('Night Harbor');
    expect(JSON.stringify((await call('guest', 'GET', `/api/playlists/${id}?profile=${kid}`)).body)).not.toContain('Night Harbor');
    // The Guest PIN must browse playlists for a kid profile; the Adult PIN sees everything (control).
    expect((await call('guest', 'GET', '/api/playlists')).status).toBe(403);
    expect((await call('guest', 'GET', `/api/playlists?profile=${grown}`)).status).toBe(403);
    expect(JSON.stringify((await call('adult', 'GET', '/api/playlists')).body)).toContain('Night Harbor');
  });

  it('start with each PIN; Guest pauses, skips and stops; Guest cannot edit, send or use the remote', async () => {
    const g = await call('guest', 'POST', `/api/playlists/${id}/start`, { tvIds: [tv], profile: kid });
    expect(g.status).toBe(200);
    const live = g.body.tvs.find((t: any) => t.tv.id === tv).playback;
    expect(live.profileName).toBe('Kid one');
    expect(live.now.item.name).toBe('Snow Pups');
    expect(JSON.stringify(live)).toContain('not allowed for Kid one'); // Night Harbor, in the queue as not allowed
    expect((await call('guest', 'POST', `/api/tvs/${tv}/playback`, { action: 'pause' })).body.message).toBe('Paused Snow Pups (Weekend Cartoons) on Living room');
    expect((await call('guest', 'POST', `/api/tvs/${tv}/playback`, { action: 'skip' })).status).toBe(200);
    expect((await call('guest', 'POST', `/api/tvs/${tv}/playback`, { action: 'stop' })).status).toBe(200);
    for (const [m, u, b] of [
      ['PATCH', `/api/playlists/${id}`, { name: 'x' }],
      ['POST', `/api/playlists/${id}/items`, { titleKey: 'tv-9001' }],
      ['POST', `/api/tvs/${tv}/queue`, { action: 'add', titleKey: 'tv-9001' }],
      ['POST', `/api/tvs/${tv}/send`, { toTvId: tv2 }],
      ['POST', `/api/tvs/${tv}/remote`, { key: 'Select' }],
      ['DELETE', `/api/playlists/${id}`, undefined],
    ] as const) {
      expect(`${m} ${u} ${(await call('guest', m, u, b)).status}`).toBe(`${m} ${u} 403`);
    }
    // The Adult PIN, for the TV's default profile (a kid): Night Harbor is still not launched.
    roku.calls.length = 0;
    const a = await call('adult', 'POST', `/api/playlists/${id}/start`, { tvIds: [tv] });
    expect(a.body.tvs.find((t: any) => t.tv.id === tv).playback.profileName).toBe('Kid one');
    expect((await call('adult', 'POST', `/api/tvs/${tv}/playback`, { action: 'skip' })).status).toBe(200);
    expect((await call('adult', 'POST', `/api/tvs/${tv}/playback`, { action: 'skip' })).status).toBe(200);
    expect(roku.calls.filter((c) => c.path === '/search/browse').map((c) => c.query.keyword)).not.toContain('Night Harbor');
    expect((await call('adult', 'POST', `/api/tvs/${tv}/remote`, { key: 'VolumeMute' })).body.message).toBe('Pressed Mute on Living room (remote)');
    expect((await call('adult', 'POST', `/api/tvs/${tv}/playback`, { action: 'jump' })).status).toBe(400);
  });

  it('delete is a soft delete and is in Activity history', async () => {
    expect((await call('adult', 'DELETE', `/api/playlists/${id}`)).status).toBe(200);
    expect((await call('adult', 'GET', `/api/playlists/${id}`)).status).toBe(404);
    expect((getDb().prepare('SELECT deleted_at FROM playlists WHERE id = ?').get(id) as { deleted_at: string | null }).deleted_at).not.toBeNull();
    expect(listActivity({ limit: 3 }).map((a) => a.summary)).toContain('Deleted the playlist Weekend Cartoons');
  });
});

describe('check 4 over the API: quick playlist', () => {
  it('first pick asks to start; later picks append; Save as playlist creates a playlist', async () => {
    await call('adult', 'POST', `/api/tvs/${tv}/playback`, { action: 'stop' });
    const one = await call('guest', 'POST', '/api/quick/items', { titleKey: 'tv-9001', profile: kid });
    expect(one.status).toBe(201);
    expect(one.body.first).toBe(true);
    const two = await call('guest', 'POST', '/api/quick/items', { titleKey: 'tv-9201', profile: kid });
    expect(two.body.first).toBe(false);
    // A kid profile cannot pick a title above its ratings, even into the quick playlist.
    expect((await call('guest', 'POST', '/api/quick/items', { titleKey: 'tv-9007', profile: kid })).status).toBe(404);
    expect((await call('guest', 'POST', '/api/quick/start', { tvId: tv, profile: kid })).status).toBe(200);
    const three = await call('guest', 'POST', '/api/quick/items', { titleKey: 'tv-9101', profile: kid });
    expect(three.body.playingOn).toEqual(['Living room']);
    const q = (await call('guest', 'GET', `/api/quick?profile=${kid}`)).body;
    expect(q.quick.items.map((i: any) => i.name)).toEqual(['Rocket Pals', 'Bubble Bakery', 'Puddle Jumpers']);
    expect(q.playingOn).toEqual([{ id: tv, name: 'Living room' }]);
    const pb = (await call('guest', 'GET', '/api/playback')).body.tvs.find((t: any) => t.tv.id === tv).playback;
    expect(pb.upNext.map((i: any) => i.name)).toEqual(['Bubble Bakery', 'Puddle Jumpers']);
    expect((await call('guest', 'POST', '/api/quick/save', { name: 'Tonight' })).status).toBe(403);
    const saved = await call('adult', 'POST', '/api/quick/save', { name: 'Tonight' });
    expect(saved.status).toBe(201);
    expect(saved.body.playlist.items).toHaveLength(3);
    expect((await call('adult', 'GET', '/api/playlists')).body.playlists.map((p: any) => p.name)).toContain('Tonight');
    expect((await call('adult', 'GET', '/api/quick')).body.quick).toBeNull();
    expect((await call('adult', 'POST', '/api/quick/start', { tvId: tv })).status).toBe(404);
  });
});

describe('the Roku channel API', () => {
  // PP5: routines and the album background are real now (test/unit/routines.test.ts and album.test.ts); here, with
  // none made and no album synced, both lists are empty.
  it('home: playlists with cover art for the TV profile (kid rules applied), no routines or album yet, profile', async () => {
    const pid = (await call('adult', 'POST', '/api/playlists', { name: 'Grown ups' })).body.playlist.id;
    await call('adult', 'POST', `/api/playlists/${pid}/items`, { titleKey: 'tv-9007' });
    const token = newChannelToken(tv) as string;
    const h = await call({ channel: token }, 'GET', '/api/channel/home');
    expect(h.status).toBe(200);
    expect(h.body.tv.name).toBe('Living room');
    expect(h.body.profile.name).toBe('Kid one');
    expect(h.body.routines).toEqual([]);
    expect(h.body.background).toEqual([]);
    expect(h.body.playlists.map((p: any) => p.name)).toEqual(['Tonight']); // "Grown ups" has only a TV-MA title
    expect(h.body.playlists[0].covers[0]).toMatch(/^\/api\/catalog\/art\//);
    // Control: a TV with an adult default profile sees both.
    getDb().prepare('UPDATE tvs SET default_profile_id = ? WHERE id = ?').run(grown, tv2);
    const token2 = newChannelToken(tv2) as string;
    expect((await call({ channel: token2 }, 'GET', '/api/channel/home')).body.playlists.map((p: any) => p.name)).toEqual(['Grown ups', 'Tonight']);
  });

  it('now playing and up next, for its own TV only', async () => {
    const token = newChannelToken(tv) as string;
    const n = await call({ channel: token }, 'GET', '/api/channel/now-playing');
    expect(n.body.nowPlaying.playlist).toBe('Quick playlist');
    expect(n.body.nowPlaying.title.name).toBe('Rocket Pals');
    expect(n.body.nowPlaying.position).toBe('1 of 3');
    expect(n.body.upNext).toMatchObject({ name: 'Bubble Bakery', service: 'Hulu', position: '2 of 3' });
    const other = await call({ channel: newChannelToken(tv2) as string }, 'GET', '/api/channel/now-playing');
    expect(other.body).toEqual({ nowPlaying: null, upNext: null });
    expect((await call({ channel: 'wrong' }, 'GET', '/api/channel/now-playing')).status).toBe(401);
  });
});
