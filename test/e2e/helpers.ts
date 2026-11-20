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

/**
 * Read a QR code on the page the way a phone camera would (PP7): draw the element as the browser shows it onto a
 * canvas, then decode the pixels with jsQR (in the test, not the app).
 */
export async function readQr(page: Page, label: string): Promise<string | null> {
  const img = await page.getByRole('img', { name: label }).evaluate(async (el) => {
    const svg = new XMLSerializer().serializeToString(el);
    const size = 400;
    const pic = new Image();
    pic.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await pic.decode();
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(pic, 0, 0, size, size);
    return { size, data: Array.from(ctx.getImageData(0, 0, size, size).data) };
  });
  const { default: jsQR } = await import('jsqr');
  return jsQR(Uint8ClampedArray.from(img.data), img.size, img.size)?.data ?? null;
}
