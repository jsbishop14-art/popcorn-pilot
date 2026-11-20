// Find Rokus on the home network with SSDP (M-SEARCH for roku:ecp), then ask each for its device info.
// PP_SSDP_TARGET (host:port) points the search at the fake Roku in tests; the default is the SSDP multicast group.
import dgram from 'node:dgram';
import { isHomeAddress } from './address';
import { RokuDriver } from './roku';

export interface FoundTv {
  address: string;
  port: number;
  name: string;
  model: string;
  serial: string;
}

function target(): { host: string; port: number } {
  const t = process.env.PP_SSDP_TARGET;
  if (t) {
    const [host, port] = t.split(':');
    return { host, port: Number(port) };
  }
  return { host: '239.255.255.250', port: 1900 };
}

export function parseSsdpLocation(msg: string): { address: string; port: number } | null {
  const loc = msg.match(/^location:\s*(\S+)\s*$/im)?.[1];
  if (!loc || !/^st:\s*roku:ecp\s*$/im.test(msg)) return null;
  try {
    const u = new URL(loc);
    if (u.protocol !== 'http:' || !isHomeAddress(u.hostname)) return null;
    return { address: u.hostname, port: u.port ? Number(u.port) : 80 };
  } catch {
    return null;
  }
}

export async function discoverRokus(waitMs = 2500): Promise<FoundTv[]> {
  const { host, port } = target();
  const seen = new Map<string, { address: string; port: number }>();
  await new Promise<void>((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => {
      try {
        sock.close();
      } catch {
        // already closed
      }
      resolve();
    };
    sock.on('message', (buf) => {
      const loc = parseSsdpLocation(buf.toString('utf8'));
      if (loc) seen.set(`${loc.address}:${loc.port}`, loc);
    });
    sock.on('error', done);
    sock.bind(0, () => {
      const msg = Buffer.from(
        `M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\nMan: "ssdp:discover"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n`,
      );
      sock.send(msg, port, host, (err) => {
        if (err) done();
        else sock.send(msg, port, host, () => undefined);
      });
      setTimeout(done, waitMs);
    });
  });
  const found = await Promise.all(
    [...seen.values()].map(async (loc) => {
      try {
        const info = await new RokuDriver(loc.address, loc.port, 2000).deviceInfo();
        return { ...loc, name: info.name, model: info.model, serial: info.serial };
      } catch {
        return { ...loc, name: 'Roku', model: '', serial: '' };
      }
    }),
  );
  return found.sort((a, b) => a.address.localeCompare(b.address) || a.port - b.port);
}
