// PP6: the channel's screens run in the brs interpreter (no Roku needed). roku/tests/run_screens.brs puts each
// screen up with sample hub data, presses remote keys, and prints what the screen asks the channel to do. This
// checks each screen draws without a runtime error and that the buttons do what the mockups say. Uses the compiled
// channel (build/roku-staging from scripts/roku-build.mjs; built here when missing).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const STAGING = path.join(ROOT, 'build', 'roku-staging');
const BRS = path.join(ROOT, 'node_modules', 'brs', 'bin', 'cli.js');

let out = '';
const scenarios = new Map<string, Record<string, unknown>>();
const rendered = new Map<string, number>();

beforeAll(() => {
  if (!fs.existsSync(path.join(STAGING, 'components', 'MainScene.xml'))) {
    const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'roku-build.mjs')], { encoding: 'utf8', timeout: 180_000 });
    if (b.status !== 0) throw new Error(`roku build failed:\n${b.stdout}\n${b.stderr}`);
  }
  // brs reads components from <root>/components; the harness and bsc's helper library go in <root>/source.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-sg-'));
  fs.cpSync(path.join(STAGING, 'components'), path.join(dir, 'components'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'source'));
  fs.copyFileSync(path.join(STAGING, 'source', 'bslib.brs'), path.join(dir, 'source', 'bslib.brs'));
  fs.copyFileSync(path.join(ROOT, 'roku', 'tests', 'run_screens.brs'), path.join(dir, 'source', 'run_screens.brs'));
  const r = spawnSync(process.execPath, [BRS, '-r', dir, path.join(dir, 'source', 'run_screens.brs'), path.join(dir, 'source', 'bslib.brs')], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
  out = `${r.stdout}\n${r.stderr}`;
  for (const line of r.stdout.split('\n')) {
    const s = line.match(/^SCENARIO (.+?) (\{.*\})\s*$/);
    if (s) scenarios.set(s[1], JSON.parse(s[2]) as Record<string, unknown>);
    const d = line.match(/^RENDERED (\w+)\s+(\d+)/);
    if (d) rendered.set(d[1], Math.max(rendered.get(d[1]) ?? 0, Number(d[2])));
  }
}, 240_000);

function act(name: string) {
  expect(scenarios.has(name), `scenario "${name}" ran`).toBe(true);
  return scenarios.get(name);
}

