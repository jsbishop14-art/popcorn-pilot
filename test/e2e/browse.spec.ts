// PP2 browser checks, at phone width (project browse-phone) and desktop width (browse-desktop):
// 1. Browse, a title and Suggestions are reached by clicking from the app's menus with each PIN.
// 3. All shows one row per platform; a platform tab shows only that platform.
// 4. Trailer on TV sends the YouTube launch to the fake Roku.
// 5. Tag as calm and Block for kids persist and appear in Activity history.
// Kid filtering in the UI (the hub enforces it; test/unit/catalog.test.ts checks every route).
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ADULT, GUEST, signIn, tab } from './helpers';

const KID = 'Kid placeholder'; // made by tvs.spec.ts (phone project)

const desktop = (info: TestInfo) => info.project.name === 'browse-desktop';

/** Titles this width tags, so the two widths do not undo each other. */
const T = (info: TestInfo) =>
  desktop(info) ? { open: 'Rocket Pals', calm: 'Moon Camp', block: 'Big Truck Town', key: 'tv-9003' } : { open: 'Rocket Pals', calm: 'Garden Bugs', block: 'Star Club', key: 'tv-9004' };

async function rokuCalls(page: Page): Promise<{ method: string; path: string; query: Record<string, string> }[]> {
  return (await page.request.get('http://127.0.0.1:18061/calls')).json();
}

/** Open a title from Browse by clicking its poster; returns the details region. */
async function openTitle(page: Page, info: TestInfo, name: string) {
  const area = desktop(info) ? page.locator('.b-rows') : page.getByRole('region', { name: 'Titles' });
  await area.getByRole('button', { name, exact: true }).first().click();
  if (desktop(info)) {
    const aside = page.getByRole('complementary', { name: 'Title details' });
    await expect(aside.getByRole('heading', { name })).toBeVisible();
    return aside;
  }
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return page.getByRole('region', { name: `${name} details` });
}

