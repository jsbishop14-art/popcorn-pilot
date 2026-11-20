// TMDB client (free API key, personal use; handoff 4.1). Every answer is cached on the hub (catalog_cache); when
// TMDB cannot be reached a stale answer is served. Region: US ratings and US streaming availability.
// Never used in CI or build sessions: without a key the stub is used, and PP_NO_OUTSIDE_CALLS=1 refuses any address
// that is not this machine (the tests point PP_TMDB_BASE at a local fake).
import { getDb } from '../db';
import { CatalogUnavailable, SERVICES, SERVICE_INFO, type CatalogSource, type Kind, type Service, type Title } from './types';

export const REGION = 'US';
const LIST_TTL_MS = 6 * 3600_000;
const TITLE_TTL_MS = 24 * 3600_000;
const TIMEOUT_MS = 8000;
const PAGE_TITLES = 20;
const SIMILAR_MAX = 12;

export function tmdbBase(): string {
  return process.env.PP_TMDB_BASE || 'https://api.themoviedb.org/3';
}

export function tmdbImageBase(): string {
  return process.env.PP_TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p/w342';
}

/** Refuse a real outside call where none is allowed (CI, build sessions, tests). */
export function assertOutsideCallAllowed(url: string): void {
  if (process.env.PP_NO_OUTSIDE_CALLS !== '1') return;
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new CatalogUnavailable(`Outside call refused here: ${host}`);
}

type Json = Record<string, unknown>;

function cacheGet(key: string): { body: Json; fetchedAt: number } | null {
  const row = getDb().prepare('SELECT body, fetched_at FROM catalog_cache WHERE key = ?').get(key) as { body: string; fetched_at: number } | undefined;
  return row ? { body: JSON.parse(row.body) as Json, fetchedAt: row.fetched_at } : null;
}

function cachePut(key: string, body: Json, now: number): void {
  getDb()
    .prepare('INSERT INTO catalog_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at')
    .run(key, JSON.stringify(body), now);
}

const SERVICE_BY_PROVIDER = new Map<number, Service>();
for (const s of SERVICES) for (const id of SERVICE_INFO[s].tmdbProviders) SERVICE_BY_PROVIDER.set(id, s);

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function arr(v: unknown): Json[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : [];
}
function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

