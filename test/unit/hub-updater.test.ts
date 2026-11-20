// PP7 check 3: the Windows and Mac updater (scripts/hub-update.mjs). In temporary git repos (a stand-in "GitHub" and
// a stand-in hub computer's app folder): a good update moves to the new version; a failed smoke check or build rolls
// back to the previous version and restores the database. The app is stopped and started through the hub service's
// channel (a stand-in service here records each request). Commands are small node scripts, so the same test runs on
// Linux, Windows and macOS (the CI Windows and macOS jobs run this file).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

const UPDATE = path.join(process.cwd(), 'scripts/hub-update.mjs');
const BACKUP = path.join(process.cwd(), 'scripts/backup.mjs');

let root: string;
let origin: string;
let dev: string;
let hub: string;
let data: string;
let v1: string;

const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).trim();
}

function commitVersion(v: string): string {
  fs.writeFileSync(path.join(dev, 'version.txt'), v + '\n');
  git(dev, 'add', '.');
  git(dev, 'commit', '-q', '-m', `version ${v}`);
  git(dev, 'push', '-q', 'origin', 'HEAD:main');
  return git(dev, 'rev-parse', 'HEAD');
}

/** A node script file; commands run it as: node "<file>" (no shell quoting differences between cmd.exe and sh). */
function script(name: string, body: string): string {
  const f = path.join(root, name);
  fs.writeFileSync(f, body);
  return `node "${f}"`;
}

interface Run {
  code: number | null;
  status: Record<string, string> | null;
  ops: string[];
}

/** Run the updater as the hub service does: with an IPC channel, answering stop and start. */
function runUpdater(env: Record<string, string>): Promise<Run> {
  const ops: string[] = [];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [UPDATE], {
      cwd: hub,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        ...GIT_ENV,
        PP_APP_DIR: hub,
        PP_DATA_DIR: data,
        PP_INSTALL_CMD: script('install.cjs', 'process.exit(0)'),
        PP_BUILD_CMD: script('build.cjs', "process.exit(require('fs').readFileSync('version.txt','utf8').trim() === process.env.BUILD_FAIL_ON ? 1 : 0)"),
        PP_SMOKE_CMD: script('smoke.cjs', "process.exit(process.env.SMOKE_FAIL_ON === 'always' || require('fs').readFileSync('version.txt','utf8').trim() === process.env.SMOKE_FAIL_ON ? 1 : 0)"),
        PP_BACKUP_CMD: `node "${BACKUP}"`,
        // "Migration": add a table, as a new build's migration would.
        PP_MIGRATE_CMD: script(
          'migrate.cjs',
          `const D = require(${JSON.stringify(require.resolve('better-sqlite3'))});\n` +
            `const v = require('fs').readFileSync('version.txt', 'utf8').trim();\n` +
            `const d = new D(${JSON.stringify(path.join(data, 'popcorn.db'))});\n` +
            "d.exec('CREATE TABLE IF NOT EXISTS added_by_v' + v + ' (x)');\nd.close();\n",
        ),
        ...env,
      },
    });
    child.on('message', (m: { op: string }) => {
      ops.push(m.op);
      child.send({ op: `${m.op}-done`, ok: true });
    });
    child.stdout?.resume();
    child.stderr?.resume();
    child.on('exit', (code) => {
      const f = path.join(data, 'update-status.json');
      resolve({ code, status: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null, ops });
    });
  });
}

function tables(): string[] {
  const db = new Database(path.join(data, 'popcorn.db'), { readonly: true });
  const t = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  db.close();
  return t;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-hub-updater-'));
  origin = path.join(root, 'origin.git');
  dev = path.join(root, 'dev');
  hub = path.join(root, 'hub');
  data = path.join(root, 'data');
  fs.mkdirSync(data);
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, dev);
  git(dev, 'checkout', '-q', '-b', 'main');
  v1 = commitVersion('1');
  git(root, 'clone', '-q', '-b', 'main', origin, hub);
  const db = new Database(path.join(data, 'popcorn.db'));
  db.exec("CREATE TABLE profiles (name TEXT); INSERT INTO profiles VALUES ('kept')");
  db.close();
});

