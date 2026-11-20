// PP4 kid safeguards enforced on the hub, against fake Rokus and a fake clock (local time):
// check 1: limit by day, viewing hours, the warning at the set time, the stop at the episode boundary nearest the
//          limit, then the TV turns off;
// check 2: snap back: the fake Roku switches to Hulu (not launched by the hub) in kid mode; the hub relaunches within
//          5 s and records an alert. In adult mode nothing happens;
// check 5: wind-down plays only calm titles and steps the volume down on the fake Roku;
// and the watch log, the time bar color, and kid "Play on a TV" running under the kid rules.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDataDir } from './helpers';
import { getDb } from '@/lib/db';
import { createProfile } from '@/lib/profiles';
import { listActivity } from '@/lib/activity';
import { EVERYONE, viewerForProfile } from '@/lib/catalog';
import { appendItem, createPlaylist, titleFields } from '@/lib/playlists';
import { control, setClockForTests, snapBackRelaunch, startPlaylist, startTitle, switchProfile, tick, tvView, type Actor } from '@/lib/playback';
import { barColor, kidRules, listAlerts, timeStatus, updateRules, watchWeek } from '@/lib/safeguards';
import { resetSnapBackForTests, snapBackPass, startSnapBackWatcher, stopSnapBackWatcher } from '@/lib/snapback';
import { tvState } from '@/lib/tvstate';
import { getTv } from '@/lib/tvs';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

const ADULT: Actor = { pinType: 'adult', device: 'Computer' };
const GUEST: Actor = { pinType: 'guest', device: 'iPhone' };
const MIN = 60_000;
const SEC = 1_000;

let T = 0;
let roku1: FakeRoku;
let roku2: FakeRoku;
let tv1: number;
let tv2: number;
let kid: number;
let grown: number;

const RP = 'tv-9001'; // Rocket Pals, Netflix, 22 min episodes, direct link 12:81000001
const OF = 'tv-9002'; // Ocean Friends, Netflix, 11 min episodes
const GB = 'tv-9005'; // Garden Bugs, Netflix, 12 min episodes
const BB = 'tv-9201'; // Bubble Bakery, Hulu, 11 min episodes

/** A local time: 2026-11-16 is a Monday. */
function local(day: number, h: number, m = 0, s = 0): number {
  return new Date(2026, 10, day, h, m, s).getTime();
}

function launches(r: FakeRoku): string[] {
  return r.calls
    .filter((c) => c.method === 'POST' && (c.path.startsWith('/launch/') || c.path === '/search/browse'))
    .map((c) => (c.path === '/search/browse' ? `search:${c.query['provider-id']}:${c.query.keyword}` : `${c.path.slice(8)}:${c.query.contentId ?? ''}`));
}

function keys(r: FakeRoku): string[] {
  return r.calls.filter((c) => c.path.startsWith('/keypress/')).map((c) => c.path.slice('/keypress/'.length));
}

async function playlist(name: string, items: { key: string; mode?: string; episodes?: number }[]) {
  const p = createPlaylist({ name });
  for (const it of items) appendItem(p.id, await titleFields(EVERYONE, it.key, undefined, { mode: it.mode ?? 'stay', episodes: it.episodes }));
  return p.id;
}

function live(tvId: number) {
  return tvView(getTv(tvId)!, T).playback;
}

async function at(ms: number) {
  T = ms;
  return tick();
}

function alertsOf(kind: string) {
  return listAlerts().filter((a) => a.kind === kind);
}

const RULES = {
  allowedRatings: ['TV-Y', 'TV-Y7', 'TV-G', 'G'],
  dailyLimits: { mon: 60, tue: 50, wed: 60, thu: 60, fri: 90, sat: 120, sun: 120 },
  hoursStart: '07:00',
  hoursEnd: '19:30',
  warningMinutes: 5,
  finishEpisode: true,
  windDown: false,
  windDownMinutes: 15,
  snapBack: true,
  alertOnSnapBack: true,
  canAskForTime: true,
  weeklyBonusCap: 60,
};

