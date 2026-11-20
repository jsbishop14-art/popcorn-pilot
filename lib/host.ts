// Which computer the hub runs on (PP7): a Windows PC, a Mac or a Raspberry Pi, and the address phones open.
// The install scripts set PP_HOST (windows, mac, pi); without it the hub goes by the operating system.
import os from 'node:os';

export type HostKind = 'windows' | 'mac' | 'pi' | 'linux';

export const HOST_LABEL: Record<HostKind, string> = {
  windows: 'Windows PC',
  mac: 'Mac',
  pi: 'Raspberry Pi',
  linux: 'Linux computer',
};

export function hostKind(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform, arch: string = process.arch): HostKind {
  const set = env.PP_HOST?.trim().toLowerCase();
  if (set === 'windows' || set === 'mac' || set === 'pi' || set === 'linux') return set;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux' && arch === 'arm64') return 'pi';
  return 'linux';
}

/** Ad blocking (AdGuard Home) is installed only on the Pi; on Windows and Mac it is not set up (spec section 4). */
export function adBlockingSetUp(kind: HostKind = hostKind()): boolean {
  return kind === 'pi' || kind === 'linux';
}

type Ifaces = ReturnType<typeof os.networkInterfaces>;

// Adapters that are not the home network: virtual machines, WSL, Docker, VPNs.
const VIRTUAL = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|vbox|utun|tailscale|zerotier|bridge|br-|veth|vmnet|loopback/i;

function rank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  const m = address.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2;
  return 3;
}

/**
 * This computer's address on the home network: a real (not virtual) adapter's IPv4 address, preferring the usual
 * home ranges (192.168.x.x, then 10.x.x.x, then 172.16 to 31). Never a link-local 169.254 address.
 */
export function homeAddress(ifaces: Ifaces = os.networkInterfaces()): string | null {
  const found: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      found.push({ address: a.address, score: rank(a.address) + (VIRTUAL.test(name) ? 10 : 0) });
    }
  }
  found.sort((x, y) => x.score - y.score);
  return found[0]?.address ?? null;
}

/**
 * The address to open on a phone and the one the Roku channel calls: PP_HUB_URL when set, else this computer's home
 * network address and the app's port (no port when it is 80).
 */
export function hubUrl(env: NodeJS.ProcessEnv = process.env, ifaces?: Ifaces): string {
  const set = env.PP_HUB_URL?.trim();
  if (set) return set.replace(/\/+$/, '');
  const port = env.PORT || '3000';
  const ip = homeAddress(ifaces) ?? '127.0.0.1';
  return port === '80' ? `http://${ip}` : `http://${ip}:${port}`;
}
