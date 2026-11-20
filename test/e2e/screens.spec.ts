// Check 3: with the Adult PIN, Profiles, the profile editor, Settings, a TV and Activity history are reached by
// clicking from the app's own menus; with the Guest PIN those entry points are absent and the pages refuse (403).
// Runs at phone width and at desktop width.
import { expect, test } from '@playwright/test';
import { ADULT, GUEST, signIn, tab } from './helpers';

test.describe('Adult PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, ADULT));

  test('all five tabs; Browse (PP2) and Playlists (PP3) are built', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['Home', 'Browse', 'Playlists', 'Profiles', 'Settings']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    await tab(page, 'Browse');
    await expect(page.getByRole('tablist', { name: 'Platform' })).toBeVisible();
    await expect(page.getByText('is coming in a later build')).toHaveCount(0);
    // Inverted from PP2 ("Playlists and playback is coming in a later build").
    await tab(page, 'Playlists');
    await expect(page.getByRole('link', { name: 'New playlist' })).toBeVisible();
    await expect(page.getByText('Playlists and playback is coming in a later build')).toHaveCount(0);
    await tab(page, 'Home');
    await expect(page.getByRole('region', { name: 'Requests' })).toBeVisible();
    await expect(page.getByText('is coming in a later build')).toHaveCount(0);
  });

  test('Profiles: add a kid profile, edit it, delete it', async ({ page }, info) => {
    const name = `Kid ${info.project.name}`;
    await tab(page, 'Profiles');
    await page.getByRole('link', { name: 'Add profile' }).click();
    await expect(page.getByRole('heading', { name: 'Add profile' })).toBeVisible();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('radio', { name: 'Kid' }).click();
    await page.getByRole('radio', { name: 'Color #7FC8A9' }).click();
    await expect(page.getByText('These defaults are saved now; changing them arrives in PP4.')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible();
    const card = page.getByRole('link', { name: `Edit ${name}` });
    await expect(card).toContainText('TV-Y, TV-Y7, TV-G, G · 60 min weekdays');
    await expect(card).toContainText('Kid');

    await card.click();
    await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();
    await page.getByLabel('Name').fill(`${name} two`);
    await page.getByRole('radio', { name: 'Adult' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    const edited = page.getByRole('link', { name: `Edit ${name} two` });
    await expect(edited).toContainText('No limits');

    await edited.click();
    await page.getByRole('button', { name: 'Delete profile' }).click();
    await page.getByRole('alertdialog', { name: 'Delete profile' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Edit ${name} two` })).toHaveCount(0);

    // Every change is in Activity history, with the PIN and the device.
    await tab(page, 'Settings');
    await page.getByRole('link', { name: /Activity history/ }).click();
    await expect(page.getByRole('heading', { name: 'Activity history' })).toBeVisible();
    const changes = page.getByLabel('Changes');
    await expect(changes).toContainText(`Added profile ${name} (Kid)`);
    await expect(changes).toContainText(`Renamed ${name} to ${name} two, changed ${name} two to Adult`);
    await expect(changes).toContainText(`Deleted profile ${name} two`);
    await expect(changes).toContainText(info.project.name === 'desktop' ? 'Computer' : 'Android phone');
  });

  test('Settings: TVs, PINs, hub and Activity history are reached from the menu', async ({ page }) => {
    await tab(page, 'Settings');
    await expect(page.getByText('Lock the app after', { exact: true })).toBeVisible();
    await expect(page.getByText('Raspberry Pi')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find TVs on the network' })).toBeVisible();

    // Make sure there is a TV to open (an offline one; tvs.spec.ts adds the fake Roku by discovery), then open it.
    const tvLink = page.getByRole('link', { name: /^TV / }).first();
    if ((await tvLink.count()) === 0) {
      await page.getByRole('button', { name: 'Add by address' }).click();
      await page.getByLabel('TV address').fill('127.0.0.1:2');
      await page.getByLabel('TV name').fill('Spare TV');
      await page.getByRole('button', { name: 'Add TV' }).click();
      await expect(page.getByRole('status')).toContainText('Added');
    }
    await page.getByRole('link', { name: /^TV / }).first().click();
    await expect(page.getByLabel('Default profile')).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    await page.getByRole('link', { name: /Activity history/ }).click();
    await expect(page.getByRole('heading', { name: 'Activity history' })).toBeVisible();
    await page.getByRole('radio', { name: 'Guest PIN' }).click();
    await expect(page.getByLabel('Changes')).not.toContainText('Adult');
    await page.getByRole('radio', { name: 'Adult PIN' }).click();
    await expect(page.getByLabel('Changes').getByText('Adult', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Guest PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, GUEST));

  test('only Home, Browse and Playlists; Profiles and Settings are absent and refuse', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['Home', 'Browse', 'Playlists']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    for (const name of ['Profiles', 'Settings']) await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Activity history/ })).toHaveCount(0);
    await tab(page, 'Browse');
    await tab(page, 'Playlists');
    await tab(page, 'Home');
    await expect(page.getByRole('link', { name: 'Add profile' })).toHaveCount(0);

    for (const path of ['/profiles', '/profiles/new', '/profiles/1', '/settings', '/settings/tvs/1', '/settings/activity']) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(`${path} ${res.status()}`).toBe(`${path} 403`);
    }
    for (const path of ['/api/profiles', '/api/settings', '/api/activity', '/api/hub/status']) {
      const res = await page.request.get(path);
      expect(`${path} ${res.status()}`).toBe(`${path} 403`);
    }
  });
});
