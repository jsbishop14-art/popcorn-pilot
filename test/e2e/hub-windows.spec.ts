// PP7 checks 4 and 6, against a second test hub started as a Windows hub (PP_HOST=windows, its own empty data
// folder, port 3101): with the Adult PIN, Settings > Hub is reached from the menu and shows "Windows PC", the
// address with the app's port, a QR code a phone camera reads as that address, and the sleep note; Ad blocking says
// "Not set up on this computer" with no switch. With the Guest PIN the Settings entry point is absent and the routes
// refuse. (The Pi case is in screens.spec.ts; the Mac case is the same code path, checked in test/unit/host.test.ts
// and by the CI macOS job against an installed hub.)
import { expect, test } from '@playwright/test';
import { ADULT, GUEST, readQr, signIn, tab } from './helpers';

test.beforeAll(async ({ request }) => {
  // First run on this fresh test hub (made-up test PINs, the same as the main test hub).
  const r = await request.post('/api/auth/setup', { data: { adultPin: ADULT, guestPin: GUEST } });
  expect([200, 409]).toContain(r.status());
});

test('Adult PIN: Settings > Hub shows Windows PC, the address and its QR code; ad blocking is not set up', async ({ page }) => {
  await signIn(page, ADULT);
  await tab(page, 'Settings');
  const hub = page.getByRole('region', { name: 'Hub' });
  await expect(hub.getByText('Windows PC', { exact: true })).toBeVisible();
  await expect(hub.getByText('Raspberry Pi')).toHaveCount(0);
  const address = (await hub.getByLabel('Hub address').innerText()).trim();
  expect(address).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:3101$/);
  expect(await readQr(page, `QR code for ${address}`)).toBe(address);
  await expect(hub.getByRole('note')).toHaveText('While this Windows PC sleeps or is off, kid limits, snap back, schedules and routines pause until it is back.');

  const ad = page.getByRole('region', { name: 'Ad blocking' });
  await expect(ad.getByRole('note')).toHaveText('Not set up on this computer');
  await expect(ad.getByText('Not set up', { exact: true })).toBeVisible();
  await expect(ad.getByRole('switch', { name: 'Ad blocking' })).toHaveCount(0);
  await expect(ad.getByText('Not answering')).toHaveCount(0);
  // Turning it on is refused on the hub, not only hidden.
  const p = await page.request.patch('/api/adblock', { data: { on: true } });
  expect(p.status()).toBe(409);
});

test('Guest PIN: no Settings, so no Hub or Ad blocking; the routes refuse', async ({ page }) => {
  await signIn(page, GUEST);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Hub' })).toHaveCount(0);
  for (const [method, path] of [
    ['GET', '/settings'],
    ['GET', '/api/hub/status'],
    ['POST', '/api/hub/update'],
    ['GET', '/api/adblock'],
    ['PATCH', '/api/adblock'],
  ]) {
    const res = await page.request.fetch(path, { method, data: method === 'GET' ? undefined : {}, maxRedirects: 0 });
    expect(`${method} ${path} ${res.status()}`).toBe(`${method} ${path} 403`);
  }
});
