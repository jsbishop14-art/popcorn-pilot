import { expect, type Page } from '@playwright/test';

// Test PINs only (made up for the test hub; never real PINs).
export const ADULT = '1357';
export const GUEST = '2468';
export const FAKE_ROKU = '127.0.0.1:18060';

/** Open the app and enter a PIN on the keypad. */
export async function signIn(page: Page, pin: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter PIN' })).toBeVisible();
  await typePin(page, pin);
  await page.waitForURL('**/home');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
}

export async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click();
}

export async function tab(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export async function lock(page: Page) {
  await page.getByRole('button', { name: 'Lock app' }).click();
  await expect(page.getByRole('heading', { name: 'Enter PIN' })).toBeVisible();
}

/** The app's own alert message (Next.js adds a hidden route announcer with role=alert, which this skips). */
export function alert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