beforeAll(async () => {
  freshDataDir();
  setClockForTests(() => T);
  roku1 = await startFakeRoku({ name: 'Living room' });
  roku2 = await startFakeRoku({ name: 'Guest room' });
  kid = createProfile({ name: 'Kid one', color: '#7FC8A9', type: 'kid' }).id;
  grown = createProfile({ name: 'Family', color: '#FFC94A', type: 'adult' }).id;
  const ins = getDb().prepare('INSERT INTO tvs (name, room, address, port, online) VALUES (?, ?, ?, ?, 1)');
  tv1 = Number(ins.run('Living room', 'Living room', '127.0.0.1', roku1.port).lastInsertRowid);
  tv2 = Number(ins.run('Guest room', 'Guest room', '127.0.0.1', roku2.port).lastInsertRowid);
});

beforeEach(async () => {
  updateRules(kid, RULES);
  T = Math.max(T, local(1, 6)); // every test sets its own time; stop what the last one left
  for (const tv of [tv1, tv2]) if (live(tv)) await control(ADULT, tv, 'stop');
  for (const r of [roku1, roku2]) {
    r.calls.length = 0;
    r.state.power = 'on';
    r.state.activeApp = { id: null, name: 'Roku' };
  }
  getDb().prepare('DELETE FROM alerts').run();
  getDb().prepare('DELETE FROM tv_state').run();
  resetSnapBackForTests();
});

afterAll(async () => {
  stopSnapBackWatcher();
  setClockForTests(null);
  await roku1?.close();
  await roku2?.close();
});

