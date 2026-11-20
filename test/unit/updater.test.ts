// Check 6: the Pi updater. In temporary git repos (a stand-in "GitHub" and a stand-in "Pi" checkout): a good update
// moves to the new version; a failed smoke check rolls back to the previous version and restores the database.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

const UPDATE = path.join(process.cwd(), 'scripts/update.sh');
const BACKUP = path.join(process.cwd(), 'scripts/backup.mjs');

let root: string;
let origin: string;
let dev: string;
let pi: string;
let data: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
}

function commitVersion(v: string): string {
  fs.writeFileSync(path.join(dev, 'version.txt'), v + '\n');
  git(dev, 'add', '.');
  git(dev, 'commit', '-q', '-m', `version ${v}`);
  git(dev, 'push', '-q', 'origin', 'HEAD:main');
  return git(dev, 'rev-parse', 'HEAD');
}

function runUpdater(env: Record<string, string>) {
  const r = spawnSync('bash', [UPDATE], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PP_APP_DIR: pi,
      PP_DATA_DIR: data,
      PP_INSTALL_CMD: 'true',
      PP_BUILD_CMD: 'true',
      PP_STOP_CMD: 'true',
      PP_START_CMD: 'true',
      PP_BACKUP_CMD: `node ${BACKUP}`,
      // "Migration": add a table, as a new build's migration would.
      PP_MIGRATE_CMD: `node -e "const D=require('${require.resolve('better-sqlite3')}');const d=new D('${data}/popcorn.db');d.exec('CREATE TABLE IF NOT EXISTS added_by_v' + require('fs').readFileSync('version.txt','utf8').trim() + ' (x)');d.close()"`,
      ...env,
    },
  });
  const status = fs.existsSync(path.join(data, 'update-status.json')) ? JSON.parse(fs.readFileSync(path.join(data, 'update-status.json'), 'utf8')) : null;
  return { code: r.status, out: r.stdout + r.stderr, status };
}

function tables(): string[] {
  const db = new Database(path.join(data, 'popcorn.db'), { readonly: true });
  const t = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  db.close();
  return t;
}

let v1: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-updater-'));
  origin = path.join(root, 'origin.git');
  dev = path.join(root, 'dev');
  pi = path.join(root, 'pi');
  data = path.join(root, 'data');
  fs.mkdirSync(data);
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, dev);
  git(dev, 'checkout', '-q', '-b', 'main');
  v1 = commitVersion('1');
  git(root, 'clone', '-q', '-b', 'main', origin, pi);
  const db = new Database(path.join(data, 'popcorn.db'));
  db.exec("CREATE TABLE profiles (name TEXT); INSERT INTO profiles VALUES ('kept')");
  db.close();
});

describe('Pi updater (check 6)', () => {
  it('does nothing when already up to date', () => {
    const r = runUpdater({ PP_SMOKE_CMD: 'true' });
    expect(r.code).toBe(0);
    expect(r.status).toMatchObject({ result: 'up_to_date', from: v1, to: v1 });
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(v1);
  });

  it('a good update moves to the new version and keeps its migration', () => {
    const v2 = commitVersion('2');
    const r = runUpdater({ PP_SMOKE_CMD: 'true' });
    expect(r.code).toBe(0);
    expect(r.status).toMatchObject({ result: 'updated', from: v1, to: v2 });
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(v2);
    expect(tables()).toEqual(['added_by_v2', 'profiles']);
    expect(fs.readdirSync(path.join(data, 'backups')).some((f) => f.startsWith('pre-update-'))).toBe(true);
  });

  it('a failed smoke check rolls back to the previous version and restores the database', () => {
    const v2 = commitVersion('2');
    // The smoke check fails on version 2 only, like a broken build.
    const r = runUpdater({ PP_SMOKE_CMD: 'test "$(cat version.txt)" != 2' });
    expect(r.code).toBe(1);
    expect(r.status).toMatchObject({ result: 'rolled_back', from: v1, to: v2 });
    expect(r.status.message).toContain('failed at: smoke check');
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(v1);
    expect(fs.readFileSync(path.join(pi, 'version.txt'), 'utf8').trim()).toBe('1');
    // The v2 migration is undone: the database is the copy from just before the update.
    expect(tables()).toEqual(['profiles']);
    const db = new Database(path.join(data, 'popcorn.db'), { readonly: true });
    expect(db.prepare('SELECT name FROM profiles').all()).toEqual([{ name: 'kept' }]);
    db.close();
    const log = fs.readFileSync(path.join(data, 'update.log'), 'utf8');
    expect(log).toContain('rolling back');
    expect(log).toContain('database restored');
  });

  it('a failed build also rolls back, before the migration runs', () => {
    commitVersion('2');
    const r = runUpdater({ PP_SMOKE_CMD: 'true', PP_BUILD_CMD: 'test "$(cat version.txt)" != 2' });
    expect(r.code).toBe(1);
    expect(r.status.result).toBe('rolled_back');
    expect(r.status.message).toContain('failed at: build');
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(v1);
    expect(tables()).toEqual(['profiles']);
  });

  it('reports failed when the rollback also fails its smoke check', () => {
    commitVersion('2');
    const r = runUpdater({ PP_SMOKE_CMD: 'false' });
    expect(r.code).toBe(1);
    expect(r.status.result).toBe('failed');
    expect(git(pi, 'rev-parse', 'HEAD')).toBe(v1);
  });

  it('clears the Check for updates now request', () => {
    fs.writeFileSync(path.join(data, 'update-requested'), 'x');
    runUpdater({ PP_SMOKE_CMD: 'true' });
    expect(fs.existsSync(path.join(data, 'update-requested'))).toBe(false);
  });
});
