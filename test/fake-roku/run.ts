// Run the fake Rokus on fixed ports for the browser tests: the living room TV with ECP on FAKE_ROKU_PORT (default
// 18060) and SSDP on FAKE_ROKU_SSDP_PORT (default 11900), and a second TV (PP3, Send to) with ECP on
// FAKE_ROKU_2_PORT (default 18062) and no SSDP, so discovery still finds only the first. The app points discovery
// at the first with PP_SSDP_TARGET=127.0.0.1:11900.
// PP5: also the iCloud stub on ICLOUD_STUB_PORT (default 18063) and the AdGuard Home stub on ADGUARD_STUB_PORT
// (default 18064); the app points at them with PP_ICLOUD_BASE and PP_ADGUARD_URL.
import http from 'node:http';
import { startFakeRoku } from './server';
import { GOOD_TOKEN, changedAlbum, firstAlbum, startICloudStub } from '../stubs/icloud';
import { startAdGuardStub } from '../stubs/adguard';

const port = Number(process.env.FAKE_ROKU_PORT ?? 18060);
const ssdpPort = Number(process.env.FAKE_ROKU_SSDP_PORT ?? 11900);
const readyPort = Number(process.env.FAKE_ROKU_READY_PORT ?? 18061);
const port2 = Number(process.env.FAKE_ROKU_2_PORT ?? 18062);

async function main() {
  const roku = await startFakeRoku({ name: 'Fake living room Roku', serial: 'FAKE0001', port, ssdpPort });
  const roku2 = await startFakeRoku({ name: 'Fake bedroom Roku', serial: 'FAKE0002', port: port2 });
  const icloud = await startICloudStub({ port: Number(process.env.ICLOUD_STUB_PORT ?? 18063) });
  const adguard = await startAdGuardStub({ port: Number(process.env.ADGUARD_STUB_PORT ?? 18064) });
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
      // PP4: POST /app?id=2285&name=Hulu puts that app on the first TV, like a kid pressing the Hulu button (snap back).
      if (url.pathname === '/app' && req.method === 'POST') {
        const id = url.searchParams.get('id');
        roku.state.activeApp = { id: id || null, name: url.searchParams.get('name') ?? 'Roku' };
        return send(roku.state.activeApp);
      }
      if (url.pathname === '/state') return send(roku.state);
      // PP5: POST /album?as=first|changed sets the stub album; GET /adguard the stub's state; POST /adguard?on=1|0.
      if (url.pathname === '/album' && req.method === 'POST') {
        icloud.albums.set(GOOD_TOKEN, url.searchParams.get('as') === 'changed' ? changedAlbum() : firstAlbum());
        return send({ items: icloud.albums.get(GOOD_TOKEN)?.length });
      }
      if (url.pathname === '/adguard' && req.method === 'POST') adguard.state.on = url.searchParams.get('on') !== '0';
      if (url.pathname === '/adguard') return send({ on: adguard.state.on });
      if (url.pathname === '/fail' && req.method === 'POST') {
        roku.state.failChannels = (url.searchParams.get('channels') ?? '').split(',').filter(Boolean);
        return send({ failChannels: roku.state.failChannels });
      }
      res.end('ok');
    })
    .listen(readyPort, '127.0.0.1');
  console.log(`fake Roku: ECP 127.0.0.1:${roku.port}, SSDP 127.0.0.1:${roku.ssdpPort}; second fake Roku: ECP 127.0.0.1:${roku2.port}; iCloud stub ${icloud.base}; AdGuard Home stub ${adguard.base}`);
}

void main();