/** Map a TMDB details answer (with appended content ratings, release dates, videos, providers, similar). */
export function mapDetails(kind: Kind, d: Json): Title {
  const id = num(d.id) ?? 0;
  const date = str(kind === 'show' ? d.first_air_date : d.release_date);
  let rating: string | null = null;
  if (kind === 'show') {
    const r = arr(obj(d.content_ratings).results).find((x) => x.iso_3166_1 === REGION);
    rating = str(r?.rating) || null;
  } else {
    const r = arr(obj(d.release_dates).results).find((x) => x.iso_3166_1 === REGION);
    rating = arr(r?.release_dates).map((x) => str(x.certification)).find((c) => c) ?? null;
  }
  const flatrate = arr(obj(obj(obj(d['watch/providers']).results)[REGION]).flatrate);
  const found = new Set(flatrate.map((p) => SERVICE_BY_PROVIDER.get(num(p.provider_id) ?? -1)).filter(Boolean) as Service[]);
  const videos = arr(obj(d.videos).results).filter((v) => v.site === 'YouTube' && v.type === 'Trailer');
  const trailer = (videos.find((v) => v.official === true) ?? videos[0])?.key;
  const posterPath = str(d.poster_path);
  const prefix = kind === 'show' ? 'tv' : 'movie';
  const runTimes = Array.isArray(d.episode_run_time) ? (d.episode_run_time as unknown[]) : [];
  return {
    key: `${prefix}-${id}`,
    kind,
    name: str(kind === 'show' ? d.name : d.title) || 'Untitled',
    year: date ? Number(date.slice(0, 4)) || null : null,
    rating,
    services: SERVICES.filter((s) => found.has(s)),
    overview: str(d.overview),
    seasons:
      kind === 'show'
        ? arr(d.seasons)
            .filter((s) => (num(s.season_number) ?? 0) > 0)
            .map((s) => ({ number: num(s.season_number) ?? 0, episodes: num(s.episode_count) ?? 0 }))
        : [],
    episodeMinutes: kind === 'show' ? num(runTimes[0]) ?? num(obj(d.last_episode_to_air).runtime) : null,
    runtimeMinutes: kind === 'movie' ? num(d.runtime) : null,
    poster: /^\/[A-Za-z0-9_-]+\.(jpg|png)$/.test(posterPath) ? `tmdb-${posterPath.slice(1)}` : null,
    trailer: typeof trailer === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(trailer) ? trailer : null,
    similar: arr(obj(d.similar).results)
      .slice(0, SIMILAR_MAX)
      .map((x) => num(x.id))
      .filter((x): x is number => x !== null)
      .map((x) => `${prefix}-${x}`),
    contentIds: {},
    popularity: num(d.popularity) ?? 0,
  };
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export class TmdbSource implements CatalogSource {
  readonly name = 'tmdb' as const;

  constructor(private readonly apiKey: string, private readonly now: () => number = Date.now) {}

  /** A GET against TMDB through the hub cache. Serves a stale copy when TMDB cannot be reached. */
  async get(path: string, params: Record<string, string>, ttlMs: number): Promise<Json> {
    const q = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
    const cacheKey = `${path}?${q.toString()}`;
    const cached = cacheGet(cacheKey);
    const now = this.now();
    if (cached && now - cached.fetchedAt < ttlMs) return cached.body;
    const bearer = this.apiKey.startsWith('eyJ');
    if (!bearer) q.set('api_key', this.apiKey);
    const url = `${tmdbBase()}${path}?${q.toString()}`;
    try {
      assertOutsideCallAllowed(url);
      const res = await fetch(url, {
        headers: { accept: 'application/json', ...(bearer ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      if (res.status === 404) return {};
      if (!res.ok) throw new CatalogUnavailable(res.status === 401 ? 'TMDB refused the key. Check it in Settings.' : `TMDB answered ${res.status}`);
      const body = (await res.json()) as Json;
      cachePut(cacheKey, body, now);
      return body;
    } catch (err) {
      if (cached) return cached.body;
      throw err instanceof CatalogUnavailable ? err : new CatalogUnavailable('TMDB could not be reached.');
    }
  }

  private async details(kind: Kind, id: number): Promise<Title | null> {
    const append = kind === 'show' ? 'content_ratings,videos,watch/providers,similar' : 'release_dates,videos,watch/providers,similar';
    const d = await this.get(`/${kind === 'show' ? 'tv' : 'movie'}/${id}`, { append_to_response: append, language: 'en-US' }, TITLE_TTL_MS);
    return num(d.id) === null ? null : mapDetails(kind, d);
  }

  async title(key: string): Promise<Title | null> {
    const m = key.match(/^(tv|movie)-(\d+)$/);
    if (!m) return null;
    return this.details(m[1] === 'tv' ? 'show' : 'movie', Number(m[2]));
  }

  async list(service: Service, kind: Kind): Promise<Title[]> {
    const page = await this.get(
      `/discover/${kind === 'show' ? 'tv' : 'movie'}`,
      {
        with_watch_providers: SERVICE_INFO[service].tmdbProviders.join('|'),
        watch_region: REGION,
        with_watch_monetization_types: 'flatrate',
        sort_by: 'popularity.desc',
        include_adult: 'false',
        language: 'en-US',
        page: '1',
      },
      LIST_TTL_MS,
    );
    const ids = arr(page.results)
      .map((r) => num(r.id))
      .filter((x): x is number => x !== null)
      .slice(0, PAGE_TITLES);
    const titles = await pool(ids, 6, (id) => this.details(kind, id).catch(() => null));
    return titles.filter((t): t is Title => t !== null && t.services.includes(service));
  }

  async search(q: string): Promise<Title[]> {
    const query = q.trim();
    if (!query) return [];
    const page = await this.get('/search/multi', { query, include_adult: 'false', language: 'en-US', page: '1' }, LIST_TTL_MS);
    const hits = arr(page.results)
      .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
      .slice(0, PAGE_TITLES)
      .map((r) => ({ kind: (r.media_type === 'tv' ? 'show' : 'movie') as Kind, id: num(r.id) ?? 0 }));
    const titles = await pool(hits, 6, (h) => this.details(h.kind, h.id).catch(() => null));
    return titles.filter((t): t is Title => t !== null && t.services.length > 0);
  }
}
