#!/usr/bin/env node
// The hub service on a Windows PC or a Mac (PP7). Started when the computer starts (Windows: a scheduled task that
// runs before anyone signs in; Mac: a launchd daemon), it:
//   - runs the app (next start) and starts it again within seconds if it stops
//   - backs up the database nightly at 3:00 AM (scripts/backup.mjs)
//   - runs the updater (scripts/hub-update.mjs) daily at 4:00 AM and when Settings asks (Check for updates now),
//     stopping and starting the app when the updater asks
// A time missed while the computer was asleep or off runs when it is back. Nothing here changes a system setting.
//
// Usage: node scripts/hub-service.mjs --config <hub.json>
//   hub.json: { "host": "windows"|"mac", "port": 8765, "appDir", "dataDir", "keyFile", "logDir", "pathDirs": [] }
// Uses nothing from node_modules (the updater replaces them while this runs).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const i = process.argv.indexOf('--config');
if (i < 0 || !process.argv[i + 1]) {
  console.error('usage: node scripts/hub-service.mjs --config <hub.json>');
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
const appDir = cfg.appDir;
const dataDir = cfg.dataDir;
const logDir = cfg.logDir || path.join(dataDir, 'logs');
const port = String(cfg.port || 8765);
const TICK_MS = Number(process.env.PP_SERVICE_TICK_MS || 5000);
fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: port,
  PP_HOST: cfg.host,
  PP_APP_DIR: appDir,
  PP_DATA_DIR: dataDir,
  PP_MASTER_KEY_FILE: cfg.keyFile,
  PP_SUPERVISOR_PID: String(process.pid),
  GIT_TERMINAL_PROMPT: '0',
  npm_config_update_notifier: 'false',
  npm_config_fund: 'false',
  ...(cfg.npmCache ? { npm_config_cache: cfg.npmCache } : {}),
  ...(cfg.git ? { PP_GIT: cfg.git } : {}),
};
const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
env[pathKey] = [path.dirname(process.execPath), ...(cfg.pathDirs || []), env[pathKey]].filter(Boolean).join(path.delimiter);

// ------------------------------------------------------------------------------------------------- logs

const MAX_LOG = 5 * 1024 * 1024;
function logStream(name) {
  const file = path.join(logDir, name);
  try {
    if (fs.statSync(file).size > MAX_LOG) fs.renameSync(file, file + '.1');
  } catch {
    // no log yet
  }
  return fs.openSync(file, 'a');
}
function say(msg) {
  const fd = logStream('service.log');
  fs.writeSync(fd, `${new Date().toISOString()} ${msg}\n`);
  fs.closeSync(fd);
}

// ------------------------------------------------------------------------------------------------- the app

let app = null;
let held = false; // stopped on purpose (the updater asked)
let quitting = false;
let backoff = 2000;
let startedAt = 0;

function startApp() {
  if (app || quitting) return;
  held = false;
  const fd = logStream('app.log');
  const nextBin = path.join(appDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  startedAt = Date.now();
  const child = spawn(process.execPath, [nextBin, 'start', '-p', port, '-H', '0.0.0.0'], { cwd: appDir, env, stdio: ['ignore', fd, fd], windowsHide: true });
  fs.closeSync(fd);
  app = child;
  say(`app started (pid ${child.pid}) on port ${port}`);
  child.on('exit', (code, signal) => {
    if (app === child) app = null;
    say(`app stopped (code ${code}, signal ${signal})`);
    if (held || quitting) return;
    // Started again after 2 s, doubling up to a minute while it keeps failing; back to 2 s after a minute running.
    if (Date.now() - startedAt > 60_000) backoff = 2000;
    setTimeout(startApp, backoff).unref();
    backoff = Math.min(backoff * 2, 60_000);
  });
  child.on('error', (err) => say(`app could not start: ${err.message}`));
}

function stopApp() {
  held = true;
  return new Promise((resolve) => {
    const child = app;
    if (!child) return resolve(true);
    const t = setTimeout(() => {
      child.kill('SIGKILL');
    }, 15_000);
    child.once('exit', () => {
      clearTimeout(t);
      resolve(true);
    });
    child.kill('SIGTERM');
  });
}

// ------------------------------------------------------------------------------------------------- schedules

const stateFile = path.join(dataDir, 'service-state.json');
function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    // First start: count both jobs as done now, so nothing runs at once after the install.
    const now = Date.now();
    const s = { lastBackupAt: now, lastUpdateAt: now };
    fs.writeFileSync(stateFile, JSON.stringify(s));
    return s;
  }
}
function writeState(s) {
  fs.writeFileSync(stateFile, JSON.stringify(s));
}

/** The latest time today (or yesterday, before the hour) at hour:00 local time. */
function lastSlot(hour, now = new Date()) {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

let busy = false;

function runScript(script, args, name, ipc) {
  return new Promise((resolve) => {
    const fd = logStream(`${name}.log`);
    const child = spawn(process.execPath, [path.join(appDir, 'scripts', script), ...args], {
      cwd: appDir,
      env,
      stdio: ipc ? ['ignore', fd, fd, 'ipc'] : ['ignore', fd, fd],
      windowsHide: true,
    });
    fs.closeSync(fd);
    if (ipc) {
      child.on('message', async (m) => {
        if (m?.op === 'stop') {
          await stopApp();
          child.send({ op: 'stop-done', ok: true });
        } else if (m?.op === 'start') {
          startApp();
          child.send({ op: 'start-done', ok: Boolean(app) });
        }
      });
    }
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      say(`${name} could not start: ${err.message}`);
      resolve(1);
    });
  });
}

async function tick() {
  if (busy || quitting) return;
  busy = true;
  try {
    const s = readState();
    const requested = fs.existsSync(path.join(dataDir, 'update-requested'));
    if (s.lastBackupAt < lastSlot(3)) {
      say('nightly backup');
      const code = await runScript('backup.mjs', [], 'backup', false);
      say(`nightly backup ${code === 0 ? 'done' : `failed (code ${code})`}`);
      writeState({ ...readState(), lastBackupAt: Date.now() });
    }
    if (requested || s.lastUpdateAt < lastSlot(4)) {
      say(requested ? 'update check (asked from Settings)' : 'daily update check');
      const code = await runScript('hub-update.mjs', [], 'update', true);
      say(`update check ended (code ${code})`);
      writeState({ ...readState(), lastUpdateAt: Date.now() });
      fs.rmSync(path.join(dataDir, 'update-requested'), { force: true });
      // Whatever the updater did, the app runs afterwards.
      startApp();
    }
  } catch (err) {
    say(`schedule check failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    busy = false;
  }
}

function quit(signal) {
  if (quitting) return;
  quitting = true;
  say(`service stopping (${signal})`);
  const child = app;
  if (!child) process.exit(0);
  child.once('exit', () => process.exit(0));
  child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => quit('SIGTERM'));
process.on('SIGINT', () => quit('SIGINT'));
process.on('SIGHUP', () => quit('SIGHUP'));

say(`service started (pid ${process.pid}, ${cfg.host}, node ${process.version})`);
startApp();
setInterval(() => void tick(), TICK_MS);
