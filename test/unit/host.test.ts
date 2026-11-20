// PP7 check 4 (unit part), through the real route handlers: Settings > Hub says which computer the hub runs on
// (Windows PC, Mac, Raspberry Pi) and the address to open on a phone; the QR code decodes to that same address;
// on a Windows or Mac hub, ad blocking says "Not set up on this computer" and refuses to be turned on or off, with
// no call to AdGuard Home; on the Pi it works as before. The Guest PIN gets none of it (403).
import os from 'node:os';
import path from 'node:path';
import jsQR from 'jsqr';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, resetLockout, UA } from './helpers';
import { setUpPins, signInWithPin, SESSION_COOKIE } from '@/lib/auth';
import { HOST_LABEL, adBlockingSetUp, homeAddress, hostKind, hubUrl } from '@/lib/host';
import { qrMatrix } from '@/lib/qr';
import { startAdGuardStub, type AdGuardStub } from '../stubs/adguard';

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
const cookies: Record<'adult' | 'guest', string> = { adult: '', guest: '' };

async function call(who: 'adult' | 'guest', method: string, urlPath: string, body?: unknown) {
  const mod = (await import(path.join(process.cwd(), 'app', urlPath, 'route.ts'))) as Record<string, Handler>;
  const headers: Record<string, string> = { 'user-agent': UA.computer, 'content-type': 'application/json', cookie: cookies[who] };
  const res = await mod[method](new Request(`http://hub.test${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: {} });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

type Ifaces = ReturnType<typeof os.networkInterfaces>;
function iface(address: string, internal = false) {
  return { address, family: 'IPv4' as const, internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` };
}

/** Decode a QR matrix the way a phone camera would: draw it (4-module quiet zone, 8 px a module) and read it. */
function decode(m: boolean[][]): string | null {
  const scale = 8;
  const side = (m.length + 8) * scale;
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const r = Math.floor(y / scale) - 4;
      const c = Math.floor(x / scale) - 4;
      if (m[r]?.[c]) px.fill(0, (y * side + x) * 4, (y * side + x) * 4 + 3);
    }
  }
  return jsQR(px, side, side)?.data ?? null;
}

let stub: AdGuardStub;