describe('check 1: limit by day, viewing hours, warning, episode aware stop, TV off', () => {
  it('Monday (60 min): warning at 5 min left; Rocket Pals (22 min episodes) stops at 66 min, the boundary nearest 60; TV off', async () => {
    const t0 = local(16, 10); // Monday 10:00
    T = t0;
    const s0 = timeStatus(kidRules(kid)!, T);
    expect([s0.limitMin, s0.leftMin, s0.percent]).toEqual([60, 60, 100]);
    const id = await playlist('Cartoons', [{ key: RP }]);
    await startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid });
    expect(launches(roku1)).toEqual(['12:81000001']);
    expect(tvView(getTv(tv1)!, T).profile).toEqual({ id: kid, name: 'Kid one', kid: true }); // kid mode
    await at(t0 + 22 * MIN + 10 * SEC);
    await at(t0 + 44 * MIN + 10 * SEC); // boundary at 44: 16 min left, nearer the next boundary (66) than this one
    expect(live(tv1)?.state).toBe('playing');
    await at(t0 + 54 * MIN + 50 * SEC);
    expect(alertsOf('time_warning')).toHaveLength(0);
    await at(t0 + 55 * MIN); // the set time: 5 min left
    expect(alertsOf('time_warning').map((a) => `${a.title} · ${a.detail}`)).toEqual(['5 minutes left · Kid one · Living room']);
    await at(t0 + 60 * MIN + 15 * SEC); // the limit: the episode finishes
    expect(live(tv1)?.state).toBe('playing');
    expect(keys(roku1)).not.toContain('PowerOff');
    expect(timeStatus(kidRules(kid)!, T).leftMin).toBe(0);
    await at(t0 + 65 * MIN + 50 * SEC);
    expect(live(tv1)?.state).toBe('playing');
    await at(t0 + 66 * MIN + 10 * SEC); // the episode boundary at 66: time is up
    expect(live(tv1)).toBeNull();
    expect(keys(roku1)).toEqual(['PowerOff']);
    expect(roku1.state.power).toBe('standby');
    expect(alertsOf('time_up').map((a) => `${a.title} · ${a.detail}`)).toEqual(['Time is up · Finished Rocket Pals, TV turned off · Kid one · Living room']);
    expect(tvView(getTv(tv1)!, T).lastMessage).toBe('Time is up for Kid one. The TV was turned off.');
    expect(alertsOf('time_warning')).toHaveLength(1); // warned once
    // Time is up for today: another start is refused on the hub.
    await expect(startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid })).rejects.toThrow('No time left today for Kid one.');
    // The watch log has it (approximate minutes).
    const w = watchWeek(kid, T);
    expect(w.entries[0].items.map((e) => `${e.name} · ${e.episodes} · ${e.service} · ${e.tvName} · ${e.minutes} min`)).toEqual(['Rocket Pals · 3 episodes · Netflix · Living room · 66 min']);
    expect(w.days.find((d) => d.day === 'mon')?.minutes).toBe(66);
  });

  it('Tuesday (50 min): the nearest boundary is before the limit (44 min), so it stops there', async () => {
    const t0 = local(17, 10);
    T = t0;
    expect(timeStatus(kidRules(kid)!, T).limitMin).toBe(50);
    const id = await playlist('Tuesday', [{ key: RP }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: kid });
    await at(t0 + 22 * MIN + 10 * SEC);
    await at(t0 + 43 * MIN);
    expect(live(tv1)?.state).toBe('playing');
    await at(t0 + 44 * MIN + 10 * SEC); // 6 min left at this boundary: nearer than the next one (66)
    expect(live(tv1)).toBeNull();
    expect(keys(roku1)).toEqual(['PowerOff']);
  });

  it('Friday (90 min) gives a longer day than Monday: stops at 88 min', async () => {
    const t0 = local(20, 10);
    T = t0;
    expect(timeStatus(kidRules(kid)!, T).limitMin).toBe(90);
    const id = await playlist('Friday', [{ key: RP }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: kid });
    for (const m of [22, 44, 66]) await at(t0 + m * MIN + 10 * SEC);
    expect(live(tv1)?.state).toBe('playing');
    await at(t0 + 88 * MIN + 10 * SEC);
    expect(live(tv1)).toBeNull();
  });

  it('a start outside viewing hours is refused and alerted; viewing hours ending stops at the nearest boundary', async () => {
    T = local(18, 6, 30); // Wednesday 6:30 AM, before 7:00
    const id = await playlist('Early', [{ key: RP }]);
    await expect(startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid })).rejects.toThrow("Outside Kid one's viewing hours (7:00 AM to 7:30 PM).");
    expect(launches(roku1)).toEqual([]);
    expect(alertsOf('outside_hours').map((a) => `${a.title} · ${a.detail}`)).toEqual(['Outside viewing hours · Kid one · blocked a start at 6:30 AM · Living room']);
    // Kid "Play on a TV" is refused the same way.
    await expect(startTitle(GUEST, viewerForProfile(kid)!, { tvId: tv1, titleKey: RP })).rejects.toThrow("Outside Kid one's viewing hours");
    // 7:00 PM with plenty of time left: the hours end at 7:30, nearest boundary 7:22.
    const t0 = local(18, 19);
    T = t0;
    await startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid });
    await at(t0 + 21 * MIN);
    expect(live(tv1)?.state).toBe('playing');
    await at(t0 + 22 * MIN + 10 * SEC);
    expect(live(tv1)).toBeNull();
    expect(alertsOf('time_up').map((a) => a.title)).toEqual(['Viewing hours ended']);
    expect(keys(roku1)).toEqual(['PowerOff']);
  });

  it('with "finish the current episode" off, the stop is at the limit itself (mid episode)', async () => {
    updateRules(kid, { finishEpisode: false });
    const t0 = local(23, 10); // Monday, 60 min
    T = t0;
    const id = await playlist('Strict', [{ key: RP }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: kid });
    await at(t0 + 59 * MIN + 50 * SEC);
    expect(live(tv1)?.state).toBe('playing');
    await at(t0 + 60 * MIN + 5 * SEC);
    expect(live(tv1)).toBeNull();
    expect(keys(roku1)).toEqual(['PowerOff']);
  });

  it('an adult profile has no limits (control)', async () => {
    const t0 = local(24, 6); // Tuesday 6:00 AM, outside the kid's hours
    T = t0;
    const id = await playlist('Grown', [{ key: RP }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: grown });
    await at(t0 + 5 * 60 * MIN);
    expect(live(tv1)?.state).toBe('playing');
    expect(keys(roku1)).toEqual([]);
    expect(listAlerts()).toHaveLength(0);
  });

  it('the time bar fades green to yellow to red', () => {
    expect(barColor(100)).toBe('hsl(120, 72%, 42%)');
    expect(barColor(50)).toBe('hsl(60, 72%, 42%)');
    expect(barColor(0)).toBe('hsl(0, 72%, 42%)');
  });

  it('kid "Play on a TV" runs under the kid rules: counted, warned and stopped', async () => {
    const t0 = local(30, 10); // Monday, 60 min
    T = t0;
    const r = await startTitle(GUEST, viewerForProfile(kid)!, { tvId: tv1, titleKey: OF });
    expect(r).toEqual({ tvName: 'Living room', service: 'netflix', route: 'search', name: 'Ocean Friends' });
    expect(live(tv1)?.name).toBe('Ocean Friends');
    for (let m = 11; m <= 44; m += 11) await at(t0 + m * MIN + 10 * SEC);
    expect(live(tv1)?.state).toBe('playing');
    // 11 min episodes: the boundary at 55 is 5 min from the limit (60), the one at 66 is 6 min: it stops at 55.
    await at(t0 + 55 * MIN + 10 * SEC);
    expect(live(tv1)).toBeNull();
    expect(alertsOf('time_warning')).toHaveLength(1);
    expect(watchWeek(kid, T).days.find((d) => d.today)?.minutes).toBe(55);
  });
});

