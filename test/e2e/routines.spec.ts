// PP5 browser checks, at phone width (project routines-phone) and desktop width (routines-desktop), against the
// production build, the fake Roku (Living room, 18060), the iCloud stub (18063) and the AdGuard Home stub (18064):
// 4. every new screen and button is reached by clicking from the app's own menus with each PIN: Playlists >
//    Routines, New routine (the editor: every step kind, Add step, move, remove, schedule, Test now, Save), Run,
//    Edit, the Home TV card's Start routine; Settings > Family Album (save the link, sync, a broken link's error,
//    remove) and Ad blocking (on, blocked today, off). For the Guest PIN the entry points are absent and the pages
//    and routes refuse.
// And, end to end on the running hub: a routine sets the fake Roku's volume to its level; the album syncs from the
// stub; the ad blocking switch turns the stub off and on.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ADULT, GUEST, signIn, tab } from './helpers';

const KID = 'Kid placeholder'; // made by tvs.spec.ts
const FAKE = 'http://127.0.0.1:18061';
const GOOD_LINK = 'https://www.icloud.com/sharedalbum/#B0aGoodAlbum12x';
const BROKEN_LINK = 'https://www.icloud.com/sharedalbum/#B0aNoSuchAlbum9';
const P = (info: TestInfo) => (info.project.name === 'routines-desktop' ? 'desktop' : 'phone');

async function ids(page: Page) {
  const tvs = (await (await page.request.get('/api/tvs')).json()).tvs as { id: number; name: string }[];
  const profiles = (await (await page.request.get('/api/profiles')).json()).profiles as { id: number; name: string }[];
  return { tv: Object.fromEntries(tvs.map((t) => [t.name, t.id])), profile: Object.fromEntries(profiles.map((p) => [p.name, p.id])) };
}

async function fake(path: string, method: 'GET' | 'POST' = 'GET') {
  const r = await fetch(FAKE + path, { method });
  return r.json();
}

