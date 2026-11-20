// PP3 browser checks, at phone width (project playback-phone) and desktop width (playback-desktop), against the
// production build and two fake Rokus (Living room on 18060, Bedroom on 18062):
// 6. every new screen is reached by clicking from the app's own menus with each PIN: Dashboard (Home), Playlists, a
//    playlist, New playlist and the editor with Show options (Adult), Quick playlist, Live queue, Remote (Adult).
//    For the Guest PIN the Adult entry points are absent and those pages and routes refuse.
// 3. the same playlist on both TVs; Send to pauses one and resumes on the other.
// 4. quick playlist: the first pick asks to start; later picks append; Save as playlist makes a playlist.
// 5. a failed launch shows a message and the next title starts.
// Engine timing (modes, loop, shuffle, schedules) is checked with a fake clock in test/unit/playback.test.ts.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ADULT, GUEST, signIn, tab } from './helpers';

const KID = 'Kid placeholder'; // made by tvs.spec.ts, the Living room TV's default profile
const desktop = (info: TestInfo) => info.project.name === 'playback-desktop';
const P = (info: TestInfo) => (desktop(info) ? 'desktop' : 'phone');
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_WORDS = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const DAY_PLURAL = { sun: 'Sundays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays' };
/** A schedule day three days from today, so the hub's engine never starts it during the tests. */
const SCHEDULE_DAY = DAY_KEYS[(new Date().getDay() + 3) % 7];

type Call = { method: string; path: string; query: Record<string, string> };
async function calls(page: Page, tv: 1 | 2): Promise<Call[]> {
  return (await page.request.get(`http://127.0.0.1:18061/${tv === 1 ? 'calls' : 'calls2'}`)).json();
}
/**
 * What the hub told a TV to do (keys, launches), without its status reads: since PP6 the hub also asks each paired TV
 * whether it is on (GET /query/device-info, the power-on watcher), at any moment.
 */
const commandsOf = (cs: Call[]) => cs.filter((c) => c.method === 'POST').map((c) => c.path);
const launchesOf = (cs: Call[]) =>
  cs.filter((c) => c.method === 'POST' && (c.path.startsWith('/launch/') || c.path === '/search/browse')).map((c) => (c.path === '/search/browse' ? `search ${c.query.keyword}` : `${c.path} ${c.query.contentId ?? ''}`));

async function tvIds(page: Page): Promise<Record<string, number>> {
  const r = (await (await page.request.get('/api/tvs')).json()) as { tvs: { id: number; name: string }[] };
  return Object.fromEntries(r.tvs.map((t) => [t.name, t.id]));
}

