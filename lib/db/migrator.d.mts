import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  file: string;
  sql: string;
  expected: { type: string; name: string }[];
}
export function listMigrations(dir: string): Migration[];
export function migrate(db: Database.Database, dir: string): string[];
export function verify(db: Database.Database, dir: string): { checked: number; missing: string[] };
