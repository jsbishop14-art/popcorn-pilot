// PP5 check 2, through the real route handlers, against the iCloud stub (no real iCloud call): the album link in
// Settings; a sync adds the photos and the clip, a later sync updates a changed photo, removes one taken out of the
// album and adds a new one; a broken link shows an error in Settings, not a crash, and keeps what was cached; the
// album plays as a playlist item (the Popcorn Pilot channel opened with the album) and feeds the TV home
// background; the channel gets the files; and the Guest PIN has no part of it.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';
import { newChannelToken, getTv } from '@/lib/tvs';
import { EVERYONE } from '@/lib/catalog';
import { albumFields, appendItem, createPlaylist, titleFields } from '@/lib/playlists';
import { ALBUM_CONTENT_ID, BRIDGE_CONTENT_ID, BRIDGE_MS, control, setClockForTests, startPlaylist, tick, tvView, type Actor } from '@/lib/playback';
import { albumDir, syncDue } from '@/lib/album';
import { albumToken, partitionHost, pickDerivative } from '@/lib/album/icloud';
import { readSecrets } from '@/lib/secrets';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';
import { BROKEN_LINK, GOOD_LINK, GOOD_TOKEN, changedAlbum, startICloudStub, type ICloudStub } from '../stubs/icloud';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
type Who = 'adult' | 'guest' | { channel: string };

const ADULT: Actor = { pinType: 'adult', device: 'Computer' };
const MIN = 60_000;
const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };
let T = new Date(2026, 10, 16, 18, 0).getTime();

