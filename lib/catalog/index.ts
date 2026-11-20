// The catalog on the hub: Browse rows, title details, More like this, Suggestions, calm and blocked tags, and
// launching a title or a trailer on a TV. Kid rules are applied here, on the hub, for every answer (handoff 4.6):
// a kid profile never receives a title above its allowed ratings, unrated, or on a block list.
import { getDb } from '../db';
import { readSecrets } from '../secrets';
import type { Auth } from '../auth';
import { HttpError, BadRequest } from '../route';
import { getTv } from '../tvs';
import { driverFor } from '../devices';
import { DeviceError, type LaunchRoute } from '../devices/types';
import type { KidSafeguardsRow, ProfilesRow } from '../db/types.gen';
import { noteLaunch } from '../tvstate';
import { now } from '../clock';
import { stubSource } from './stub';
import { TmdbSource } from './tmdb';
import { SERVICES, SERVICE_INFO, YOUTUBE_CHANNEL, isService, isTitleKey, type CatalogSource, type Kind, type Service, type Title } from './types';

export * from './types';

// ---------------------------------------------------------------------------------------------- source

let testSource: CatalogSource | null = null;
/** Tests only: replace the source. */
export function setCatalogSourceForTests(s: CatalogSource | null): void {
  testSource = s;
}

export function catalogSourceName(): 'tmdb' | 'stub' {
  return readSecrets().tmdb_api_key ? 'tmdb' : 'stub';
}

export function catalogSource(): CatalogSource {
  if (testSource) return testSource;
  const key = readSecrets().tmdb_api_key;
  return key ? new TmdbSource(key) : stubSource;
}

/** A TMDB v3 key (32 hex) or a v4 read access token (a long token starting eyJ). */
export function validTmdbKey(v: unknown): v is string {
  return typeof v === 'string' && (/^[0-9a-f]{32}$/i.test(v) || /^eyJ[A-Za-z0-9._-]{40,1000}$/.test(v));
}

// ---------------------------------------------------------------------------------------------- viewer

/** Who the answer is for. Adults (and adult profiles) see everything; a kid profile sees only what its rules allow. */
export interface Viewer {
  profileId: number | null;
  profileName: string | null;
  kid: boolean;
  allowedRatings: Set<string>;
  blocked: Set<string>;
}

export const EVERYONE: Viewer = { profileId: null, profileName: null, kid: false, allowedRatings: new Set(), blocked: new Set() };

function householdBlocked(): Set<string> {
  const rows = getDb().prepare('SELECT title_key FROM title_tags WHERE blocked = 1').all() as { title_key: string }[];
  return new Set(rows.map((r) => r.title_key));
}

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function viewerForProfile(id: number): Viewer | null {
  const p = getDb().prepare('SELECT * FROM profiles WHERE id = ? AND deleted_at IS NULL').get(id) as ProfilesRow | undefined;
  if (!p) return null;
  if (p.type !== 'kid') return { ...EVERYONE, profileId: p.id, profileName: p.name };
  const s = getDb().prepare('SELECT * FROM kid_safeguards WHERE profile_id = ?').get(id) as KidSafeguardsRow | undefined;
  const blocked = householdBlocked();
  for (const k of parseList(s?.blocked_titles ?? '[]')) blocked.add(k);
  // No safeguards row: nothing is allowed (fail closed).
  return { profileId: p.id, profileName: p.name, kid: true, allowedRatings: new Set(parseList(s?.allowed_ratings ?? '[]')), blocked };
}

/**
 * The viewer for a request. `profile` is the "Showing for" profile id (query or body). The Guest PIN browses for a
 * kid profile only; the Adult PIN may browse for anyone, or for no one in particular (no filter).
 */
export function viewerFor(auth: Auth, profile: unknown): Viewer {
  const raw = profile === undefined || profile === null || profile === '' ? null : Number(profile);
  if (raw !== null && (!Number.isInteger(raw) || raw < 1)) throw new BadRequest('Bad profile.');
  const v = raw === null ? null : viewerForProfile(raw);
  if (raw !== null && !v) throw new BadRequest('That profile does not exist.');
  if (auth.role === 'guest') {
    if (!v || !v.kid) throw new HttpError(403, 'With the Guest PIN, browse for a kid profile.');
    return v;
  }
  if (auth.role === 'adult') return v ?? EVERYONE;
  throw new HttpError(403, 'Not allowed.');
}

export function allows(v: Viewer, t: Title): boolean {
  if (!v.kid) return true;
  if (!t.rating || !v.allowedRatings.has(t.rating)) return false;
  return !v.blocked.has(t.key);
}

// ---------------------------------------------------------------------------------------------- cards