test.describe('Adult PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, ADULT));

  test('Playlists > Routines > New routine: every step, Test now, Save, then Run sets up the TV', async ({ page }, info) => {
    test.setTimeout(90_000);
    // A playlist the kid may watch, and the kid allowed to watch now (the kid rules apply to the playlist step).
    const { tv, profile } = await ids(page);
    const allDay = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 720]));
    expect((await page.request.patch(`/api/profiles/${profile[KID]}/safeguards`, { data: { hoursStart: '00:00', hoursEnd: '24:00', dailyLimits: allDay } })).status()).toBe(200);
    const plName = `Routine cartoons ${P(info)}`;
    const pl = (await (await page.request.post('/api/playlists', { data: { name: plName } })).json()).playlist.id;
    expect((await page.request.post(`/api/playlists/${pl}/items`, { data: { titleKey: 'tv-9001' } })).status()).toBe(201);
    await page.request.post(`/api/tvs/${tv['Living room']}/playback`, { data: { action: 'stop' } });

    await tab(page, 'Playlists');
    await page.getByRole('link', { name: 'Routines' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible();
    await page.getByRole('link', { name: 'New routine' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New routine' })).toBeVisible();
    const name = `Morning ${P(info)}`;
    await page.getByLabel('Routine name').fill(name);
    await page.getByLabel('Routine TV').selectOption({ label: 'Living room' });
    await page.getByRole('group', { name: 'Picture' }).getByRole('button', { name: 'Morning' }).click();
    const steps = page.getByRole('region', { name: 'Steps' });
    for (const kind of ['Timer', 'Profile', 'Volume', 'Playlist']) {
      await steps.getByRole('button', { name: 'Add step' }).click();
      await steps.getByRole('group', { name: 'Add a step' }).getByRole('button', { name: kind }).click();
    }
    // Every kind is used: no Add step any more.
    await expect(steps.getByRole('button', { name: 'Add step' })).toHaveCount(0);
    await steps.getByLabel('Profile step').selectOption({ label: KID });
    await steps.getByLabel('Volume level').fill('18');
    await steps.getByLabel('Playlist step').selectOption({ label: plName });
    await steps.getByLabel('Timer minutes').fill('45');
    // The timer goes last: move it down three times.
    for (let i = 0; i < 3; i++) await steps.getByRole('button', { name: 'Move Timer down' }).click();
    await expect(steps.locator('.row .t')).toHaveText(['Turn on', 'Profile', 'Volume', 'Playlist', 'Timer']);
    // Schedule: weekdays at 7:00.
    const sch = page.getByRole('region', { name: 'Schedule' });
    await sch.getByRole('switch', { name: 'Run on a schedule' }).click();
    await expect(sch.getByText('Mon to Fri · 7:00 AM')).toBeVisible();

    await page.getByRole('button', { name: 'Test now' }).click();
    const test1 = page.getByRole('status', { name: 'Routine result' });
    await expect(test1).toContainText(`Test of ${name}: all 5 steps done on Living room.`, { timeout: 30_000 });
    await expect(test1).toContainText('(not set in a test)');
    expect((await fake('/state')).volume).toBe(18);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible();
    const card = page.getByRole('group', { name: `Routine ${name}` });
    await expect(card).toContainText(`Weekdays 7:00 AM · Living room · ${KID}`);

    // Run, after the volume was changed on the TV: the routine sets it back to 18.
    await page.request.post(`/api/tvs/${tv['Living room']}/remote`, { data: { key: 'VolumeUp' } });
    expect((await fake('/state')).volume).toBe(19);
    await card.getByRole('button', { name: `Run ${name}` }).click();
    await expect(card.getByRole('status', { name: 'Routine result' })).toContainText(`${name}: all 5 steps done on Living room.`, { timeout: 30_000 });
    await expect(card).toContainText('Turns Living room off at');
    const state = await fake('/state');
    expect(state.volume).toBe(18);
    expect(state.activeApp.id).toBe('12'); // Rocket Pals on Netflix
    // The timer can be cancelled.
    await card.getByRole('button', { name: 'Cancel timer' }).click();
    await expect(card.getByRole('button', { name: 'Cancel timer' })).toHaveCount(0);

    // Edit: opened from the list; the schedule goes off; saved.
    await card.getByRole('link', { name: `Edit ${name}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit routine' })).toBeVisible();
    await expect(page.getByLabel('Routine name')).toHaveValue(name);
    await page.getByRole('region', { name: 'Schedule' }).getByRole('switch', { name: 'Run on a schedule' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('group', { name: `Routine ${name}` })).toContainText(`Manual · Living room · ${KID}`);
    await page.request.post(`/api/tvs/${tv['Living room']}/playback`, { data: { action: 'stop' } });
  });

  test('a step that fails stops the routine with a clear message; a routine can be deleted', async ({ page }, info) => {
    // A TV at an address nothing answers on (removed again at the end; screens.spec.ts uses port 2).
    const tvName = `Unplugged ${P(info)}`;
    const added = await page.request.post('/api/tvs', { data: { address: `127.0.0.1:${P(info) === 'phone' ? 4 : 5}`, name: tvName } });
    expect(`${added.status()} ${added.status() === 201 ? '' : JSON.stringify(await added.json())}`).toBe('201 ');
    const deadId = (await added.json()).tv.id as number;
    await tab(page, 'Playlists');
    await page.getByRole('link', { name: 'Routines' }).click();
    await page.getByRole('link', { name: 'New routine' }).click();
    const name = `Spare ${P(info)}`;
    await page.getByLabel('Routine name').fill(name);
    await page.getByLabel('Routine TV').selectOption({ label: tvName });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const card = page.getByRole('group', { name: `Routine ${name}` });
    await card.getByRole('button', { name: `Run ${name}` }).click();
    await expect(card.getByRole('status', { name: 'Routine result' })).toContainText(`${name} stopped at step 1 (Turn on): ${tvName} did not answer.`, { timeout: 30_000 });
    await card.getByRole('link', { name: `Edit ${name}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: `Delete ${name} for good` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible();
    await expect(page.getByRole('group', { name: `Routine ${name}` })).toHaveCount(0);
    expect((await page.request.delete(`/api/tvs/${deadId}`)).status()).toBe(200);
  });

  test('Home: a TV card has Start routine, which lists that TV\'s routines', async ({ page }, info) => {
    const { tv } = await ids(page);
    await page.request.post(`/api/tvs/${tv['Living room']}/playback`, { data: { action: 'stop' } });
    await page.reload();
    await page.getByRole('region', { name: 'Living room TV' }).getByRole('link', { name: 'Start routine on Living room' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible();
    await expect(page.getByText('Routines for Living room')).toBeVisible();
    await expect(page.getByRole('group', { name: `Routine Morning ${P(info)}` })).toBeVisible();
  });

  test('Settings > Family Album: save the link, it syncs and shows the counts; a broken link shows an error', async ({ page }) => {
    await fake('/album?as=first', 'POST');
    await tab(page, 'Settings');
    const album = page.getByRole('region', { name: 'Family Album' });
    const link = album.getByLabel('iCloud shared album link');
    // From an earlier run of this test (the other width), the link may already be saved: start from none.
    if (await album.getByRole('button', { name: 'Remove link' }).isVisible()) {
      await album.getByRole('button', { name: 'Remove link' }).click();
      await expect(album.getByRole('note')).toContainText('No album yet');
    }
    await link.fill(GOOD_LINK);
    await album.getByRole('button', { name: 'Save link' }).click();
    await expect(album.getByRole('note')).toContainText(/3 photos · 1 clip · synced /, { timeout: 20_000 });
    await expect(album.getByRole('status')).toContainText('Synced: 4 added, 0 updated, 0 removed.');
    // The album changes in iCloud: Sync now.
    await fake('/album?as=changed', 'POST');
    await album.getByRole('button', { name: 'Sync now' }).click();
    await expect(album.getByRole('status')).toContainText('Synced: 1 added, 1 updated, 1 removed.', { timeout: 20_000 });
    // A broken link: an error in Settings, the photos stay.
    await link.fill(BROKEN_LINK);
    await album.getByRole('button', { name: 'Save link' }).click();
    await expect(album.getByRole('alert')).toContainText('Last sync failed: iCloud did not find that album.', { timeout: 20_000 });
    await expect(album.getByRole('note')).toContainText('3 photos · 1 clip');
    // Back to the good link.
    await link.fill(GOOD_LINK);
    await album.getByRole('button', { name: 'Save link' }).click();
    await expect(album.getByRole('alert')).toHaveCount(0, { timeout: 20_000 });
  });

  test('Settings > Ad blocking: on with blocked today; the switch turns it off and on', async ({ page }) => {
    await fake('/adguard?on=1', 'POST');
    await tab(page, 'Settings');
    const ad = page.getByRole('region', { name: 'Ad blocking' });
    await expect(ad.getByRole('note')).toHaveText('1,284 requests blocked today');
    const sw = ad.getByRole('switch', { name: 'Ad blocking' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(ad.getByRole('note')).toHaveText('Off: home screen ads are not blocked (1,284 requests blocked earlier today)');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    expect((await fake('/adguard')).on).toBe(false);
    // Off in AdGuard Home itself shows as off after a reload too.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Ad blocking' }).getByRole('switch', { name: 'Ad blocking' })).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('region', { name: 'Ad blocking' }).getByRole('switch', { name: 'Ad blocking' }).click();
    await expect(page.getByRole('region', { name: 'Ad blocking' }).getByRole('note')).toHaveText('1,284 requests blocked today');
    expect((await fake('/adguard')).on).toBe(true);
  });
});

test.describe('Guest PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, GUEST));

  test('no Routines on Playlists, no Start routine on Home, no Settings; the pages and routes refuse', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Start routine/ })).toHaveCount(0);
    await tab(page, 'Playlists');
    await expect(page.getByRole('heading', { level: 1, name: 'Playlists' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Routines' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' })).toHaveCount(0);
    for (const p of ['/playlists/routines', '/playlists/routines/new']) expect(`${p} ${(await page.request.get(p, { maxRedirects: 0 })).status()}`).toBe(`${p} 403`);
    for (const [m, p] of [
      ['GET', '/api/routines'],
      ['POST', '/api/routines/test'],
      ['POST', '/api/album/sync'],
      ['GET', '/api/adblock'],
      ['PATCH', '/api/adblock'],
    ] as const)
      expect(`${m} ${p} ${(await page.request.fetch(p, { method: m, data: m === 'GET' ? undefined : {} })).status()}`).toBe(`${m} ${p} 403`);
  });
});
