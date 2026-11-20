#!/usr/bin/env node
// Seed a development hub with placeholder profiles (no real names, no PINs). Refuses a hub that already has profiles.
// Usage: PP_DATA_DIR=data node scripts/seed.mjs
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { migrate } from '../lib/db/migrator.mjs';
import { dataDir, dbFile, migrationsDir } from '../lib/paths.mjs';

const PROFILES = [
  { name: 'Family', color: '#FF8A65', type: 'adult' },
  { name: 'Kid placeholder', color: '#7FC8A9', type: 'kid' },
  { name: 'Guest kid', color: '#8FB3FF', type: 'kid' },
];

fs.mkdirSync(dataDir(), { recursive: true });
const db = new Database(dbFile());
migrate(db, migrationsDir());
const { n } = db.prepare('SELECT count(*) AS n FROM profiles').get();
if (n > 0) {
  console.error(`refusing: this hub already has ${n} profiles`);
  process.exitCode = 1;
} else {
  db.transaction(() => {
    for (const p of PROFILES) {
      const r = db.prepare('INSERT INTO profiles (name, color, initial, type) VALUES (?, ?, ?, ?)').run(p.name, p.color, p.name[0], p.type);
      if (p.type === 'kid') db.prepare('INSERT INTO kid_safeguards (profile_id) VALUES (?)').run(r.lastInsertRowid);
    }
  })();
  console.log(`seeded ${PROFILES.length} placeholder profiles into ${dbFile()}`);
}
db.close();
