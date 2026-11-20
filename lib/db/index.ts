import fs from 'node:fs';
import Database from 'better-sqlite3';
import { migrate } from './migrator.mjs';
import { dataDir, dbFile, migrationsDir } from '../paths.mjs';

type Db = Database.Database;

const g = globalThis as unknown as { __ppDb?: Db; __ppDbFile?: string };

/** The hub database. Opens (and migrates) on first use; reopens if PP_DATA_DIR changed (tests). */
export function getDb(): Db {
  const file = dbFile();
  if (g.__ppDb && g.__ppDbFile === file) return g.__ppDb;
  if (g.__ppDb) g.__ppDb.close();
  fs.mkdirSync(dataDir(), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db, migrationsDir());
  g.__ppDb = db;
  g.__ppDbFile = file;
  return db;
}

export function closeDb(): void {
  if (g.__ppDb) g.__ppDb.close();
  g.__ppDb = undefined;
  g.__ppDbFile = undefined;
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}
