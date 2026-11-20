// Hub status for Settings, and the Check for updates now request (handoff 11.2).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupsDir, dbFile, updateRequestFile, updateStatusFile } from './paths.mjs';

export interface UpdateStatus {
  at: string;
  result: 'updated' | 'up_to_date' | 'rolled_back' | 'failed';
  from?: string;
  to?: string;
  message?: string;
}

export interface HubStatus {
  version: string;
  builtAt: string | null;
  uptimeSeconds: number;
  node: string;
  arch: string;
  dbBytes: number;
  lastBackup: string | null;
  lastUpdate: UpdateStatus | null;
  updateRequested: boolean;
}

function readVersion(): { sha: string; builtAt: string | null } {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/version.gen.json'), 'utf8')) as { sha: string; built_at: string };
    return { sha: v.sha, builtAt: v.built_at };
  } catch {
    return { sha: 'dev', builtAt: null };
  }
}

function lastBackup(): string | null {
  try {
    const files = fs.readdirSync(backupsDir()).filter((f) => f.endsWith('.db')).sort();
    const last = files.at(-1);
    return last ? fs.statSync(path.join(backupsDir(), last)).mtime.toISOString() : null;
  } catch {
    return null;
  }
}

export function hubStatus(): HubStatus {
  const v = readVersion();
  let dbBytes = 0;
  try {
    dbBytes = fs.statSync(dbFile()).size;
  } catch {
    // no database yet
  }
  let lastUpdate: UpdateStatus | null = null;
  try {
    lastUpdate = JSON.parse(fs.readFileSync(updateStatusFile(), 'utf8')) as UpdateStatus;
  } catch {
    // never updated
  }
  return {
    version: v.sha,
    builtAt: v.builtAt,
    uptimeSeconds: Math.round(os.uptime()),
    node: process.version,
    arch: process.arch,
    dbBytes,
    lastBackup: lastBackup(),
    lastUpdate,
    updateRequested: fs.existsSync(updateRequestFile()),
  };
}

/** Leaves a request file; on the Pi a systemd path unit sees it and runs the updater. */
export function requestUpdate(): void {
  fs.mkdirSync(path.dirname(updateRequestFile()), { recursive: true });
  fs.writeFileSync(updateRequestFile(), new Date().toISOString() + '\n');
}
