// PP4 browser checks, at phone width (project kid-phone) and desktop width (kid-desktop), against the production
// build and the fake Roku (Living room, 18060):
// 6. every new screen and button is reached by clicking from the app's own menus with each PIN: the profile editor's
//    safeguards, Profiles' kid tools (Earn time tasks, Requests, Watch log, Alerts), the Dashboard requests area and
//    the profile on each TV. For the Guest PIN the entry points are absent and the pages and routes refuse.
// And, end to end on the running hub: a kid's request from the TV (the channel API) answered in the app, a task
// marked done, and a real snap back (the fake Roku switched to Hulu in kid mode comes back, with an alert).
// The time rules themselves run on a fake clock in test/unit/safeguards.test.ts (checks 1, 2, 5) and
// test/unit/kid-api.test.ts (checks 3, 4).
import { expect, request as pwRequest, test, type Page, type TestInfo } from '@playwright/test';
import { ADULT, GUEST, signIn, tab } from './helpers';

const KID = 'Kid placeholder'; // made by tvs.spec.ts
const BASE = 'http://127.0.0.1:3100';
const FAKE = 'http://127.0.0.1:18061';
const P = (info: TestInfo) => (info.project.name === 'kid-desktop' ? 'desktop' : 'phone');

async function tvIds(page: Page): Promise<Record<string, number>> {
  const r = (await (await page.request.get('/api/tvs')).json()) as { tvs: { id: number; name: string }[] };
  return Object.fromEntries(r.tvs.map((t) => [t.name, t.id]));
}

/** The Roku channel for the Living room TV (PP6 later): a fresh channel token made with the Adult PIN. */
async function channelFor(page: Page) {
  const id = (await tvIds(page))['Living room'];
  const token = (await (await page.request.post(`/api/tvs/${id}/channel-token`)).json()).token as string;
  return pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
}

/** Set the profile on the Living room TV from the Dashboard's own picker. */
async function pickProfile(page: Page, label: string) {
  const card = page.getByRole('region', { name: 'Living room TV' });
  await card.getByLabel('Profile on Living room').selectOption({ label });
  await expect(card.getByRole('status').filter({ hasText: 'Switched Living room to' })).toBeVisible();
}

