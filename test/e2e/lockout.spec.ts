// Check 1 (part): 5 wrong PINs lock PIN entry for 1 minute, even for the right PIN; after the minute it works.
import { expect, test } from '@playwright/test';
import { ADULT, alert, typePin } from './helpers';

test('5 wrong PINs lock PIN entry for 1 minute', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter PIN' })).toBeVisible();
  for (let left = 4; left >= 1; left--) {
    await typePin(page, '0000');
    await expect(alert(page)).toHaveText(`Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  }
  await typePin(page, '0000');
  const started = Date.now();
  await expect(alert(page)).toContainText('Too many wrong tries. Try again in');
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();

  // The hub refuses the right PIN while locked (not just the keypad).
  const r = await page.request.post('/api/auth/pin', { data: { pin: ADULT } });
  expect(r.status()).toBe(429);

  // Still locked at 55 s.
  await page.waitForTimeout(Math.max(0, 55_000 - (Date.now() - started)));
  expect((await page.request.post('/api/auth/pin', { data: { pin: ADULT } })).status()).toBe(429);

  // Open again after the minute.
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeEnabled({ timeout: 15_000 });
  await typePin(page, ADULT);
  await page.waitForURL('**/home');
});
