// The catalog (handoff section 4): titles on Netflix, Prime Video and Hulu, from TMDB or the stub.

export const SERVICES = ['netflix', 'prime', 'hulu'] as const;
export type Service = (typeof SERVICES)[number];
export type Kind = 'show' | 'movie';

/** Plain names, TMDB watch provider ids (US) and Roku channel ids (handoff 2.4). */
export const SERVICE_INFO: Record<Service, { name: string; tmdbProviders: number[]; rokuChannel: string }> = {
  netflix: { name: 'Netflix', tmdbProviders: [8], rokuChannel: '12' },
  prime: { name: 'Prime Video', tmdbProviders: [9, 119], rokuChannel: '13' },
  hulu: { name: 'Hulu', tmdbProviders: [15], rokuChannel: '2285' },
};

export const YOUTUBE_CHANNEL = '837';

export function isService(v: unknown): v is Service {
  return typeof v === 'string' && (SERVICES as readonly string[]).includes(v);
}

/** A title key is '<tv|movie>-<TMDB id>'. */
export const TITLE_KEY_RE = /^(tv|movie)-([0-9]{1,10})$/;

export function isTitleKey(v: unknown): v is string {
  return typeof v === 'string' && TITLE_KEY_RE.test(v);
}

export interface Title {
  key: string;
  kind: Kind;
  name: string;
  year: number | null;
  /** US rating (TV-Y, G, PG-13, TV-MA, ...); null when TMDB has none. Unrated titles are hidden from kid profiles. */
  rating: string | null;
  /** Which of the three services stream it (subscription), in service order. */
  services: Service[];
  overview: string;
  seasons: { number: number; episodes: number }[];
  episodeMinutes: number | null;
  runtimeMinutes: number | null;
  /** Cover art id, served by GET /api/catalog/art/[id]; null when there is none. */
  poster: string | null;
  /** YouTube video id of the trailer. */
  trailer: string | null;
  similar: string[];
  /** The service's own content id, when known, for a deep link launch. */
  contentIds: Partial<Record<Service, string>>;
  popularity: number;
}

/** Where titles come from: TMDB (with a key) or the stub (no key, CI, build sessions). */
export interface CatalogSource {
  readonly name: 'tmdb' | 'stub';
  list(service: Service, kind: Kind): Promise<Title[]>;
  search(q: string): Promise<Title[]>;
  title(key: string): Promise<Title | null>;
}

export class CatalogUnavailable extends Error {}
