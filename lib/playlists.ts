// Playlists (handoff section 6): saved playlists and the one quick playlist, their titles in order with a mode per
// show, loop, shuffle and a schedule. Playlists are shared across profiles; a kid profile only sees the titles its
// rules allow (checked here on the hub, and again by the engine when a title is launched).
import { getDb } from './db';
import type { PlaylistItemsRow, PlaylistsRow } from './db/types.gen';
import { BadRequest, HttpError } from './route';
import { getTv } from './tvs';
import { EVERYONE, SERVICE_INFO, allows, artUrl, isService, visibleTitle, type Service, type Viewer } from './catalog';

export const MODES = ['episodes', 'stay', 'time', 'indefinite'] as const;
export type Mode = (typeof MODES)[number];
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

/** The fields a playlist item and a live queue item share. */
export interface ItemFields {
  kind: 'title' | 'album';
  titleKey: string | null;
  titleKind: 'show' | 'movie' | null;
  service: Service | null;
  name: string;
  rating: string | null;
  poster: string | null;
  episodeMinutes: number | null;
  runtimeMinutes: number | null;
  mode: Mode;
  episodes: number;
  minutes: number;
  startFrom: string | null;
}

export interface Item extends ItemFields {
  id: number;
  position: number;
  /** "3 episodes", "Stay on show", "45 min", "Run indefinitely", "Whole movie". */
  modeLabel: string;
  serviceName: string;
}

export interface Schedule {
  on: boolean;
  days: Day[];
  time: string | null;
  tvId: number | null;
  tvName: string | null;
  profileId: number | null;
  /** "Saturdays 8:00 AM · Living room". */
  label: string;
}

export interface Playlist {
  id: number;
  name: string;
  quick: boolean;
  loop: boolean;
  shuffle: boolean;
  schedule: Schedule;
  items: Item[];
  /** Items the viewer may not see are left out of items; this says how many. */
  hiddenCount: number;
  covers: string[];
  /** "6 titles · Netflix, Hulu · 2 hr 10 min". */
  meta: string;
  updatedAt: string;
}

export const ALBUM_NAME = 'Family Album';

export function modeLabel(f: Pick<ItemFields, 'kind' | 'titleKind' | 'mode' | 'episodes' | 'minutes'>): string {
  if (f.kind === 'album') return f.mode === 'indefinite' ? 'Run indefinitely' : `${f.minutes} min`;
  switch (f.mode) {
    case 'episodes':
      return f.titleKind === 'movie' ? 'Whole movie' : `${f.episodes} episode${f.episodes === 1 ? '' : 's'}`;
    case 'stay':
      return 'Stay on show';
    case 'time':
      return `${f.minutes} min`;
    case 'indefinite':
      return 'Run indefinitely';
  }
}

/**
 * How long the hub lets an item play before moving on, in minutes; null when it plays until someone skips or stops
 * (stay on show, run indefinitely). Time on show stops at the end of an episode: the first episode boundary at or
 * after the set minutes. Approximate: streaming apps do not reliably report position.
 */
export function itemMinutes(f: Pick<ItemFields, 'kind' | 'titleKind' | 'mode' | 'episodes' | 'minutes' | 'episodeMinutes' | 'runtimeMinutes'>): number | null {
  if (f.mode === 'stay' || f.mode === 'indefinite') return null;
  if (f.kind === 'album') return f.minutes;
  if (f.titleKind === 'movie') return f.runtimeMinutes ?? 90;
  const ep = f.episodeMinutes ?? 30;
  if (f.mode === 'episodes') return f.episodes * ep;
  return Math.ceil(f.minutes / ep) * ep;
}