export interface Tags {
  calm: boolean;
  blocked: boolean;
}

function tagsFor(keys: string[]): Map<string, Tags> {
  const out = new Map<string, Tags>();
  if (!keys.length) return out;
  const rows = getDb()
    .prepare(`SELECT title_key, calm, blocked FROM title_tags WHERE title_key IN (${keys.map(() => '?').join(',')})`)
    .all(...keys) as { title_key: string; calm: number; blocked: number }[];
  for (const r of rows) out.set(r.title_key, { calm: r.calm === 1, blocked: r.blocked === 1 });
  return out;
}

export interface Card {
  key: string;
  kind: Kind;
  name: string;
  rating: string | null;
  services: Service[];
  poster: string | null;
  calm: boolean;
  blocked: boolean;
}

export function artUrl(id: string | null): string | null {
  return id ? `/api/catalog/art/${encodeURIComponent(id)}` : null;
}

function cards(titles: Title[]): Card[] {
  const tags = tagsFor(titles.map((t) => t.key));
  return titles.map((t) => ({
    key: t.key,
    kind: t.kind,
    name: t.name,
    rating: t.rating,
    services: t.services,
    poster: artUrl(t.poster),
    calm: tags.get(t.key)?.calm ?? false,
    blocked: tags.get(t.key)?.blocked ?? false,
  }));
}

// ---------------------------------------------------------------------------------------------- browse

export type KindFilter = 'all' | Kind;

export interface Row {
  id: string;
  name: string;
  service: Service;
  titles: Card[];
}

function byPopularity(a: Title, b: Title) {
  return b.popularity - a.popularity;
}

async function serviceTitles(src: CatalogSource, service: Service, kind: KindFilter, q: string): Promise<Title[]> {
  if (q) {
    const hits = await src.search(q);
    return hits.filter((t) => t.services.includes(service) && (kind === 'all' || t.kind === kind));
  }
  const kinds: Kind[] = kind === 'all' ? ['show', 'movie'] : [kind];
  const lists = await Promise.all(kinds.map((k) => src.list(service, k)));
  return lists.flat().sort(byPopularity);
}

/**
 * Browse rows. "All" is exactly one row per platform. One platform: a row per kind (shows, movies), or one row when
 * filtered to shows or movies. Every title passes the viewer's rules.
 */
export async function browse(v: Viewer, opts: { service: 'all' | Service; kind: KindFilter; q: string }): Promise<Row[]> {
  const src = catalogSource();
  const q = opts.q.trim().slice(0, 80);
  if (opts.service === 'all') {
    return Promise.all(
      SERVICES.map(async (s) => ({
        id: s,
        name: SERVICE_INFO[s].name,
        service: s,
        titles: cards((await serviceTitles(src, s, opts.kind, q)).filter((t) => allows(v, t))),
      })),
    );
  }
  const s = opts.service;
  const kinds: Kind[] = opts.kind === 'all' ? ['show', 'movie'] : [opts.kind];
  return Promise.all(
    kinds.map(async (k) => ({
      id: `${s}-${k}`,
      name: `${k === 'show' ? 'Shows' : 'Movies'} on ${SERVICE_INFO[s].name}`,
      service: s,
      titles: cards((await serviceTitles(src, s, k, q)).filter((t) => allows(v, t))),
    })),
  );
}

export function parseBrowseQuery(url: URL): { service: 'all' | Service; kind: KindFilter; q: string } {
  const service = url.searchParams.get('service') ?? 'all';
  const kind = url.searchParams.get('kind') ?? 'all';
  if (service !== 'all' && !isService(service)) throw new BadRequest('Platform is all, netflix, prime or hulu.');
  if (kind !== 'all' && kind !== 'show' && kind !== 'movie') throw new BadRequest('Kind is all, show or movie.');
  return { service, kind, q: url.searchParams.get('q') ?? '' };
}

// ---------------------------------------------------------------------------------------------- details

export interface Details extends Card {
  year: number | null;
  overview: string;
  seasons: { number: number; episodes: number }[];
  episodeMinutes: number | null;
  runtimeMinutes: number | null;
  trailer: string | null;
}

/** A title the viewer may see, or 404. Titles on none of the three services are not offered. */
export async function visibleTitle(v: Viewer, key: string): Promise<Title> {
  if (!isTitleKey(key)) throw new HttpError(404, 'No such title.');
  const t = await catalogSource().title(key);
  if (!t || !t.services.length) throw new HttpError(404, 'No such title on Netflix, Prime Video or Hulu.');
  if (!allows(v, t)) throw new HttpError(404, `Not available for ${v.profileName ?? 'this profile'}.`);
  return t;
}

