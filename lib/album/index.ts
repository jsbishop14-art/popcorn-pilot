// The Family Album on the hub (handoff 8): the iCloud shared album link (kept in the secret store), a sync on a
// schedule that adds new photos and clips, replaces changed ones and removes the ones taken out of the album, the
// cache on disk (<data>/album/), and the counts and last sync for Settings. A sync that cannot read the album keeps
// what is cached and records the error in plain words; it never throws to its caller.
import fs from 'node:fs';
import path from 'node:path';
import { getDb, getSetting } from '../db';
import { dataDir } from '../paths.mjs';
import { readSecrets, updateSecrets } from '../secrets';
import { now } from '../clock';
import { logActivity } from '../activity';
import type { AlbumItemsRow, AlbumSyncsRow } from '../db/types.gen';
import { AlbumError, albumToken, assetUrls, download, readStream, type StreamItem } from './icloud';

export { AlbumError, albumToken };

/** Clips larger than this are not kept (the album is for short clips; the Pi's storage is shared). */
export const MAX_CLIP_BYTES = 200 * 1024 * 1024;
const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
const DOWNLOADS_AT_ONCE = 3;

const db = () => getDb();

export function albumDir(): string {
  return path.join(dataDir(), 'album');
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

// ---------------------------------------------------------------------------------------------- the link

export function albumLink(): string | null {
  return readSecrets().album_link ?? null;
}

/**
 * Save or remove the album link. Removing it empties the cache (the photos stay in iCloud). Returns what changed in
 * plain words, or null when nothing did.
 */
export function setAlbumLink(link: string | null): string | null {
  const before = albumLink();
  if (link === null) {
    if (!before) return null;
    updateSecrets({ album_link: undefined });
    clearCache();
    return 'Removed the Family Album link (the photos on the hub were cleared)';
  }
  const clean = link.trim();
  if (!albumToken(clean)) throw new AlbumError('That is not an iCloud shared album link. It looks like https://www.icloud.com/sharedalbum/#B0aBcDeFgHiJkL');
  if (clean === before) return null;
  updateSecrets({ album_link: clean });
  return before ? 'Changed the Family Album link' : 'Saved the Family Album link';
}

function clearCache() {
  for (const r of db().prepare('SELECT file FROM album_items').all() as { file: string }[]) removeFile(r.file);
  db().prepare('DELETE FROM album_items').run();
}

function removeFile(file: string) {
  try {
    fs.unlinkSync(path.join(albumDir(), path.basename(file)));
  } catch {
    // already gone
  }
}

// ---------------------------------------------------------------------------------------------- sync

export interface SyncResult {
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  photos: number;
  clips: number;
  message: string | null;
}

let running: Promise<SyncResult> | null = null;

/** Sync the album now. One sync at a time: a second call while one runs gets the same result. */
export function syncAlbum(by: { pinType: 'adult' | 'hub'; device: string } = { pinType: 'hub', device: 'Hub' }): Promise<SyncResult> {
  if (running) return running;
  running = doSync(by).finally(() => {
    running = null;
  });
  return running;
}

export function syncing(): boolean {
  return running !== null;
}

function counts(): { photos: number; clips: number } {
  const r = db().prepare("SELECT sum(kind = 'photo') AS photos, sum(kind = 'clip') AS clips FROM album_items").get() as { photos: number | null; clips: number | null };
  return { photos: r.photos ?? 0, clips: r.clips ?? 0 };
}

async function doSync(by: { pinType: 'adult' | 'hub'; device: string }): Promise<SyncResult> {
  const startedAt = now();
  const link = albumLink();
  const syncId = Number(db().prepare("INSERT INTO album_syncs (started_at, result) VALUES (?, 'running')").run(startedAt).lastInsertRowid);
  const finish = (r: SyncResult): SyncResult => {
    db()
      .prepare('UPDATE album_syncs SET ended_at = ?, result = ?, added = ?, updated = ?, removed = ?, skipped = ?, photos = ?, clips = ?, message = ? WHERE id = ?')
      .run(now(), r.ok ? 'ok' : 'error', r.added, r.updated, r.removed, r.skipped, r.photos, r.clips, r.message, syncId);
    const what = r.ok
      ? `Synced the Family Album: ${r.added} added, ${r.updated} updated, ${r.removed} removed (${r.photos} photos, ${r.clips} clips)`
      : `The Family Album sync failed: ${r.message}`;
    // Only syncs that changed something or failed go into Activity history (the schedule runs every few hours).
    if (!r.ok || r.added || r.updated || r.removed || by.pinType === 'adult') logActivity({ pinType: by.pinType, device: by.device, action: r.ok ? 'album.sync' : 'album.sync_failed', summary: what });
    return r;
  };
  const token = link ? albumToken(link) : null;
  if (!token) return finish({ ok: false, added: 0, updated: 0, removed: 0, skipped: 0, ...counts(), message: 'No Family Album link yet. Add it in Settings.' });

  let added = 0;
  let updated = 0;
  let skipped = 0;
  try {
    const stream = await readStream(token);
    const have = new Map((db().prepare('SELECT * FROM album_items').all() as AlbumItemsRow[]).map((r) => [r.guid, r]));
    const keep = stream.items.filter((i) => {
      const max = i.kind === 'clip' ? MAX_CLIP_BYTES : MAX_PHOTO_BYTES;
      if (i.bytes > max) {
        skipped++;
        return false;
      }
      return true;
    });
    const need = keep.filter((i) => {
      const h = have.get(i.guid);
      return !h || h.checksum !== i.checksum || !fs.existsSync(path.join(albumDir(), h.file));
    });
    const urls = need.length ? await assetUrls(stream, need.map((i) => i.guid)) : new Map<string, string>();
    fs.mkdirSync(albumDir(), { recursive: true });
    const queue = [...need];
    const worker = async () => {
      for (let i = queue.shift(); i; i = queue.shift()) {
        const url = urls.get(i.checksum);
        if (!url) {
          skipped++;
          continue;
        }
        const got = await download(url, i.kind === 'clip' ? MAX_CLIP_BYTES : MAX_PHOTO_BYTES);
        const h = have.get(i.guid);
        if (save(i, got, h)) updated++;
        else added++;
      }
    };
    await Promise.all(Array.from({ length: DOWNLOADS_AT_ONCE }, worker));
    // Removed from the album (or now too large to keep): removed here too. Only after the album was read in full.
    const inAlbum = new Set(keep.map((i) => i.guid));
    let removed = 0;
    for (const [guid, h] of have) {
      if (inAlbum.has(guid)) continue;
      removeFile(h.file);
      db().prepare('DELETE FROM album_items WHERE id = ?').run(h.id);
      removed++;
    }
    // Tidy up files no row points at (an interrupted sync).
    const files = new Set((db().prepare('SELECT file FROM album_items').all() as { file: string }[]).map((r) => r.file));
    for (const f of fs.readdirSync(albumDir())) if (!files.has(f)) removeFile(f);
    return finish({ ok: true, added, updated, removed, skipped, ...counts(), message: skipped ? `${skipped} item${skipped === 1 ? ' was' : 's were'} too large to keep or could not be read.` : null });
  } catch (err) {
    const message = err instanceof AlbumError ? err.message : 'The sync stopped with an error on the hub. It tries again later.';
    if (!(err instanceof AlbumError)) console.error('album sync:', err instanceof Error ? err.message : err);
    return finish({ ok: false, added, updated, removed: 0, skipped, ...counts(), message });
  }
}

/** Write one downloaded item to the cache. Returns true when it replaced an older copy. */
function save(i: StreamItem, got: { data: Buffer; mime: string }, h: AlbumItemsRow | undefined): boolean {
  const mime = EXT[got.mime] ? got.mime : i.kind === 'clip' ? 'video/mp4' : 'image/jpeg';
  const file = `${i.guid}.${EXT[mime]}`;
  const full = path.join(albumDir(), file);
  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, got.data);
  fs.renameSync(tmp, full);
  const at = now();
  if (h) {
    if (h.file !== file) removeFile(h.file);
    db()
      .prepare('UPDATE album_items SET kind = ?, checksum = ?, file = ?, mime = ?, width = ?, height = ?, bytes = ?, caption = ?, taken_at = ?, updated_at = ? WHERE id = ?')
      .run(i.kind, i.checksum, file, mime, i.width, i.height, got.data.length, i.caption, i.takenAt, at, h.id);
    return true;
  }
  db()
    .prepare('INSERT INTO album_items (guid, kind, checksum, file, mime, width, height, bytes, caption, taken_at, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(i.guid, i.kind, i.checksum, file, mime, i.width, i.height, got.data.length, i.caption, i.takenAt, at, at);
  return false;
}

// ---------------------------------------------------------------------------------------------- views

export interface AlbumStatus {
  linkSet: boolean;
  link: string | null;
  photos: number;
  clips: number;
  syncing: boolean;
  everyHours: number;
  lastSync: { at: number; ok: boolean; added: number; updated: number; removed: number; message: string | null } | null;
  /** The last sync that worked, when the last one failed. */
  lastGood: number | null;
}

export function syncHours(): number {
  const n = Number(getSetting('album_sync_hours', '6'));
  return Number.isFinite(n) && n >= 1 ? n : 6;
}

/** For Settings (Adult PIN only): the link, counts and the last sync. */
export function albumStatus(): AlbumStatus {
  const last = db().prepare("SELECT * FROM album_syncs WHERE result != 'running' ORDER BY started_at DESC, id DESC LIMIT 1").get() as AlbumSyncsRow | undefined;
  const good = last && last.result !== 'ok' ? (db().prepare("SELECT max(ended_at) AS at FROM album_syncs WHERE result = 'ok'").get() as { at: number | null }).at : null;
  const link = albumLink();
  return {
    linkSet: Boolean(link),
    link,
    ...counts(),
    syncing: syncing(),
    everyHours: syncHours(),
    lastSync: last ? { at: last.ended_at ?? last.started_at, ok: last.result === 'ok', added: last.added, updated: last.updated, removed: last.removed, message: last.message } : null,
    lastGood: good ?? null,
  };
}

export function albumCount(): number {
  const c = counts();
  return c.photos + c.clips;
}

export interface AlbumEntry {
  id: number;
  kind: 'photo' | 'clip';
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  caption: string | null;
}

/** The cached items for the TV, in a random order (the album plays shuffled), photos only when asked. */
export function albumEntries(opts: { photosOnly?: boolean; random?: () => number } = {}): AlbumEntry[] {
  const rows = db().prepare(`SELECT * FROM album_items${opts.photosOnly ? " WHERE kind = 'photo'" : ''} ORDER BY taken_at, id`).all() as AlbumItemsRow[];
  const rnd = opts.random ?? Math.random;
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.map((r) => ({ id: r.id, kind: r.kind as 'photo' | 'clip', url: `/api/channel/album/${r.id}`, mime: r.mime, width: r.width, height: r.height, caption: r.caption }));
}

/** One cached item's file, for the channel. */
export function albumFile(id: number): { path: string; mime: string; bytes: number } | null {
  const r = db().prepare('SELECT * FROM album_items WHERE id = ?').get(id) as AlbumItemsRow | undefined;
  if (!r) return null;
  const p = path.join(albumDir(), path.basename(r.file));
  if (!fs.existsSync(p)) return null;
  return { path: p, mime: r.mime, bytes: fs.statSync(p).size };
}

// ---------------------------------------------------------------------------------------------- schedule

/** Whether a scheduled sync is due: a link is set and the last sync began longer ago than the sync interval. */
export function syncDue(at: number): boolean {
  if (!albumLink()) return false;
  const last = db().prepare('SELECT max(started_at) AS at FROM album_syncs').get() as { at: number | null };
  return last.at === null || at - last.at >= syncHours() * 3600_000;
}

let timer: NodeJS.Timeout | null = null;

/** Check every 10 minutes (PP_ALBUM_CHECK_MS; 0 turns it off) whether a sync is due, and run it. */
export function startAlbumTimer(): void {
  const ms = Number(process.env.PP_ALBUM_CHECK_MS ?? 600_000);
  if (timer || !(ms > 0)) return;
  timer = setInterval(() => {
    if (syncDue(now())) void syncAlbum();
  }, ms);
  timer.unref();
}
