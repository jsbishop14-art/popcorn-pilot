import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getDb } from '@/lib/db';

/** A fresh, empty hub data directory for this test file. */
export function freshDataDir(): string {
  closeDb();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-test-'));
  process.env.PP_DATA_DIR = dir;
  delete process.env.PP_MASTER_KEY_FILE;
  getDb();
  return dir;
}

export function resetLockout(): void {
  getDb().prepare('UPDATE pin_lockout SET failures = 0, locked_until = 0 WHERE id = 1').run();
}

export const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  computer: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
};