beforeAll(async () => {
  freshDataDir();
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

afterEach(() => {
  delete process.env.PP_HOST;
  delete process.env.PP_HUB_URL;
});

afterAll(async () => {
  delete process.env.PP_ADGUARD_URL;
  await stub?.close();
});

describe('which computer the hub runs on', () => {
  it('PP_HOST from the install script wins; otherwise the operating system decides', () => {
    expect(hostKind({ PP_HOST: 'windows' }, 'linux', 'x64')).toBe('windows');
    expect(hostKind({ PP_HOST: 'Mac' }, 'linux', 'x64')).toBe('mac');
    expect(hostKind({ PP_HOST: 'pi' }, 'win32', 'x64')).toBe('pi');
    expect(hostKind({ PP_HOST: 'toaster' }, 'win32', 'x64')).toBe('windows');
    expect(hostKind({}, 'win32', 'x64')).toBe('windows');
    expect(hostKind({}, 'darwin', 'arm64')).toBe('mac');
    expect(hostKind({}, 'linux', 'arm64')).toBe('pi');
    expect(hostKind({}, 'linux', 'x64')).toBe('linux');
    expect(HOST_LABEL).toEqual({ windows: 'Windows PC', mac: 'Mac', pi: 'Raspberry Pi', linux: 'Linux computer' });
  });

  it('ad blocking is set up only on the Pi (and a plain Linux test machine), never on Windows or Mac', () => {
    expect([adBlockingSetUp('windows'), adBlockingSetUp('mac'), adBlockingSetUp('pi'), adBlockingSetUp('linux')]).toEqual([false, false, true, true]);
  });
});

describe('the address to open on a phone', () => {
  it('picks the real home network adapter over virtual ones, loopback and link-local', () => {
    const win: Ifaces = {
      'Loopback Pseudo-Interface 1': [iface('127.0.0.1', true)],
      'vEthernet (WSL (Hyper-V firewall))': [iface('172.24.160.1')],
      'Ethernet 2': [iface('169.254.10.4')],
      'Wi-Fi': [iface('192.168.1.23')],
    };
    expect(homeAddress(win)).toBe('192.168.1.23');
    expect(homeAddress({ en0: [iface('10.0.0.8')], bridge100: [iface('192.168.64.1')] })).toBe('10.0.0.8');
    expect(homeAddress({ lo: [iface('127.0.0.1', true)] })).toBeNull();
  });

  it('is http://<address>:<port>, without :80 on the Pi, and PP_HUB_URL overrides', () => {
    const ifs: Ifaces = { 'Wi-Fi': [iface('192.168.1.23')] };
    expect(hubUrl({ PORT: '8765' }, ifs)).toBe('http://192.168.1.23:8765');
    expect(hubUrl({ PORT: '80' }, ifs)).toBe('http://192.168.1.23');
    expect(hubUrl({ PORT: '8765', PP_HUB_URL: 'http://hub.test:9/' }, ifs)).toBe('http://hub.test:9');
    expect(hubUrl({ PORT: '8765' }, {})).toBe('http://127.0.0.1:8765');
  });

  it('the QR code decodes to exactly the address (control: a different address decodes differently)', () => {
    for (const a of ['http://192.168.1.23:8765', 'http://10.0.0.8:8765', 'http://192.168.100.200']) expect(decode(qrMatrix(a))).toBe(a);
    expect(decode(qrMatrix('http://192.168.1.24:8765'))).not.toBe('http://192.168.1.23:8765');
    // Control that must fail: a blank square is not a QR code.
    expect(decode(qrMatrix('x').map((row) => row.map(() => false)))).toBeNull();
  });
});

describe('Settings > Hub and Ad blocking by host', () => {
  for (const host of ['windows', 'mac'] as const) {
    it(`${host}: Hub shows ${HOST_LABEL[host]} and the address; ad blocking is not set up and refuses on or off`, async () => {
      process.env.PP_HOST = host;
      process.env.PP_HUB_URL = 'http://192.168.1.23:8765';
      const before = stub.state.on;
      const hub = await call('adult', 'GET', '/api/hub/status');
      expect(hub.status).toBe(200);
      expect(hub.body.hub).toMatchObject({ host, hostLabel: HOST_LABEL[host], address: 'http://192.168.1.23:8765' });
      const ad = await call('adult', 'GET', '/api/adblock');
      expect([ad.status, ad.body.adblock]).toEqual([200, { state: 'not_set_up', blockedToday: null, queriesToday: null, message: 'Not set up on this computer' }]);
      const p = await call('adult', 'PATCH', '/api/adblock', { on: !before });
      expect([p.status, p.body.error]).toEqual([409, 'Not set up on this computer. Ad blocking runs only when the hub is a Raspberry Pi.']);
      expect(stub.state.on).toBe(before);
    });
  }

  it('pi: Hub shows Raspberry Pi; ad blocking reads from AdGuard Home as before', async () => {
    process.env.PP_HOST = 'pi';
    const hub = await call('adult', 'GET', '/api/hub/status');
    expect(hub.body.hub).toMatchObject({ host: 'pi', hostLabel: 'Raspberry Pi' });
    expect(hub.body.hub.address).toMatch(/^http:\/\//);
    const ad = await call('adult', 'GET', '/api/adblock');
    expect(['on', 'off', 'unavailable']).toContain(ad.body.adblock.state);
  });

  it('Guest PIN: Hub status and ad blocking refuse (403) on every host', async () => {
    for (const host of ['windows', 'mac', 'pi'] as const) {
      process.env.PP_HOST = host;
      expect(`${host} ${(await call('guest', 'GET', '/api/hub/status')).status}`).toBe(`${host} 403`);
      expect(`${host} ${(await call('guest', 'GET', '/api/adblock')).status}`).toBe(`${host} 403`);
      expect(`${host} ${(await call('guest', 'PATCH', '/api/adblock', { on: true })).status}`).toBe(`${host} 403`);
    }
  });
});
