// PP5 check 3, through the real route handlers, against the AdGuard Home stub (no real AdGuard Home call): Settings
// reads ad blocking on or off and the requests blocked today; the off state shows correctly; turning it off and on
// from Settings; AdGuard Home not answering shows as unavailable with plain words; the install script's login file
// is moved into the secret store; and the Guest PIN has no part of it.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { listActivity } from '@/lib/activity';
import { readSecrets } from '@/lib/secrets';
import { todayFrom } from '@/lib/adblock';
import { STUB_PASSWORD, STUB_USER, hourly, startAdGuardStub, type AdGuardStub } from '../stubs/adguard';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };

async function call(who: 'adult' | 'guest', method: string, urlPath: string, body?: unknown) {
  const mod = (await import(path.join(process.cwd(), 'app', urlPath, 'route.ts'))) as Record<string, Handler>;
  const headers: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json', cookie: cookies[who] };
  const res = await mod[method](new Request(`http://hub.test${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: {} });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let stub: AdGuardStub;
let dataDir: string;

beforeAll(async () => {
  dataDir = freshDataDir();
  stub = await startAdGuardStub();
  process.env.PP_ADGUARD_URL = stub.base;
  expect((await setUpPins('1357', '2468', 'Computer')).status).toBe('ok');
  for (const role of ['adult', 'guest'] as const) {
    resetLockout();
    const r = await signInWithPin(role === 'adult' ? '1357' : '2468', 'Computer');
    if (r.status !== 'ok') throw new Error(r.status);
    cookies[role] = `${SESSION_COOKIE}=${encodeURIComponent(r.token)}`;
  }
});

afterAll(async () => {
  delete process.env.PP_ADGUARD_URL;
  await stub?.close();
});

describe('check 3: ad blocking status reads from the stub; the off state shows correctly', () => {
  it('without the login AdGuard Home refuses the hub: shown as unavailable, with what to do', async () => {
    const r = await call('adult', 'GET', '/api/adblock');
    expect(r.status).toBe(200);
    expect(r.body.adblock).toEqual({ state: 'unavailable', blockedToday: null, queriesToday: null, message: 'Ad blocking refused the hub its login. Run the install again to set it up (docs/install-pi.md).' });
  });

  it('the install login file is moved into the secret store and deleted; then on, with 1,284 blocked today', async () => {
    const file = path.join(dataDir, 'adguard-credentials.json');
    fs.writeFileSync(file, JSON.stringify({ user: STUB_USER, password: STUB_PASSWORD }), { mode: 0o600 });
    const r = await call('adult', 'GET', '/api/adblock');
    expect(r.body.adblock).toEqual({ state: 'on', blockedToday: 1284, queriesToday: 9310, message: null });
    expect(fs.existsSync(file)).toBe(false);
    expect(readSecrets()).toMatchObject({ adguard_user: STUB_USER, adguard_password: STUB_PASSWORD });
    // The login went to AdGuard Home as HTTP basic auth, and nowhere else.
    expect(stub.calls.at(-1)?.auth).toBe('Basic ' + Buffer.from(`${STUB_USER}:${STUB_PASSWORD}`).toString('base64'));
  });

  it('off in AdGuard Home shows as off (with today\'s count so far)', async () => {
    stub.state.on = false;
    const r = await call('adult', 'GET', '/api/adblock');
    expect(r.body.adblock).toMatchObject({ state: 'off', blockedToday: 1284 });
    stub.state.on = true;
  });

  it('turning it off and on from Settings; each in Activity history', async () => {
    const off = await call('adult', 'PATCH', '/api/adblock', { on: false });
    expect([off.status, off.body.adblock.state]).toEqual([200, 'off']);
    expect(stub.state.on).toBe(false);
    expect(JSON.parse(stub.calls.find((c) => c.path === '/control/protection')!.body)).toEqual({ enabled: false });
    expect(listActivity({ limit: 1 })[0].summary).toBe('Turned ad blocking off');
    const on = await call('adult', 'PATCH', '/api/adblock', { on: true });
    expect([on.status, on.body.adblock.state, stub.state.on]).toEqual([200, 'on', true]);
    expect(listActivity({ limit: 1 })[0].summary).toBe('Turned ad blocking on');
    expect((await call('adult', 'PATCH', '/api/adblock', { on: 'yes' })).status).toBe(400);
  });

  it('"today" is the hours since midnight, not the whole 24 hours', () => {
    const at = new Date(2026, 10, 16, 9, 30).getTime(); // 9:30: the last 10 hourly figures
    const stats = { time_units: 'hours', blocked_filtering: hourly(1284, 9, 700), num_blocked_filtering: 1984 };
    expect(todayFrom(stats, 'blocked_filtering', 'num_blocked_filtering', at)).toBe(1284);
    expect(todayFrom({ time_units: 'days', num_blocked_filtering: 50 }, 'blocked_filtering', 'num_blocked_filtering', at)).toBe(50);
  });

  it('AdGuard Home not answering: unavailable, in plain words; turning it on or off says so', async () => {
    process.env.PP_ADGUARD_URL = 'http://127.0.0.1:9';
    const r = await call('adult', 'GET', '/api/adblock');
    expect(r.body.adblock.state).toBe('unavailable');
    expect(r.body.adblock.message).toMatch(/^Ad blocking is not answering on the hub/);
    const p = await call('adult', 'PATCH', '/api/adblock', { on: true });
    expect(p.status).toBe(502);
    expect(p.body.error).toMatch(/^Ad blocking is not answering on the hub/);
    process.env.PP_ADGUARD_URL = stub.base;
  });

  it('the Guest PIN cannot see or change ad blocking (403 from the hub)', async () => {
    expect((await call('guest', 'GET', '/api/adblock')).status).toBe(403);
    expect((await call('guest', 'PATCH', '/api/adblock', { on: false })).status).toBe(403);
    expect(stub.state.on).toBe(true);
  });
});
