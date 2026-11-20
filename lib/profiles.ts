// Profiles (handoff 3.3): created, edited and deleted in the app; nothing hard coded. Soft delete.
import { getDb } from './db';
import type { KidSafeguardsRow, ProfilesRow } from './db/types.gen';
import { BadRequest } from './route';

export const PROFILE_COLORS = ['#FFC94A', '#FF8A65', '#7FC8A9', '#8FB3FF', '#C9A7F5'] as const;
export type ProfileType = 'adult' | 'kid';

export interface Profile {
  id: number;
  name: string;
  color: string;
  initial: string;
  type: ProfileType;
  summary: string;
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function safeguardSummary(s: KidSafeguardsRow | undefined): string {
  if (!s) return '';
  const ratings = (JSON.parse(s.allowed_ratings) as string[]).join(', ');
  const limits = JSON.parse(s.daily_limits) as Record<string, number>;
  const weekday = limits.mon;
  const sameWeekdays = DAY_KEYS.slice(0, 4).every((d) => limits[d] === weekday);
  return `${ratings || 'No ratings allowed'} · ${weekday} min ${sameWeekdays ? 'weekdays' : 'Mondays'}`;
}

function toProfile(row: ProfilesRow, s?: KidSafeguardsRow): Profile {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    initial: row.initial,
    type: row.type as ProfileType,
    summary: row.type === 'adult' ? 'No limits' : safeguardSummary(s),
  };
}

function safeguards(id: number): KidSafeguardsRow | undefined {
  return getDb().prepare('SELECT * FROM kid_safeguards WHERE profile_id = ?').get(id) as KidSafeguardsRow | undefined;
}

export function listProfiles(): Profile[] {
  const rows = getDb().prepare('SELECT * FROM profiles WHERE deleted_at IS NULL ORDER BY type, name COLLATE NOCASE, id').all() as ProfilesRow[];
  return rows.map((r) => toProfile(r, r.type === 'kid' ? safeguards(r.id) : undefined));
}

export function getProfile(id: number): Profile | null {
  const row = getDb().prepare('SELECT * FROM profiles WHERE id = ? AND deleted_at IS NULL').get(id) as ProfilesRow | undefined;
  return row ? toProfile(row, row.type === 'kid' ? safeguards(row.id) : undefined) : null;
}

export interface ProfileInput {
  name?: unknown;
  color?: unknown;
  type?: unknown;
}

function cleanName(v: unknown): string {
  const name = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 40) throw new BadRequest('A profile needs a name of 1 to 40 characters.');
  return name;
}

function cleanColor(v: unknown): string {
  if (typeof v !== 'string' || !(PROFILE_COLORS as readonly string[]).includes(v)) throw new BadRequest('Pick one of the profile colors.');
  return v;
}

function cleanType(v: unknown): ProfileType {
  if (v !== 'adult' && v !== 'kid') throw new BadRequest('A profile is Adult or Kid.');
  return v;
}

function initialOf(name: string): string {
  return Array.from(name)[0].toUpperCase();
}

function ensureSafeguards(id: number): void {
  getDb().prepare('INSERT OR IGNORE INTO kid_safeguards (profile_id) VALUES (?)').run(id);
}

export function createProfile(input: ProfileInput): Profile {
  const name = cleanName(input.name);
  const color = cleanColor(input.color);
  const type = cleanType(input.type);
  const db = getDb();
  const id = db.transaction(() => {
    const r = db.prepare('INSERT INTO profiles (name, color, initial, type) VALUES (?, ?, ?, ?)').run(name, color, initialOf(name), type);
    const newId = Number(r.lastInsertRowid);
    if (type === 'kid') ensureSafeguards(newId);
    return newId;
  })();
  return getProfile(id) as Profile;
}

export function updateProfile(id: number, input: ProfileInput): { before: Profile; after: Profile } | null {
  const before = getProfile(id);
  if (!before) return null;
  const name = input.name === undefined ? before.name : cleanName(input.name);
  const color = input.color === undefined ? before.color : cleanColor(input.color);
  const type = input.type === undefined ? before.type : cleanType(input.type);
  const db = getDb();
  db.transaction(() => {
    db.prepare('UPDATE profiles SET name = ?, color = ?, initial = ?, type = ? WHERE id = ?').run(name, color, initialOf(name), type, id);
    // Kid safeguards are kept when a profile turns Adult, so turning it back restores them.
    if (type === 'kid') ensureSafeguards(id);
  })();
  return { before, after: getProfile(id) as Profile };
}

export function deleteProfile(id: number): Profile | null {
  const p = getProfile(id);
  if (!p) return null;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE profiles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
    db.prepare('UPDATE tvs SET default_profile_id = NULL WHERE default_profile_id = ?').run(id);
  })();
  return p;
}

export function describeProfileChange(before: Profile, after: Profile): string {
  const parts: string[] = [];
  if (before.name !== after.name) parts.push(`renamed ${before.name} to ${after.name}`);
  if (before.type !== after.type) parts.push(`changed ${after.name} to ${after.type === 'kid' ? 'Kid' : 'Adult'}`);
  if (before.color !== after.color) parts.push(`changed the color of ${after.name}`);
  if (!parts.length) return `Saved profile ${after.name} (no changes)`;
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
