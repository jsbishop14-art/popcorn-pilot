// The TMDB client against a fake TMDB on this machine (never the real one): mapping of ratings, services, seasons,
// trailers and posters; the hub cache (fresh answers are not asked again; stale answers are served when TMDB is
// down); both key forms; cover art cached on the hub; and the outside call guard.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir } from './helpers';
import { TmdbSource, mapDetails } from '@/lib/catalog/tmdb';
import { readArt } from '@/lib/catalog/art';
import { CatalogUnavailable } from '@/lib/catalog/types';

const TV_1 = {
  id: 1,
  name: 'Fake Show',
  first_air_date: '2021-03-04',
  overview: 'A fake show.',
  popularity: 50,
  poster_path: '/abcDEF123.jpg',
  episode_run_time: [22],
  seasons: [
    { season_number: 0, episode_count: 3 },
    { season_number: 1, episode_count: 10 },
    { season_number: 2, episode_count: 8 },
  ],
  content_ratings: { results: [{ iso_3166_1: 'GB', rating: '12' }, { iso_3166_1: 'US', rating: 'TV-Y7' }] },
  videos: { results: [{ site: 'Vimeo', type: 'Trailer', key: 'nope' }, { site: 'YouTube', type: 'Teaser', key: 'teaser1' }, { site: 'YouTube', type: 'Trailer', key: 'trailerAB12', official: true }] },
  'watch/providers': { results: { US: { flatrate: [{ provider_id: 15 }, { provider_id: 8 }, { provider_id: 337 }] } } },
  similar: { results: [{ id: 2 }, { id: 3 }] },
};
const TV_2 = { id: 2, name: 'Grown Show', content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] }, 'watch/providers': { results: { US: { flatrate: [{ provider_id: 8 }] } } } };
const TV_3 = { id: 3, name: 'Nowhere Show', 'watch/providers': { results: { US: { flatrate: [{ provider_id: 337 }] } } } };
const MOVIE_9 = {
  id: 9,
  title: 'Fake Movie',
  release_date: '2019-07-01',
  runtime: 95,
  release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'PG' }] }] },
  'watch/providers': { results: { US: { flatrate: [{ provider_id: 119 }] } } },
};

let server: http.Server;
let base: string;
const hits: string[] = [];
let down = false;
const authSeen: string[] = [];

beforeAll(async () => {
  freshDataDir();
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    hits.push(url.pathname);
    authSeen.push(req.headers.authorization ?? `api_key=${url.searchParams.get('api_key')}`);
    if (down) {
      res.writeHead(500);
      return res.end();
    }
    const send = (b: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(b));
    };
    if (url.pathname === '/img/abcDEF123.jpg') {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    }
    if (url.pathname === '/discover/tv') {
      expect(url.searchParams.get('watch_region')).toBe('US');
      return send({ results: url.searchParams.get('with_watch_providers') === '8' ? [{ id: 1 }, { id: 2 }, { id: 3 }] : [{ id: 1 }] });
    }
    if (url.pathname === '/search/multi') return send({ results: [{ id: 9, media_type: 'movie' }, { id: 77, media_type: 'person' }, { id: 3, media_type: 'tv' }] });
    const d = { '/tv/1': TV_1, '/tv/2': TV_2, '/tv/3': TV_3, '/movie/9': MOVIE_9 }[url.pathname];
    if (d) return send(d);
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.PP_TMDB_BASE = base;
  process.env.PP_TMDB_IMAGE_BASE = `${base}/img`;
});

afterAll(() => {
  server.close();
  delete process.env.PP_TMDB_BASE;
  delete process.env.PP_TMDB_IMAGE_BASE;
});

