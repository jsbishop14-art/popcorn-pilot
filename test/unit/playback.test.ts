// PP3 playback engine on the hub, against two fake Rokus and a fake clock:
// check 1: a 3-title playlist plays through in order with each mode (number of episodes, stay on show, time on
//          show, run indefinitely);
// check 2: loop and shuffle; a scheduled playlist starts at its time on the right TV;
// check 3: the same playlist on both TVs; Send to pauses one and resumes on the other;
// check 4: quick playlist (first pick, later picks append, Save as playlist);
// check 5: a failed launch gives a message and moves to the next title;
// and kid rules enforced by the engine at launch, and every control action in Activity history.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDataDir } from './helpers';
import { getDb } from '@/lib/db';
import { createProfile } from '@/lib/profiles';
import { listActivity } from '@/lib/activity';
import { EVERYONE, viewerForProfile } from '@/lib/catalog';
import { appendItem, createPlaylist, getPlaylist, listPlaylists, quickRow, saveQuick, titleFields, updatePlaylist, albumFields } from '@/lib/playlists';
import {
  control,
  editQueue,
  quickAdd,
  remote,
  sendTo,
  setClockForTests,
  setRandomForTests,
  startPlaylist,
  tick,
  tvView,
  type Actor,
} from '@/lib/playback';
import { getTv } from '@/lib/tvs';
import { updateRules } from '@/lib/safeguards';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';

const ADULT: Actor = { pinType: 'adult', device: 'Computer' };
const GUEST: Actor = { pinType: 'guest', device: 'iPhone' };
const MIN = 60_000;

let T = 0;
let roku1: FakeRoku;
let roku2: FakeRoku;
let tv1: number;
let tv2: number;
let kid: number;
let grown: number;

/** What each fake Roku was asked to launch, in order: "12:81000001" (direct link) or "search:13:Puddle Jumpers". */
function launches(r: FakeRoku): string[] {
  return r.calls
    .filter((c) => c.method === 'POST' && (c.path.startsWith('/launch/') || c.path === '/search/browse'))
    .map((c) => (c.path === '/search/browse' ? `search:${c.query['provider-id']}:${c.query.keyword}` : `${c.path.slice(8)}:${c.query.contentId ?? ''}`));
}

function keys(r: FakeRoku): string[] {
  return r.calls.filter((c) => c.path.startsWith('/keypress/')).map((c) => c.path.slice('/keypress/'.length));
}

const RP = 'tv-9001'; // Rocket Pals, Netflix, 22 min episodes, direct link
const PJ = 'tv-9101'; // Puddle Jumpers, Prime Video, 11 min episodes, search launch
const BB = 'tv-9201'; // Bubble Bakery, Hulu, 11 min episodes, search launch
const L_RP = '12:81000001';
const L_PJ = 'search:13:Puddle Jumpers';
const L_BB = 'search:2285:Bubble Bakery';

async function playlist(name: string, items: { key: string; mode?: string; episodes?: number; minutes?: number }[], opts: { loop?: boolean; shuffle?: boolean } = {}) {
  const p = createPlaylist({ name });
  for (const it of items) appendItem(p.id, await titleFields(EVERYONE, it.key, undefined, { mode: it.mode, episodes: it.episodes, minutes: it.minutes }));
  if (opts.loop !== undefined || opts.shuffle !== undefined) updatePlaylist(p.id, { loop: opts.loop ?? false, shuffle: opts.shuffle ?? false });
  return p.id;
}

function now(tvId: number) {
  return tvView(getTv(tvId)!, T).playback;
}

async function at(ms: number) {
  T = ms;
  return tick();
}