describe('check 2: snap back', () => {
  async function waitFor(fn: () => boolean, ms: number): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (fn()) return Date.now() - start;
      await new Promise((r) => setTimeout(r, 50));
    }
    return -1;
  }

  it('in kid mode, the TV switched to Hulu is relaunched within 5 s, with an alert', async () => {
    T = local(31, 10); // Tuesday 10:00
    const id = await playlist('Snap', [{ key: RP }]);
    await startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid });
    expect(roku1.state.activeApp.id).toBe('12');
    T += 10 * SEC; // past the time the hub gives its own launch
    startSnapBackWatcher(2_000);
    await new Promise((r) => setTimeout(r, 2_200)); // a pass that sees the playlist's app
    roku1.calls.length = 0;
    // The kid presses the Hulu button on the remote.
    roku1.state.activeApp = { id: '2285', name: 'Hulu' };
    const took = await waitFor(() => launches(roku1).length > 0, 6_000);
    expect(took).toBeGreaterThanOrEqual(0);
    expect(took).toBeLessThan(5_000);
    expect(launches(roku1)).toEqual(['12:81000001']); // back to the playlist's title
    expect(roku1.state.activeApp.id).toBe('12');
    // The hub writes the alert just after the relaunch returns: wait for it (the fake Roku sees the launch first).
    expect(await waitFor(() => alertsOf('left_playlist').length > 0, 2_000)).toBeGreaterThanOrEqual(0);
    const a = alertsOf('left_playlist');
    expect(a).toHaveLength(1);
    expect(a[0].title).toBe('Left the playlist');
    expect(a[0].detail).toMatch(/^Opened Hulu · back to Rocket Pals in \d s · Kid one · Living room$/);
    expect(listActivity({ limit: 5 }).some((x) => x.action === 'snapback' && x.summary.includes('Hulu was opened'))).toBe(true);

    // Home pressed: back to the title again, alerted as "Pressed Home".
    T += 10 * SEC;
    roku1.calls.length = 0;
    roku1.state.activeApp = { id: null, name: 'Roku' };
    expect(await waitFor(() => launches(roku1).length > 0, 6_000)).toBeLessThan(5_000);
    expect(await waitFor(() => alertsOf('home').length > 0, 2_000)).toBeGreaterThanOrEqual(0);
    expect(alertsOf('home').map((x) => x.title)).toEqual(['Pressed Home']);
    stopSnapBackWatcher();
  });

  it('in kid mode with nothing playing, another app is replaced by the Popcorn Pilot channel', async () => {
    T = local(31, 11);
    await switchProfile(GUEST, tv1, kid);
    expect(launches(roku1)).toEqual(['dev:']); // the kid home screen
    T += 10 * SEC;
    await snapBackPass(); // sees Popcorn Pilot: nothing to do
    expect(launches(roku1)).toEqual(['dev:']);
    roku1.state.activeApp = { id: '12', name: 'Netflix' };
    const made = await snapBackPass();
    expect(made.map((m) => `${m.from} -> ${m.to}`)).toEqual(['Netflix -> Popcorn Pilot']);
    expect(launches(roku1)).toEqual(['dev:', 'dev:']);
    expect(alertsOf('other_app').map((a) => a.title)).toEqual(['Opened Netflix']);
  });

  it('in adult mode nothing happens (control); snap back off and a TV that is off are left alone', async () => {
    T = local(31, 12);
    const id = await playlist('Grown up', [{ key: RP }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: grown });
    expect(tvState(tv1)?.profile_id).toBe(grown);
    T += 10 * SEC;
    roku1.calls.length = 0;
    roku1.state.activeApp = { id: '2285', name: 'Hulu' };
    expect(await snapBackPass()).toEqual([]);
    expect(roku1.calls).toEqual([]); // not even asked
    expect(listAlerts()).toHaveLength(0);

    // Kid mode, snap back off for this kid: nothing.
    await switchProfile(ADULT, tv2, kid);
    updateRules(kid, { snapBack: false });
    T += 10 * SEC;
    roku2.state.activeApp = { id: '13', name: 'Prime Video' };
    expect(await snapBackPass()).toEqual([]);
    // Snap back on again, but the TV is off (standby): nothing; turned on again, Popcorn Pilot opens without an alert.
    updateRules(kid, { snapBack: true });
    roku2.state.power = 'standby';
    expect(await snapBackPass()).toEqual([]);
    roku2.state.power = 'on';
    expect((await snapBackPass()).map((m) => `${m.from} -> ${m.to} ${m.alerted}`)).toEqual(['Prime Video -> Popcorn Pilot false']);
    expect(listAlerts()).toHaveLength(0);
  });

  it('a launch by the hub while the watcher looks is not undone (no second launch, no alert)', async () => {
    T = local(31, 14);
    await switchProfile(ADULT, tv1, kid); // kid home screen: the hub expects Popcorn Pilot
    const seen = tvState(tv1)?.expected_at ?? null;
    T += 10 * SEC;
    // The hub starts a playlist; the watcher had read the TV's state before it, and now sees Netflix.
    const id = await playlist('Race', [{ key: RP }]);
    await startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid });
    roku1.calls.length = 0;
    expect(await snapBackRelaunch(tv1, seen)).toBeNull();
    expect(launches(roku1)).toEqual([]);
    expect(listAlerts()).toHaveLength(0);
  });

  it('the alert can be turned off; the snap back still happens', async () => {
    T = local(31, 13);
    updateRules(kid, { alertOnSnapBack: false });
    await switchProfile(ADULT, tv1, kid);
    T += 10 * SEC;
    roku1.state.activeApp = { id: '13', name: 'Prime Video' };
    expect((await snapBackPass()).map((m) => m.alerted)).toEqual([false]);
    expect(roku1.state.activeApp.id).toBe('dev');
    expect(listAlerts()).toHaveLength(0);
  });
});