export async function details(v: Viewer, key: string): Promise<Details> {
  const t = await visibleTitle(v, key);
  const [c] = cards([t]);
  return { ...c, year: t.year, overview: t.overview, seasons: t.seasons, episodeMinutes: t.episodeMinutes, runtimeMinutes: t.runtimeMinutes, trailer: t.trailer };
}

async function titlesFor(keys: string[]): Promise<Title[]> {
  const src = catalogSource();
  const got = await Promise.all(keys.map((k) => src.title(k).catch(() => null)));
  return got.filter((t): t is Title => t !== null && t.services.length > 0);
}

/** More like this: the title's similar titles that the viewer may see. */
export async function similar(v: Viewer, key: string): Promise<Card[]> {
  const t = await visibleTitle(v, key);
  return cards((await titlesFor(t.similar)).filter((x) => allows(v, x) && x.key !== t.key));
}

// ---------------------------------------------------------------------------------------------- suggestions

export interface Suggestion extends Card {
  reason: string;
}

const SUGGESTIONS_MAX = 20;

/**
 * Rule based suggestions (no AI): titles similar to what this profile has played (or, with calm, to the calm
 * titles), then popular titles on each service. Every suggestion passes the viewer's rules and streams on one of
 * the three services.
 */
export async function suggestions(v: Viewer, opts: { calm: boolean }): Promise<{ basedOn: string; items: Suggestion[] }> {
  const db = getDb();
  let seedKeys: string[];
  let basedOn: string;
  if (opts.calm) {
    seedKeys = (db.prepare('SELECT title_key FROM title_tags WHERE calm = 1 ORDER BY updated_at DESC LIMIT 12').all() as { title_key: string }[]).map((r) => r.title_key);
    basedOn = 'calm';
  } else if (v.profileId !== null) {
    seedKeys = (
      db
        .prepare("SELECT title_key FROM launch_log WHERE profile_id = ? AND kind = 'title' AND ok = 1 GROUP BY title_key ORDER BY max(at) DESC LIMIT 6")
        .all(v.profileId) as { title_key: string }[]
    ).map((r) => r.title_key);
    basedOn = seedKeys.length ? 'played' : 'popular';
  } else {
    seedKeys = [];
    basedOn = 'popular';
  }
  const src = catalogSource();
  const seeds = (await titlesFor(seedKeys)).filter((t) => allows(v, t));
  const out: { t: Title; reason: string }[] = [];
  const seen = new Set(seeds.map((s) => s.key));
  const push = (t: Title, reason: string) => {
    if (out.length >= SUGGESTIONS_MAX || seen.has(t.key) || !t.services.length || !allows(v, t)) return;
    seen.add(t.key);
    out.push({ t, reason });
  };
  for (const seed of seeds) for (const t of await titlesFor(seed.similar)) push(t, `Similar to ${seed.name}`);
  if (!opts.calm) {
    const popular = await Promise.all(SERVICES.map(async (s) => ({ s, list: (await src.list(s, 'show')).concat(await src.list(s, 'movie')).sort(byPopularity) })));
    // Popular picks, one service at a time, so all three services are represented.
    for (let i = 0; out.length < SUGGESTIONS_MAX && i < 20; i++) {
      for (const { s, list } of popular) if (list[i]) push(list[i], `Popular on ${SERVICE_INFO[s].name}`);
    }
  }
  const cs = cards(out.map((o) => o.t));
  return { basedOn, items: cs.map((c, i) => ({ ...c, reason: out[i].reason })) };
}

// ---------------------------------------------------------------------------------------------- tags

export interface TaggedTitle {
  key: string;
  name: string;
  services: Service[];
  rating: string | null;
  updatedAt: string;
}

/** Set a household tag. Returns whether anything changed. */
export function setTag(t: Title, tag: 'calm' | 'blocked', on: boolean): boolean {
  const db = getDb();
  const before = db.prepare(`SELECT ${tag} AS v FROM title_tags WHERE title_key = ?`).get(t.key) as { v: number } | undefined;
  if ((before?.v ?? 0) === (on ? 1 : 0)) return false;
  db.prepare(
    `INSERT INTO title_tags (title_key, name, services, rating, ${tag}) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (title_key) DO UPDATE SET name = excluded.name, services = excluded.services, rating = excluded.rating, ${tag} = excluded.${tag}`,
  ).run(t.key, t.name, JSON.stringify(t.services), t.rating, on ? 1 : 0);
  return true;
}

