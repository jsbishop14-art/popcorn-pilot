// Run the fake Rokus on fixed ports for the browser tests: the living room TV with ECP on FAKE_ROKU_PORT (default
// 18060) and SSDP on FAKE_ROKU_SSDP_PORT (default 11900), and a second TV (PP3, Send to) with ECP on
// FAKE_ROKU_2_PORT (default 18062) and no SSDP, so discovery still finds only the first. The app points discovery
// at the first with PP_SSDP_TARGET=127.0.0.1:11900.
import http from 'node:http';
import { startFakeRoku } from './server';

const port = Number(process.env.FAKE_ROKU_PORT ?? 18060);
const ssdpPort = Number(process.env.FAKE_ROKU_SSDP_PORT ?? 11900);
const readyPort = Number(process.env.FAKE_ROKU_READY_PORT ?? 18061);
const port2 = Number(process.env.FAKE_ROKU_2_PORT ?? 18062);

async function main() {
  const roku = await startFakeRoku({ name: 'Fake living room Roku', serial: 'FAKE0001', port, ssdpPort });
  const roku2 = await startFakeRoku({ name: 'Fake bedroom Roku', serial: 'FAKE0002', port: port2 });
  // A small control server for Playwright: the ready check, /calls (every ECP call the first TV received; /calls2
  // for the second), and POST /fail?channels=2285,13 (those channels' launches fail on the first TV; empty clears).
  http
    .createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://fake');
      const send = (body: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/calls') return send(roku.calls);
      if (url.pathname === '/calls2') return send(roku2.calls);
      if (url.pathname === '/fail' && req.method === 'POST') {
        roku.state.failChannels = (url.searchParams.get('channels') ?? '').split(',').filter(Boolean);
        return send({ failChannels: roku.state.failChannels });
      }
      res.end('ok');
    })
    .listen(readyPort, '127.0.0.1');
  console.log(`fake Roku: ECP 127.0.0.1:${roku.port}, SSDP 127.0.0.1:${roku.ssdpPort}; second fake Roku: ECP 127.0.0.1:${roku2.port}`);
}

void main();
