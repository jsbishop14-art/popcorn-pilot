#!/usr/bin/env node
// Apply pending migrations to the hub database, then read back every expected object.
// Usage: node scripts/migrate.mjs [--verify-only]
// Exit 0: all expected objects present. Exit 1: something missing (the updater rolls back).
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { migrate, verify } from '../lib/db/migrator.mjs';
import { dataDir, dbFile, migrationsDir } from '../lib/paths.mjs';

const verifyOnly = process.argv.includes('--verify-only');
fs.mkdirSync(dataDir(), { recursive: true });
const db = new Database(dbFile());
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
try {
  if (!verifyOnly) {
    const applied = migrate(db, migrationsDir());
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'applied: none (up to date)');
  }
  const { checked, missing } = verify(db, migrationsDir());
  console.log(`expected objects checked: ${checked}, missing: ${missing.length}`);
  for (const m of missing) console.log(`  missing ${m}`);
  process.exitCode = missing.length ? 1 : 0;
} catch (err) {
  console.error(`migrate failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
} finally {
  db.close();
}