beforeAll(async () => {
  freshDataDir();
  setClockForTests(() => T);
  roku1 = await startFakeRoku({ name: 'Living room' });
  roku2 = await startFakeRoku({ name: 'Guest room' });
  kid = createProfile({ name: 'Kid one', color: '#7FC8A9', type: 'kid' }).id;
  // PP4: these are the PP3 engine checks, so the kid may watch at any hour and has 12 hours a day (the time rules
  // are checked in safeguards.test).
  const allDay = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, 720]));
  updateRules(kid, { hoursStart: '00:00', hoursEnd: '24:00', dailyLimits: allDay });
  grown = createProfile({ name: 'Family', color: '#FFC94A', type: 'adult' }).id;
  const ins = getDb().prepare('INSERT INTO tvs (name, room, address, port, online) VALUES (?, ?, ?, ?, 1)');
  tv1 = Number(ins.run('Living room', 'Living room', '127.0.0.1', roku1.port).lastInsertRowid);
  tv2 = Number(ins.run('Guest room', 'Guest room', '127.0.0.1', roku2.port).lastInsertRowid);
});

beforeEach(async () => {
  // Every test starts with both TVs idle and fresh call lists.
  T += 24 * 60 * MIN;
  for (const tv of [tv1, tv2]) if (now(tv)) await control(ADULT, tv, 'stop');
  roku1.calls.length = 0;
  roku2.calls.length = 0;
  roku1.state.failChannels = [];
  setRandomForTests(null);
});

afterAll(async () => {
  setClockForTests(null);
  await roku1?.close();
  await roku2?.close();
});

