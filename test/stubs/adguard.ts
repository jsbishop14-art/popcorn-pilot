// The AdGuard Home stub: answers the parts of AdGuard Home's local API the hub reads (status, statistics, turning
// protection on or off), with its login. Stands in for AdGuard Home in every test and CI run.
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const STUB_USER = 'popcorn';
export const STUB_PASSWORD = 'stub-password-not-real';

export interface AdGuardStub {
  port: number;
  base: string;
  /** on: protection; blocked/queries: per hour for the last 24 hours, the last entry the current hour. */
  state: { on: boolean; blocked: number[]; queries: number[] };
  calls: { method: string; path: string; body: string; auth: string | null }[];
  close(): Promise<void>;
}

/** 24 hourly figures where the hours since midnight at `hour` add up to `today` (and earlier hours add more). */
export function hourly(today: number, hour: number, yesterday = 500): number[] {
  const out = new Array(24).fill(0);
  const since = hour + 1;
  for (let i = 0; i < since; i++) out[24 - since + i] = Math.floor(today / since) + (i < today % since ? 1 : 0);
  if (since < 24) out[0] = yesterday;
  return out;
}

export async function startAdGuardStub(opts: { port?: number; hour?: number } = {}): Promise<AdGuardStub> {
  const hour = opts.hour ?? new Date().getHours();
  const state: AdGuardStub['state'] = { on: true, blocked: hourly(1284, hour), queries: hourly(9310, hour, 4000) };
  const calls: AdGuardStub['calls'] = [];
  const good = 'Basic ' + Buffer.from(`${STUB_USER}:${STUB_PASSWORD}`).toString('base64');
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      calls.push({ method: req.method ?? 'GET', path: url.pathname, body: raw, auth: req.headers.authorization ?? null });
      const send = (status: number, body?: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      if (req.headers.authorization !== good) return send(401, { message: 'unauthorized' });
      if (req.method === 'GET' && url.pathname === '/control/status') return send(200, { protection_enabled: state.on, running: true, version: 'v0.107.stub', dns_port: 53 });
      if (req.method === 'GET' && url.pathname === '/control/stats')
        return send(200, {
          time_units: 'hours',
          num_blocked_filtering: state.blocked.reduce((a, b) => a + b, 0),
          num_dns_queries: state.queries.reduce((a, b) => a + b, 0),
          blocked_filtering: state.blocked,
          dns_queries: state.queries,
        });
      if (req.method === 'POST' && url.pathname === '/control/protection') {
        try {
          const b = JSON.parse(raw) as { enabled?: unknown };
          if (typeof b.enabled !== 'boolean') return send(400, { message: 'enabled is a boolean' });
          state.on = b.enabled;
          return send(200);
        } catch {
          return send(400, { message: 'bad json' });
        }
      }
      send(404, { message: 'not found' });
    });
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    state,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