export function durationWords(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`;
}

function parseDays(s: string): Day[] {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? DAYS.filter((d) => v.includes(d)) : [];
  } catch {
    return [];
  }
}

const DAY_WORDS: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_PLURAL: Record<Day, string> = { mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays' };

export function timeWords(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function daysWords(days: Day[]): string {
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && DAYS.slice(0, 5).every((d) => days.includes(d))) return 'Weekdays';
  if (days.length === 2 && days.includes('sat') && days.includes('sun')) return 'Weekends';
  if (days.length === 1) return DAY_PLURAL[days[0]];
  return days.map((d) => DAY_WORDS[d]).join(', ');
}

function scheduleOf(r: PlaylistsRow): Schedule {
  const days = parseDays(r.schedule_days);
  const tv = r.schedule_tv_id ? getTv(r.schedule_tv_id) : null;
  const on = r.schedule_on === 1 && days.length > 0 && !!r.schedule_time && !!tv;
  return {
    on,
    days,
    time: r.schedule_time,
    tvId: tv?.id ?? null,
    tvName: tv?.name ?? null,
    profileId: r.schedule_profile_id,
    label: on ? `${daysWords(days)} ${timeWords(r.schedule_time as string)} · ${tv?.name}` : 'Not scheduled',
  };
}

function toItem(r: PlaylistItemsRow): Item {
  const f = rowFields(r);
  return { ...f, id: r.id, position: r.position, modeLabel: modeLabel(f), serviceName: f.service ? SERVICE_INFO[f.service].name : 'iCloud album' };
}

/** Item fields from a playlist_items or queue_items row (same column names). */
export function rowFields(r: Omit<PlaylistItemsRow, 'id' | 'playlist_id' | 'position'>): ItemFields {
  return {
    kind: r.kind as 'title' | 'album',
    titleKey: r.title_key,
    titleKind: r.title_kind as 'show' | 'movie' | null,
    service: isService(r.service) ? r.service : null,
    name: r.name,
    rating: r.rating,
    poster: r.poster,
    episodeMinutes: r.episode_minutes,
    runtimeMinutes: r.runtime_minutes,
    mode: r.mode as Mode,
    episodes: r.episodes,
    minutes: r.minutes,
    startFrom: r.start_from,
  };
}

/** Whether the viewer may see an item. The Family Album is the household's own photos: every profile sees it. */
export function itemAllowed(v: Viewer, f: Pick<ItemFields, 'kind' | 'titleKey' | 'rating'>): boolean {
  if (f.kind === 'album') return true;
  return allows(v, { key: f.titleKey ?? '', rating: f.rating } as Parameters<typeof allows>[1]);
}

function metaOf(items: Item[], loop: boolean, shuffle: boolean): string {
  const parts: string[] = [`${items.length} title${items.length === 1 ? '' : 's'}`];
  const services = [...new Set(items.map((i) => (i.service ? SERVICE_INFO[i.service].name : ALBUM_NAME)))];
  if (services.length) parts.push(services.length >= 3 ? 'all services' : services.join(', '));
  const mins = items.map(itemMinutes);
  if (items.length && mins.every((m) => m !== null)) parts.push(durationWords((mins as number[]).reduce((a, b) => a + b, 0)));
  if (loop) parts.push('Loop');
  if (shuffle) parts.push('Shuffle');
  return parts.join(' · ');
}

function toPlaylist(r: PlaylistsRow, v: Viewer): Playlist {
  const all = (getDb().prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position, id').all(r.id) as PlaylistItemsRow[]).map(toItem);
  const items = all.filter((i) => itemAllowed(v, i));
  return {
    id: r.id,
    name: r.quick ? 'Quick playlist' : r.name,
    quick: r.quick === 1,
    loop: r.loop === 1,
    shuffle: r.shuffle === 1,
    schedule: scheduleOf(r),
    items,
    hiddenCount: all.length - items.length,
    covers: items.filter((i) => i.poster).slice(0, 3).map((i) => artUrl(i.poster) as string),
    meta: metaOf(items, r.loop === 1, r.shuffle === 1),
    updatedAt: r.updated_at,
  };
}

function row(id: number): PlaylistsRow | undefined {
  return getDb().prepare('SELECT * FROM playlists WHERE id = ? AND deleted_at IS NULL').get(id) as PlaylistsRow | undefined;
}

/** Saved playlists, for this viewer. A kid profile does not see a playlist with no title it may watch. */
export function listPlaylists(v: Viewer): Playlist[] {
  const rows = getDb().prepare('SELECT * FROM playlists WHERE deleted_at IS NULL AND quick = 0 ORDER BY name COLLATE NOCASE, id').all() as PlaylistsRow[];
  return rows.map((r) => toPlaylist(r, v)).filter((p) => !v.kid || p.items.length > 0);
}

export function getPlaylist(id: number, v: Viewer): Playlist | null {
  const r = row(id);
  return r ? toPlaylist(r, v) : null;
}

export function playlistOr404(id: number, v: Viewer): Playlist {
  const p = getPlaylist(id, v);
  if (!p) throw new HttpError(404, 'No such playlist.');
  return p;
}

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (s.length < 1 || s.length > 60) throw new BadRequest('A playlist name is 1 to 60 characters.');
  return s;
}

export function createPlaylist(input: { name?: unknown }): Playlist {
  const name = cleanName(input.name);
  const r = getDb().prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
  return getPlaylist(Number(r.lastInsertRowid), EVERYONE) as Playlist;
}

// ---------------------------------------------------------------------------------------------- items

export interface ModeInput {
  mode?: unknown;
  episodes?: unknown;
  minutes?: unknown;
}

function intIn(v: unknown, lo: number, hi: number, what: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new BadRequest(`${what} is ${lo} to ${hi}.`);
  return n;
}

/** Validate a mode for an item. Movies play whole or run indefinitely; the Family Album plays for minutes or runs. */
export function cleanMode(f: Pick<ItemFields, 'kind' | 'titleKind'>, input: ModeInput, base: Pick<ItemFields, 'mode' | 'episodes' | 'minutes'>): Pick<ItemFields, 'mode' | 'episodes' | 'minutes'> {
  const mode = input.mode === undefined ? base.mode : input.mode;
  if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) throw new BadRequest('Mode is episodes, stay, time or indefinite.');
  const m = mode as Mode;
  if (f.kind === 'album' && m !== 'time' && m !== 'indefinite') throw new BadRequest('The Family Album plays for a set time or runs indefinitely.');
  if (f.titleKind === 'movie' && m !== 'episodes' && m !== 'indefinite') throw new BadRequest('A movie plays whole or runs indefinitely.');
  const episodes = input.episodes === undefined ? base.episodes : intIn(input.episodes, 1, 99, 'Number of episodes');
  const minutes = input.minutes === undefined ? base.minutes : intIn(input.minutes, 5, 600, 'Time on show');
  return { mode: m, episodes: f.titleKind === 'movie' ? 1 : episodes, minutes };
}

/** The fields for a title, looked up in the catalog (it must be one the viewer may see). */
export async function titleFields(v: Viewer, key: unknown, service: unknown, mode: ModeInput, startFrom?: unknown): Promise<ItemFields> {
  if (typeof key !== 'string') throw new BadRequest('Pick a title.');
  const t = await visibleTitle(v, key);
  const s = service === undefined || service === null || service === '' ? t.services[0] : service;
  if (!isService(s) || !t.services.includes(s)) throw new BadRequest(`${t.name} is not on that service.`);
  const titleKind = t.kind;
  const base = { mode: 'episodes' as Mode, episodes: titleKind === 'show' ? 3 : 1, minutes: 30 };
  const m = cleanMode({ kind: 'title', titleKind }, mode, base);
  return {
    kind: 'title',
    titleKey: t.key,
    titleKind,
    service: s,
    name: t.name,
    rating: t.rating,
    poster: t.poster,
    episodeMinutes: t.episodeMinutes,
    runtimeMinutes: t.runtimeMinutes,
    ...m,
    startFrom: typeof startFrom === 'string' && startFrom.length <= 60 ? startFrom : null,
  };
}

export function albumFields(mode: ModeInput): ItemFields {
  const m = cleanMode({ kind: 'album', titleKind: null }, mode, { mode: 'time', episodes: 1, minutes: 15 });
  return { kind: 'album', titleKey: null, titleKind: null, service: null, name: ALBUM_NAME, rating: null, poster: null, episodeMinutes: null, runtimeMinutes: null, ...m, startFrom: null };
}

export const ITEM_COLUMNS = 'kind, title_key, title_kind, service, name, rating, poster, episode_minutes, runtime_minutes, mode, episodes, minutes, start_from';

export function itemValues(f: ItemFields): (string | number | null)[] {
  return [f.kind, f.titleKey, f.titleKind, f.service, f.name, f.rating, f.poster, f.episodeMinutes, f.runtimeMinutes, f.mode, f.episodes, f.minutes, f.startFrom];
}

export function appendItem(playlistId: number, f: ItemFields): number {
  const db = getDb();
  const next = (db.prepare('SELECT coalesce(max(position), 0) + 1 AS n FROM playlist_items WHERE playlist_id = ?').get(playlistId) as { n: number }).n;
  const r = db.prepare(`INSERT INTO playlist_items (playlist_id, position, ${ITEM_COLUMNS}) VALUES (?, ?, ${ITEM_COLUMNS.split(',').map(() => '?').join(', ')})`).run(playlistId, next, ...itemValues(f));
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), playlistId);
  return Number(r.lastInsertRowid);
}

// ---------------------------------------------------------------------------------------------- edit

export interface PlaylistEdit {
  name?: unknown;
  loop?: unknown;
  shuffle?: unknown;
  schedule?: unknown;
  /** The items in their new order, each with its mode. Items left out are removed. */
  items?: unknown;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new BadRequest(`${what} is on or off.`);
  return v;
}

/** Save the editor. Returns words for Activity history. Adult PIN only (the route says so). */
export function updatePlaylist(id: number, input: PlaylistEdit): { playlist: Playlist; changes: string[] } {
  const db = getDb();
  const before = row(id);
  if (!before || before.quick) throw new HttpError(404, 'No such playlist.');
  const changes: string[] = [];
  const set: Record<string, string | number | null> = {};
  if (input.name !== undefined) {
    const n = cleanName(input.name);
    if (n !== before.name) {
      set.name = n;
      changes.push(`renamed to ${n}`);
    }
  }
  if (input.loop !== undefined) {
    const on = bool(input.loop, 'Loop');
    if (on !== (before.loop === 1)) {
      set.loop = on ? 1 : 0;
      changes.push(`loop ${on ? 'on' : 'off'}`);
    }
  }
  if (input.shuffle !== undefined) {
    const on = bool(input.shuffle, 'Shuffle');
    if (on !== (before.shuffle === 1)) {
      set.shuffle = on ? 1 : 0;
      changes.push(`shuffle ${on ? 'on' : 'off'}`);
    }
  }
  if (input.schedule !== undefined) {
    const s = input.schedule as Record<string, unknown> | null;
    if (!s || typeof s !== 'object') throw new BadRequest('Bad schedule.');
    const on = bool(s.on, 'Schedule');
    const days = Array.isArray(s.days) ? DAYS.filter((d) => (s.days as unknown[]).includes(d)) : [];
    const time = typeof s.time === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s.time) ? s.time : null;
    const tvId = s.tvId === null || s.tvId === undefined ? null : Number(s.tvId);
    const profileId = s.profileId === null || s.profileId === undefined || s.profileId === '' ? null : Number(s.profileId);
    if (on) {
      if (!days.length) throw new BadRequest('Pick at least one day for the schedule.');
      if (!time) throw new BadRequest('Pick a time for the schedule.');
      if (tvId === null || !Number.isInteger(tvId) || !getTv(tvId)) throw new BadRequest('Pick a TV for the schedule.');
    }
    if (profileId !== null && !(Number.isInteger(profileId) && db.prepare('SELECT 1 FROM profiles WHERE id = ? AND deleted_at IS NULL').get(profileId)))
      throw new BadRequest('Pick a profile that exists.');
    set.schedule_on = on ? 1 : 0;
    set.schedule_days = JSON.stringify(days);
    set.schedule_time = time;
    set.schedule_tv_id = tvId !== null && Number.isInteger(tvId) && getTv(tvId) ? tvId : null;
    set.schedule_profile_id = profileId;
    const after = scheduleOf({ ...before, ...set } as PlaylistsRow);
    const was = scheduleOf(before);
    if (after.label !== was.label || after.profileId !== was.profileId) changes.push(on ? `schedule ${after.label}` : 'schedule off');
  }
  const tx = db.transaction(() => {
    if (Object.keys(set).length) {
      db.prepare(`UPDATE playlists SET ${Object.keys(set).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(set), id);
    }
    if (input.items !== undefined) {
      if (!Array.isArray(input.items)) throw new BadRequest('Items is a list.');
      const current = db.prepare('SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position, id').all(id) as PlaylistItemsRow[];
      const byId = new Map(current.map((r) => [r.id, r]));
      const keep: number[] = [];
      input.items.forEach((raw, i) => {
        const it = raw as Record<string, unknown>;
        const r = byId.get(Number(it?.id));
        if (!r) throw new BadRequest('An item in the list is not in this playlist.');
        if (keep.includes(r.id)) throw new BadRequest('An item is listed twice.');
        keep.push(r.id);
        const f = rowFields(r);
        const m = cleanMode(f, it, f);
        if (m.mode !== f.mode || m.episodes !== f.episodes || m.minutes !== f.minutes) changes.push(`${f.name}: ${modeLabel({ ...f, ...m })}`);
        db.prepare('UPDATE playlist_items SET position = ?, mode = ?, episodes = ?, minutes = ? WHERE id = ?').run(i + 1, m.mode, m.episodes, m.minutes, r.id);
      });
      const removed = current.filter((r) => !keep.includes(r.id));
      for (const r of removed) {
        db.prepare('DELETE FROM playlist_items WHERE id = ?').run(r.id);
        changes.push(`removed ${r.name}`);
      }
      const order = current.filter((r) => keep.includes(r.id)).map((r) => r.id);
      if (order.join() !== keep.join()) changes.push('changed the order');
    }
    db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  });
  tx();
  return { playlist: getPlaylist(id, EVERYONE) as Playlist, changes };
}