describe('check 1: a 3-title playlist plays through in order with each mode', () => {
  it('number of episodes: each title plays its episodes, then the next starts', async () => {
    const id = await playlist('Episodes', [
      { key: RP, mode: 'episodes', episodes: 2 }, // 44 min
      { key: PJ, mode: 'episodes', episodes: 3 }, // 33 min
      { key: BB, mode: 'episodes', episodes: 1 }, // 11 min
    ]);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    expect(launches(roku1)).toEqual([L_RP]);
    expect(now(tv1)?.now?.item.name).toBe('Rocket Pals');
    expect(now(tv1)?.now?.item.modeLabel).toBe('2 episodes');
    expect(now(tv1)?.index).toBe(1);
    expect(now(tv1)?.count).toBe(3);
    await at(t0 + 22 * MIN);
    expect(now(tv1)?.now?.episode).toBe(2);
    expect(now(tv1)?.now?.leftMin).toBe(22);
    await at(t0 + 44 * MIN - 1);
    expect(launches(roku1)).toEqual([L_RP]);
    await at(t0 + 44 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_PJ]);
    expect(now(tv1)?.index).toBe(2);
    await at(t0 + 77 * MIN - 1);
    expect(launches(roku1)).toEqual([L_RP, L_PJ]);
    await at(t0 + 77 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_PJ, L_BB]);
    await at(t0 + 88 * MIN);
    expect(now(tv1)).toBeNull();
    expect(launches(roku1)).toEqual([L_RP, L_PJ, L_BB]);
    // The launch route of each title is recorded (handoff 2.4).
    const routes = getDb().prepare("SELECT title_key, route FROM launch_log WHERE tv_id = ? AND kind = 'title' ORDER BY id DESC LIMIT 3").all(tv1) as { title_key: string; route: string }[];
    expect(routes.reverse()).toEqual([
      { title_key: RP, route: 'deep_link' },
      { title_key: PJ, route: 'search' },
      { title_key: BB, route: 'search' },
    ]);
  });

  it('time on show: plays for the set time and stops at the end of an episode', async () => {
    const id = await playlist('Time', [
      { key: RP, mode: 'time', minutes: 30 }, // 22 min episodes: 2 episodes, 44 min
      { key: PJ, mode: 'time', minutes: 15 }, // 11 min episodes: 2 episodes, 22 min
      { key: BB, mode: 'time', minutes: 11 }, // exactly 1 episode
    ]);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 30 * MIN);
    expect(launches(roku1)).toEqual([L_RP]);
    expect(now(tv1)?.now?.totalMin).toBe(44);
    await at(t0 + 44 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_PJ]);
    await at(t0 + 44 * MIN + 15 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_PJ]);
    await at(t0 + 66 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_PJ, L_BB]);
    await at(t0 + 77 * MIN);
    expect(now(tv1)).toBeNull();
  });

  it('stay on show: stays until Skip, then the next title; the order still holds', async () => {
    const id = await playlist('Stay', [
      { key: RP, mode: 'stay' },
      { key: PJ, mode: 'stay' },
      { key: BB, mode: 'stay' },
    ]);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 10 * 60 * MIN);
    expect(launches(roku1)).toEqual([L_RP]);
    expect(now(tv1)?.now?.totalMin).toBeNull();
    expect(now(tv1)?.now?.item.modeLabel).toBe('Stay on show');
    await control(ADULT, tv1, 'skip');
    expect(launches(roku1)).toEqual([L_RP, L_PJ]);
    await at(T + 5 * 60 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_PJ]);
    await control(ADULT, tv1, 'skip');
    await control(ADULT, tv1, 'skip');
    expect(launches(roku1)).toEqual([L_RP, L_PJ, L_BB]);
    expect(now(tv1)).toBeNull();
  });

  it('run indefinitely: keeps going with no end, for a show and for a movie', async () => {
    const id = await playlist('Indefinite', [
      { key: RP, mode: 'indefinite' },
      { key: 'movie-8001', mode: 'indefinite' },
      { key: BB, mode: 'indefinite' },
    ]);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 20 * 60 * MIN);
    expect(launches(roku1)).toEqual([L_RP]);
    expect(now(tv1)?.now?.item.modeLabel).toBe('Run indefinitely');
    await control(ADULT, tv1, 'skip');
    await at(T + 20 * 60 * MIN);
    expect(launches(roku1)).toEqual([L_RP, '12:81000101']);
    await control(ADULT, tv1, 'skip');
    expect(launches(roku1)).toEqual([L_RP, '12:81000101', L_BB]);
  });

  it('a movie plays whole; paused time does not count', async () => {
    const id = await playlist('Movie then show', [{ key: 'movie-8001' }, { key: BB, episodes: 1 }]); // 84 min, then 11
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    expect(now(tv1)?.now?.item.modeLabel).toBe('Whole movie');
    T = t0 + 40 * MIN;
    await control(ADULT, tv1, 'pause');
    expect(now(tv1)?.state).toBe('paused');
    expect(keys(roku1)).toEqual(['Play']);
    await at(t0 + 300 * MIN); // paused for 260 minutes
    expect(launches(roku1)).toEqual(['12:81000101']);
    await control(ADULT, tv1, 'resume');
    expect(keys(roku1)).toEqual(['Play', 'Play']);
    await at(t0 + 300 * MIN + 44 * MIN - 1);
    expect(launches(roku1)).toEqual(['12:81000101']);
    await at(t0 + 300 * MIN + 44 * MIN);
    expect(launches(roku1)).toEqual(['12:81000101', L_BB]);
  });

  it('a Family Album item is accepted and skipped with a note until PP5', async () => {
    const id = await playlist('With album', [{ key: RP, episodes: 1 }]);
    appendItem(id, albumFields({}));
    appendItem(id, await titleFields(EVERYONE, BB, undefined, { episodes: 1 }));
    expect(getPlaylist(id, EVERYONE)?.items.map((i) => i.name)).toEqual(['Rocket Pals', 'Family Album', 'Bubble Bakery']);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 22 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_BB]);
    const pb = now(tv1)!;
    expect(pb.message).toBe('Skipped the Family Album: it arrives in a later build.');
    expect(pb.past.find((i) => i.kind === 'album')?.note).toContain('PP5');
  });
});