describe('TMDB mapping', () => {
  it('maps a show: US rating, our three services only, seasons without specials, trailer, poster, similar', () => {
    expect(mapDetails('show', TV_1)).toEqual({
      key: 'tv-1',
      kind: 'show',
      name: 'Fake Show',
      year: 2021,
      rating: 'TV-Y7',
      services: ['netflix', 'hulu'],
      overview: 'A fake show.',
      seasons: [
        { number: 1, episodes: 10 },
        { number: 2, episodes: 8 },
      ],
      episodeMinutes: 22,
      runtimeMinutes: null,
      poster: 'tmdb-abcDEF123.jpg',
      trailer: 'trailerAB12',
      similar: ['tv-2', 'tv-3'],
      contentIds: {},
      popularity: 50,
    });
  });

  it('maps a movie: first non-empty US certification, Prime Video by either provider id', () => {
    const m = mapDetails('movie', MOVIE_9);
    expect(m).toMatchObject({ key: 'movie-9', rating: 'PG', services: ['prime'], runtimeMinutes: 95, trailer: null, poster: null });
  });

  it('a title with no US rating is unrated (null)', () => {
    expect(mapDetails('show', TV_3).rating).toBeNull();
  });
});

describe('TMDB client and the hub cache', () => {
  it('lists a service from discover, keeping only titles on that service', async () => {
    const src = new TmdbSource('abcdef0123456789abcdef0123456789');
    hits.length = 0;
    const list = await src.list('netflix', 'show');
    expect(list.map((t) => t.key)).toEqual(['tv-1', 'tv-2']);
    expect(hits.sort()).toEqual(['/discover/tv', '/tv/1', '/tv/2', '/tv/3']);
    expect(authSeen.at(-1)).toBe('api_key=abcdef0123456789abcdef0123456789');
  });

  it('a second call within the cache time asks TMDB nothing', async () => {
    const src = new TmdbSource('abcdef0123456789abcdef0123456789');
    hits.length = 0;
    await src.list('netflix', 'show');
    await src.title('tv-1');
    expect(hits).toEqual([]);
  });

  it('after the cache time it asks again; when TMDB is down it serves the stale copy', async () => {
    const later = Date.now() + 25 * 3600_000;
    const src = new TmdbSource('abcdef0123456789abcdef0123456789', () => later);
    hits.length = 0;
    down = true;
    const t = await src.title('tv-1');
    expect(hits).toEqual(['/tv/1']);
    expect(t?.name).toBe('Fake Show');
    // Nothing cached at all and TMDB down: the catalog says it is not available.
    await expect(src.title('tv-55')).rejects.toBeInstanceOf(CatalogUnavailable);
    down = false;
  });

  it('search keeps shows and movies that stream on one of the three services', async () => {
    const src = new TmdbSource('eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmYWtlIiwic3ViIjoiZmFrZSJ9.c2lnbmF0dXJlZmFrZWZha2U');
    authSeen.length = 0;
    const r = await src.search('fake');
    expect(r.map((t) => t.key)).toEqual(['movie-9']);
    expect(authSeen[0]).toMatch(/^Bearer eyJ/);
  });

  it('a TMDB poster is fetched once and then served from the hub', async () => {
    hits.length = 0;
    const a = await readArt('tmdb-abcDEF123.jpg');
    expect(a?.type).toBe('image/jpeg');
    expect(a?.body.length).toBe(4);
    const b = await readArt('tmdb-abcDEF123.jpg');
    expect(b?.body.length).toBe(4);
    expect(hits).toEqual(['/img/abcDEF123.jpg']);
    expect(fs.existsSync(path.join(process.env.PP_DATA_DIR as string, 'art-cache', 'tmdb-abcDEF123.jpg'))).toBe(true);
    expect(await readArt('tmdb-../../etc/passwd')).toBeNull();
  });

  it('the outside call guard refuses the real TMDB here (control: the guard is on in tests)', async () => {
    expect(process.env.PP_NO_OUTSIDE_CALLS).toBe('1');
    process.env.PP_TMDB_BASE = 'https://api.themoviedb.org/3';
    try {
      const src = new TmdbSource('abcdef0123456789abcdef0123456789');
      await expect(src.title('tv-424242')).rejects.toThrow('Outside call refused here: api.themoviedb.org');
    } finally {
      process.env.PP_TMDB_BASE = base;
    }
  });
});
