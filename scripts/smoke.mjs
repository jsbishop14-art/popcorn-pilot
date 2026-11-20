#!/usr/bin/env node
// Smoke check after an update: the app answers, PIN entry loads, and every expected database object is there.
// Waits up to SMOKE_TIMEOUT seconds (default 90) for the app to come up. Exit 0 = healthy.
import fs from 'node:fs';
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
      // The catalog answers and still asks for a PIN; the sample catalog is in place for when there is no TMDB key.
      const browse = await get('/api/catalog/browse');
      if (browse.status !== 401) throw new Error(`catalog answered ${browse.status} without a PIN (want 401)`);
      if (!fs.existsSync(new URL('../catalog-stub/titles.json', import.meta.url))) throw new Error('sample catalog missing');
      // Playlists and playback (PP3) answer and still ask for a PIN.
      for (const p of ['/api/playlists', '/api/playback']) {
        const r = await get(p);
        if (r.status !== 401) throw new Error(`${p} answered ${r.status} without a PIN (want 401)`);
      }
      // Kid safeguards (PP4): requests, alerts and tasks answer and still ask for a PIN; the kid screens' channel
      // route refuses a call without a channel token.
      for (const p of ['/api/requests', '/api/alerts', '/api/tasks', '/api/channel/kid']) {
        const r = await get(p);
        if (r.status !== 401) throw new Error(`${p} answered ${r.status} without a PIN (want 401)`);
      }
      // Routines, the Family Album and ad blocking (PP5) answer and still ask for a PIN; the album's channel route
      // refuses a call without a channel token.
      for (const p of ['/api/routines', '/api/adblock', '/api/channel/album']) {
        const r = await get(p);
        if (r.status !== 401) throw new Error(`${p} answered ${r.status} without a PIN (want 401)`);
      }
      const db = new Database(dbFile(), { readonly: true });
      const { checked, missing } = verify(db, migrationsDir());
      db.close();
      if (missing.length) throw new Error(`database missing ${missing.join(', ')}`);
      console.log(`smoke ok: app answers, PIN entry loads, catalog, playlists, playback, kid safeguards, routines and ad blocking ask for a PIN, ${checked} database objects present`);
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