describe('Windows and Mac updater (check 3)', () => {
  it('does nothing when already up to date (the app is not stopped)', async () => {
    const r = await runUpdater({});
    expect(r.code).toBe(0);
    expect(r.status).toMatchObject({ result: 'up_to_date', from: v1, to: v1 });
    expect(r.ops).toEqual([]);
    expect(git(hub, 'rev-parse', 'HEAD')).toBe(v1);
  });

  it('a good update moves to the new version and keeps its migration', async () => {
    const v2 = commitVersion('2');
    const r = await runUpdater({});
    expect(r.code).toBe(0);
    expect(r.status).toMatchObject({ result: 'updated', from: v1, to: v2 });
    expect(r.ops).toEqual(['stop', 'start']);
    expect(git(hub, 'rev-parse', 'HEAD')).toBe(v2);
    expect(tables()).toEqual(['added_by_v2', 'profiles']);
    expect(fs.readdirSync(path.join(data, 'backups')).some((f) => f.startsWith('pre-update-'))).toBe(true);
  });

  it('a failed smoke check rolls back to the previous version and restores the database', async () => {
    const v2 = commitVersion('2');
    // The smoke check fails on version 2 only, like a broken build.
    const r = await runUpdater({ SMOKE_FAIL_ON: '2' });
    expect(r.code).toBe(1);
    expect(r.status).toMatchObject({ result: 'rolled_back', from: v1, to: v2 });
    expect(r.status?.message).toContain('failed at: smoke check');
    expect(r.ops).toEqual(['stop', 'start', 'stop', 'start']);
    expect(git(hub, 'rev-parse', 'HEAD')).toBe(v1);
    expect(fs.readFileSync(path.join(hub, 'version.txt'), 'utf8').trim()).toBe('1');
    // The v2 migration is undone: the database is the copy from just before the update.
    expect(tables()).toEqual(['profiles']);
    const db = new Database(path.join(data, 'popcorn.db'), { readonly: true });
    expect(db.prepare('SELECT name FROM profiles').all()).toEqual([{ name: 'kept' }]);
    db.close();
    const log = fs.readFileSync(path.join(data, 'update.log'), 'utf8');
    expect(log).toContain('rolling back');
    expect(log).toContain('database restored');
  });

  it('a failed build also rolls back, before the migration runs', async () => {
    commitVersion('2');
    const r = await runUpdater({ BUILD_FAIL_ON: '2' });
    expect(r.code).toBe(1);
    expect(r.status?.result).toBe('rolled_back');
    expect(r.status?.message).toContain('failed at: build');
    expect(git(hub, 'rev-parse', 'HEAD')).toBe(v1);
    expect(tables()).toEqual(['profiles']);
  });

  it('reports failed when the rollback also fails its smoke check (control: never reported as updated)', async () => {
    commitVersion('2');
    const r = await runUpdater({ SMOKE_FAIL_ON: 'always' });
    expect(r.code).toBe(1);
    expect(r.status?.result).toBe('failed');
    expect(git(hub, 'rev-parse', 'HEAD')).toBe(v1);
  });

  it('clears the Check for updates now request, and a second updater waits its turn', async () => {
    fs.writeFileSync(path.join(data, 'update-requested'), 'x');
    await runUpdater({});
    expect(fs.existsSync(path.join(data, 'update-requested'))).toBe(false);
    // A lock held by a running process (this test) makes another updater stop at once without changing anything.
    fs.writeFileSync(path.join(data, 'update.lock'), String(process.pid));
    commitVersion('2');
    const r = await runUpdater({});
    expect(r.code).toBe(0);
    expect(r.ops).toEqual([]);
    expect(git(hub, 'rev-parse', 'HEAD')).toBe(v1);
  });
});