async function raw(who: Who, method: string, urlPath: string, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
  const segs = urlPath.split('?')[0].split('/');
  const id = segs.find((s) => /^\d+$/.test(s));
  const route = segs.map((s) => (/^\d+$/.test(s) ? '[id]' : s)).join('/');
  const mod = (await import(path.join(process.cwd(), 'app', route, 'route.ts'))) as Record<string, Handler>;
  const headers: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json', ...extra };
  if (typeof who === 'string') headers.cookie = cookies[who];
  else headers.authorization = `Bearer ${who.channel}`;
  return mod[method](new Request(`http://hub.test${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: id ? { id } : {} });
}

async function call(who: Who, method: string, urlPath: string, body?: unknown) {
  const res = await raw(who, method, urlPath, body);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let stub: ICloudStub;
let roku: FakeRoku;
let tv: number;
let token: string;

function guids(): string[] {
  return (getDb().prepare('SELECT guid FROM album_items ORDER BY guid').all() as { guid: string }[]).map((r) => r.guid);
}

beforeAll(async () => {
  freshDataDir();
  setClockForTests(() => T);
  stub = await startICloudStub();
  process.env.PP_ICLOUD_BASE = stub.base;
  expect((await setUpPins('1357', '2468', 'Computer')).status).toBe('ok');
  for (const role of ['adult', 'guest'] as const) {
    resetLockout();
    const r = await signInWithPin(role === 'adult' ? '1357' : '2468', 'Computer');
    if (r.status !== 'ok') throw new Error(r.status);
    cookies[role] = `${SESSION_COOKIE}=${encodeURIComponent(r.token)}`;
  }
  roku = await startFakeRoku({ name: 'Living room' });
  tv = Number(getDb().prepare("INSERT INTO tvs (name, address, port, online) VALUES ('Living room', '127.0.0.1', ?, 1)").run(roku.port).lastInsertRowid);
  token = newChannelToken(tv) as string;
});

afterAll(async () => {
  setClockForTests(null);
  delete process.env.PP_ICLOUD_BASE;
  await stub?.close();
  await roku?.close();
});

describe('reading an iCloud shared album link', () => {
  it('accepts shared album links only, and finds the partition from the token', () => {
    expect(albumToken(GOOD_LINK)).toBe(GOOD_TOKEN);
    expect(albumToken('https://www.icloud.com/sharedalbum/en-us/#B0aGoodAlbum12x')).toBe(GOOD_TOKEN);
    expect(albumToken('https://www.icloud.com/photos/#B0aGoodAlbum12x')).toBeNull();
    expect(albumToken('http://www.icloud.com/sharedalbum/#B0aGoodAlbum12x')).toBeNull();
    expect(albumToken('https://evil.example/sharedalbum/#B0aGoodAlbum12x')).toBeNull();
    // "B0a…": base62 of "0a" = 36; "A…": base62 of the second letter.
    expect(partitionHost('B0aGoodAlbum12x')).toBe('p36-sharedstreams.icloud.com');
    expect(partitionHost('A7xyzxyzxyzxyz')).toBe('p07-sharedstreams.icloud.com');
  });

  it('keeps the photo size that suits a TV, and the 720p clip (not its poster frame)', () => {
    const photo = { '342': { checksum: 'a', width: '342' }, '1536': { checksum: 'b', width: '1536' }, '4032': { checksum: 'c', width: '4032' } };
    expect(pickDerivative('photo', photo)?.checksum).toBe('b');
    expect(pickDerivative('photo', { '4032': { checksum: 'c', width: '4032' } })?.checksum).toBe('c');
    expect(pickDerivative('clip', { PosterFrame: { checksum: 'p', height: '720' }, '720p': { checksum: 'v', height: '720' } })?.checksum).toBe('v');
    expect(pickDerivative('clip', { PosterFrame: { checksum: 'p', height: '720' } })).toBeNull();
  });
});

describe('check 2: album sync from the stub adds, updates and removes items', () => {
  it('Settings without a link: no counts, and a sync says to add the link', async () => {
    const s = await call('adult', 'GET', '/api/settings');
    expect(s.body.album).toMatchObject({ linkSet: false, photos: 0, clips: 0, lastSync: null });
    const r = await call('adult', 'POST', '/api/album/sync');
    expect([r.status, r.body.result.ok, r.body.result.message]).toEqual([200, false, 'No Family Album link yet. Add it in Settings.']);
  });

  it('a link that is not a shared album link is refused', async () => {
    const r = await call('adult', 'PATCH', '/api/settings', { albumLink: 'https://example.com/photos' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/^That is not an iCloud shared album link/);
  });

  it('saving the link keeps it in the secret store (not the database); the first sync adds 3 photos and a clip', async () => {
    const s = await call('adult', 'PATCH', '/api/settings', { albumLink: GOOD_LINK });
    expect(s.status).toBe(200);
    expect(s.body.album.linkSet).toBe(true);
    expect(readSecrets().album_link).toBe(GOOD_LINK);
    const inDb = getDb().prepare("SELECT count(*) AS n FROM settings WHERE value LIKE '%sharedalbum%'").get() as { n: number };
    expect(inDb.n).toBe(0);
    const r = await call('adult', 'POST', '/api/album/sync');
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({ ok: true, added: 4, updated: 0, removed: 0, photos: 3, clips: 1, message: null });
    expect(r.body.album).toMatchObject({ photos: 3, clips: 1, lastSync: { ok: true, added: 4 } });
    expect(guids()).toEqual(['G-CLIP-1', 'G-PHOTO-1', 'G-PHOTO-2', 'G-PHOTO-4']);
    // The files are on the hub; the size kept is the 1536 copy (the fixture), not the 4032 original.
    const files = fs.readdirSync(albumDir()).sort();
    expect(files).toEqual(['G-CLIP-1.mp4', 'G-PHOTO-1.png', 'G-PHOTO-2.png', 'G-PHOTO-4.png']);
    expect(fs.readFileSync(path.join(albumDir(), 'G-PHOTO-2.png'))).toEqual(fs.readFileSync('test/fixtures/album/photo-2.png'));
    // iCloud named its partition first (330), as it does.
    expect(stub.calls.filter((c) => c.path.endsWith('webstream'))).toHaveLength(2);
    expect(listActivity({ limit: 1 })[0].summary).toBe('Synced the Family Album: 4 added, 0 updated, 0 removed (3 photos, 1 clip)');
  });

  it('a sync with nothing new downloads nothing', async () => {
    stub.calls.length = 0;
    const r = await call('adult', 'POST', '/api/album/sync');
    expect(r.body.result).toMatchObject({ ok: true, added: 0, updated: 0, removed: 0 });
    expect(stub.calls.filter((c) => c.path.startsWith('/asset/') || c.path.endsWith('webasseturls'))).toEqual([]);
  });

  it('a later sync: the changed photo is updated, the one taken out is removed, the new one added', async () => {
    stub.albums.set(GOOD_TOKEN, changedAlbum());
    const r = await call('adult', 'POST', '/api/album/sync');
    expect(r.body.result).toMatchObject({ ok: true, added: 1, updated: 1, removed: 1, photos: 3, clips: 1 });
    expect(guids()).toEqual(['G-CLIP-1', 'G-PHOTO-1', 'G-PHOTO-2', 'G-PHOTO-3']);
    expect(fs.readdirSync(albumDir()).sort()).toEqual(['G-CLIP-1.mp4', 'G-PHOTO-1.png', 'G-PHOTO-2.png', 'G-PHOTO-3.png']);
    expect(fs.readFileSync(path.join(albumDir(), 'G-PHOTO-2.png'))).toEqual(fs.readFileSync('test/fixtures/album/photo-2-new.png'));
    const p2 = getDb().prepare("SELECT checksum FROM album_items WHERE guid = 'G-PHOTO-2'").get() as { checksum: string };
    expect(p2.checksum).toBe('c-photo-2-v2');
  });

  it('a broken link shows an error in Settings, not a crash, and keeps what was cached', async () => {
    expect((await call('adult', 'PATCH', '/api/settings', { albumLink: BROKEN_LINK })).status).toBe(200);
    T += MIN;
    const r = await call('adult', 'POST', '/api/album/sync');
    expect(r.status).toBe(200);
    expect(r.body.result.ok).toBe(false);
    expect(r.body.result.message).toBe('iCloud did not find that album. Check the link, and that Public Website is on for the album (Photos, the album, People).');
    const s = await call('adult', 'GET', '/api/settings');
    expect(s.body.album).toMatchObject({ linkSet: true, photos: 3, clips: 1, lastSync: { ok: false, message: r.body.result.message } });
    expect(s.body.album.lastGood).toBeGreaterThan(0);
    expect(guids()).toHaveLength(4);
    expect(listActivity({ limit: 1 })[0].summary).toMatch(/^The Family Album sync failed: iCloud did not find that album/);
    // iCloud cannot be reached at all: also an error in plain words.
    process.env.PP_ICLOUD_BASE = 'http://127.0.0.1:9';
    const down = await call('adult', 'POST', '/api/album/sync');
    expect([down.status, down.body.result.ok, down.body.result.message]).toEqual([200, false, 'iCloud could not be reached. Check the hub is online; the hub tries again later.']);
    process.env.PP_ICLOUD_BASE = stub.base;
    // And a real iCloud address is refused here (no outside calls from tests).
    delete process.env.PP_ICLOUD_BASE;
    const real = await call('adult', 'POST', '/api/album/sync');
    expect(real.body.result.message).toMatch(/^Outside call refused here/);
    process.env.PP_ICLOUD_BASE = stub.base;
    expect((await call('adult', 'PATCH', '/api/settings', { albumLink: GOOD_LINK })).status).toBe(200);
    expect((await call('adult', 'POST', '/api/album/sync')).body.result.ok).toBe(true);
  });

  it('the schedule: a sync is due once the sync interval has passed since the last', async () => {
    expect(syncDue(T)).toBe(false);
    expect(syncDue(T + 6 * 60 * MIN)).toBe(true);
  });
});

describe('the album on the TV', () => {
  it('feeds the TV home background (photos only) and the channel gets each file', async () => {
    const h = await call({ channel: token }, 'GET', '/api/channel/home');
    expect(h.body.background).toHaveLength(3);
    for (const b of h.body.background) expect(b.url).toMatch(/^\/api\/channel\/album\/\d+$/);
    const a = await call({ channel: token }, 'GET', '/api/channel/album');
    expect(a.body.items.map((i: any) => i.kind).sort()).toEqual(['clip', 'photo', 'photo', 'photo']);
    const photo = a.body.items.find((i: any) => i.kind === 'photo');
    const res = await raw({ channel: token }, 'GET', photo.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).subarray(1, 4).toString()).toBe('PNG');
    // A clip answers byte ranges (the Roku video player asks for them).
    const clip = a.body.items.find((i: any) => i.kind === 'clip');
    const part = await raw({ channel: token }, 'GET', clip.url, undefined, { range: 'bytes=4-11' });
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe('ftypisom');
    expect((await raw({ channel: token }, 'GET', '/api/channel/album/99999')).status).toBe(404);
    expect((await raw({ channel: 'wrong' }, 'GET', photo.url)).status).toBe(401);
  });

  it('plays as a playlist item: the Popcorn Pilot channel opens with the album, then the next title', async () => {
    const p = createPlaylist({ name: 'Photos then cartoons' });
    appendItem(p.id, albumFields({ mode: 'time', minutes: 10 }));
    appendItem(p.id, await titleFields(EVERYONE, 'tv-9001', undefined, { episodes: 1 }));
    roku.calls.length = 0;
    await startPlaylist(ADULT, { playlistId: p.id, tvIds: [tv] });
    const launch = roku.calls.filter((c) => c.path.startsWith('/launch/'));
    expect(launch.map((c) => `${c.path} ${c.query.contentId}`)).toEqual([`/launch/dev ${ALBUM_CONTENT_ID}`]);
    const v = tvView(getTv(tv)!, T).playback;
    expect(v?.now?.item.name).toBe('Family Album');
    expect(v?.now?.item.serviceName).toBe('Family Album');
    expect(v?.now?.totalMin).toBe(10);
    const np = await call({ channel: token }, 'GET', '/api/channel/now-playing');
    expect(np.body.nowPlaying.title.name).toBe('Family Album');
    expect(listActivity({ limit: 1 })[0].summary).toBe('Started the Family Album on Living room (Photos then cartoons, photos and clips, shuffled)');
    // This TV's channel is paired (PP6): the Now playing bridge comes first, then the next title.
    T += 10 * MIN;
    await tick();
    expect(roku.calls.filter((c) => c.path.startsWith('/launch/')).map((c) => c.query.contentId).slice(-1)).toEqual([BRIDGE_CONTENT_ID]);
    expect(tvView(getTv(tv)!, T).playback?.now).toBeNull();
    T += BRIDGE_MS;
    await tick();
    expect(tvView(getTv(tv)!, T).playback?.now?.item.name).toBe('Rocket Pals');
    await control(ADULT, tv, 'stop');
  });

  it('removing the link clears the photos on the hub', async () => {
    const r = await call('adult', 'PATCH', '/api/settings', { albumLink: null });
    expect(r.body.album).toMatchObject({ linkSet: false, photos: 0, clips: 0 });
    expect(fs.readdirSync(albumDir())).toEqual([]);
    expect(readSecrets().album_link).toBeUndefined();
    expect(listActivity({ limit: 1 })[0].summary).toBe('Removed the Family Album link (the photos on the hub were cleared)');
  });

  it('the Guest PIN cannot see or change the album link, or sync (403 from the hub)', async () => {
    expect((await call('guest', 'GET', '/api/settings')).status).toBe(403);
    expect((await call('guest', 'PATCH', '/api/settings', { albumLink: GOOD_LINK })).status).toBe(403);
    expect((await call('guest', 'POST', '/api/album/sync')).status).toBe(403);
    expect((await call('guest', 'GET', '/api/channel/album')).status).toBe(403);
  });
});
