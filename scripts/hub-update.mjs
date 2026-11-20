#!/usr/bin/env node
// Windows and Mac updater (PP7), the same steps as the Pi's scripts/update.sh: pull main, install, build, migrate,
// restart, smoke check; on any failure roll back to the previous version and restore the database copied just
// before. The hub service (scripts/hub-service.mjs) runs it daily at 4:00 AM and when Settings asks (Check for
// updates now leaves <data>/update-requested), and stops and starts the app when this asks it to.
//
// Every command can be replaced through an environment variable, so the rollback is tested in temporary git repos
// without a hub computer (test/unit/hub-updater.test.ts). Uses nothing from node_modules: "npm ci" replaces them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const appDir = env.PP_APP_DIR || process.cwd();
const dataDir = env.PP_DATA_DIR || path.join(appDir, 'data');
const branch = env.PP_BRANCH || 'main';
const git = env.PP_GIT || 'git';
const cmds = {
  install: env.PP_INSTALL_CMD || 'npm ci --no-audit --no-fund',
  build: env.PP_BUILD_CMD || 'npm run build',
  migrate: env.PP_MIGRATE_CMD || 'node scripts/migrate.mjs',
  backup: env.PP_BACKUP_CMD || 'node scripts/backup.mjs',
  smoke: env.PP_SMOKE_CMD || 'node scripts/smoke.mjs',
  stop: env.PP_STOP_CMD || '',
  start: env.PP_START_CMD || '',
};
const statusFile = path.join(dataDir, 'update-status.json');
const logFile = path.join(dataDir, 'update.log');
const lockFile = path.join(dataDir, 'update.lock');
const db = path.join(dataDir, 'popcorn.db');

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(logFile, line);
  process.stdout.write(line);
}

function status(result, from, to, message = '') {
  fs.writeFileSync(statusFile, JSON.stringify({ at: new Date().toISOString(), result, from, to, message }) + '\n');
}

/** git, trusting the app folder even when another account installed it (the service runs as its own account). */
function gitOut(...args) {
  const r = spawnSync(git, ['-c', 'safe.directory=*', ...args], { cwd: appDir, encoding: 'utf8', env: { ...env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.error?.message || '').trim()}`);
  return r.stdout.trim();
}

// The hub service passes an IPC channel: "stop" and "start" ask it to stop or start the app.
function ask(op) {
  return new Promise((resolve) => {
    if (!process.send) return resolve(false);
    const done = (m) => {
      if (m && m.op === `${op}-done`) {
        process.off('message', done);
        resolve(m.ok !== false);
      }
    };
    process.on('message', done);
    process.send({ op });
    setTimeout(() => {
      process.off('message', done);
      resolve(false);
    }, 60_000).unref();
  });
}

async function step(name, cmd) {
  log(`step: ${name}`);
  if (name.startsWith('stop the app') && !cmds.stop) return (await ask('stop')) || (log('failed: the hub service did not stop the app'), false);
  if (name.startsWith('start the app') && !cmds.start) return (await ask('start')) || (log('failed: the hub service did not start the app'), false);
  const fd = fs.openSync(logFile, 'a');
  const r = spawnSync(cmd, { cwd: appDir, shell: true, stdio: ['ignore', fd, fd], env });
  fs.closeSync(fd);
  if (r.status !== 0) {
    log(`failed: ${cmd}`);
    return false;
  }
  return true;
}

/** One update at a time: a lock file holding this process id (a stale one, whose process is gone, is replaced). */
function takeLock() {
  try {
    fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    try {
      if (pid && pid !== process.pid) process.kill(pid, 0);
      return false;
    } catch {
      fs.writeFileSync(lockFile, String(process.pid));
      return true;
    }
  }
}

async function main() {
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  if (!takeLock()) {
    console.log('another update is running');
    return 0;
  }
  try {
    fs.rmSync(path.join(dataDir, 'update-requested'), { force: true });
    return await update();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

async function update() {
  const old = gitOut('rev-parse', 'HEAD');
  gitOut('fetch', '--quiet', 'origin', branch);
  const next = gitOut('rev-parse', `origin/${branch}`);
  if (old === next) {
    log(`up to date at ${old.slice(0, 7)}`);
    status('up_to_date', old, next);
    return 0;
  }
  log(`updating ${old.slice(0, 7)} -> ${next.slice(0, 7)}`);

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const pre = path.join(dataDir, 'backups', `pre-update-${stamp}-${old.slice(0, 7)}.db`);
  await step('stop the app', cmds.stop);
  if (fs.existsSync(db) && !(await step('back up the database', `${cmds.backup} --out "${pre}"`))) {
    status('failed', old, next, 'backup failed; nothing changed');
    await step('start the app', cmds.start);
    return 1;
  }

  let failed = '';
  gitOut('reset', '--quiet', '--hard', next);
  if (!(await step('install', cmds.install))) failed = 'install';
  if (!failed && !(await step('build', cmds.build))) failed = 'build';
  if (!failed && !(await step('migrate', cmds.migrate))) failed = 'migrate';
  if (!failed && !(await step('start the app', cmds.start))) failed = 'start';
  if (!failed && !(await step('smoke check', cmds.smoke))) failed = 'smoke check';
  if (!failed) {
    log(`updated to ${next.slice(0, 7)}`);
    status('updated', old, next);
    return 0;
  }

  log(`rolling back to ${old.slice(0, 7)} after: ${failed}`);
  await step('stop the app', cmds.stop);
  gitOut('reset', '--quiet', '--hard', old);
  if (fs.existsSync(pre)) {
    fs.copyFileSync(pre, db);
    fs.rmSync(`${db}-wal`, { force: true });
    fs.rmSync(`${db}-shm`, { force: true });
    log(`database restored from ${pre}`);
  }
  let ok = await step('install (rollback)', cmds.install);
  ok = ok && (await step('build (rollback)', cmds.build));
  ok = ok && (await step('start the app (rollback)', cmds.start));
  ok = ok && (await step('smoke check (rollback)', cmds.smoke));
  if (ok) status('rolled_back', old, next, `update to ${next.slice(0, 7)} failed at: ${failed}; back on ${old.slice(0, 7)}`);
  else status('failed', old, next, `update failed at: ${failed}, and the rollback did not pass its smoke check`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    try {
      const message = err instanceof Error ? err.message : String(err);
      log(`failed: ${message}`);
      status('failed', '', '', message.slice(0, 300));
    } catch {
      // the data folder is not writable
    }
    process.exit(1);
  });