export function deletePlaylist(id: number): PlaylistsRow | null {
  const r = row(id);
  if (!r || r.quick) return null;
  getDb().prepare('UPDATE playlists SET deleted_at = ?, schedule_on = 0 WHERE id = ?').run(new Date().toISOString(), id);
  return r;
}

// ---------------------------------------------------------------------------------------------- quick playlist

/** The one quick playlist, if there is one. */
export function quickRow(): PlaylistsRow | undefined {
  return getDb().prepare('SELECT * FROM playlists WHERE quick = 1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1').get() as PlaylistsRow | undefined;
}

export function quickId(create: boolean): number | null {
  const r = quickRow();
  if (r) return r.id;
  if (!create) return null;
  return Number(getDb().prepare("INSERT INTO playlists (name, quick) VALUES ('', 1)").run().lastInsertRowid);
}

/** Save the quick playlist as a playlist with a name. */
export function saveQuick(name: unknown): Playlist {
  const r = quickRow();
  if (!r) throw new HttpError(404, 'There is no quick playlist to save.');
  const n = cleanName(name);
  getDb().prepare('UPDATE playlists SET quick = 0, name = ? WHERE id = ?').run(n, r.id);
  return getPlaylist(r.id, EVERYONE) as Playlist;
}

/** Clear the quick playlist (soft delete; anything already playing from it keeps playing). */
export function clearQuick(): boolean {
  const r = quickRow();
  if (!r) return false;
  getDb().prepare('UPDATE playlists SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), r.id);
  return true;
}