test.describe('Adult PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, ADULT));

  test('Browse: All is one row per platform; a platform tab shows only that platform (check 3)', async ({ page }, info) => {
    await tab(page, 'Browse');
    await expect(page.getByText('Sample catalog (no TMDB key yet)')).toBeVisible();
    const platform = page.getByRole('tablist', { name: 'Platform' });
    await expect(platform.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    if (desktop(info)) {
      const rows = page.locator('.b-rows > section');
      await expect(rows).toHaveCount(3);
      await expect(rows.locator('h2')).toHaveText(['Netflix', 'Prime Video', 'Hulu']);
      await expect(page.getByRole('region', { name: 'Hulu' }).getByRole('button', { name: 'Bubble Bakery' })).toBeVisible();
      await platform.getByRole('tab', { name: 'Hulu' }).click();
      await expect(rows.locator('h2')).toHaveText(['Shows on Hulu', 'Movies on Hulu']);
      await expect(page.getByRole('button', { name: 'Rocket Pals' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Bubble Bakery' })).toBeVisible();
    } else {
      const grid = page.getByRole('region', { name: 'Titles' });
      await expect(grid.getByRole('button', { name: 'Rocket Pals' })).toBeVisible();
      await expect(grid.getByRole('button', { name: 'Bubble Bakery' })).toBeVisible();
      await platform.getByRole('tab', { name: 'Netflix' }).click();
      await expect(grid.getByRole('button', { name: 'Bubble Bakery' })).toHaveCount(0);
      await expect(grid.getByRole('button', { name: 'Rocket Pals' })).toBeVisible();
      await expect(page.getByPlaceholder('Search Netflix')).toBeVisible();
    }
    // Search and the shows or movies filter.
    await platform.getByRole('tab', { name: 'All' }).click();
    await page.getByLabel('Search titles').fill('moon');
    await expect(page.locator(desktop(info) ? '.b-rows' : '.b-grid').getByRole('button')).toHaveCount(desktop(info) ? 2 : 1);
    await page.getByLabel('Search titles').fill('');
    await page.getByLabel('Shows or movies').selectOption('movie');
    await expect(page.locator(desktop(info) ? '.b-rows' : '.b-grid').getByRole('button', { name: 'Rocket Pals' })).toHaveCount(0);
    await expect(page.locator(desktop(info) ? '.b-rows' : '.b-grid').getByRole('button', { name: 'Snow Pups' }).first()).toBeVisible();
  });

  test('title details: trailer in the app, Trailer on TV reaches the fake Roku, Play on a TV (check 4)', async ({ page }, info) => {
    await tab(page, 'Browse');
    const d = await openTitle(page, info, 'Rocket Pals');
    await expect(d).toContainText('Netflix · 2 seasons · 22 min episodes');
    await expect(d).toContainText('Three friends build a cardboard rocket');
    await expect(d.getByLabel('Start from')).toHaveValue('Season 1 · Episode 1');
    await expect(d.getByRole('button', { name: 'Add to playlist' })).toBeDisabled();
    await expect(d.getByRole('button', { name: 'Start quick playlist' })).toBeDisabled();
    await expect(d).toContainText('coming in PP3');

    await d.getByRole('button', { name: 'Play trailer here' }).click();
    await expect(d.getByText('Trailer playing: Rocket Pals')).toBeVisible();

    await d.getByLabel('TV').selectOption({ label: 'Living room' });
    const before = (await rokuCalls(page)).length;
    await d.getByRole('button', { name: 'Trailer on TV' }).click();
    await expect(d.getByRole('status').last()).toHaveText('Trailer sent to Living room');
    const calls = (await rokuCalls(page)).slice(before);
    expect(calls.map((c) => `${c.method} ${c.path} ${c.query.contentId}`)).toEqual(['POST /launch/837 stub9001']);

    await d.getByLabel('Start from').selectOption('Next unwatched episode');
    await d.getByRole('button', { name: 'Play on Living room' }).click();
    await expect(d.getByRole('status').last()).toHaveText('Playing Rocket Pals on Living room');
    const play = (await rokuCalls(page)).slice(before + 1);
    expect(play.map((c) => `${c.method} ${c.path} ${c.query.contentId}`)).toEqual(['POST /launch/12 81000001']);

    // More like this opens a similar title.
    await d.getByRole('button', { name: 'More like this' }).click();
    const more = d.getByRole('region', { name: 'More like this' });
    await more.getByRole('button', { name: 'Ocean Friends' }).click();
    if (desktop(info)) await expect(page.getByRole('complementary', { name: 'Title details' }).getByRole('heading', { name: 'Ocean Friends' })).toBeVisible();
    else await expect(page.getByRole('heading', { level: 1, name: 'Ocean Friends' })).toBeVisible();
  });

  test('Tag as calm and Block for kids persist and are in Activity history (check 5)', async ({ page }, info) => {
    const t = T(info);
    await tab(page, 'Browse');
    let d = await openTitle(page, info, t.calm);
    await d.getByRole('button', { name: 'Tag as calm' }).click();
    await expect(d.getByRole('status').last()).toHaveText(`${t.calm} is tagged as calm`);
    await expect(d.getByRole('button', { name: 'Tag as calm' })).toHaveAttribute('aria-pressed', 'true');
    if (!desktop(info)) await page.getByRole('link', { name: 'Back' }).click();
    d = await openTitle(page, info, t.block);
    await d.getByRole('button', { name: 'Block for kids' }).click();
    await expect(d.getByRole('status').last()).toHaveText(`${t.block} is blocked for kids`);

    // Persisted: a fresh page load shows both pressed.
    await page.reload();
    if (desktop(info)) d = await openTitle(page, info, t.block);
    await expect(d.getByRole('button', { name: 'Block for kids' })).toHaveAttribute('aria-pressed', 'true');

    // A kid profile no longer sees the blocked title.
    if (!desktop(info)) await page.getByRole('link', { name: 'Back' }).click();
    await page.getByLabel('Showing for').selectOption({ label: `Showing for: ${KID} (Kid)` });
    const area = page.locator(desktop(info) ? '.b-rows' : '.b-grid');
    await expect(area.getByRole('button', { name: 'Rocket Pals' }).first()).toBeVisible();
    await expect(area.getByRole('button', { name: t.block, exact: true })).toHaveCount(0);
    await expect(area.getByRole('button', { name: 'Night Harbor' })).toHaveCount(0); // TV-MA
    await expect(area.getByRole('button', { name: 'Last Signal' })).toHaveCount(0); // R

    await tab(page, 'Settings');
    await page.getByRole('link', { name: /Calm titles/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Calm titles' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Calm titles' })).toContainText(t.calm);
    await page.getByRole('link', { name: 'Back' }).click();
    await page.getByRole('link', { name: /Activity history/ }).click();
    const changes = page.getByLabel('Changes');
    await expect(changes).toContainText(`Tagged ${t.calm} as calm`);
    await expect(changes).toContainText(`Blocked ${t.block} for kids`);
    await expect(changes).toContainText('Sent the Rocket Pals trailer to Living room (YouTube)');
    await expect(changes).toContainText('Played Rocket Pals on Living room (Netflix, direct link, start from Next unwatched episode)');
  });

  test('Suggestions from Browse and from Playlists', async ({ page }) => {
    await tab(page, 'Browse');
    await page.getByRole('link', { name: 'Suggestions' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Suggestions' })).toBeVisible();
    const list = page.getByRole('region', { name: 'Suggested titles' });
    await expect(list).toContainText('Popular on Netflix');
    await page.getByRole('button', { name: `For ${KID}` }).click();
    await expect(list.getByRole('link').first()).toBeVisible();
    await expect(list).not.toContainText('TV-MA');
    await expect(list).not.toContainText('PG-13');
    await page.getByRole('button', { name: 'Calm titles' }).click();
    await expect(list).toContainText('Similar to');
    await list.getByRole('link').first().click();
    await expect(page.getByRole('button', { name: 'Play trailer here' })).toBeVisible();

    await tab(page, 'Playlists');
    await page.getByRole('link', { name: 'Suggestions' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Suggestions' })).toBeVisible();
  });

  test('Settings: the TMDB key field says the sample catalog is used', async ({ page }) => {
    await tab(page, 'Settings');
    const box = page.getByRole('region', { name: 'Titles and cover art' });
    await expect(box).toContainText('No TMDB key yet: Browse shows a built-in sample catalog.');
    await box.getByLabel('TMDB key').fill('not a key');
    await box.getByRole('button', { name: 'Save key' }).click();
    await expect(box.getByRole('status')).toHaveText('That does not look like a TMDB key. Use the API key (32 letters and numbers) or the read access token.');
  });
});

test.describe('Guest PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, GUEST));

  test('Browse for a kid profile only; open a title, play it; tags absent; Suggestions reached', async ({ page }, info) => {
    await tab(page, 'Browse');
    const picker = page.getByLabel('Showing for');
    await expect(picker).toHaveValue(/\d+/);
    await expect(picker.locator('option')).toHaveText([`Showing for: ${KID} (Kid)`]);
    const area = page.locator(desktop(info) ? '.b-rows' : '.b-grid');
    await expect(area.getByRole('button', { name: 'Rocket Pals' }).first()).toBeVisible();
    for (const adultTitle of ['Night Harbor', 'Kitchen Clash', 'City of Glass', 'The Basement Tapes']) await expect(area.getByRole('button', { name: adultTitle })).toHaveCount(0);

    const d = await openTitle(page, info, 'Rocket Pals');
    await expect(d.getByRole('button', { name: 'Tag as calm' })).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Block for kids' })).toHaveCount(0);
    await d.getByLabel('TV').selectOption({ label: 'Living room' });
    await d.getByRole('button', { name: 'Play on Living room' }).click();
    await expect(d.getByRole('status').last()).toHaveText('Playing Rocket Pals on Living room');

    // The hub refuses tags and adult titles to the Guest PIN, whatever the page shows.
    expect((await page.request.post('/api/catalog/titles/tv-9001/calm', { data: { calm: true } })).status()).toBe(403);
    expect((await page.request.get('/api/catalog/titles/tv-9007')).status()).toBe(403);
    expect((await page.request.get('/settings/calm', { maxRedirects: 0 })).status()).toBe(403);

    if (!desktop(info)) await page.getByRole('link', { name: 'Back' }).click();
    await page.getByRole('link', { name: 'Suggestions' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Suggestions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'For everyone' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Suggested titles' })).toContainText('Similar to Rocket Pals');
  });
});