describe('check 2: loop, shuffle and schedules', () => {
  it('loop starts the playlist again after the last title', async () => {
    const id = await playlist('Loop', [{ key: RP, episodes: 1 }, { key: BB, episodes: 1 }], { loop: true });
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 22 * MIN);
    await at(t0 + 33 * MIN);
    await at(t0 + 55 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_BB, L_RP, L_BB]);
    expect(now(tv1)?.state).toBe('playing');
  });

  it('without loop the playlist ends (control)', async () => {
    const id = await playlist('No loop', [{ key: RP, episodes: 1 }, { key: BB, episodes: 1 }]);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 22 * MIN);
    await at(t0 + 33 * MIN);
    await at(t0 + 55 * MIN);
    expect(launches(roku1)).toEqual([L_RP, L_BB]);
    expect(now(tv1)).toBeNull();
  });

  it('shuffle plays every title once in a shuffled order, and reshuffles on each loop', async () => {
    const keysList = ['tv-9001', 'tv-9002', 'tv-9003', 'tv-9004', 'tv-9005', 'tv-9006'];
    const id = await playlist('Shuffle', keysList.map((key) => ({ key, episodes: 1 })), { shuffle: true, loop: true });
    let seed = 7;
    setRandomForTests(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    const order = (): string[] => {
      const pb = now(tv1)!;
      return [pb.now!.item.titleKey as string, ...pb.upNext.map((i) => i.titleKey as string)];
    };
    const first = order();
    expect([...first].sort()).toEqual([...keysList].sort());
    expect(first).not.toEqual(keysList);
    for (let i = 0; i < 6; i++) await control(ADULT, tv1, 'skip');
    const second = order();
    expect([...second].sort()).toEqual([...keysList].sort());
    expect(second).not.toEqual(first);
    expect(launches(roku1)).toHaveLength(7);
  });

  it('a scheduled playlist starts at its time on the right TV, once, for its profile', async () => {
    const id = await playlist('Saturday Cartoons', [{ key: RP, episodes: 1 }, { key: BB, episodes: 1 }]);
    updatePlaylist(id, { schedule: { on: true, days: ['sat'], time: '08:00', tvId: tv2, profileId: kid } });
    expect(getPlaylist(id, EVERYONE)?.schedule.label).toBe('Saturdays 8:00 AM · Guest room');
    // Saturday 2026-11-28 in the hub's local time.
    const sat8 = new Date(2026, 10, 28, 8, 0).getTime();
    expect(new Date(sat8).getDay()).toBe(6);
    expect((await at(sat8 - 24 * 60 * MIN)).started).toBe(0); // Friday 8:00
    expect((await at(sat8 - MIN)).started).toBe(0); // Saturday 7:59
    expect(now(tv2)).toBeNull();
    expect((await at(sat8 + 30_000)).started).toBe(1);
    expect(launches(roku2)).toEqual([L_RP]);
    expect(launches(roku1)).toEqual([]);
    expect(now(tv2)?.name).toBe('Saturday Cartoons');
    expect(now(tv2)?.profileName).toBe('Kid one');
    expect((await at(sat8 + 5 * MIN)).started).toBe(0); // not twice
    expect(listActivity({ limit: 20 }).some((a) => a.pin_type === 'hub' && a.summary === 'Started Saturday Cartoons on Guest room for Kid one (schedule)')).toBe(true);
    await control(ADULT, tv2, 'stop');
    // The next Saturday, a hub that was off at 8:00 and comes back at 9:00 does not start it late.
    expect((await at(sat8 + 7 * 24 * 60 * MIN + 60 * MIN)).started).toBe(0);
    // A schedule that is off does not start (control).
    updatePlaylist(id, { schedule: { on: false, days: ['sat'], time: '08:00', tvId: tv2, profileId: kid } });
    expect((await at(sat8 + 14 * 24 * 60 * MIN)).started).toBe(0);
  });
});