export function taggedTitles(tag: 'calm' | 'blocked'): TaggedTitle[] {
  const rows = getDb()
    .prepare(`SELECT title_key, name, services, rating, updated_at FROM title_tags WHERE ${tag} = 1 ORDER BY name COLLATE NOCASE`)
    .all() as { title_key: string; name: string; services: string; rating: string | null; updated_at: string }[];
  return rows.map((r) => ({ key: r.title_key, name: r.name, services: parseList(r.services).filter(isService), rating: r.rating, updatedAt: r.updated_at }));
}

export function calmCount(): number {
  return (getDb().prepare('SELECT count(*) AS n FROM title_tags WHERE calm = 1').get() as { n: number }).n;
}

/** Look a title up for tagging (Adult PIN): no viewer filter, but it must exist on one of the three services. */
export async function titleForTag(key: string): Promise<Title> {
  return visibleTitle(EVERYONE, key);
}

// ---------------------------------------------------------------------------------------------- launches

function tvOrFail(tvId: unknown) {
  const id = Number(tvId);
  const tv = Number.isInteger(id) && id > 0 ? getTv(id) : null;
  if (!tv) throw new BadRequest('Pick a TV.');
  return tv;
}

function logLaunch(e: { key: string; kind: 'title' | 'trailer'; service: Service | 'youtube'; tvId: number; profileId: number | null; route: LaunchRoute; ok: boolean; error?: string }) {
  getDb()
    .prepare('INSERT INTO launch_log (title_key, kind, service, tv_id, profile_id, route, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(e.key, e.kind, e.service, e.tvId, e.profileId, e.route, e.ok ? 1 : 0, e.error ?? null);
}

function deviceMessage(tvName: string, err: unknown): string {
  if (err instanceof DeviceError && !err.offline) return `${tvName}: ${err.message}`;
  return `${tvName} did not answer. Check it is on and on the home Wi-Fi.`;
}

export interface LaunchResult {
  tvName: string;
  service: Service | 'youtube';
  route: LaunchRoute;
}

/**
 * Play a title on a TV: a deep link when the service's content id is known, else Roku search launch (handoff 2.4).
 * The route used is recorded. Start from is passed through as words in the record; the services choose the episode.
 */
export async function playOnTv(v: Viewer, key: string, input: { tvId: unknown; service?: unknown }): Promise<LaunchResult & { title: Title }> {
  const t = await visibleTitle(v, key);
  const tv = tvOrFail(input.tvId);
  const service = input.service === undefined || input.service === null || input.service === '' ? t.services[0] : input.service;
  if (!isService(service) || !t.services.includes(service)) throw new BadRequest(`${t.name} is not on that service.`);
  const channelId = SERVICE_INFO[service].rokuChannel;
  const contentId = t.contentIds[service];
  const route: LaunchRoute = contentId ? 'deep_link' : 'search';
  try {
    const d = driverFor(tv);
    if (contentId) await d.launch({ channelId, contentId, mediaType: t.kind === 'show' ? 'series' : 'movie' });
    else await d.searchLaunch({ keyword: t.name, type: t.kind === 'show' ? 'tv-show' : 'movie', providerId: channelId });
  } catch (err) {
    logLaunch({ key, kind: 'title', service, tvId: tv.id, profileId: v.profileId, route, ok: false, error: err instanceof Error ? err.message : 'error' });
    throw new HttpError(502, deviceMessage(tv.name, err));
  }
  logLaunch({ key, kind: 'title', service, tvId: tv.id, profileId: v.profileId, route, ok: true });
  noteLaunch(tv.id, channelId, now());
  return { title: t, tvName: tv.name, service, route };
}

/** Send a title's trailer to a TV: the YouTube channel on the Roku, with the trailer's video id. */
export async function trailerOnTv(v: Viewer, key: string, input: { tvId: unknown }): Promise<LaunchResult & { title: Title }> {
  const t = await visibleTitle(v, key);
  if (!t.trailer) throw new BadRequest(`${t.name} has no trailer.`);
  const tv = tvOrFail(input.tvId);
  try {
    await driverFor(tv).launch({ channelId: YOUTUBE_CHANNEL, contentId: t.trailer });
  } catch (err) {
    logLaunch({ key, kind: 'trailer', service: 'youtube', tvId: tv.id, profileId: v.profileId, route: 'deep_link', ok: false, error: err instanceof Error ? err.message : 'error' });
    throw new HttpError(502, deviceMessage(tv.name, err));
  }
  logLaunch({ key, kind: 'trailer', service: 'youtube', tvId: tv.id, profileId: v.profileId, route: 'deep_link', ok: true });
  noteLaunch(tv.id, YOUTUBE_CHANNEL, now());
  return { title: t, tvName: tv.name, service: 'youtube', route: 'deep_link' };
}
