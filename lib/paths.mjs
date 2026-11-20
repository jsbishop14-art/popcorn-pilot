// Where the hub keeps its files. On the Pi: PP_DATA_DIR=/var/lib/popcorn-pilot and
// PP_MASTER_KEY_FILE=/etc/popcorn-pilot/master.key (set by the service file, scripts/install-pi.sh).
import path from 'node:path';

export function dataDir() {
  return process.env.PP_DATA_DIR || path.join(process.cwd(), 'data');
}
export function dbFile() {
  return path.join(dataDir(), 'popcorn.db');
}
export function masterKeyFile() {
  return process.env.PP_MASTER_KEY_FILE || path.join(dataDir(), 'master.key');
}
export function secretsFile() {
  return path.join(dataDir(), 'secrets.enc');
}
export function backupsDir() {
  return path.join(dataDir(), 'backups');
}
export function updateStatusFile() {
  return path.join(dataDir(), 'update-status.json');
}
export function updateRequestFile() {
  return path.join(dataDir(), 'update-requested');
}
export function migrationsDir() {
  return process.env.PP_MIGRATIONS_DIR || path.join(process.cwd(), 'migrations');
}