describe('check 3: one playlist on both TVs; Send to', () => {
  it('plays the same playlist on both TVs at once', async () => {
    const id = await playlist('Both', [{ key: RP, episodes: 1 }, { key: BB, episodes: 1 }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1, tv2] });
    expect(launches(roku1)).toEqual([L_RP]);
    expect(launches(roku2)).toEqual([L_RP]);
    expect(now(tv1)?.name).toBe('Both');
    expect(now(tv2)?.name).toBe('Both');
    expect(now(tv1)?.id).not.toBe(now(tv2)?.id);
    // Each TV moves on by itself.
    await control(ADULT, tv2, 'skip');
    expect(launches(roku2)).toEqual([L_RP, L_BB]);
    expect(launches(roku1)).toEqual([L_RP]);
  });

  it('Send to pauses one TV and resumes the same title on the other, where it was', async () => {
    const id = await playlist('Send', [{ key: RP, episodes: 2 }, { key: BB, episodes: 1 }]);
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await startPlaylist(ADULT, { playlistId: await playlist('Other', [{ key: PJ, episodes: 1 }]), tvIds: [tv2] });
    T = t0 + 30 * MIN;
    await sendTo(ADULT, tv1, tv2);
    expect(keys(roku1)).toEqual(['Play']); // paused
    expect(now(tv1)?.state).toBe('paused');
    expect(now(tv1)?.message).toBe('Sent to Guest room');
    expect(launches(roku2)).toEqual([L_PJ, L_RP]);
    const there = now(tv2)!;
    expect(there.name).toBe('Send');
    expect(there.state).toBe('playing');
    expect(there.now?.item.name).toBe('Rocket Pals');
    expect(there.now?.playedMin).toBe(30);
    expect(there.upNext.map((i) => i.name)).toEqual(['Bubble Bakery']);
    // It carries on from where it was: 14 more minutes of Rocket Pals, then Bubble Bakery on the Guest room TV.
    await at(T + 14 * MIN - 1);
    expect(launches(roku2)).toEqual([L_PJ, L_RP]);
    await at(T + 1);
    expect(launches(roku2)).toEqual([L_PJ, L_RP, L_BB]);
    expect(launches(roku1)).toEqual([L_RP]);
    expect(listActivity({ limit: 30 }).some((a) => a.summary === 'Sent Send from Living room to Guest room')).toBe(true);
  });
});

describe('check 4: quick playlist', () => {
  it('first pick asks to start; later picks append; Save as playlist creates a playlist', async () => {
    const first = await quickAdd(ADULT, EVERYONE, { titleKey: RP, episodes: 1 });
    expect(first.first).toBe(true);
    expect(first.playingOn).toEqual([]);
    const second = await quickAdd(ADULT, EVERYONE, { titleKey: PJ, episodes: 1 });
    expect(second.first).toBe(false);
    const qid = quickRow()!.id;
    expect(listPlaylists(EVERYONE).some((p) => p.id === qid)).toBe(false); // not saved
    await startPlaylist(ADULT, { playlistId: qid, tvIds: [tv1] });
    expect(now(tv1)?.name).toBe('Quick playlist');
    expect(now(tv1)?.quick).toBe(true);
    const third = await quickAdd(ADULT, EVERYONE, { titleKey: BB, episodes: 1 });
    expect(third.first).toBe(false);
    expect(third.playingOn).toEqual(['Living room']);
    expect(now(tv1)?.upNext.map((i) => i.name)).toEqual(['Puddle Jumpers', 'Bubble Bakery']);
    const saved = saveQuick('Tonight');
    expect(saved.quick).toBe(false);
    expect(saved.items.map((i) => i.name)).toEqual(['Rocket Pals', 'Puddle Jumpers', 'Bubble Bakery']);
    expect(listPlaylists(EVERYONE).some((p) => p.id === saved.id && p.name === 'Tonight')).toBe(true);
    expect(quickRow()).toBeUndefined();
    // The next pick starts a new quick playlist.
    expect((await quickAdd(ADULT, EVERYONE, { titleKey: RP })).first).toBe(true);
  });
});

