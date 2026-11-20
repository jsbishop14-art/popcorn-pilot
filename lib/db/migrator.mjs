// Migrations: plain SQL files in migrations/, applied in order, each listing the objects it should produce
// ("-- expect: <type> <name>"; a column added to a table is "-- expect: column <table>.<column>"). Plain JS so
// the Pi updater can run it without a TypeScript toolchain.
import fs from 'node:fs';
import path from 'node:path';

const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;
const EXPECT_RE = /^--\s*expect:\s*(table|index|trigger|view|column)\s+([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\s*$/gm;

/** @param {string} dir */
export function listMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const expected = [...sql.matchAll(EXPECT_RE)].map((m) => ({ type: m[1], name: m[2] }));
      return { version: Number(file.slice(0, 3)), file, sql, expected };
    });
}

/** @param {import('better-sqlite3').Database} db */
function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, file TEXT NOT NULL, applied_at TEXT NOT NULL)`);
}

/**
 * Apply every pending migration, each in its own transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {string} dir
 * @returns {string[]} files applied
 */
export function migrate(db, dir) {
  ensureTable(db);
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const applied = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, file, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.file,
        new Date().toISOString(),
      );
    })();
    applied.push(m.file);
  }
  return applied;
}

/**
 * Read back every expected object of every applied migration.
 * @param {import('better-sqlite3').Database} db
 * @param {string} dir
 * @returns {{ checked: number, missing: string[] }}
 */
export function verify(db, dir) {
  ensureTable(db);
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const have = new Set(db.prepare('SELECT type, name FROM sqlite_master').all().map((r) => `${r.type} ${r.name}`));
  for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
    for (const c of db.prepare('SELECT name FROM pragma_table_info(?)').all(t.name)) have.add(`column ${t.name}.${c.name}`);
  }
  const missing = [];
  let checked = 0;
  for (const m of listMigrations(dir)) {
    if (!done.has(m.version)) {
      missing.push(`migration ${m.file} not applied`);
      continue;
    }
    for (const e of m.expected) {
      checked += 1;
      if (!have.has(`${e.type} ${e.name}`)) missing.push(`${e.type} ${e.name} (${m.file})`);
    }
  }
  return { checked, missing };
}