describe('the channel screens in the brs interpreter', () => {
  it('every scenario ran with no runtime error', () => {
    // Lines brs prints for a runtime error name a file and position, e.g. "Ui.brs(198,15-16): ...".
    // "Ignoring attempt to call non-implemented function" is a screen function the scene would call and is missing.
    const errors = out.split('\n').filter((l) => /\.brs\(\d+,\d+/.test(l) || /not a function|Type Mismatch|Cannot|undefined|Ignoring attempt/i.test(l));
    expect(errors).toEqual([]);
    expect(out).toContain('DONE');
    expect(scenarios.size).toBe(33);
  });

  it('every screen draws something', () => {
    const screens = ['HomeScreen', 'KidHomeScreen', 'ProfilePickerScreen', 'PinScreen', 'KidPickerScreen', 'EarnTimeScreen', 'TimeUpScreen', 'RequestSentScreen', 'NowPlayingScreen', 'TimeWarningScreen', 'PairScreen', 'AlbumScreen'];
    for (const s of screens) expect(rendered.get(s) ?? 0, s).toBeGreaterThan(3);
  });

  it('home (mockup Main): playlists, the picker board, routines, the profile button', () => {
    expect(act('home: OK starts the first playlist')).toEqual({ kind: 'startPlaylist', id: 1 });
    expect(act('home: the last card opens the picker board')).toEqual({ kind: 'go', screen: 'KidPicker' });
    expect(act('home: up to Routines, OK runs it')).toEqual({ kind: 'runRoutine', id: 3 });
    expect(act('home: up twice to the profile button')).toEqual({ kind: 'go', screen: 'ProfilePicker' });
  });

  it('kid home (mockup KidHome): Keep watching, Pick a show, Earn more time, Not me; other keys do nothing', () => {
    expect(act('kid home: Keep watching')).toEqual({ kind: 'startPlaylist', id: 1 });
    expect(act('kid home: Pick a show')).toEqual({ kind: 'go', screen: 'KidPicker' });
    expect(act('kid home: Earn more time')).toEqual({ kind: 'go', screen: 'EarnTime' });
    expect(act('kid home: Not me')).toEqual({ kind: 'go', screen: 'ProfilePicker' });
    expect(act('kid home: Back, Options and Play do nothing')).toEqual({ kind: 'none' });
  });

  it('profile picker (mockup ProfilePicker): the hub is asked to switch; Back', () => {
    expect(act('profiles: the kid')).toEqual({ kind: 'profile', profileId: 2, name: 'Kid one' });
    expect(act('profiles: Guest')).toEqual({ kind: 'profile', profileId: null, name: 'Guest' });
    expect(act('profiles: Back button')).toEqual({ kind: 'back' });
    expect(act('profiles (kid mode): Family')).toEqual({ kind: 'profile', profileId: 1, name: 'Family' });
  });

  it('PIN (mockup TvPin): 4 digits from the pad are sent; Clear; approve; Back', () => {
    // Starts on 5: OK 5, left OK 4, up OK 1, right right OK 3.
    expect(act('pin: four digits are sent')).toEqual({ kind: 'profile', profileId: 1, name: 'Family', pin: '5413' });
    expect(act('pin: Clear then OK sends nothing')).toEqual({ kind: 'none' });
    expect(act('pin: approve a request')).toEqual({ kind: 'approve', requestId: 9, pin: '5555' });
    expect(act('pin: Back button')).toEqual({ kind: 'back' });
  });

  it('picker board (mockup KidPicker): 3 across for a kid, 6 across for an adult; footer', () => {
    expect(act('kid board: right, down, OK plays the fifth')).toEqual({ kind: 'play', titleKey: 'tv-905', service: 'netflix' });
    expect(act('kid board: Earn more time in the footer')).toEqual({ kind: 'go', screen: 'EarnTime' });
    expect(act('kid board: Back in the footer')).toEqual({ kind: 'back' });
    expect(act('adult board: six across')).toEqual({ kind: 'play', titleKey: 'tv-9012', service: 'netflix' });
  });

  it('earn time (mockup EarnTime): I did it asks a grown-up; a job already waiting does nothing; Back', () => {
    expect(act('earn: a job waiting for a grown-up does nothing')).toEqual({ kind: 'none' });
    expect(act('earn: I did it')).toEqual({ kind: 'ask', body: { kind: 'task', taskId: 2 }, words: 'Set the table' });
    expect(act('earn: Back')).toEqual({ kind: 'back' });
  });

  it('time up, request sent, the bridge, the warning, pairing', () => {
    expect(act('time up: Earn more time')).toEqual({ kind: 'go', screen: 'EarnTime' });
    expect(act('time up: Ask a grown-up')).toEqual({ kind: 'ask', body: { kind: 'time', minutes: 20 }, words: '+20 minutes' });
    expect(act('request sent: Back')).toEqual({ kind: 'back' });
    expect(act('request sent: Grown-up PIN')).toEqual({ kind: 'go', screen: 'Pin', params: { purpose: 'approve', requestId: 9 } });
    expect(act('bridge: Play now')).toEqual({ kind: 'bridge', action: 'play' });
    expect(act('bridge: Skip')).toEqual({ kind: 'bridge', action: 'skip' });
    expect(act('warning: keys do nothing')).toEqual({ kind: 'none' });
    expect(act('pair: Pair with the kept token')).toEqual({ kind: 'pairWith', hub: 'http://192.168.1.50:3000', token: 'tok' });
  });
});