describe('check 5: a failed launch', () => {
  it('shows a message and moves to the next title', async () => {
    const id = await playlist('Fails', [{ key: RP, episodes: 1 }, { key: PJ, episodes: 1 }, { key: BB, episodes: 1 }]);
    roku1.state.failChannels = ['13']; // Prime Video will not start
    const t0 = T;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    await at(t0 + 22 * MIN);
    // The Prime Video launch was tried (and answered 500), then Bubble Bakery started.
    expect(launches(roku1)).toEqual([L_RP, L_PJ, L_BB]);
    const pb = now(tv1)!;
    expect(pb.now?.item.name).toBe('Bubble Bakery');
    expect(pb.message).toBe('Could not start Puddle Jumpers on Living room: the TV did not start it. Moved to the next title.');
    expect(pb.past.find((i) => i.name === 'Puddle Jumpers')?.status).toBe('failed');
    const log = getDb().prepare("SELECT ok FROM launch_log WHERE title_key = ? AND tv_id = ? ORDER BY id DESC LIMIT 1").get(PJ, tv1) as { ok: number };
    expect(log.ok).toBe(0);
    expect(listActivity({ limit: 10 }).some((a) => a.action === 'playback.launch_failed' && a.summary.startsWith('Could not start Puddle Jumpers'))).toBe(true);
  });

  it('a TV that does not answer: every title fails, the playback ends and the TV shows why', async () => {
    const off = Number(getDb().prepare("INSERT INTO tvs (name, address, port) VALUES ('Den', '127.0.0.1', 1)").run().lastInsertRowid);
    const id = await playlist('Offline', [{ key: RP }, { key: BB }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [off] });
    const v = tvView(getTv(off)!, T);
    expect(v.playback).toBeNull();
    expect(v.lastMessage).toBe('Could not start Bubble Bakery on Den: the TV did not answer. Moved to the next title.');
    getDb().prepare('UPDATE tvs SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), off);
  });
});

describe('kid rules are enforced by the engine on the hub', () => {
  it('a title above the kid profile’s ratings is never launched; the rest plays', async () => {
    const id = await playlist('Mixed', [{ key: 'tv-9007', episodes: 1 }, { key: RP, episodes: 1 }]); // Night Harbor is TV-MA
    expect(getPlaylist(id, viewerForProfile(kid)!)?.items.map((i) => i.name)).toEqual(['Rocket Pals']);
    expect(getPlaylist(id, viewerForProfile(kid)!)?.hiddenCount).toBe(1);
    expect(getPlaylist(id, EVERYONE)?.items).toHaveLength(2); // control: the adult view has both
    await startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: kid });
    expect(launches(roku1)).toEqual([L_RP]);
    expect(now(tv1)?.past.find((i) => i.name === 'Night Harbor')?.note).toBe('not allowed for Kid one');
    // Control: for an adult profile, Night Harbor is launched.
    await control(ADULT, tv1, 'stop');
    roku1.calls.length = 0;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: grown });
    expect(launches(roku1)).toEqual(['search:12:Night Harbor']);
  });

  it('a title blocked after the start is refused at launch', async () => {
    const id = await playlist('Blocked later', [{ key: RP, episodes: 1 }, { key: BB, episodes: 1 }]);
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1], profile: kid });
    getDb().prepare("INSERT INTO title_tags (title_key, name, blocked) VALUES (?, 'Bubble Bakery', 1) ON CONFLICT (title_key) DO UPDATE SET blocked = 1").run(BB);
    await control(ADULT, tv1, 'skip');
    expect(launches(roku1)).toEqual([L_RP]);
    expect(now(tv1)).toBeNull();
    expect(tvView(getTv(tv1)!, T).lastMessage).toBe('Could not start Bubble Bakery on Living room: not allowed for Kid one. Moved to the next title.');
    getDb().prepare('UPDATE title_tags SET blocked = 0 WHERE title_key = ?').run(BB);
  });

  it('the Guest PIN starts for a kid profile only; a kid queue refuses a title above its ratings', async () => {
    const id = await playlist('Guest', [{ key: RP, episodes: 1 }]);
    await expect(startPlaylist(GUEST, { playlistId: id, tvIds: [tv1], profile: grown })).rejects.toThrow('With the Guest PIN, start for a kid profile.');
    getDb().prepare('UPDATE tvs SET default_profile_id = ? WHERE id = ?').run(grown, tv1);
    await expect(startPlaylist(GUEST, { playlistId: id, tvIds: [tv1] })).rejects.toThrow('With the Guest PIN, start for a kid profile.');
    getDb().prepare('UPDATE tvs SET default_profile_id = ? WHERE id = ?').run(kid, tv1);
    await startPlaylist(GUEST, { playlistId: id, tvIds: [tv1] }); // the TV's default profile, a kid
    expect(now(tv1)?.profileName).toBe('Kid one');
    await expect(editQueue(ADULT, tv1, { action: 'add', titleKey: 'tv-9007' })).rejects.toThrow('Not available for Kid one');
    await expect(quickAdd(GUEST, viewerForProfile(kid)!, { titleKey: 'movie-8006' })).rejects.toThrow('Not available for Kid one');
    getDb().prepare('UPDATE tvs SET default_profile_id = NULL WHERE id = ?').run(tv1);
  });
});

