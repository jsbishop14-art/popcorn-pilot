// PP7: the Windows and Mac hub service (scripts/hub-service.mjs), with a stand-in app folder: it starts the app, starts
// it again when it stops, runs a backup missed while the computer was off, runs the updater when Settings asks
// (stopping and starting the app on the updater's request), and stops the app when the service stops. Same test on
// Linux, Windows and macOS.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SERVICE = path.join(process.cwd(), 'scripts/hub-service.mjs');

let root: string;
let svc: ChildProcess | null = null;

function write(rel: string, body: string) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
}

function lines(rel: string): string[] {
  const f = path.join(root, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : [];
}

async function until(what: string, ok: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function setUp(state: { lastBackupAt: number; lastUpdateAt: number }) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-hub-service-'));
  // The stand-in app: records each start with its process id and settings, then stays running.
  write(
    'app/node_modules/next/dist/bin/next',
    "const fs = require('fs');\n" +
      `fs.appendFileSync(${JSON.stringify(path.join(root, 'starts.txt'))}, JSON.stringify({ pid: process.pid, args: process.argv.slice(2), host: process.env.PP_HOST, data: process.env.PP_DATA_DIR, key: process.env.PP_MASTER_KEY_FILE, env: process.env.NODE_ENV }) + '\\n');\n` +
      // The same check as the real app (instrumentation.ts): stop when the service is gone.
      "setInterval(() => { try { process.kill(Number(process.env.PP_SUPERVISOR_PID), 0); } catch (e) { if (e.code !== 'EPERM') process.exit(0); } }, 5000);\n",
  );
  write('app/package.json', '{"type":"commonjs"}');
  write('app/scripts/backup.mjs', `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(path.join(root, 'backups.txt'))}, 'backup\\n');\n`);
  // The stand-in updater asks the service to stop the app, then to start it, as the real one does.
  write(
    'app/scripts/hub-update.mjs',
    `import fs from 'node:fs';\nconst out = ${JSON.stringify(path.join(root, 'updates.txt'))};\n` +
      "const ask = (op) => new Promise((r) => { process.once('message', (m) => r(m)); process.send({ op }); });\n" +
      "fs.appendFileSync(out, JSON.stringify(await ask('stop')) + '\\n');\n" +
      "fs.appendFileSync(out, JSON.stringify(await ask('start')) + '\\n');\nprocess.exit(0);\n",
  );
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/service-state.json'), JSON.stringify(state));
  const cfg = { host: 'windows', port: 18999, appDir: path.join(root, 'app'), dataDir: path.join(root, 'data'), keyFile: path.join(root, 'data/master.key'), logDir: path.join(root, 'logs') };
  fs.writeFileSync(path.join(root, 'hub.json'), JSON.stringify(cfg));
  svc = spawn(process.execPath, [SERVICE, '--config', path.join(root, 'hub.json')], { env: { ...process.env, PP_SERVICE_TICK_MS: '200' }, stdio: 'ignore' });
}

function starts() {
  return lines('starts.txt').map((l) => JSON.parse(l) as { pid: number; args: string[]; host: string; data: string; key: string; env: string });
}

afterEach(async () => {
  // A process ended by a signal (and on Windows every kill) has exitCode null and signalCode set: it is gone already.
  if (svc && svc.exitCode === null && svc.signalCode === null) {
    const gone = new Promise((r) => svc!.once('exit', r));
    svc.kill('SIGTERM');
    await gone;
  }
  for (const s of root ? starts() : []) if (alive(s.pid)) process.kill(s.pid, 'SIGKILL');
  svc = null;
});

describe('hub service on Windows and Mac', () => {
  it('starts the app with the hub settings and starts it again when it stops', async () => {
    setUp({ lastBackupAt: Date.now(), lastUpdateAt: Date.now() });
    await until('the app starts', () => starts().length === 1);
    const first = starts()[0];
    expect(first.args).toEqual(['start', '-p', '18999', '-H', '0.0.0.0']);
    expect([first.host, first.data, first.key, first.env]).toEqual(['windows', path.join(root, 'data'), path.join(root, 'data/master.key'), 'production']);
    process.kill(first.pid, 'SIGKILL');
    await until('the app starts again', () => starts().length === 2, 10_000);
    expect(starts()[1].pid).not.toBe(first.pid);
    expect(lines('backups.txt')).toEqual([]);
  });

  it('runs a backup missed while the computer was off, once', async () => {
    setUp({ lastBackupAt: 0, lastUpdateAt: Date.now() });
    await until('the backup runs', () => lines('backups.txt').length === 1);
    await new Promise((r) => setTimeout(r, 800));
    expect(lines('backups.txt')).toEqual(['backup']);
    expect(lines('updates.txt')).toEqual([]);
  });

  it('Check for updates now: runs the updater, which stops and starts the app; clears the request', async () => {
    setUp({ lastBackupAt: Date.now(), lastUpdateAt: Date.now() });
    await until('the app starts', () => starts().length === 1);
    const first = starts()[0].pid;
    fs.writeFileSync(path.join(root, 'data/update-requested'), 'x');
    await until('the updater ran', () => lines('updates.txt').length === 2);
    expect(lines('updates.txt').map((l) => JSON.parse(l))).toEqual([
      { op: 'stop-done', ok: true },
      { op: 'start-done', ok: true },
    ]);
    await until('the request is cleared', () => !fs.existsSync(path.join(root, 'data/update-requested')));
    await until('the old app is gone', () => !alive(first));
    await until('the app is started again', () => starts().length === 2);
    expect(starts()[1].pid).not.toBe(first);
  });

  for (const how of ['SIGTERM', 'SIGKILL'] as const) {
    // SIGKILL is how Windows ends the task (no signal reaches the service): the app sees the service is gone and stops.
    it(`stopping the service stops the app (${how})`, async () => {
      setUp({ lastBackupAt: Date.now(), lastUpdateAt: Date.now() });
      await until('the app starts', () => starts().length === 1);
      const pid = starts()[0].pid;
      const gone = new Promise((r) => svc!.once('exit', r));
      svc!.kill(how);
      await gone;
      await until('the app is gone', () => !alive(pid), 12_000);
    }, 20_000);
  }
});
