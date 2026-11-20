#!/usr/bin/env node
// Copy the hub database (a safe online copy) and the encrypted secret store into the backups folder.
// Nightly by the backup timer; also before every update. Keeps the newest 14 nightly copies.
// Usage: node scripts/backup.mjs [--out <file.db>]
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backupsDir, dbFile, secretsFile } from '../lib/paths.mjs';

const KEEP = 14;
const i = process.argv.indexOf('--out');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const out = i > 0 ? process.argv[i + 1] : path.join(backupsDir(), `popcorn-${stamp}.db`);

async function main() {
  if (!fs.existsSync(dbFile())) {
    console.log('no database yet; nothing to back up');
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const db = new Database(dbFile(), { readonly: true });
  try {
    await db.backup(out);
  } finally {
    db.close();
  }
  if (fs.existsSync(secretsFile())) fs.copyFileSync(secretsFile(), out.replace(/\.db$/, '') + '.secrets.enc');
  fs.chmodSync(out, 0o600);
  console.log(`backed up to ${out}`);
  if (i < 0) {
    const nightly = fs.readdirSync(backupsDir()).filter((f) => /^popcorn-\d{8}-\d{6}\.db$/.test(f)).sort();
    for (const f of nightly.slice(0, Math.max(0, nightly.length - KEEP))) {
      fs.rmSync(path.join(backupsDir(), f));
      fs.rmSync(path.join(backupsDir(), f.replace(/\.db$/, '.secrets.enc')), { force: true });
    }
  }
}

main().catch((err) => {
  console.error(`backup failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
