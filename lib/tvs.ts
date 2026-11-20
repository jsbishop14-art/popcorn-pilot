// TVs (handoff section 2): name, room, address, type, default profile, online status.
import { getDb } from './db';
import type { TvsRow } from './db/types.gen';
import { BadRequest } from './route';
import { parseTvAddress } from './devices/address';
import { driverFor } from './devices';
import { channelTokenHash, newToken } from './auth';

export interface Tv {
  id: number;
  name: string;
  room: string;
  address: string;
  port: number;
  type: 'roku';
  model: string | null;
  online: boolean;
  lastSeenAt: string | null;
  defaultProfileId: number | null;
  defaultProfileName: string | null;
  hasChannelToken: boolean;
}

/** What the Guest PIN sees of a TV: enough to pick one, nothing about its setup. */
export function guestView(tv: Tv) {
  return { id: tv.id, name: tv.name, room: tv.room, online: tv.online, defaultProfileName: tv.defaultProfileName };
}

type Row = TvsRow & { profile_name: string | null };

function toTv(r: Row): Tv {
  return {
    id: r.id,
    name: r.name,
    room: r.room,
    address: r.address,
    port: r.port,
    type: 'roku',
    model: r.model,
    online: r.online === 1,
    lastSeenAt: r.last_seen_at,
    defaultProfileId: r.default_profile_id,
    defaultProfileName: r.profile_name,
    hasChannelToken: Boolean(r.channel_token_hash),
  };
}

const SELECT = `SELECT t.*, p.name AS profile_name FROM tvs t
  LEFT JOIN profiles p ON p.id = t.default_profile_id AND p.deleted_at IS NULL
  WHERE t.deleted_at IS NULL`;

export function listTvs(): Tv[] {
  return (getDb().prepare(`${SELECT} ORDER BY t.name COLLATE NOCASE, t.id`).all() as Row[]).map(toTv);
}

export function getTv(id: number): Tv | null {
  const r = getDb().prepare(`${SELECT} AND t.id = ?`).get(id) as Row | undefined;
  return r ? toTv(r) : null;
}

function cleanText(v: unknown, what: string, min: number): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (s.length < min || s.length > 40) throw new BadRequest(`${what} is ${min ? '1' : '0'} to 40 characters.`);
  return s;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function probe(address: string, port: number, timeoutMs = 2000) {
  try {
    return await driverFor({ type: 'roku', address, port }, timeoutMs).deviceInfo();
  } catch {
    return null;
  }
}

export async function addTv(input: { address?: unknown; name?: unknown; room?: unknown }): Promise<Tv> {
  const parsed = typeof input.address === 'string' ? parseTvAddress(input.address) : null;
  if (!parsed) throw new BadRequest('Type the TV address on the home network, like 192.168.1.40.');
  const db = getDb();
  const dup = db.prepare('SELECT id FROM tvs WHERE address = ? AND port = ? AND deleted_at IS NULL').get(parsed.address, parsed.port);
  if (dup) throw new BadRequest('That TV is already added.');
  const info = await probe(parsed.address, parsed.port);
  const name = input.name ? cleanText(input.name, 'A TV name', 1) : (info?.name ?? 'TV').slice(0, 40);
  const room = input.room ? cleanText(input.room, 'A room', 0) : '';
  const at = nowIso();
  const r = db
    .prepare(
      `INSERT INTO tvs (name, room, address, port, type, serial, model, online, last_seen_at, checked_at)
       VALUES (?, ?, ?, ?, 'roku', ?, ?, ?, ?, ?)`,
    )
    .run(name, room, parsed.address, parsed.port, info?.serial ?? null, info?.model ?? null, info ? 1 : 0, info ? at : null, at);
  return getTv(Number(r.lastInsertRowid)) as Tv;
}

export function updateTv(id: number, input: { name?: unknown; room?: unknown; defaultProfileId?: unknown }): { before: Tv; after: Tv } | null {
  const before = getTv(id);
  if (!before) return null;
  const name = input.name === undefined ? before.name : cleanText(input.name, 'A TV name', 1);
  const room = input.room === undefined ? before.room : cleanText(input.room, 'A room', 0);
  let profileId = before.defaultProfileId;
  if (input.defaultProfileId !== undefined) {
    if (input.defaultProfileId === null) profileId = null;
    else {
      const pid = Number(input.defaultProfileId);
      const ok = Number.isInteger(pid) && getDb().prepare('SELECT 1 FROM profiles WHERE id = ? AND deleted_at IS NULL').get(pid);
      if (!ok) throw new BadRequest('Pick a profile that exists.');
      profileId = pid;
    }
  }
  getDb().prepare('UPDATE tvs SET name = ?, room = ?, default_profile_id = ? WHERE id = ?').run(name, room, profileId, id);
  return { before, after: getTv(id) as Tv };
}

export function describeTvChange(before: Tv, after: Tv): string {
  const parts: string[] = [];
  if (before.name !== after.name) parts.push(`renamed TV ${before.name} to ${after.name}`);
  if (before.room !== after.room) parts.push(`set the room of ${after.name} to ${after.room || '(none)'}`);
  if (before.defaultProfileId !== after.defaultProfileId)
    parts.push(`set the default profile of ${after.name} to ${after.defaultProfileName ?? '(none)'}`);
  if (!parts.length) return `Saved TV ${after.name} (no changes)`;
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deleteTv(id: number): Tv | null {
  const tv = getTv(id);
  if (!tv) return null;
  getDb().prepare('UPDATE tvs SET deleted_at = ?, channel_token_hash = NULL WHERE id = ?').run(nowIso(), id);
  return tv;
}

/** Ask every TV whether it is there. Each check waits at most timeoutMs. */
export async function refreshTvs(timeoutMs = 1500): Promise<Tv[]> {
  const tvs = listTvs();
  const db = getDb();
  await Promise.all(
    tvs.map(async (tv) => {
      const info = await probe(tv.address, tv.port, timeoutMs);
      const at = nowIso();
      if (info) db.prepare('UPDATE tvs SET online = 1, last_seen_at = ?, checked_at = ?, model = coalesce(?, model), serial = coalesce(?, serial) WHERE id = ?').run(at, at, info.model || null, info.serial || null, tv.id);
      else db.prepare('UPDATE tvs SET online = 0, checked_at = ? WHERE id = ?').run(at, tv.id);
    }),
  );
  return listTvs();
}

/** A new token for this TV's Popcorn Pilot channel. Shown once; only its hash is kept. Replaces any old token. */
export function newChannelToken(id: number): string | null {
  if (!getTv(id)) return null;
  const token = newToken();
  getDb().prepare('UPDATE tvs SET channel_token_hash = ? WHERE id = ?').run(channelTokenHash(token), id);
  return token;
}

/** The stored token hash of a TV's channel (to put it back when pairing could not reach the TV). */
export function channelTokenHashOf(id: number): string | null {
  const r = getDb().prepare('SELECT channel_token_hash FROM tvs WHERE id = ?').get(id) as { channel_token_hash: string | null } | undefined;
  return r?.channel_token_hash ?? null;
}

export function restoreChannelTokenHash(id: number, hash: string | null): void {
  getDb().prepare('UPDATE tvs SET channel_token_hash = ? WHERE id = ?').run(hash, id);
}
