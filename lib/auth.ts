// PIN access (handoff section 3): Adult PIN and Guest PIN, hashed with scrypt in the secret store; hub-wide lockout
// after 5 wrong tries for 1 minute; sessions that lock after the set idle time, enforced here on the hub.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getDb, getSetting } from './db';
import { readSecrets, sessionSecret, updateSecrets } from './secrets';
import type { Role } from './permissions';
import { logActivity } from './activity';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;

export const MAX_TRIES = 5;
export const LOCKOUT_MS = 60_000;
export const SESSION_COOKIE = 'pp_session';
export type PinType = 'adult' | 'guest';

const SCRYPT = { N: 16384, r: 8, p: 1 };

export function validPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pin, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function checkPin(pin: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pin, Buffer.from(salt, 'base64'), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(want, got);
}

export function isSetUp(): boolean {
  const s = readSecrets();
  return Boolean(s.adult_pin_hash && s.guest_pin_hash);
}

export function lockMinutes(): number {
  const n = Number(getSetting('lock_minutes', '5'));
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

/** Plain-words label for the device a request came from (activity history). */
export function deviceFromUserAgent(ua: string | null): string {
  const s = ua ?? '';
  if (/iPhone/.test(s)) return 'iPhone';
  if (/iPad/.test(s)) return 'iPad';
  if (/Android/.test(s)) return /Mobile/.test(s) ? 'Android phone' : 'Android tablet';
  if (/Roku/.test(s)) return 'Roku';
  if (/Macintosh|Windows|Linux|CrOS/.test(s)) return 'Computer';
  return 'Unknown device';
}

function tokenHash(token: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(token).digest('hex');
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Hash used to store a TV's channel token. */
export function channelTokenHash(token: string): string {
  return tokenHash(`channel:${token}`);
}

export interface LockState {
  failures: number;
  locked_until: number;
}

export function lockState(): LockState {
  return getDb().prepare('SELECT failures, locked_until FROM pin_lockout WHERE id = 1').get() as LockState;
}

export type PinResult =
  | { status: 'ok'; pinType: PinType; token: string }
  | { status: 'wrong'; triesLeft: number }
  | { status: 'locked'; lockedUntil: number }
  | { status: 'not_set_up' };

export async function signInWithPin(pin: string, device: string, now = Date.now()): Promise<PinResult> {
  const db = getDb();
  if (!isSetUp()) return { status: 'not_set_up' };
  const lock = lockState();
  if (lock.locked_until > now) return { status: 'locked', lockedUntil: lock.locked_until };
  const s = readSecrets();
  let pinType: PinType | null = null;
  if (validPin(pin)) {
    // Check both so timing does not reveal which PIN a guess was close to.
    const [isAdult, isGuest] = await Promise.all([checkPin(pin, s.adult_pin_hash), checkPin(pin, s.guest_pin_hash)]);
    pinType = isAdult ? 'adult' : isGuest ? 'guest' : null;
  }
  if (!pinType) {
    const failures = lock.failures + 1;
    if (failures >= MAX_TRIES) {
      const until = now + LOCKOUT_MS;
      db.prepare('UPDATE pin_lockout SET failures = 0, locked_until = ? WHERE id = 1').run(until);
      logActivity({ pinType: 'hub', device, action: 'pin.lockout', summary: `PIN entry locked for 1 minute after ${MAX_TRIES} wrong tries` });
      return { status: 'locked', lockedUntil: until };
    }
    db.prepare('UPDATE pin_lockout SET failures = ? WHERE id = 1').run(failures);
    return { status: 'wrong', triesLeft: MAX_TRIES - failures };
  }
  db.prepare('UPDATE pin_lockout SET failures = 0, locked_until = 0 WHERE id = 1').run();
  const token = newToken();
  db.prepare('INSERT INTO sessions (token_hash, pin_type, device, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(
    tokenHash(token),
    pinType,
    device,
    now,
    now,
  );
  return { status: 'ok', pinType, token };
}

export type SetupResult = { status: 'ok' } | { status: 'already_set_up' } | { status: 'invalid'; message: string };

export async function setUpPins(adult: unknown, guest: unknown, device: string): Promise<SetupResult> {
  if (isSetUp()) return { status: 'already_set_up' };
  if (!validPin(adult) || !validPin(guest)) return { status: 'invalid', message: 'Each PIN is 4 digits.' };
  if (adult === guest) return { status: 'invalid', message: 'The Adult PIN and the Guest PIN must be different.' };
  updateSecrets({ adult_pin_hash: await hashPin(adult), guest_pin_hash: await hashPin(guest) });
  logActivity({ pinType: 'hub', device, action: 'pin.setup', summary: 'Set the Adult PIN and the Guest PIN (first run)' });
  return { status: 'ok' };
}

export type ChangePinResult = { status: 'ok' } | { status: 'invalid'; message: string };

export async function changePin(which: PinType, pin: unknown): Promise<ChangePinResult> {
  if (!validPin(pin)) return { status: 'invalid', message: 'A PIN is 4 digits.' };
  const s = readSecrets();
  const other = which === 'adult' ? s.guest_pin_hash : s.adult_pin_hash;
  if (await checkPin(pin, other)) return { status: 'invalid', message: 'The Adult PIN and the Guest PIN must be different.' };
  updateSecrets(which === 'adult' ? { adult_pin_hash: await hashPin(pin) } : { guest_pin_hash: await hashPin(pin) });
  if (which === 'guest') {
    // Guest sessions signed in with the old PIN end now.
    getDb().prepare("UPDATE sessions SET ended_at = ? WHERE pin_type = 'guest' AND ended_at IS NULL").run(Date.now());
  }
  return { status: 'ok' };
}

export interface Auth {
  role: Role;
  sessionId?: number;
  tvId?: number;
  device: string;
  /** Set when a session existed but ended because of no use. */
  idleLocked?: boolean;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export interface AuthInput {
  cookie: string | null;
  authorization: string | null;
  userAgent: string | null;
}

export function authFromHeaders(h: AuthInput, now = Date.now(), touch = true): Auth {
  const device = deviceFromUserAgent(h.userAgent);
  const db = getDb();
  const bearer = h.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) {
    const tv = db
      .prepare('SELECT id, name FROM tvs WHERE channel_token_hash = ? AND deleted_at IS NULL')
      .get(channelTokenHash(bearer)) as { id: number; name: string } | undefined;
    return tv ? { role: 'channel', tvId: tv.id, device: `${tv.name} TV` } : { role: 'signed_out', device };
  }
  const token = readCookie(h.cookie, SESSION_COOKIE);
  if (!token) return { role: 'signed_out', device };
  const row = db
    .prepare('SELECT id, pin_type, device, last_seen_at FROM sessions WHERE token_hash = ? AND ended_at IS NULL')
    .get(tokenHash(token)) as { id: number; pin_type: PinType; device: string; last_seen_at: number } | undefined;
  if (!row) return { role: 'signed_out', device };
  if (now - row.last_seen_at > lockMinutes() * 60_000) {
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, row.id);
    return { role: 'signed_out', device, idleLocked: true };
  }
  if (touch) db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, row.id);
  return { role: row.pin_type, sessionId: row.id, device: row.device };
}

export function authFromRequest(req: Request, now = Date.now()): Auth {
  return authFromHeaders(
    { cookie: req.headers.get('cookie'), authorization: req.headers.get('authorization'), userAgent: req.headers.get('user-agent') },
    now,
  );
}

export function endSession(sessionId: number, now = Date.now()): void {
  getDb().prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, sessionId);
}

export function sessionCookie(token: string): string {
  // No Max-Age: the hub decides when a session ends (idle lock). Secure is off: the hub serves plain HTTP on the
  // home network.
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
