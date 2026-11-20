// PP2 catalog on the hub, through the real route handlers: Browse rows (check 3), kid filtering on every route that
// returns titles (check 2), Trailer on TV to the fake Roku (check 4), Tag as calm and Block for kids persist and are
// in Activity history (check 5), Play on a TV with both launch routes, Suggestions, and the TMDB key in Settings.
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { createProfile } from '@/lib/profiles';
import { getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';
import { readSecrets } from '@/lib/secrets';
import { stubTitles } from '@/lib/catalog/stub';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
const mods = new Map<string, Record<string, Handler>>();
async function mod(route: string) {
  if (!mods.has(route)) mods.set(route, (await import(path.join(process.cwd(), 'app', route, 'route.ts'))) as Record<string, Handler>);
  return mods.get(route) as Record<string, Handler>;
}

const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };
async function signIn(role: 'adult' | 'guest') {
  resetLockout();
  const r = await signInWithPin(role === 'adult' ? '1357' : '2468', 'Computer');
  if (r.status !== 'ok') throw new Error(r.status);
  cookies[role] = `${SESSION_COOKIE}=${encodeURIComponent(r.token)}`;
}

async function call(role: 'adult' | 'guest', method: 'GET' | 'POST' | 'PATCH', urlPath: string, body?: unknown) {
  const route = urlPath.split('?')[0].replace(/\/api\/catalog\/titles\/[^/]+/, '/api/catalog/titles/[id]').replace(/\/api\/catalog\/art\/[^/]+/, '/api/catalog/art/[id]');
  const id = urlPath.match(/\/api\/catalog\/(?:titles|art)\/([^/?]+)/)?.[1];
  const handler = (await mod(route))[method];
  const res = await handler(
    new Request(`http://hub.test${urlPath}`, {
      method,
      headers: { cookie: cookies[role], 'user-agent': UA.computer, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: id ? { id: decodeURIComponent(id) } : {} },
  );
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? ((await res.json()) as Record<string, unknown>) : {}, res };
}

type Card = { key: string; name: string; rating: string | null; services: string[] };
type RowT = { id: string; name: string; service: string; titles: Card[] };

let kid: number; // ratings TV-Y, TV-Y7, TV-G, G (the PP1 defaults), plus its own block list
let kid2: number;
let grown: number;
let roku: FakeRoku;
let tvId: number;
let offlineTvId: number;

const titles = () => stubTitles();
const KID_OK = new Set(['TV-Y', 'TV-Y7', 'TV-G', 'G']);

beforeAll(async () => {
  freshDataDir();
  expect((await setUpPins('1357', '2468', 'Computer')).status).toBe('ok');
  await signIn('adult');
  await signIn('guest');
  kid = createProfile({ name: 'Kid one', color: '#7FC8A9', type: 'kid' }).id;
  kid2 = createProfile({ name: 'Kid two', color: '#8FB3FF', type: 'kid' }).id;
  grown = createProfile({ name: 'Family', color: '#FFC94A', type: 'adult' }).id;
  // Kid one's own block list (the PP4 editor fills this; here it is set directly).
  getDb().prepare('UPDATE kid_safeguards SET blocked_titles = ? WHERE profile_id = ?').run(JSON.stringify(['tv-9002']), kid);
  roku = await startFakeRoku({ name: 'Living room' });
  tvId = Number(getDb().prepare("INSERT INTO tvs (name, address, port, online) VALUES ('Living room', '127.0.0.1', ?, 1)").run(roku.port).lastInsertRowid);
  offlineTvId = Number(getDb().prepare("INSERT INTO tvs (name, address, port) VALUES ('Guest room', '127.0.0.1', 1)").run().lastInsertRowid);
});

afterAll(async () => {
  await roku?.close();
});

describe('Browse rows (check 3)', () => {
  it('All is exactly one row per platform, and each row holds only that platform', async () => {
    const r = await call('adult', 'GET', '/api/catalog/browse?service=all');
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('stub');
    const rows = r.body.rows as RowT[];
    expect(rows.map((x) => x.id)).toEqual(['netflix', 'prime', 'hulu']);
    expect(rows.map((x) => x.name)).toEqual(['Netflix', 'Prime Video', 'Hulu']);
    for (const row of rows) {
      expect(row.titles.length).toBeGreaterThan(5);
      for (const t of row.titles) expect(`${row.id} ${t.name} ${t.services.includes(row.id)}`).toBe(`${row.id} ${t.name} true`);
    }
    // Every stub title on a service is in that service's row.
    for (const row of rows) expect(row.titles.length).toBe(titles().filter((t) => t.services.includes(row.service as never)).length);
  });

  it('a platform filter returns only that service, a row per kind', async () => {
    for (const s of ['netflix', 'prime', 'hulu']) {
      const rows = (await call('adult', 'GET', `/api/catalog/browse?service=${s}`)).body.rows as RowT[];
      expect(rows.map((x) => x.id)).toEqual([`${s}-show`, `${s}-movie`]);
      const all = rows.flatMap((x) => x.titles);
      expect(all.length).toBe(titles().filter((t) => t.services.includes(s as never)).length);
      for (const t of all) expect(t.services).toContain(s);
    }
    const shows = (await call('adult', 'GET', '/api/catalog/browse?service=netflix&kind=show')).body.rows as RowT[];
    expect(shows.map((x) => x.name)).toEqual(['Shows on Netflix']);
    expect(shows[0].titles.every((t) => t.key.startsWith('tv-'))).toBe(true);
    const movies = (await call('adult', 'GET', '/api/catalog/browse?service=all&kind=movie')).body.rows as RowT[];
    expect(movies).toHaveLength(3);
    expect(movies.flatMap((x) => x.titles).every((t) => t.key.startsWith('movie-'))).toBe(true);
  });

  it('search finds titles by name, still one row per platform', async () => {
    const rows = (await call('adult', 'GET', '/api/catalog/browse?service=all&q=moon')).body.rows as RowT[];
    expect(rows.map((x) => x.id)).toEqual(['netflix', 'prime', 'hulu']);
    expect(rows.map((x) => x.titles.map((t) => t.name))).toEqual([['Moon Camp'], [], ['Moon Camp']]);
  });

  it('a title on two services appears in both rows', async () => {
    const rows = (await call('adult', 'GET', '/api/catalog/browse')).body.rows as RowT[];
    const snow = rows.filter((r) => r.titles.some((t) => t.name === 'Snow Pups')).map((r) => r.id);
    expect(snow).toEqual(['netflix', 'prime']);
  });

  it('bad filters are refused', async () => {
    expect((await call('adult', 'GET', '/api/catalog/browse?service=disney')).status).toBe(400);
    expect((await call('adult', 'GET', '/api/catalog/browse?kind=game')).status).toBe(400);
    expect((await call('adult', 'GET', '/api/catalog/browse?profile=9999')).status).toBe(400);
  });
});

describe('Guest PIN browses for a kid profile only', () => {
  it('no profile, or an adult profile: refused; a kid profile: allowed', async () => {
    expect((await call('guest', 'GET', '/api/catalog/browse')).status).toBe(403);
    expect((await call('guest', 'GET', `/api/catalog/browse?profile=${grown}`)).status).toBe(403);
    expect((await call('guest', 'GET', `/api/catalog/titles/tv-9001?profile=${grown}`)).status).toBe(403);
    expect((await call('guest', 'GET', `/api/catalog/suggestions`)).status).toBe(403);
    expect((await call('guest', 'POST', '/api/catalog/titles/tv-9001/play', { tvId })).status).toBe(403);
    expect((await call('guest', 'GET', `/api/catalog/browse?profile=${kid}`)).status).toBe(200);
  });
});

describe('Tag as calm and Block for kids (check 5)', () => {
  it('both persist, show on the title, and are in Activity history; untagging too', async () => {
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9005/calm', { calm: true })).status).toBe(200);
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9006/calm', { calm: true })).status).toBe(200);
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9004/block', { blocked: true })).status).toBe(200);
    // Saying it twice changes nothing and logs nothing.
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9004/block', { blocked: true })).status).toBe(200);
    const rows = getDb().prepare('SELECT title_key, name, calm, blocked FROM title_tags ORDER BY title_key').all();
    expect(rows).toEqual([
      { title_key: 'tv-9004', name: 'Star Club', calm: 0, blocked: 1 },
      { title_key: 'tv-9005', name: 'Garden Bugs', calm: 1, blocked: 0 },
      { title_key: 'tv-9006', name: 'Moon Camp', calm: 1, blocked: 0 },
    ]);
    const d = (await call('adult', 'GET', '/api/catalog/titles/tv-9005')).body.title as { calm: boolean; blocked: boolean };
    expect(d).toMatchObject({ calm: true, blocked: false });
    const calm = (await call('adult', 'GET', '/api/catalog/calm')).body.titles as { name: string }[];
    expect(calm.map((t) => t.name)).toEqual(['Garden Bugs', 'Moon Camp']);

    // Untag one, then put it back for the tests below.
    await call('adult', 'POST', '/api/catalog/titles/tv-9006/calm', { calm: false });
    await call('adult', 'POST', '/api/catalog/titles/tv-9006/calm', { calm: true });
    const log = listActivity({ limit: 20 }).filter((a) => a.action.startsWith('title.')).map((a) => `${a.pin_type} ${a.device} ${a.summary}`);
    expect(log.reverse()).toEqual([
      'adult Computer Tagged Garden Bugs as calm',
      'adult Computer Tagged Moon Camp as calm',
      'adult Computer Blocked Star Club for kids',
      'adult Computer Removed the calm tag from Moon Camp',
      'adult Computer Tagged Moon Camp as calm',
    ]);
  });

  it('bad bodies and unknown titles are refused', async () => {
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9005/calm', {})).status).toBe(400);
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-1/calm', { calm: true })).status).toBe(404);
    expect((await call('adult', 'POST', '/api/catalog/titles/nope/block', { blocked: true })).status).toBe(404);
  });
});

describe('Kid filtering on every route that returns titles (check 2)', () => {
  // Kid one may see: allowed rating, not blocked for kids (Star Club, tv-9004), not on its own list (Ocean Friends).
  const allowedForKid = (k: string) => {
    const t = titles().find((x) => x.key === k);
    return Boolean(t && t.rating && KID_OK.has(t.rating) && k !== 'tv-9004' && k !== 'tv-9002');
  };
  const forbidden = () => titles().filter((t) => !allowedForKid(t.key));

  /** Every title key anywhere in an answer. */
  function keysIn(v: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(v)) v.forEach((x) => keysIn(x, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (k === 'key' && typeof x === 'string' ? out.add(x) : keysIn(x, out));
    return out;
  }

  async function everyTitleAnswer(role: 'adult' | 'guest', profile: number | null): Promise<Set<string>> {
    const q = profile === null ? '' : `profile=${profile}`;
    const seen = new Set<string>();
    const add = (b: unknown) => keysIn(b, seen);
    for (const service of ['all', 'netflix', 'prime', 'hulu'])
      for (const kind of ['all', 'show', 'movie'])
        for (const search of ['', 'a', 'the', 'night', 'static']) {
          const r = await call(role, 'GET', `/api/catalog/browse?service=${service}&kind=${kind}&q=${search}&${q}`);
          expect(r.status).toBe(200);
          add(r.body);
        }
    for (const calm of ['', '1']) add((await call(role, 'GET', `/api/catalog/suggestions?calm=${calm}&${q}`)).body);
    for (const t of titles()) {
      const d = await call(role, 'GET', `/api/catalog/titles/${t.key}?${q}`);
      if (d.status === 200) add(d.body);
      const s = await call(role, 'GET', `/api/catalog/titles/${t.key}/similar?${q}`);
      if (s.status === 200) add(s.body);
    }
    return seen;
  }

  it('the kid profile (Guest PIN and Adult PIN) never receives a title above its ratings, unrated, or blocked', async () => {
    expect(forbidden().length).toBeGreaterThan(15);
    for (const role of ['guest', 'adult'] as const) {
      const seen = await everyTitleAnswer(role, kid);
      const leaked = [...seen].filter((k) => !allowedForKid(k));
      expect(`${role}: ${leaked.join(', ')}`).toBe(`${role}: `);
      expect(seen.size).toBeGreaterThan(8);
    }
  });

  it('control: the same calls with the Adult PIN and no kid profile do receive those titles', async () => {
    const seen = await everyTitleAnswer('adult', null);
    for (const t of forbidden()) expect(`${t.key} ${seen.has(t.key)}`).toBe(`${t.key} true`);
    const fam = await everyTitleAnswer('adult', grown);
    expect(fam.has('tv-9007')).toBe(true);
  });

  it('a forbidden title answers 404 to details, More like this, Play and Trailer on TV for the kid', async () => {
    for (const t of forbidden()) {
      for (const role of ['guest', 'adult'] as const) {
        expect(`${t.key} ${(await call(role, 'GET', `/api/catalog/titles/${t.key}?profile=${kid}`)).status}`).toBe(`${t.key} 404`);
        expect(`${t.key} ${(await call(role, 'GET', `/api/catalog/titles/${t.key}/similar?profile=${kid}`)).status}`).toBe(`${t.key} 404`);
        expect(`${t.key} ${(await call(role, 'POST', `/api/catalog/titles/${t.key}/play`, { tvId, profile: kid })).status}`).toBe(`${t.key} 404`);
        expect(`${t.key} ${(await call(role, 'POST', `/api/catalog/titles/${t.key}/trailer`, { tvId, profile: kid })).status}`).toBe(`${t.key} 404`);
      }
    }
    // Nothing was sent to the TV for any of them.
    expect(roku.calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('a profile block list applies to that kid only; the household block applies to every kid', async () => {
    const two = await everyTitleAnswer('guest', kid2);
    expect(two.has('tv-9002')).toBe(true); // on Kid one's list only
    expect(two.has('tv-9004')).toBe(false); // blocked for kids
  });

  it('a kid profile with no allowed ratings sees nothing (fails closed)', async () => {
    const none = createProfile({ name: 'Kid none', color: '#FF8A65', type: 'kid' }).id;
    getDb().prepare("UPDATE kid_safeguards SET allowed_ratings = '[]' WHERE profile_id = ?").run(none);
    const seen = await everyTitleAnswer('guest', none);
    expect([...seen]).toEqual([]);
  });
});

describe('Trailer on TV (check 4) and Play on a TV', () => {
  it('Trailer on TV launches YouTube on the fake Roku with the trailer id, and is recorded', async () => {
    roku.calls.length = 0;
    const r = await call('guest', 'POST', '/api/catalog/titles/tv-9001/trailer', { tvId, profile: kid });
    expect(r.status).toBe(200);
    expect(roku.calls.map((c) => `${c.method} ${c.path} ${JSON.stringify(c.query)}`)).toEqual(['POST /launch/837 {"contentId":"stub9001"}']);
    expect(roku.state.activeApp).toEqual({ id: '837', name: 'YouTube' });
    const log = getDb().prepare("SELECT title_key, kind, service, tv_id, profile_id, route, ok FROM launch_log WHERE kind = 'trailer'").all();
    expect(log).toEqual([{ title_key: 'tv-9001', kind: 'trailer', service: 'youtube', tv_id: tvId, profile_id: kid, route: 'deep_link', ok: 1 }]);
    expect(listActivity({ limit: 1 })[0]).toMatchObject({ pin_type: 'guest', summary: 'Sent the Rocket Pals trailer to Living room (YouTube)' });
  });

  it('control: an offline TV is not reported as sent', async () => {
    const r = await call('adult', 'POST', '/api/catalog/titles/tv-9001/trailer', { tvId: offlineTvId });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('Guest room did not answer. Check it is on and on the home Wi-Fi.');
    expect(getDb().prepare("SELECT ok FROM launch_log WHERE tv_id = ? AND kind = 'trailer'").all(offlineTvId)).toEqual([{ ok: 0 }]);
  });

  it('Play uses a deep link when the content id is known, else search launch, and records the route', async () => {
    roku.calls.length = 0;
    expect((await call('guest', 'POST', '/api/catalog/titles/tv-9001/play', { tvId, profile: kid, startFrom: 'Season 1 · Episode 1' })).body).toEqual({
      ok: true,
      tv: 'Living room',
      service: 'netflix',
      route: 'deep_link',
    });
    expect((await call('guest', 'POST', '/api/catalog/titles/movie-8101/play', { tvId, profile: kid })).body.route).toBe('search');
    expect((await call('adult', 'POST', '/api/catalog/titles/movie-8001/play', { tvId, service: 'prime' })).body.route).toBe('search');
    expect(roku.calls.map((c) => `${c.method} ${c.path} ${new URLSearchParams(c.query).toString()}`)).toEqual([
      'POST /launch/12 contentId=81000001&mediaType=series',
      'POST /search/browse keyword=Paper+Kites&provider-id=13&launch=true&type=movie',
      'POST /search/browse keyword=Snow+Pups&provider-id=13&launch=true&type=movie',
    ]);
    const log = getDb().prepare("SELECT title_key, service, route, profile_id FROM launch_log WHERE kind = 'title' AND ok = 1 ORDER BY id").all();
    expect(log).toEqual([
      { title_key: 'tv-9001', service: 'netflix', route: 'deep_link', profile_id: kid },
      { title_key: 'movie-8101', service: 'prime', route: 'search', profile_id: kid },
      { title_key: 'movie-8001', service: 'prime', route: 'search', profile_id: null },
    ]);
    const summaries = listActivity({ limit: 3 }).map((a) => a.summary).reverse();
    expect(summaries).toEqual([
      'Played Rocket Pals on Living room for Kid one (Netflix, direct link, start from Season 1 · Episode 1)',
      'Played Paper Kites on Living room for Kid one (Prime Video, search launch)',
      'Played Snow Pups on Living room (Prime Video, search launch)',
    ]);
  });

  it('Play refuses a service the title is not on, and a missing TV', async () => {
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9001/play', { tvId, service: 'hulu' })).status).toBe(400);
    expect((await call('adult', 'POST', '/api/catalog/titles/tv-9001/play', { tvId: 999 })).status).toBe(400);
  });
});

describe('Suggestions', () => {
  it('for a kid: similar to what it played, then popular; all allowed and on the three services', async () => {
    const r = await call('guest', 'GET', `/api/catalog/suggestions?profile=${kid}`);
    expect(r.status).toBe(200);
    expect(r.body.basedOn).toBe('played');
    const items = r.body.items as (Card & { reason: string })[];
    expect(items.length).toBeGreaterThan(4);
    // Played: Rocket Pals and Paper Kites. Their similar titles come first, then popular ones.
    expect(items[0].reason).toMatch(/^Similar to (Rocket Pals|Paper Kites)$/);
    expect(items.some((i) => i.reason.startsWith('Popular on '))).toBe(true);
    for (const i of items) {
      expect(KID_OK.has(i.rating as string)).toBe(true);
      expect(i.services.length).toBeGreaterThan(0);
      expect(['tv-9001', 'movie-8101', 'tv-9002', 'tv-9004']).not.toContain(i.key);
    }
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('calm: similar to the calm titles; without a profile the adult gets popular picks', async () => {
    const calm = await call('adult', 'GET', `/api/catalog/suggestions?calm=1&profile=${kid}`);
    expect(calm.body.basedOn).toBe('calm');
    const items = calm.body.items as (Card & { reason: string })[];
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(i.reason).toMatch(/^Similar to (Garden Bugs|Moon Camp)$/);
    const pop = await call('adult', 'GET', '/api/catalog/suggestions');
    expect(pop.body.basedOn).toBe('popular');
    const reasons = new Set((pop.body.items as { reason: string }[]).map((i) => i.reason));
    expect([...reasons].sort()).toEqual(['Popular on Hulu', 'Popular on Netflix', 'Popular on Prime Video']);
  });
});

describe('Cover art', () => {
  it('serves stub posters as pictures only, and refuses other names', async () => {
    const r = await call('guest', 'GET', '/api/catalog/art/stub-9001.svg');
    expect(r.status).toBe(200);
    expect(r.res.headers.get('content-type')).toBe('image/svg+xml');
    expect(r.res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await r.res.text()).toContain('Rocket Pals');
    expect((await call('guest', 'GET', '/api/catalog/art/..%2Fpackage.json')).status).toBe(404);
    expect((await call('guest', 'GET', '/api/catalog/art/stub-1.svg')).status).toBe(404);
  });
});

describe('Settings: the TMDB key', () => {
  it('without a key the stub is used and Settings says so; a key is stored in the secret store only', async () => {
    let s = await call('adult', 'GET', '/api/settings');
    expect(s.body.catalog).toEqual({ source: 'stub', tmdbKeySet: false, calmCount: 2 });
    expect((await call('adult', 'PATCH', '/api/settings', { tmdbKey: 'not a key' })).status).toBe(400);
    const key = 'abcdef0123456789abcdef0123456789';
    s = await call('adult', 'PATCH', '/api/settings', { tmdbKey: key });
    expect(s.status).toBe(200);
    expect(s.body.catalog).toEqual({ source: 'tmdb', tmdbKeySet: true, calmCount: 2 });
    expect(JSON.stringify(s.body)).not.toContain(key);
    expect(readSecrets().tmdb_api_key).toBe(key);
    // Not in the database or Activity history.
    const dump = JSON.stringify([getDb().prepare('SELECT * FROM settings').all(), getDb().prepare('SELECT * FROM activity').all()]);
    expect(dump).not.toContain(key);
    expect(listActivity({ limit: 1 })[0].summary).toBe('Saved a TMDB key (titles now come from TMDB)');
    // With a key and no internet allowed here, Browse says the catalog is not available rather than calling out.
    const b = await call('adult', 'GET', '/api/catalog/browse');
    expect(b.status).toBe(503);
    expect(String(b.body.error)).toContain('Outside call refused here: api.themoviedb.org');
    s = await call('adult', 'PATCH', '/api/settings', { tmdbKey: null });
    expect(s.body.catalog).toEqual({ source: 'stub', tmdbKeySet: false, calmCount: 2 });
    expect(readSecrets().tmdb_api_key).toBeUndefined();
    expect(listActivity({ limit: 1 })[0].summary).toBe('Removed the TMDB key (the built-in sample catalog is used)');
    expect((await call('adult', 'GET', '/api/catalog/browse')).status).toBe(200);
  });
});
