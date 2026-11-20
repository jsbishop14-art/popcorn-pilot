// Check 1 (hub side): first run sets both PINs; 5 wrong PINs lock for 1 minute; idle lock ends the session.
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDataDir, UA } from './helpers';
import { authFromHeaders, changePin, deviceFromUserAgent, isSetUp, LOCKOUT_MS, MAX_TRIES, SESSION_COOKIE, setUpPins, signInWithPin } from '@/lib/auth';
import { readSecrets } from '@/lib/secrets';
import { setSetting, getDb } from '@/lib/db';
import { listActivity } from '@/lib/activity';

let dir: string;
beforeEach(() => {
  dir = freshDataDir();
});

function cookieOf(token: string) {
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`, authorization: null, userAgent: UA.iphone };
}

describe('first run', () => {
  it('starts not set up and sets both PINs once', async () => {
    expect(isSetUp()).toBe(false);
    expect(await signInWithPin('1111', 'iPhone')).toEqual({ status: 'not_set_up' });
    expect(await setUpPins('1111', '2222', 'iPhone')).toEqual({ status: 'ok' });
    expect(isSetUp()).toBe(true);
    expect(await setUpPins('3333', '4444', 'iPhone')).toEqual({ status: 'already_set_up' });
    expect((await signInWithPin('1111', 'iPhone')).status).toBe('ok');
    expect(listActivity()[0]).toMatchObject({ pin_type: 'hub', action: 'pin.setup' });
  });

  it('refuses PINs that are not 4 digits, or the same for both', async () => {
    expect((await setUpPins('111', '2222', 'x')).status).toBe('invalid');
    expect((await setUpPins('11a1', '2222', 'x')).status).toBe('invalid');
    expect((await setUpPins('12345', '2222', 'x')).status).toBe('invalid');
    expect((await setUpPins('1111', '1111', 'x')).status).toBe('invalid');
    expect(isSetUp()).toBe(false);
  });

  it('stores PINs hashed, only in the encrypted secret store', async () => {
    await setUpPins('8642', '9753', 'x');
    const s = readSecrets();
    expect(s.adult_pin_hash).toMatch(/^scrypt\$/);
    expect(s.adult_pin_hash).not.toContain('8642');
    const raw = fs.readFileSync(path.join(dir, 'secrets.enc'), 'utf8');
    expect(raw).not.toContain('scrypt');
    expect(raw).not.toContain('8642');
    expect(fs.statSync(path.join(dir, 'secrets.enc')).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(dir, 'master.key')).mode & 0o777).toBe(0o600);
    const db = fs.readFileSync(path.join(dir, 'popcorn.db'));
    expect(db.includes(Buffer.from('8642'))).toBe(false);
  });
});

describe('PIN sign in and lockout', () => {
  beforeEach(async () => {
    await setUpPins('1111', '2222', 'x');
  });

  it('Adult PIN gives adult, Guest PIN gives guest', async () => {
    const a = await signInWithPin('1111', 'iPhone');
    const g = await signInWithPin('2222', 'iPhone');
    expect(a.status === 'ok' && a.pinType).toBe('adult');
    expect(g.status === 'ok' && g.pinType).toBe('guest');
    if (a.status === 'ok') expect(authFromHeaders(cookieOf(a.token)).role).toBe('adult');
    if (g.status === 'ok') expect(authFromHeaders(cookieOf(g.token)).role).toBe('guest');
  });

  it(`locks for 1 minute after ${MAX_TRIES} wrong tries, then lets the right PIN in`, async () => {
    const t0 = 1_000_000;
    for (let i = 1; i < MAX_TRIES; i++) expect(await signInWithPin('9999', 'iPhone', t0 + i)).toEqual({ status: 'wrong', triesLeft: MAX_TRIES - i });
    expect(await signInWithPin('9999', 'iPhone', t0 + 10)).toEqual({ status: 'locked', lockedUntil: t0 + 10 + LOCKOUT_MS });
    expect(LOCKOUT_MS).toBe(60_000);
    // The right PIN is refused while locked.
    expect((await signInWithPin('1111', 'iPhone', t0 + 10 + LOCKOUT_MS - 1)).status).toBe('locked');
    // After the minute it works, and the count starts over.
    expect((await signInWithPin('1111', 'iPhone', t0 + 10 + LOCKOUT_MS)).status).toBe('ok');
    expect(listActivity().some((a) => a.action === 'pin.lockout')).toBe(true);
  });

  it('a right PIN resets the wrong-try count', async () => {
    for (let i = 0; i < MAX_TRIES - 1; i++) await signInWithPin('9999', 'x');
    expect((await signInWithPin('2222', 'x')).status).toBe('ok');
    expect(await signInWithPin('9999', 'x')).toEqual({ status: 'wrong', triesLeft: MAX_TRIES - 1 });
  });
});

describe('idle lock', () => {
  beforeEach(async () => {
    await setUpPins('1111', '2222', 'x');
  });

  it('ends the session after the set time of no use (default 5 min), enforced on the hub', async () => {
    const t0 = 5_000_000;
    const r = await signInWithPin('1111', 'iPhone', t0);
    if (r.status !== 'ok') throw new Error('sign in');
    expect(authFromHeaders(cookieOf(r.token), t0 + 4 * 60_000).role).toBe('adult');
    // Use at 4 min moves the clock: 4 min later it still works.
    expect(authFromHeaders(cookieOf(r.token), t0 + 8 * 60_000).role).toBe('adult');
    const late = authFromHeaders(cookieOf(r.token), t0 + 13 * 60_000 + 1);
    expect(late).toMatchObject({ role: 'signed_out', idleLocked: true });
    // Once ended, it stays ended.
    expect(authFromHeaders(cookieOf(r.token), t0 + 13 * 60_000 + 2).role).toBe('signed_out');
  });

  it('follows the lock time set in Settings', async () => {
    setSetting('lock_minutes', '1');
    const r = await signInWithPin('2222', 'iPhone', 0);
    if (r.status !== 'ok') throw new Error('sign in');
    expect(authFromHeaders(cookieOf(r.token), 60_001).role).toBe('signed_out');
  });

  it('a made-up cookie is signed out (control)', () => {
    expect(authFromHeaders(cookieOf('made-up')).role).toBe('signed_out');
  });
});

describe('changing PINs', () => {
  it('changes a PIN, refuses a clash, and ends Guest sessions when the Guest PIN changes', async () => {
    await setUpPins('1111', '2222', 'x');
    const g = await signInWithPin('2222', 'x');
    expect(await changePin('guest', '1111')).toMatchObject({ status: 'invalid' });
    expect(await changePin('guest', '33')).toMatchObject({ status: 'invalid' });
    expect(await changePin('guest', '3333')).toEqual({ status: 'ok' });
    if (g.status === 'ok') expect(authFromHeaders(cookieOf(g.token)).role).toBe('signed_out');
    expect((await signInWithPin('2222', 'x')).status).toBe('wrong');
    expect((await signInWithPin('3333', 'x')).status).toBe('ok');
    expect(await changePin('adult', '4444')).toEqual({ status: 'ok' });
    expect((await signInWithPin('4444', 'x')).status === 'ok').toBe(true);
    expect(getDb().prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 3 });
  });
});

describe('device labels for activity history', () => {
  it('names phones, tablets and computers', () => {
    expect(deviceFromUserAgent(UA.iphone)).toBe('iPhone');
    expect(deviceFromUserAgent(UA.computer)).toBe('Computer');
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14) Mobile Safari')).toBe('Android phone');
    expect(deviceFromUserAgent(null)).toBe('Unknown device');
  });
});