test.describe('Adult PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, ADULT));

  test('profile editor: every kid safeguard, saved and read back; logged', async ({ page }) => {
    await tab(page, 'Profiles');
    await page.getByRole('link', { name: `Edit ${KID}` }).click();
    await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();
    for (const region of ['Allowed ratings', 'Daily screen time', 'Viewing hours', 'When time runs out', 'Bedtime wind-down', 'Guardrails', 'Earn more time', 'Blocked titles'])
      await expect(page.getByRole('region', { name: region })).toBeVisible();
    const ratings = page.getByRole('region', { name: 'Allowed ratings' });
    await expect(ratings.getByRole('button', { name: 'TV-Y', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(ratings.getByRole('button', { name: 'PG-13' })).toHaveAttribute('aria-pressed', 'false');
    // Set a known state: PG on, warning 6 min, wind-down 20 min, Moon Camp blocked.
    const pg = ratings.getByRole('button', { name: 'PG', exact: true });
    if ((await pg.getAttribute('aria-pressed')) === 'false') await pg.click();
    /** Step a stepper to a value with its own − and + buttons. */
    async function stepTo(region: string, label: string, want: number) {
      const r = page.getByRole('region', { name: region });
      const v = r.getByLabel(label, { exact: true });
      for (let i = 0; i < 40; i++) {
        const n = Number((await v.textContent())?.split(' ')[0]);
        if (n === want) return;
        await r.getByRole('button', { name: `${n < want ? 'More' : 'Less'} ${label}` }).click();
      }
      throw new Error(`${label} did not reach ${want}`);
    }
    await stepTo('When time runs out', 'warning', 6);
    await stepTo('Bedtime wind-down', 'wind-down length', 20);
    // tvs.spec.ts gave the test kid 12 hours every day: one "Mon to Thu" row.
    await expect(page.getByRole('region', { name: 'Daily screen time' }).getByLabel('Mon to Thu screen time', { exact: true })).toHaveText('12 hr');
    const blocked = page.getByRole('region', { name: 'Blocked titles' });
    if ((await blocked.getByRole('button', { name: 'Unblock Moon Camp' }).count()) === 0) {
      await blocked.getByLabel('Find a title to block').fill('Moon');
      await blocked.getByRole('button', { name: 'Find' }).click();
      await blocked.getByRole('button', { name: 'Block Moon Camp' }).click();
    }
    await expect(blocked.getByRole('button', { name: 'Unblock Moon Camp' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Snap back to playlist' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible();

    // Read back from the hub by opening the editor again.
    await page.getByRole('link', { name: `Edit ${KID}` }).click();
    await expect(page.getByRole('region', { name: 'Allowed ratings' }).getByRole('button', { name: 'PG', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'When time runs out' }).getByLabel('warning', { exact: true })).toHaveText('6 min');
    await expect(page.getByRole('region', { name: 'Bedtime wind-down' }).getByLabel('wind-down length', { exact: true })).toHaveText('20 min');
    await expect(page.getByRole('region', { name: 'Blocked titles' })).toContainText('Moon Camp');
    // The hub applies it: Moon Camp is gone from Browse for the kid.
    const browse = await (await page.request.get(`/api/catalog/browse?service=netflix&profile=${page.url().split('/').pop()}`)).json();
    expect(browse.rows.flatMap((r: { titles: { name: string }[] }) => r.titles.map((t) => t.name))).not.toContain('Moon Camp');
    // Unblock again (later tests and the other width start from the same state).
    await page.getByRole('region', { name: 'Blocked titles' }).getByRole('button', { name: 'Unblock Moon Camp' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible();

    await tab(page, 'Settings');
    await page.getByRole('link', { name: /Activity history/ }).click();
    await expect(page.getByLabel('Changes')).toContainText(`Changed ${KID}'s safeguards`);
  });

  test('Profiles: kid time bar and the kid tools; Earn time tasks: new task with a picture, mark done', async ({ page }, info) => {
    await tab(page, 'Profiles');
    const kidCard = page.getByRole('link', { name: `Edit ${KID}` });
    await expect(kidCard.getByRole('progressbar', { name: `${KID} time left today` })).toBeVisible();
    const tools = page.getByRole('navigation', { name: 'Kid tools' });
    for (const t of ['Earn time tasks', 'Requests', 'Watch log', 'Alerts']) await expect(tools.getByRole('link', { name: new RegExp(`^${t}`) })).toBeVisible();
    await tools.getByRole('link', { name: /^Earn time tasks/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Earn time tasks' })).toBeVisible();
    const task = `Pick up toys ${P(info)}`;
    const form = page.getByRole('form', { name: 'New task' });
    await form.getByLabel('Task').fill(task);
    await form.getByRole('radio', { name: '15 min' }).click();
    await form.getByRole('radio', { name: 'Toys' }).click();
    await form.getByRole('button', { name: 'Add task' }).click();
    await expect(page.getByRole('status')).toHaveText(`Added ${task} (+15 min)`);
    await page.getByRole('group', { name: 'Kid' }).getByRole('button', { name: KID }).click();
    const bonus = page.getByRole('region', { name: 'Bonus this week' });
    const before = Number((await bonus.locator('.t').textContent())?.split(' ')[0]);
    const row = page.getByRole('group', { name: task });
    await expect(row).toContainText('🧸');
    await row.getByRole('button', { name: 'Mark done' }).click();
    await expect(page.getByRole('status')).toHaveText(`Marked ${task} done for ${KID}: +15 min`);
    await expect(row.getByText('Approved')).toBeVisible();
    await expect(bonus).toContainText(`${before + 15} of 60 min`);
    await expect(bonus).toContainText('Weekly cap resets Monday');
  });

  test('kid mode, a request from the TV approved on the Dashboard, one denied on Requests; snap back with an alert', async ({ page }, info) => {
    await tab(page, 'Home');
    // Put the Living room TV in kid mode from its own picker (first out of it, so the change always happens).
    await pickProfile(page, 'No profile');
    await pickProfile(page, `${KID} (Kid)`);
    const card = page.getByRole('region', { name: 'Living room TV' });
    await expect(card).toContainText('Kid mode');
    await expect(card.getByRole('progressbar', { name: `${KID} time left today` })).toBeVisible();

    // The kid asks for 20 more minutes on the TV (the Roku channel's call).
    const ch = await channelFor(page);
    const kidScreen = await (await ch.get('/api/channel/kid')).json();
    expect(kidScreen.kidMode).toBe(true);
    const ask = await ch.post('/api/channel/requests', { data: { kind: 'time', minutes: 20 } });
    expect(ask.status()).toBe(201);
    await page.reload();
    const reqs = page.getByRole('region', { name: 'Requests' });
    const r = reqs.getByRole('group', { name: `${KID} wants 20 more min` });
    await expect(r).toContainText('Living room');
    await r.getByRole('button', { name: 'Approve' }).click();
    await expect(reqs.getByRole('status')).toHaveText(`Approved ${KID}'s request: 20 more min (+20 min)`);
    const after = await (await ch.get('/api/channel/kid')).json();
    expect(after.time.bonusMin).toBe(kidScreen.time.bonusMin + 20);

    // Another, denied on the Requests screen (Profiles > Requests).
    expect((await ch.post('/api/channel/requests', { data: { kind: 'time', minutes: 15 } })).status()).toBe(201);
    await tab(page, 'Profiles');
    await page.getByRole('navigation', { name: 'Kid tools' }).getByRole('link', { name: /^Requests/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Requests' })).toBeVisible();
    await page.getByRole('group', { name: `${KID} wants 15 more min` }).getByRole('button', { name: 'Deny' }).click();
    await expect(page.getByRole('status')).toHaveText(`Denied ${KID}'s request: 15 more min`);
    const earlier = page.getByRole('region', { name: 'Earlier today' });
    await expect(earlier).toContainText('Denied by Adult PIN');
    await expect(earlier).toContainText('Approved by Adult PIN');
    expect((await (await ch.get('/api/channel/kid')).json()).time.bonusMin).toBe(after.time.bonusMin);

    // Snap back on the running hub: the kid presses the Hulu button; Popcorn Pilot comes back within 5 s. First wait
    // until the watcher asks the TV which app is on (after the hub's own launch has had its few seconds to land).
    const n0 = ((await (await page.request.get(`${FAKE}/calls`)).json()) as { path: string }[]).length;
    await expect
      .poll(async () => ((await (await page.request.get(`${FAKE}/calls`)).json()) as { path: string }[]).slice(n0).some((c) => c.path === '/query/active-app'), { timeout: 15_000, intervals: [250] })
      .toBe(true);
    await page.request.post(`${FAKE}/app?id=2285&name=Hulu`);
    await expect.poll(async () => (await (await page.request.get(`${FAKE}/state`)).json()).activeApp.id, { timeout: 5_000, intervals: [250] }).toBe('dev');
    await page.getByRole('link', { name: 'Back' }).click();
    await page.getByRole('navigation', { name: 'Kid tools' }).getByRole('link', { name: /^Alerts/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alerts' })).toBeVisible();
    const today = page.getByRole('region', { name: 'Today' });
    await expect(today.getByRole('article', { name: 'Opened Hulu' }).first()).toContainText('back to Popcorn Pilot');
    await page.getByRole('group', { name: 'TV' }).getByRole('button', { name: 'Bedroom' }).click();
    await expect(page.getByRole('article', { name: 'Opened Hulu' })).toHaveCount(0);
    await page.getByRole('group', { name: 'TV' }).getByRole('button', { name: 'Living room' }).click();
    await expect(page.getByRole('article', { name: 'Opened Hulu' }).first()).toBeVisible();

    // The Dashboard shows today's alerts too.
    await tab(page, 'Home');
    await expect(page.getByRole('region', { name: 'Alerts' })).toContainText('today');
    // Leave kid mode (the other tests use the Living room TV in adult use).
    await pickProfile(page, 'No profile');
    await expect(page.getByRole('region', { name: 'Living room TV' })).not.toContainText('Kid mode');
    await ch.dispose();
    expect(P(info)).toBeTruthy();
  });

  test('Watch log: the week, the day by day chart, and the titles', async ({ page }) => {
    await tab(page, 'Profiles');
    await page.getByRole('navigation', { name: 'Kid tools' }).getByRole('link', { name: /^Watch log/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Watch log' })).toBeVisible();
    await page.getByRole('group', { name: 'Kid' }).getByRole('button', { name: KID }).click();
    const week = page.getByRole('region', { name: 'Week' });
    await expect(week).toContainText('This week');
    await expect(week).toContainText('Limit');
    await expect(week.getByRole('img', { name: /^Minutes by day: Mon \d+, Tue \d+/ })).toBeVisible();
    // The PP2 and PP3 browser tests played titles for this kid today.
    await expect(page.getByRole('region', { name: 'Today' })).toContainText('Living room');
    await expect(page.getByText("Times are approximate. Streaming apps don't report exact playback.")).toBeVisible();
    await week.getByRole('button', { name: 'Previous week' }).click();
    await expect(week).toContainText('Week of');
    await expect(page.getByText('Nothing watched this week.')).toBeVisible();
  });
});

test.describe('Guest PIN', () => {
  test.beforeEach(async ({ page }) => signIn(page, GUEST));

  test('switches a TV to a kid profile only; no requests, alerts or kid tools; those pages and routes refuse', async ({ page }) => {
    await tab(page, 'Home');
    await expect(page.getByRole('region', { name: 'Requests' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Alerts' })).toHaveCount(0);
    const card = page.getByRole('region', { name: 'Living room TV' });
    const picker = card.getByLabel('Profile on Living room');
    const options = await picker.locator('option').allTextContents();
    expect(options.filter((o) => o !== 'Pick a kid profile').every((o) => o.endsWith('(Kid)'))).toBe(true);
    expect(options).not.toContain('No profile');
    await pickProfile(page, `${KID} (Kid)`);
    await expect(card).toContainText('Kid mode');
    await expect(card.getByRole('progressbar', { name: `${KID} time left today` })).toBeVisible();
    // The hub refuses the Guest PIN taking a TV out of kid mode, whatever the page shows.
    const id = (await tvIds(page))['Living room'];
    expect((await page.request.post(`/api/tvs/${id}/profile`, { data: { profileId: null } })).status()).toBe(403);
    // Kid tools: no Profiles tab; the pages and routes refuse.
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profiles', exact: true })).toHaveCount(0);
    for (const path of ['/profiles/requests', '/profiles/alerts', '/profiles/tasks', '/profiles/watch-log']) {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(`${path} ${res.status()}`).toBe(`${path} 403`);
    }
    for (const path of ['/api/requests', '/api/alerts', '/api/tasks']) {
      const res = await page.request.get(path);
      expect(`${path} ${res.status()}`).toBe(`${path} 403`);
    }
    expect((await page.request.post('/api/requests/1', { data: { decision: 'approve' } })).status()).toBe(403);

    // Clean up with the Adult PIN: the Living room TV back to adult use.
    const adult = await pwRequest.newContext({ baseURL: BASE });
    expect((await adult.post('/api/auth/pin', { data: { pin: ADULT } })).status()).toBe(200);
    expect((await adult.post(`/api/tvs/${id}/profile`, { data: { profileId: null } })).status()).toBe(200);
    await adult.dispose();
  });
});
