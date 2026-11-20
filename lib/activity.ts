// Activity history (handoff 3.5): which PIN, from which device, what changed, when.
import { getDb } from './db';
import type { ActivityRow } from './db/types.gen';

export type ActivityPin = 'adult' | 'guest' | 'kid' | 'hub';

export function logActivity(e: { pinType: ActivityPin; device: string; action: string; summary: string }): void {
  getDb()
    .prepare('INSERT INTO activity (pin_type, device, action, summary) VALUES (?, ?, ?, ?)')
    .run(e.pinType, e.device, e.action, e.summary.slice(0, 300));
}

export function listActivity(opts: { pinType?: 'adult' | 'guest'; limit?: number; before?: number } = {}): ActivityRow[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.pinType) {
    where.push('pin_type = ?');
    args.push(opts.pinType);
  }
  if (opts.before) {
    where.push('id < ?');
    args.push(opts.before);
  }
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return getDb()
    .prepare(`SELECT * FROM activity ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`)
    .all(...args) as ActivityRow[];
}
