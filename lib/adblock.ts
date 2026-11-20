// Ad blocking (handoff 10.1): AdGuard Home runs on the hub (installed by scripts/install-pi.sh) and answers the
// home network's DNS, blocking Roku home screen ads and tracking. Settings shows whether it is on and how many
// requests it blocked today, read from AdGuard Home's local API (127.0.0.1:3053, its login in the secret store), and
// can turn it on or off. Never a real call in CI or build sessions: the tests point PP_ADGUARD_URL at a local stub.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths.mjs';
import { readSecrets, updateSecrets } from './secrets';
import { now } from './clock';

const TIMEOUT_MS = 4000;

export function adguardBase(): string {
  return (process.env.PP_ADGUARD_URL || 'http://127.0.0.1:3053').replace(/\/+$/, '');
}

/**
 * The install script leaves AdGuard Home's login in <data>/adguard-credentials.json (readable only by the service
 * user). The hub moves it into the secret store on first use and deletes the file.
 */
function takeInstallCredentials(): void {
  const file = path.join(dataDir(), 'adguard-credentials.json');
  if (!fs.existsSync(file)) return;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8')) as { user?: unknown; password?: unknown };
    if (typeof c.user === 'string' && typeof c.password === 'string' && c.user && c.password) updateSecrets({ adguard_user: c.user, adguard_password: c.password });
    fs.unlinkSync(file);
  } catch (err) {
    console.error('ad blocking: could not read the install login file:', err instanceof Error ? err.message : err);
  }
}

function authHeader(): Record<string, string> {
  takeInstallCredentials();
  const s = readSecrets();
  if (!s.adguard_user || !s.adguard_password) return {};
  return { authorization: 'Basic ' + Buffer.from(`${s.adguard_user}:${s.adguard_password}`).toString('base64') };
}

class AdGuardDown extends Error {}

async function call(method: 'GET' | 'POST', p: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(adguardBase() + p, {
      method,
      headers: { ...authHeader(), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new AdGuardDown('Ad blocking is not answering on the hub. If the hub was set up before ad blocking was added, run the install again (docs/install-pi.md).');
  }
  if (res.status === 401 || res.status === 403) throw new AdGuardDown('Ad blocking refused the hub its login. Run the install again to set it up (docs/install-pi.md).');
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) json = v as Record<string, unknown>;
  } catch {
    // AdGuard Home answers some calls with an empty body
  }
  return { status: res.status, json };
}

export interface AdBlockStatus {
  /** on: blocking; off: AdGuard Home runs but protection is off; unavailable: it did not answer. */
  state: 'on' | 'off' | 'unavailable';
  blockedToday: number | null;
  queriesToday: number | null;
  message: string | null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)) : [];
}

/**
 * Today's count from AdGuard Home's statistics: with hourly figures (the last entry is the current hour), the hours
 * since local midnight; otherwise its total for the statistics period.
 */
export function todayFrom(stats: Record<string, unknown>, list: string, total: string, at: number): number | null {
  const hours = nums(stats[list]);
  if (stats.time_units === 'hours' && hours.length >= 24) {
    const d = new Date(at);
    const since = d.getHours() + 1;
    return hours.slice(-since).reduce((a, b) => a + b, 0);
  }
  const t = stats[total];
  return typeof t === 'number' ? t : null;
}

export async function adBlockStatus(at = now()): Promise<AdBlockStatus> {
  try {
    const s = await call('GET', '/control/status');
    if (s.status !== 200) return { state: 'unavailable', blockedToday: null, queriesToday: null, message: `Ad blocking answered ${s.status}.` };
    const on = s.json.protection_enabled === true;
    let blocked: number | null = null;
    let queries: number | null = null;
    const st = await call('GET', '/control/stats');
    if (st.status === 200) {
      blocked = todayFrom(st.json, 'blocked_filtering', 'num_blocked_filtering', at);
      queries = todayFrom(st.json, 'dns_queries', 'num_dns_queries', at);
    }
    return { state: on ? 'on' : 'off', blockedToday: blocked, queriesToday: queries, message: null };
  } catch (err) {
    return { state: 'unavailable', blockedToday: null, queriesToday: null, message: err instanceof Error ? err.message : 'Ad blocking did not answer.' };
  }
}

/** Turn blocking on or off. Returns the status afterwards. Throws with plain words when AdGuard Home did not answer. */
export async function setAdBlocking(on: boolean): Promise<AdBlockStatus> {
  try {
    let r = await call('POST', '/control/protection', { enabled: on });
    // Older AdGuard Home versions: protection is part of the DNS settings.
    if (r.status === 404 || r.status === 405) r = await call('POST', '/control/dns_config', { protection_enabled: on });
    if (r.status !== 200) throw new AdGuardDown(`Ad blocking answered ${r.status}.`);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Ad blocking did not answer.');
  }
  return adBlockStatus();
}
