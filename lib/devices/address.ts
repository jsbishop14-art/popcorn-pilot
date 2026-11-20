// TVs are on the home network only: the hub talks to private (RFC 1918) and loopback IPv4 addresses, nothing else.
import { DeviceError } from './types';

export function isHomeAddress(address: string): boolean {
  const m = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127;
}

export function assertHomeAddress(address: string): void {
  if (!isHomeAddress(address)) throw new DeviceError('Use the TV address on the home network, like 192.168.1.40.');
}

/** "192.168.1.40" or "192.168.1.40:8060" -> parts. Null when it is not a home network address. */
export function parseTvAddress(input: string): { address: string; port: number } | null {
  const m = input.trim().match(/^([\d.]+)(?::(\d{1,5}))?$/);
  if (!m || !isHomeAddress(m[1])) return null;
  const port = m[2] ? Number(m[2]) : 8060;
  if (port < 1 || port > 65535) return null;
  return { address: m[1], port };
}
