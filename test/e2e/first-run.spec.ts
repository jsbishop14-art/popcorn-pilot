// Check 1 (part): first run asks for both PINs, then PIN entry lets each one in.
import { expect, test } from '@playwright/test';
import { ADULT, GUEST, alert, lock, typePin } from './helpers';

test('first run sets the Adult PIN and the Guest PIN, then each PIN signs in', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/setup');
  await expect(page.getByRole('heading', { name: 'Welcome to Popcorn Pilot' })).toBeVisible();

  // The same PIN for both is refused.
  await page.getByLabel('Adult PIN', { exact: true }).fill(ADULT);
  await page.getByLabel('Adult PIN again').fill(ADULT);
  await page.getByLabel('Guest PIN', { exact: true }).fill(ADULT);
  await page.getByLabel('Guest PIN again').fill(ADULT);
  await page.getByRole('button', { name: 'Save PINs' }).click();
  await expect(alert(page)).toHaveText('The Adult PIN and the Guest PIN must be different.');

  await page.getByLabel('Guest PIN', { exact: true }).fill(GUEST);
  await page.getByLabel('Guest PIN again').fill(GUEST);
  await page.getByRole('button', { name: 'Save PINs' }).click();
  await page.waitForURL('**/pin');

  // First run is gone once the PINs are set.
  const again = await page.request.post('/api/auth/setup', { data: { adultPin: '1111', guestPin: '2222' } });
  expect(again.status()).toBe(409);

  await expect(page.getByText('Adult PIN for full control · Guest PIN for kid mode and playlists')).toBeVisible();
  await typePin(page, ADULT);
  await page.waitForURL('**/home');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' })).toBeVisible();
  await lock(page);

  await typePin(page, GUEST);
  await page.waitForURL('**/home');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await lock(page);

  // A wrong PIN says how many tries are left.
  await typePin(page, '0000');
  await expect(alert(page)).toHaveText('Wrong PIN. 4 tries left.');
  await typePin(page, ADULT);
  await page.waitForURL('**/home');
});