describe('live queue, remote, and Activity history', () => {
  it('reorder, remove, change mode and add; every control action is in Activity history', async () => {
    const id = await playlist('Queue', [{ key: RP, episodes: 1 }, { key: PJ, episodes: 1 }, { key: BB, episodes: 1 }, { key: 'tv-9002', episodes: 1 }]);
    const before = (listActivity({ limit: 1 })[0]?.id ?? 0) as number;
    await startPlaylist(ADULT, { playlistId: id, tvIds: [tv1] });
    let pb = now(tv1)!;
    const [pj, bb, of] = pb.upNext;
    await editQueue(ADULT, tv1, { action: 'move', itemId: bb.id, direction: 'up' });
    expect(now(tv1)!.upNext.map((i) => i.name)).toEqual(['Bubble Bakery', 'Puddle Jumpers', 'Ocean Friends']);
    await expect(editQueue(ADULT, tv1, { action: 'move', itemId: bb.id, direction: 'up' })).rejects.toThrow('already first');
    await editQueue(ADULT, tv1, { action: 'remove', itemId: of.id });
    await editQueue(ADULT, tv1, { action: 'mode', itemId: pj.id, mode: 'time', minutes: 20 });
    await editQueue(ADULT, tv1, { action: 'add', titleKey: 'movie-8001' });
    pb = now(tv1)!;
    expect(pb.upNext.map((i) => `${i.name}: ${i.modeLabel}`)).toEqual(['Bubble Bakery: 1 episode', 'Puddle Jumpers: 20 min', 'Snow Pups: Whole movie']);
    await control(ADULT, tv1, 'skip');
    expect(launches(roku1)).toEqual([L_RP, L_BB]);
    await control(GUEST, tv1, 'pause');
    await control(GUEST, tv1, 'resume');
    await remote(ADULT, tv1, 'VolumeUp');
    await remote(ADULT, tv1, 'Select');
    await expect(remote(ADULT, tv1, 'Home')).rejects.toThrow('Not a remote button.');
    await remote(ADULT, tv1, 'PowerOff');
    expect(now(tv1)).toBeNull();
    expect(keys(roku1)).toEqual(['Play', 'Play', 'VolumeUp', 'Select', 'PowerOff']);
    const log = listActivity({ limit: 50 })
      .filter((a) => a.id > before && a.pin_type !== 'hub')
      .reverse()
      .map((a) => `${a.pin_type} ${a.device}: ${a.summary}`);
    expect(log).toEqual([
      'adult Computer: Started Queue on Living room',
      'adult Computer: Moved Bubble Bakery up in the Living room queue',
      'adult Computer: Removed Ocean Friends from the Living room queue',
      'adult Computer: Set Puddle Jumpers to 20 min in the Living room queue',
      'adult Computer: Added Snow Pups to the Living room queue (Whole movie)',
      'adult Computer: Skipped Rocket Pals on Living room (Queue)',
      'guest iPhone: Paused Bubble Bakery (Queue) on Living room',
      'guest iPhone: Resumed Bubble Bakery (Queue) on Living room',
      'adult Computer: Pressed Volume up on Living room (remote)',
      'adult Computer: Pressed OK on Living room (remote)',
      'adult Computer: Pressed Turn off on Living room (remote) and stopped what it was playing',
    ]);
  });
});