/** Every TV idle before a test (both PINs may stop). */
async function stopAll(page: Page) {
  for (const id of Object.values(await tvIds(page))) await page.request.post(`/api/tvs/${id}/playback`, { data: { action: 'stop' } });
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

async function backToBrowse(page: Page, info: TestInfo) {
  if (!desktop(info)) await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Browse' })).toBeVisible();
}

/** Set the Start section's TV chips to exactly these TVs. */
async function pickTvs(page: Page, names: string[]) {
  const group = page.getByRole('region', { name: 'Start' }).getByRole('group', { name: 'TVs' });
  for (const chip of await group.getByRole('button').all()) {
    const label = ((await chip.textContent()) ?? '').replace(' (offline)', '').trim();
    const on = (await chip.getAttribute('aria-pressed')) === 'true';
    if (on !== names.includes(label)) await chip.click();
  }
  for (const n of names) await expect(group.getByRole('button', { name: n, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

async function openPlaylist(page: Page, name: string) {
  await tab(page, 'Playlists');
  await page.getByRole('link', { name: `Playlist ${name}`, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test.describe('Adult PIN', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADULT);
    await stopAll(page);
  });

  test('make a playlist from Browse; editor: Show options, order, loop, schedule; saved and in Activity history', async ({ page }, info) => {
    const name = `Cartoons ${P(info)}`;
    // The second fake TV, once (Send to needs two TVs that answer).
    await tab(page, 'Settings');
    if ((await page.getByRole('link', { name: 'TV Bedroom' }).count()) === 0) {
      await page.getByRole('button', { name: 'Add by address' }).click();
      await page.getByLabel('TV address').fill('127.0.0.1:18062');
      await page.getByLabel('TV name').fill('Bedroom');
      await page.getByRole('button', { name: 'Add TV' }).click();
      await expect(page.getByRole('link', { name: 'TV Bedroom' })).toContainText('Online');
    }

    await tab(page, 'Playlists');
    await page.getByRole('link', { name: 'New playlist' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New playlist' })).toBeVisible();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Make playlist' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit playlist' })).toBeVisible();
    await page.getByRole('link', { name: 'Add title' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Browse' })).toBeVisible();
    for (const t of ['Bubble Bakery', 'Rocket Pals', 'Night Harbor']) {
      const d = await openTitle(page, info, t);
      await d.getByRole('button', { name: 'Add to playlist' }).click();
      await d.getByRole('button', { name: `Add to ${name}`, exact: true }).click();
      await expect(d.getByRole('status').last()).toHaveText(`Added ${t} to ${name}`);
      await backToBrowse(page, info);
    }

    await openPlaylist(page, name);
    await expect(page.getByRole('region', { name: 'Titles' })).toContainText('Night Harbor');
    await page.getByRole('link', { name: 'Edit playlist' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit playlist' })).toBeVisible();
    const titles = page.getByRole('region', { name: 'Titles' });
    await expect(titles.locator('.qrow .t')).toHaveText(['Bubble Bakery', 'Rocket Pals', 'Night Harbor']);

    // Show options: Rocket Pals for 45 minutes (stopping at an episode end); Bubble Bakery for 4 episodes.
    await page.getByRole('button', { name: 'How much Rocket Pals: 3 episodes' }).click();
    let sheet = page.getByRole('dialog', { name: 'Show options' });
    await expect(sheet.getByRole('heading', { name: 'How much Rocket Pals?' })).toBeVisible();
    for (const o of ['Number of episodes', 'Stay on show', 'Time on show', 'Run indefinitely']) await expect(sheet.getByRole('radio', { name: o })).toBeVisible();
    await sheet.getByRole('radio', { name: 'Time on show' }).click();
    await sheet.getByLabel('Minutes').selectOption('45');
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'How much Rocket Pals: 45 min' })).toBeVisible();
    await page.getByRole('button', { name: 'How much Bubble Bakery: 3 episodes' }).click();
    sheet = page.getByRole('dialog', { name: 'Show options' });
    await sheet.getByRole('button', { name: 'More episodes' }).click();
    await expect(sheet.getByLabel('Episodes', { exact: true })).toHaveText('4');
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'How much Bubble Bakery: 4 episodes' })).toBeVisible();

    await page.getByRole('button', { name: 'Move Rocket Pals up' }).click();
    await expect(titles.locator('.qrow .t')).toHaveText(['Rocket Pals', 'Bubble Bakery', 'Night Harbor']);
    await page.getByRole('switch', { name: 'Loop' }).click();
    await page.getByRole('switch', { name: 'Schedule' }).click();
    await page.getByRole('group', { name: 'Days' }).getByRole('button', { name: DAY_WORDS[SCHEDULE_DAY] }).click();
    await page.getByLabel('Time', { exact: true }).fill('08:00');
    await page.getByLabel('Schedule TV').selectOption({ label: 'Living room' });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText(`Saved ${name}`);

    // Saved: a fresh load shows the order, the modes, loop and the schedule.
    await page.reload();
    await expect(titles.locator('.qrow .t')).toHaveText(['Rocket Pals', 'Bubble Bakery', 'Night Harbor']);
    await expect(page.getByRole('button', { name: 'How much Rocket Pals: 45 min' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Loop' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'Schedule' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('main')).toContainText(`Scheduled ${DAY_PLURAL[SCHEDULE_DAY]} 8:00 AM · Living room`);
    await expect(page.getByRole('main')).toContainText('Loop');

    await tab(page, 'Settings');
    await page.getByRole('link', { name: /Activity history/ }).click();
    const changes = page.getByLabel('Changes');
    await expect(changes).toContainText(`Made the playlist ${name}`);
    await expect(changes).toContainText(`Added Night Harbor to the playlist ${name} (3 episodes)`);
    await expect(changes).toContainText(`Edited the playlist ${name}: loop on, schedule ${DAY_PLURAL[SCHEDULE_DAY]} 8:00 AM · Living room`);
  });

  test('same playlist on both TVs; Dashboard pause, resume and Send to (check 3)', async ({ page }, info) => {
    const name = `Cartoons ${P(info)}`;
    const before1 = (await calls(page, 1)).length;
    const before2 = (await calls(page, 2)).length;
    await openPlaylist(page, name);
    await pickTvs(page, ['Bedroom', 'Living room']);
    await page.getByRole('button', { name: 'Start on both TVs' }).click();
    await expect(page.getByRole('region', { name: 'Start' }).getByRole('status')).toHaveText(`Started ${name} on Bedroom and Living room`);
    expect(launchesOf((await calls(page, 1)).slice(before1))).toEqual(['/launch/12 81000001']);
    expect(launchesOf((await calls(page, 2)).slice(before2))).toEqual(['/launch/12 81000001']);

    await tab(page, 'Home');
    const living = page.getByRole('region', { name: 'Living room TV' });
    const bedroom = page.getByRole('region', { name: 'Bedroom TV' });
    await expect(living).toContainText('Rocket Pals');
    await expect(living).toContainText(`Netflix · ${name} · 1 of 3`);
    await expect(living).toContainText('Kid mode');
    await expect(bedroom).toContainText('Rocket Pals');
    await living.getByRole('button', { name: 'Pause' }).click();
    await expect(living.getByRole('status')).toHaveText(`Paused Rocket Pals (${name}) on Living room`);
    await living.getByRole('button', { name: 'Resume' }).click();
    await expect(living.getByRole('status')).toHaveText(`Resumed Rocket Pals (${name}) on Living room`);

    const sent2 = (await calls(page, 2)).length;
    const keys1 = (await calls(page, 1)).length;
    await living.getByRole('button', { name: 'Send to…' }).click();
    await living.getByRole('group', { name: 'Send Living room to' }).getByRole('button', { name: 'Send to Bedroom' }).click();
    await expect(living.getByRole('status').last()).toHaveText(`Sent ${name} from Living room to Bedroom`);
    await expect(living).toContainText('Paused');
    await expect(living).toContainText('Sent to Bedroom');
    expect(commandsOf((await calls(page, 1)).slice(keys1))).toEqual(['/keypress/Play']);
    expect(launchesOf((await calls(page, 2)).slice(sent2))).toEqual(['/launch/12 81000001']);
    await expect(bedroom).toContainText('Rocket Pals');
    await expect(bedroom).toContainText('Kid mode'); // the Living room profile went with it
  });

  test('Live queue: Show options, add, move, remove, skip; Night Harbor never reaches the kid TV', async ({ page }, info) => {
    const name = `Cartoons ${P(info)}`;
    await openPlaylist(page, name);
    await pickTvs(page, ['Living room']);
    await page.getByRole('button', { name: 'Start on Living room' }).click();
    await expect(page.getByRole('region', { name: 'Start' }).getByRole('status')).toHaveText(`Started ${name} on Living room`);

    await tab(page, 'Home');
    await page.getByRole('region', { name: 'Living room TV' }).getByRole('link', { name: 'Queue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Live queue' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'TV' }).getByRole('link', { name: 'Living room' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: 'Now playing' })).toContainText('Rocket Pals');
    const upNext = page.getByRole('region', { name: 'Up next' });
    await expect(upNext.locator('.qrow .t')).toHaveText(['Bubble Bakery']);
    await expect(page.locator('details')).toContainText('Did not play: not allowed for Kid placeholder');

    await upNext.getByRole('button', { name: 'Edit Bubble Bakery' }).click();
    const sheet = page.getByRole('dialog', { name: 'Show options' });
    await sheet.getByRole('radio', { name: 'Stay on show' }).click();
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('status').last()).toHaveText('Set Bubble Bakery to Stay on show in the Living room queue');
    await expect(upNext).toContainText('Hulu · Stay on show');

    await page.getByRole('button', { name: 'Add to queue' }).click();
    await page.getByLabel('Search titles to add').fill('snow');
    await page.getByLabel('Search titles to add').press('Enter');
    await page.getByRole('button', { name: 'Add Snow Pups' }).click();
    await expect(page.getByRole('status').last()).toHaveText('Added Snow Pups to the Living room queue (Whole movie)');
    await upNext.getByRole('button', { name: 'Move Snow Pups up' }).click();
    await expect(upNext.locator('.qrow .t')).toHaveText(['Snow Pups', 'Bubble Bakery']);
    await upNext.getByRole('button', { name: 'Remove Snow Pups' }).click();
    await expect(upNext.locator('.qrow .t')).toHaveText(['Bubble Bakery']);
    const before = (await calls(page, 1)).length;
    await page.getByRole('region', { name: 'Now playing' }).getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('region', { name: 'Now playing' })).toContainText('Bubble Bakery');
    expect(launchesOf((await calls(page, 1)).slice(before))).toEqual(['search Bubble Bakery']);

    await page.getByRole('group', { name: 'TV' }).getByRole('link', { name: 'Bedroom' }).click();
    await expect(page.getByRole('group', { name: 'TV' }).getByRole('link', { name: 'Bedroom' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('main')).toContainText('Nothing playing on Bedroom');
  });

  test('Remote: arrows, OK, volume, mute, pause, turn off; in Activity history', async ({ page }, info) => {
    const name = `Cartoons ${P(info)}`;
    await openPlaylist(page, name);
    await pickTvs(page, ['Living room']);
    await page.getByRole('button', { name: 'Start on Living room' }).click();
    await expect(page.getByRole('region', { name: 'Start' }).getByRole('status')).toHaveText(`Started ${name} on Living room`);
    await tab(page, 'Home');
    await page.getByRole('region', { name: 'Living room TV' }).getByRole('link', { name: 'Remote' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Living room' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Now playing' })).toContainText('Rocket Pals');
    const before = (await calls(page, 1)).length;
    await page.getByRole('button', { name: 'Up' }).click();
    await expect(page.getByRole('status')).toHaveText('Pressed Up on Living room (remote)');
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Pressed OK on Living room (remote)');
    await page.getByRole('button', { name: 'Vol +' }).click();
    await expect(page.getByRole('status')).toHaveText('Pressed Volume up on Living room (remote)');
    await page.getByRole('button', { name: 'Mute' }).click();
    await expect(page.getByRole('status')).toHaveText('Pressed Mute on Living room (remote)');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('status')).toHaveText(`Paused Rocket Pals (${name}) on Living room`);
    await expect(page.getByRole('button', { name: 'Send to Bedroom' })).toBeVisible();
    await page.getByRole('button', { name: 'Turn off TV' }).click();
    await expect(page.getByRole('status')).toHaveText('Pressed Turn off on Living room (remote) and stopped what it was playing');
    expect(commandsOf((await calls(page, 1)).slice(before))).toEqual([
      '/keypress/Up',
      '/keypress/Select',
      '/keypress/VolumeUp',
      '/keypress/VolumeMute',
      '/keypress/Play',
      '/keypress/PowerOff',
    ]);
    await tab(page, 'Settings');
    await page.getByRole('link', { name: /Activity history/ }).click();
    await expect(page.getByLabel('Changes')).toContainText('Pressed OK on Living room (remote)');
  });

  test('quick playlist: first pick asks to start; later picks append; Save as playlist (check 4)', async ({ page }, info) => {
    await page.request.delete('/api/quick');
    await tab(page, 'Browse');
    let d = await openTitle(page, info, 'Ocean Friends');
    await d.getByRole('button', { name: 'Start quick playlist' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Quick playlist' })).toBeVisible();
    const first = page.getByRole('region', { name: 'First title' });
    await expect(first).toContainText('Ocean Friends');
    await expect(first).toContainText('Start now?');
    await first.getByRole('link', { name: 'Keep adding' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Browse' })).toBeVisible();

    d = await openTitle(page, info, 'Puddle Jumpers');
    await d.getByRole('button', { name: 'Add to quick playlist' }).click();
    await expect(d.getByRole('status').last()).toHaveText('Added Puddle Jumpers to the quick playlist');
    await d.getByRole('link', { name: 'Open the quick playlist' }).click();
    await expect(page.getByRole('region', { name: 'Up next' })).toContainText('Puddle Jumpers');
    await first.getByLabel('TV').selectOption({ label: 'Living room' });
    const before = (await calls(page, 1)).length;
    await first.getByRole('button', { name: 'Start on Living room' }).click();
    await expect(page.getByRole('status')).toHaveText('Started the quick playlist on Living room');
    await expect(first).toContainText('Playing on Living room');
    expect(launchesOf((await calls(page, 1)).slice(before))).toEqual(['search Ocean Friends']);

    await page.getByRole('link', { name: 'Add another title' }).click();
    d = await openTitle(page, info, 'Bubble Bakery');
    await d.getByRole('button', { name: 'Add to quick playlist' }).click();
    await expect(d.getByRole('status').last()).toHaveText('Added Bubble Bakery to the quick playlist (playing on Living room)');
    await d.getByRole('link', { name: 'Open the quick playlist' }).click();
    await expect(page.getByRole('region', { name: 'Up next' }).locator('.qrow .t')).toHaveText(['Puddle Jumpers', 'Bubble Bakery']);
    await first.getByRole('link', { name: 'Live queue' }).click();
    await expect(page.getByRole('region', { name: 'Up next' }).locator('.qrow .t')).toHaveText(['Puddle Jumpers', 'Bubble Bakery']);
    await page.getByRole('link', { name: 'Back' }).click();

    await tab(page, 'Playlists');
    await page.getByRole('link', { name: 'Quick playlist' }).click();
    const save = page.getByRole('region', { name: 'Save as playlist' });
    await save.getByLabel('Playlist name').fill(`Quick ${P(info)}`);
    await save.getByRole('button', { name: 'Save as playlist' }).click();
    await expect(page.getByRole('status')).toHaveText(`Saved as the playlist Quick ${P(info)}`);
    await tab(page, 'Playlists');
    await expect(page.getByRole('link', { name: `Playlist Quick ${P(info)}` })).toContainText('3 titles');
  });

  test('a failed launch shows a message and the next title starts (check 5)', async ({ page }, info) => {
    const name = `Fails ${P(info)}`;
    const made = (await (await page.request.post('/api/playlists', { data: { name } })).json()) as { playlist: { id: number } };
    for (const titleKey of ['tv-9101', 'tv-9201']) expect((await page.request.post(`/api/playlists/${made.playlist.id}/items`, { data: { titleKey } })).status()).toBe(201);
    expect((await page.request.post('http://127.0.0.1:18061/fail?channels=13')).status()).toBe(200); // Prime Video will not start
    try {
      await openPlaylist(page, name);
      await pickTvs(page, ['Living room']);
      await page.getByRole('button', { name: 'Start on Living room' }).click();
      await expect(page.getByRole('region', { name: 'Start' }).getByRole('status')).toHaveText(`Started ${name} on Living room`);
      await tab(page, 'Home');
      const living = page.getByRole('region', { name: 'Living room TV' });
      await expect(living).toContainText('Could not start Puddle Jumpers on Living room: the TV did not start it. Moved to the next title.');
      await expect(living).toContainText('Bubble Bakery');
      await expect(living).toContainText(`Hulu · ${name} · 2 of 2`);
    } finally {
      await page.request.post('http://127.0.0.1:18061/fail?channels=');
    }
  });
});

test.describe('Guest PIN', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, GUEST);
    await stopAll(page);
  });

  test('Playlists for a kid profile, start, Dashboard and Live queue controls; Adult entry points absent and refused', async ({ page }, info) => {
    const name = `Cartoons ${P(info)}`;
    await tab(page, 'Playlists');
    await expect(page.getByRole('link', { name: 'New playlist' })).toHaveCount(0);
    await expect(page.getByLabel('Showing for').locator('option')).toHaveText([KID]);
    await expect(page.getByRole('link', { name: `Playlist Fails ${P(info)}` })).toBeVisible();
    await page.getByRole('link', { name: `Playlist ${name}`, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const playlistId = Number(new URL(page.url()).pathname.split('/')[2]);
    const titles = page.getByRole('region', { name: 'Titles' });
    await expect(titles.locator('.qrow .t')).toHaveText(['Rocket Pals', 'Bubble Bakery']);
    await expect(page.getByRole('main')).toContainText('1 more not shown for this profile.');
    await expect(page.getByRole('link', { name: 'Edit playlist' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Start' }).getByLabel('Profile').locator('option')).toHaveText([`${KID} (Kid)`]);
    await pickTvs(page, ['Living room']);
    await page.getByRole('button', { name: 'Start on Living room' }).click();
    await expect(page.getByRole('region', { name: 'Start' }).getByRole('status')).toHaveText(`Started ${name} on Living room`);

    await tab(page, 'Home');
    const living = page.getByRole('region', { name: 'Living room TV' });
    await expect(living).toContainText('Rocket Pals');
    await expect(living.getByRole('link', { name: 'Remote' })).toHaveCount(0);
    await expect(living.getByRole('button', { name: 'Send to…' })).toHaveCount(0);
    await living.getByRole('button', { name: 'Pause' }).click();
    await expect(living.getByRole('status')).toHaveText(`Paused Rocket Pals (${name}) on Living room`);
    await living.getByRole('link', { name: 'Queue' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Live queue' })).toBeVisible();
    const upNext = page.getByRole('region', { name: 'Up next' });
    await expect(upNext).toContainText('Bubble Bakery');
    await expect(upNext.getByRole('button')).toHaveCount(0); // no Edit, move or remove
    await expect(page.getByRole('button', { name: 'Add to queue' })).toHaveCount(0);
    await page.getByRole('region', { name: 'Now playing' }).getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('region', { name: 'Now playing' })).toContainText('Bubble Bakery');

    const ids = await tvIds(page);
    for (const path of ['/playlists/new', `/playlists/${playlistId}/edit`, `/tvs/${ids['Living room']}/remote`]) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(`${path} ${res.status()}`).toBe(`${path} 403`);
    }
    for (const [method, path, data] of [
      ['POST', `/api/tvs/${ids['Living room']}/remote`, { key: 'Select' }],
      ['POST', `/api/tvs/${ids['Living room']}/send`, { toTvId: ids.Bedroom }],
      ['POST', `/api/tvs/${ids['Living room']}/queue`, { action: 'add', titleKey: 'tv-9001' }],
      ['PATCH', `/api/playlists/${playlistId}`, { name: 'x' }],
      ['POST', '/api/quick/save', { name: 'x' }],
    ] as const) {
      const res = await page.request.fetch(path, { method, data });
      expect(`${method} ${path} ${res.status()}`).toBe(`${method} ${path} 403`);
    }
    // The hub refuses the Guest PIN a playlist list for an adult profile, or with no profile.
    expect((await page.request.get('/api/playlists')).status()).toBe(403);
  });

  test('quick playlist for the kid profile; Add to playlist and Save as playlist absent', async ({ page }, info) => {
    expect((await page.request.delete('/api/quick')).status()).toBe(200);
    await tab(page, 'Browse');
    const d = await openTitle(page, info, 'Rocket Pals');
    await expect(d.getByRole('button', { name: 'Add to playlist' })).toHaveCount(0);
    await d.getByRole('button', { name: 'Start quick playlist' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Quick playlist' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Save as playlist' })).toHaveCount(0);
    const first = page.getByRole('region', { name: 'First title' });
    await first.getByLabel('TV').selectOption({ label: 'Living room' });
    await first.getByRole('button', { name: 'Start on Living room' }).click();
    await expect(page.getByRole('status')).toHaveText('Started the quick playlist on Living room');
    await tab(page, 'Home');
    const living = page.getByRole('region', { name: 'Living room TV' });
    await expect(living).toContainText(`Rocket Pals`);
    await expect(living).toContainText('Quick playlist');
    await expect(living).toContainText('Kid mode');
    await living.getByRole('button', { name: 'Stop' }).click();
    await expect(living.getByRole('status').last()).toHaveText('Stopped Quick playlist on Living room');
    await tab(page, 'Playlists');
    await page.getByRole('link', { name: 'Quick playlist' }).click();
    await page.getByRole('button', { name: 'Clear quick playlist' }).click();
    await expect(page.getByRole('status')).toHaveText('Cleared the quick playlist');
  });
});
