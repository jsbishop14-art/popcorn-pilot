#!/usr/bin/env node
// Smoke check after an update: the app answers, PIN entry loads, and every expected database object is there.
// Waits up to SMOKE_TIMEOUT seconds (default 90) for the app to come up. Exit 0 = healthy.
import Database from 'better-sqlite3';
import { verify } from '../lib/db/migrator.mjs';
import { dbFile, migrationsDir } from '../lib/paths.mjs';

const base = process.env.SMOKE_URL || `http://127.0.0.1:${process.env.PORT || 80}`;
const deadline = Date.now() + Number(process.env.SMOKE_TIMEOUT || 90) * 1000;

async function get(path) {
  const res = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  return { status: res.status, text: await res.text() };
}

async function main() {
  let last = '';
  while (Date.now() < deadline) {
    try {
      const state = await get('/api/auth/state');
      const body = JSON.parse(state.text);
      if (state.status !== 200 || typeof body.setUp !== 'boolean') throw new Error(`auth state answered ${state.status}`);
      const pin = await get('/pin');
      if (pin.status !== 200 || !pin.text.includes('Enter PIN')) throw new Error(`PIN entry answered ${pin.status}`);
      const db = new Database(dbFile(), { readonly: true });
      const { checked, missing } = verify(db, migrationsDir());
      db.close();
      if (missing.length) throw new Error(`database missing ${missing.join(', ')}`);
      console.log(`smoke ok: app answers, PIN entry loads, ${checked} database objects present`);
      return 0;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error(`smoke failed: ${last}`);
  return 1;
}

process.exitCode = await main();