describe('check 5: bedtime wind-down', () => {
  it('in the last 15 min only calm titles play, and the volume steps down on the fake Roku; then the TV turns off', async () => {
    updateRules(kid, { windDown: true, windDownMinutes: 15 });
    // Ocean Friends and Garden Bugs are tagged calm; Rocket Pals and Bubble Bakery are not.
    for (const [k, n] of [[OF, 'Ocean Friends'], [GB, 'Garden Bugs']]) getDb().prepare("INSERT INTO title_tags (title_key, name, rating, calm) VALUES (?, ?, 'TV-Y', 1) ON CONFLICT (title_key) DO UPDATE SET calm = 1").run(k, n);
    updateRules(kid, { dailyLimits: { ...RULES.dailyLimits, sat: 70 } });
    const t0 = local(21, 15); // Saturday 3:00 PM, 70 min: wind-down from 55 min
    T = t0;
    const id = await playlist('Bedtime', [
      { key: RP, mode: 'episodes', episodes: 2 }, // 0 to 44 min, not calm, before wind-down
      { key: BB, mode: 'episodes', episodes: 1 }, // 44 to 55, not calm: wind-down starts during it; it finishes
      { key: RP, mode: 'episodes', episodes: 1 }, // not calm: skipped in wind-down
      { key: OF, mode: 'episodes', episodes: 1 }, // calm: plays
      { key: GB, mode: 'stay' }, // calm
    ]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv2], profile: kid });
    expect(launches(roku2)).toEqual(['12:81000001']);
    // The engine timer, once a minute (20 s past each minute).
    const seen: string[] = [];
    for (let m = 1; m <= 70 && live(tv2); m++) {
      await at(t0 + m * MIN + 20 * SEC);
      const n = live(tv2)?.now?.item.name;
      if (n && seen[seen.length - 1] !== n) seen.push(n);
      if (m === 54) expect(keys(roku2)).toEqual([]); // 16 min left: not yet
      if (m === 55) expect(keys(roku2)).toEqual(['VolumeDown']); // 15 min left: wind-down begins
    }
    expect(live(tv2)).toBeNull();
    // Only calm titles started in wind-down (the second Rocket Pals was skipped); the volume stepped down every 3
    // minutes; then the TV turned off, at Ocean Friends' end (66 min, nearest the 70 min limit).
    expect(seen).toEqual(['Rocket Pals', 'Bubble Bakery', 'Ocean Friends']);
    expect(launches(roku2)).toEqual(['12:81000001', 'search:2285:Bubble Bakery', 'search:12:Ocean Friends']);
    const k = keys(roku2);
    expect(k).toEqual(['VolumeDown', 'VolumeDown', 'VolumeDown', 'VolumeDown', 'PowerOff']); // 55, 58, 61, 64; off at 66
    expect(tvState(tv2)?.volume_steps).toBe(4);
    const skipped = getDb().prepare("SELECT name, note FROM queue_items WHERE status = 'skipped' AND note LIKE 'not a calm%'").all();
    expect(skipped).toEqual([{ name: 'Rocket Pals', note: 'not a calm title (bedtime wind-down)' }]);
    expect(listActivity({ limit: 30 }).some((a) => a.action === 'kid.wind_down')).toBe(true);

    // The next start on that TV turns the volume back up by the same 4 steps.
    T = local(22, 9); // Sunday morning
    roku2.calls.length = 0;
    roku2.state.power = 'on';
    const id2 = await playlist('Morning', [{ key: OF }]);
    await startPlaylist(ADULT, { playlistId: id2, tvIds: [tv2], profile: kid });
    expect(keys(roku2)).toEqual(['VolumeUp', 'VolumeUp', 'VolumeUp', 'VolumeUp']);
    expect(tvState(tv2)?.volume_steps).toBe(0);
  });

  it('with no calm title left, a calm title from the household list is added', async () => {
    updateRules(kid, { windDown: true, windDownMinutes: 15 });
    const t0 = local(25, 15); // Wednesday 3:00 PM, 60 min
    T = t0;
    const id = await playlist('No calm', [{ key: RP, mode: 'episodes', episodes: 2 }, { key: BB, mode: 'episodes', episodes: 1 }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv2], profile: kid });
    await at(t0 + 22 * MIN + 10 * SEC);
    await at(t0 + 46 * MIN); // 14 min left: wind-down; Bubble Bakery is skipped, a calm title is added and plays
    const names = [live(tv2)?.now?.item.name];
    expect(['Ocean Friends', 'Garden Bugs']).toContain(names[0]);
    expect(live(tv2)?.past.find((p) => p.name === 'Bubble Bakery')?.note).toBe('not a calm title (bedtime wind-down)');
  });
});
