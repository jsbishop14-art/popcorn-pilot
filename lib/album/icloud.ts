// Reading an iCloud shared album through its public web link (handoff 8.1): no Apple ID on the hub. The album's
// "Public Website" must be on. Two calls per sync: webstream (the list of photos and clips with their sizes) and
// webasseturls (download addresses for the ones the hub needs), then one download per new or changed item.
// Never used in CI or build sessions: PP_NO_OUTSIDE_CALLS=1 refuses any address that is not this machine, and the
// tests point PP_ICLOUD_BASE at a local stub (test/stubs/icloud.ts).
import { assertOutsideCallAllowed } from '../catalog/tmdb';

const TIMEOUT_MS = 20_000;
const URL_BATCH = 25;

/** A sync could not read the album; the message is for the household, in plain words. */
export class AlbumError extends Error {}

const LINK_RE = /^https:\/\/www\.icloud\.com\/sharedalbum\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?#([A-Za-z0-9]{10,30})$/;

/** The album token from a shared album link, or null when the text is not one. */
export function albumToken(link: string): string | null {
  const m = link.trim().match(LINK_RE);
  return m ? m[1] : null;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function base62(s: string): number {
  let n = 0;
  for (const c of s) n = n * 62 + BASE62.indexOf(c);
  return n;
}

/** The iCloud server partition a token lives on (iCloud answers with the right one if this guess is wrong). */
export function partitionHost(token: string): string {
  const p = token[0] === 'A' ? base62(token[1]) : base62(token.slice(1, 3));
  return `p${String(p).padStart(2, '0')}-sharedstreams.icloud.com`;
}

function baseFor(token: string, host?: string): string {
  const override = process.env.PP_ICLOUD_BASE;
  if (override) {
    const u = new URL(override);
    return `${u.protocol}//${host ?? u.host}/${token}/sharedstreams/`;
  }
  return `https://${host ?? partitionHost(token)}/${token}/sharedstreams/`;
}

type Json = Record<string, unknown>;

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

async function post(url: string, body: unknown): Promise<{ status: number; json: Json }> {
  try {
    assertOutsideCallAllowed(url);
  } catch (err) {
    throw new AlbumError(err instanceof Error ? err.message : 'Outside call refused here.');
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    throw new AlbumError('iCloud could not be reached. Check the hub is online; the hub tries again later.');
  }
  const text = await res.text();
  let json: Json = {};
  try {
    json = obj(JSON.parse(text));
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

/** One photo or clip in the album, with the copy the hub keeps (the size that suits a TV). */
export interface StreamItem {
  guid: string;
  kind: 'photo' | 'clip';
  checksum: string;
  bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  takenAt: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Pick the copy to keep. Photos: the largest no wider than 2048 (a TV shows at most 1920), else the smallest. Clips:
 * 720p when there is one, else the largest video copy up to 1080p (the poster frame is a picture, not the clip).
 */
export function pickDerivative(kind: 'photo' | 'clip', derivatives: Json): { checksum: string; bytes: number; width: number | null; height: number | null } | null {
  const all = Object.entries(derivatives)
    .map(([key, v]) => {
      const d = obj(v);
      return { key, checksum: typeof d.checksum === 'string' ? d.checksum : '', bytes: num(d.fileSize) ?? 0, width: num(d.width), height: num(d.height) };
    })
    .filter((d) => d.checksum);
  if (kind === 'clip') {
    const videos = all.filter((d) => d.key !== 'PosterFrame');
    const p720 = videos.find((d) => d.key === '720p');
    if (p720) return p720;
    const fit = videos.filter((d) => (d.height ?? 0) <= 1080).sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    return fit[0] ?? null;
  }
  const fit = all.filter((d) => (d.width ?? 0) <= 2048).sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  if (fit[0]) return fit[0];
  return all.sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0] ?? null;
}

export interface Stream {
  name: string;
  items: StreamItem[];
  /** The base address to ask for download addresses (after iCloud named its partition). */
  base: string;
}

/** Read the album's list of photos and clips. Throws AlbumError with plain words when the link does not work. */
export async function readStream(token: string): Promise<Stream> {
  let base = baseFor(token);
  let r = await post(base + 'webstream', { streamCtag: null });
  if (r.status === 330) {
    const host = r.json['X-Apple-MMe-Host'];
    if (typeof host !== 'string' || !/^[A-Za-z0-9.:-]+$/.test(host)) throw new AlbumError('iCloud answered in a way the hub does not understand. It tries again later.');
    base = baseFor(token, host);
    r = await post(base + 'webstream', { streamCtag: null });
  }
  if (r.status === 404 || r.status === 410 || r.status === 401 || r.status === 403)
    throw new AlbumError('iCloud did not find that album. Check the link, and that Public Website is on for the album (Photos, the album, People).');
  if (r.status !== 200) throw new AlbumError(`iCloud answered ${r.status}. The hub tries again later.`);
  const photos = Array.isArray(r.json.photos) ? r.json.photos.map(obj) : null;
  if (!photos) throw new AlbumError('iCloud did not send the album. Check the link; the hub tries again later.');
  const items: StreamItem[] = [];
  for (const p of photos) {
    const guid = typeof p.photoGuid === 'string' ? p.photoGuid : '';
    if (!/^[A-Za-z0-9-]{1,80}$/.test(guid)) continue;
    const kind = p.mediaAssetType === 'video' ? 'clip' : 'photo';
    const d = pickDerivative(kind, obj(p.derivatives));
    if (!d) continue;
    items.push({
      guid,
      kind,
      checksum: d.checksum,
      bytes: d.bytes,
      width: d.width,
      height: d.height,
      caption: typeof p.caption === 'string' && p.caption.trim() ? p.caption.trim().slice(0, 200) : null,
      takenAt: typeof p.dateCreated === 'string' ? p.dateCreated : null,
    });
  }
  return { name: typeof r.json.streamName === 'string' ? r.json.streamName : 'Family Album', items, base };
}

/** Download addresses for some items, by checksum. */
export async function assetUrls(stream: Stream, guids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < guids.length; i += URL_BATCH) {
    const r = await post(stream.base + 'webasseturls', { photoGuids: guids.slice(i, i + URL_BATCH) });
    if (r.status !== 200) throw new AlbumError(`iCloud answered ${r.status} when asked for the photos. The hub tries again later.`);
    const items = obj(r.json.items);
    const locations = obj(r.json.locations);
    for (const [checksum, v] of Object.entries(items)) {
      const it = obj(v);
      const path = typeof it.url_path === 'string' ? it.url_path : '';
      const locKey = typeof it.url_location === 'string' ? it.url_location : '';
      if (!path.startsWith('/') || !locKey) continue;
      const loc = obj(locations[locKey]);
      const hosts = Array.isArray(loc.hosts) ? loc.hosts.filter((h): h is string => typeof h === 'string') : [];
      const scheme = loc.scheme === 'http' ? 'http' : 'https';
      out.set(checksum, `${scheme}://${hosts[0] ?? locKey}${path}`);
    }
  }
  return out;
}

/** Download one item. Returns its bytes and content type. */
export async function download(url: string, maxBytes: number): Promise<{ data: Buffer; mime: string }> {
  try {
    assertOutsideCallAllowed(url);
  } catch (err) {
    throw new AlbumError(err instanceof Error ? err.message : 'Outside call refused here.');
  }
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000), cache: 'no-store' });
  } catch {
    throw new AlbumError('A photo could not be downloaded from iCloud. The hub tries again later.');
  }
  if (!res.ok) throw new AlbumError(`iCloud answered ${res.status} for a photo. The hub tries again later.`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > maxBytes) throw new AlbumError('A clip is too large to keep on the hub.');
  return { data, mime: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim() };
}
