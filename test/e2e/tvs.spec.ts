// Check 5: discovery finds the fake Roku; add by address works; an offline TV shows as offline. Plus the TV editor
// (rename, room, default profile, channel token) and Settings PIN changes.
import { expect, test } from '@playwright/test';
import { ADULT, GUEST, alert, lock, signIn, tab, typePin } from './helpers';

test('find the fake Roku on the network and add it; add an offline TV by address', async ({ page }) => {
  await signIn(page, ADULT);
  await tab(page, 'Settings');
  await page.getByRole('button', { name: 'Find TVs on the network' }).click();
  const found = page.getByLabel('TVs found');
  await expect(found).toContainText('Found 1 TV');
  await expect(found).toContainText('Fake living room Roku');
  await expect(found).toContainText('127.0.0.1:18060');
  await found.getByRole('button', { name: 'Add Fake living room Roku' }).click();
  await expect(page.getByRole('status')).toHaveText('Added Fake living room Roku');
  await expect(found.getByText('Added', { exact: true })).toBeVisible();
  const living = page.getByRole('link', { name: 'TV Fake living room Roku' });
  await expect(living).toContainText('Online');

  await page.getByRole('button', { name: 'Add by address' }).click();
  await page.getByLabel('TV address').fill('8.8.8.8');
  await page.getByRole('button', { name: 'Add TV' }).click();
  await expect(page.getByRole('status')).toHaveText('Type the TV address on the home network, like 192.168.1.40.');
  await page.getByLabel('TV address').fill('127.0.0.1:1');
  await page.getByLabel('TV name').fill('Guest room');
  await page.getByRole('button', { name: 'Add TV' }).click();
  await expect(page.getByRole('status')).toHaveText('Added Guest room. It did not answer, so it shows as offline.');
  await expect(page.getByRole('link', { name: 'TV Guest room' })).toContainText('Offline');

  // Home shows both, with online status, for the Adult PIN and the Guest PIN.
  await tab(page, 'Home');
  await expect(page.getByRole('region', { name: 'Fake living room Roku TV' })).toContainText('Online');
  await expect(page.getByRole('region', { name: 'Guest room TV' })).toContainText('Offline');
  await lock(page);
  await typePin(page, GUEST);
  await page.waitForURL('**/home');
  await expect(page.getByRole('region', { name: 'Guest room TV' })).toContainText('Offline');
  await expect(page.getByRole('region', { name: 'Fake living room Roku TV' })).toContainText('Online');
});

test('TV editor: rename, room, default profile, channel token', async ({ page }) => {
  await signIn(page, ADULT);
  await tab(page, 'Profiles');
  await page.getByRole('link', { name: 'Add profile' }).click();
  await page.getByLabel('Name').fill('Kid placeholder');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Edit Kid placeholder' })).toBeVisible();

  await tab(page, 'Settings');
  await page.getByRole('link', { name: 'TV Fake living room Roku' }).click();
  await page.getByLabel('Name').fill('Living room');
  await page.getByLabel('Room').fill('Living room');
  await page.getByLabel('Default profile').selectOption({ label: 'Kid placeholder (Kid)' });
  await page.getByRole('button', { name: 'Save' }).click();
  const tv = page.getByRole('link', { name: 'TV Living room' });
  await expect(tv).toContainText('Default profile: Kid placeholder');

  await tv.click();
  await page.getByRole('button', { name: 'Make channel token' }).click();
  const token = (await page.getByRole('status').locator('.mono').textContent())?.trim() ?? '';
  expect(token.length).toBeGreaterThan(30);
  // The token opens the channel's route for this TV and nothing else.
  const hello = await page.request.get('/api/channel/hello', { headers: { authorization: `Bearer ${token}`, cookie: '' } });
  expect(hello.status()).toBe(200);
  expect((await hello.json()).tv.name).toBe('Living room');
  const other = await page.request.get('/api/profiles', { headers: { authorization: `Bearer ${token}`, cookie: '' } });
  expect(other.status()).toBe(403);

  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Activity history/ }).click();
  const changes = page.getByLabel('Changes');
  await expect(changes).toContainText('Added TV Fake living room Roku at 127.0.0.1:18060');
  await expect(changes).toContainText('Added TV Guest room at 127.0.0.1:1 (offline)');
  await expect(changes).toContainText('Renamed TV Fake living room Roku to Living room, set the room of Living room to Living room, set the default profile of Living room to Kid placeholder');
  await expect(changes).toContainText('Made a new channel token for Living room');
});

test('Settings: change the Guest PIN, and the old one stops working', async ({ page }) => {
  await signIn(page, ADULT);
  await tab(page, 'Settings');
  await page.getByRole('button', { name: 'Change Guest PIN' }).click();
  await page.getByLabel('Current Adult PIN').fill('0000');
  await page.getByLabel('New PIN', { exact: true }).fill('2470');
  await page.getByLabel('New PIN again').fill('2470');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('status')).toHaveText('The current Adult PIN is wrong.');
  await page.getByLabel('Current Adult PIN').fill(ADULT);
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('status')).toHaveText('Guest PIN changed.');
  await lock(page);
  await typePin(page, GUEST);
  await expect(alert(page)).toHaveText('Wrong PIN. 4 tries left.');
  await typePin(page, '2470');
  await page.waitForURL('**/home');
  await lock(page);

  // Put it back for the other tests.
  await typePin(page, ADULT);
  await page.waitForURL('**/home');
  await tab(page, 'Settings');
  await page.getByRole('button', { name: 'Change Guest PIN' }).click();
  await page.getByLabel('Current Adult PIN').fill(ADULT);
  await page.getByLabel('New PIN', { exact: true }).fill(GUEST);
  await page.getByLabel('New PIN again').fill(GUEST);
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('status')).toHaveText('Guest PIN changed.');
});
