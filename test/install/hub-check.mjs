#!/usr/bin/env node
// PP7 checks 1 and 2 (CI only, against a hub the install script just set up in test mode): the installed hub says
// which computer it runs on, gives its address with the app's port, says ad blocking is not set up, and refuses the
// Guest PIN. Sets test PINs on the fresh test hub (made-up values, the same as the browser tests).
// Usage: node test/install/hub-check.mjs <port> <windows|mac>
const [port, host] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const LABEL = { windows: 'Windows PC', mac: 'Mac' };
let failures = 0;

function check(what, ok, got) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` (got ${JSON.stringify(got)})`}`);
  if (!ok) failures++;
}

async function call(method, path, body, cookie) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

const setup = await call('POST', '/api/auth/setup', { adultPin: '1357', guestPin: '2468' });
check('first run sets the test PINs (or they are already set)', setup.status === 200 || setup.status === 409, setup.status);
const adult = await call('POST', '/api/auth/pin', { pin: '1357' });
check('Adult PIN signs in', adult.status === 200 && adult.json.role === 'adult', adult.status);
const hub = await call('GET', '/api/hub/status', undefined, adult.cookie);
check('Settings > Hub answers', hub.status === 200, hub.status);
check(`Settings > Hub says ${host}`, hub.json.hub?.host === host, hub.json.hub?.host);
check(`Settings > Hub says "${LABEL[host]}"`, hub.json.hub?.hostLabel === LABEL[host], hub.json.hub?.hostLabel);
check(`the address is http://<address>:${port}`, new RegExp(`^http://\\d+\\.\\d+\\.\\d+\\.\\d+:${port}$`).test(hub.json.hub?.address ?? ''), hub.json.hub?.address);
const ad = await call('GET', '/api/adblock', undefined, adult.cookie);
check('ad blocking says "Not set up on this computer"', ad.json.adblock?.state === 'not_set_up' && ad.json.adblock?.message === 'Not set up on this computer', ad.json.adblock);
const guest = await call('POST', '/api/auth/pin', { pin: '2468' });
check('Guest PIN signs in', guest.status === 200 && guest.json.role === 'guest', guest.status);
const refused = await call('GET', '/api/hub/status', undefined, guest.cookie);
check('Guest PIN: Settings > Hub refused (403)', refused.status === 403, refused.status);
const out = await call('GET', '/api/hub/status');
check('signed out: Settings > Hub refused (401)', out.status === 401, out.status);

console.log(failures ? `hub check: ${failures} failed` : 'hub check: all passed');
process.exitCode = failures ? 1 : 0;
