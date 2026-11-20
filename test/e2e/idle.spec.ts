// Check 1 (part): after the set time of no use the app returns to PIN entry; the lock time is set in Settings.
import { expect, test } from '@playwright/test';
import { ADULT, GUEST, signIn, tab } from './helpers';

test('idle lock returns to PIN entry after 5 min of no use (default)', async ({ page }) => {
  await page.clock.install();
  await signIn(page, ADULT);
  await page.clock.fastForward('04:00');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.clock.fastForward('01:10');
  await page.waitForURL('**/pin?idle=1');
  await expect(page.getByText('Locked after no use. Enter your PIN.')).toBeVisible();
  // The hub ended the session too.
  expect((await page.request.get('/api/profiles')).status()).toBe(401);
});

test('use keeps the app open; the Guest PIN locks the same way', async ({ page }) => {
  await page.clock.install();
  await signIn(page, GUEST);
  await page.clock.fastForward('04:00');
  await page.mouse.click(5, 300);
  await page.clock.fastForward('04:00');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.clock.fastForward('01:10');
  await page.waitForURL('**/pin?idle=1');
});

test('the lock time follows Settings', async ({ page }) => {
  await signIn(page, ADULT);
  await tab(page, 'Settings');
  await page.getByLabel('Lock the app after').selectOption('1');
  await expect(page.getByText('1 min of no use')).toBeVisible();

  const p2 = await page.context().newPage();
  await p2.clock.install();
  await p2.goto('/home');
  await expect(p2.getByRole('heading', { name: 'Home' })).toBeVisible();
  await p2.clock.fastForward('01:10');
  await p2.waitForURL('**/pin?idle=1');
  await p2.close();

  await signIn(page, ADULT);
  await tab(page, 'Settings');
  await page.getByLabel('Lock the app after').selectOption('5');
  await expect(page.getByText('5 min of no use')).toBeVisible();
  await page.getByRole('link', { name: /Activity history/ }).click();
  await expect(page.getByLabel('Changes')).toContainText('Changed the app lock time from 5 to 1 min');
});
