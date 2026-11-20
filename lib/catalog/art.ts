// Cover art. Stub posters come from catalog-stub/art/. TMDB posters are fetched once and kept in the hub's data
// directory, so they still show when the hub has no internet.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../paths.mjs';
import { stubDir } from './stub';
import { assertOutsideCallAllowed, tmdbImageBase } from './tmdb';

const STUB_RE = /^stub-[0-9]{1,10}\.svg$/;
const TMDB_RE = /^tmdb-[A-Za-z0-9_-]{1,80}\.(jpg|png)$/;

export function isArtId(id: string): boolean {
  return STUB_RE.test(id) || TMDB_RE.test(id);
}

function artCacheDir(): string {
  return path.join(dataDir(), 'art-cache');
}

const TYPES: Record<string, string> = { svg: 'image/svg+xml', jpg: 'image/jpeg', png: 'image/png' };

export async function readArt(id: string): Promise<{ body: Buffer; type: string } | null> {
  if (!isArtId(id)) return null;
  const type = TYPES[id.split('.').pop() as string];
  if (STUB_RE.test(id)) {
    const file = path.join(stubDir(), 'art', id);
    return fs.existsSync(file) ? { body: fs.readFileSync(file), type } : null;
  }
  const file = path.join(artCacheDir(), id);
  if (fs.existsSync(file)) return { body: fs.readFileSync(file), type };
  const url = `${tmdbImageBase()}/${id.slice('tmdb-'.length)}`;
  try {
    assertOutsideCallAllowed(url);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > 2_000_000) return null;
    fs.mkdirSync(artCacheDir(), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
    return { body, type };
  } catch {
    return null;
  }
}
