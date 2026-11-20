// Run the fake Roku on fixed ports for the browser tests: ECP on FAKE_ROKU_PORT (default 18060), SSDP on
// FAKE_ROKU_SSDP_PORT (default 11900). The app points discovery at it with PP_SSDP_TARGET=127.0.0.1:11900.
import http from 'node:http';
import { startFakeRoku } from './server';

const port = Number(process.env.FAKE_ROKU_PORT ?? 18060);
const ssdpPort = Number(process.env.FAKE_ROKU_SSDP_PORT ?? 11900);
const readyPort = Number(process.env.FAKE_ROKU_READY_PORT ?? 18061);

async function main() {
  const roku = await startFakeRoku({ name: 'Fake living room Roku', serial: 'FAKE0001', port, ssdpPort });
  // A small ready endpoint for Playwright's webServer check; /calls lists every ECP call the fake Roku received
  // (the browser tests read it to check what the hub sent to the TV).
  http
    .createServer((req, res) => {
      if (req.url === '/calls') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(roku.calls));
      }
      res.end('ok');
    })
    .listen(readyPort, '127.0.0.1');
  console.log(`fake Roku: ECP 127.0.0.1:${roku.port}, SSDP 127.0.0.1:${roku.ssdpPort}`);
}

void main();
