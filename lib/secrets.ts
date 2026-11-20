// The secret store: one file encrypted with AES-256-GCM. The key lives in a separate file readable only by the
// service user (on the Pi: /etc/popcorn-pilot/master.key, made by the install script). Holds the PIN hashes, the
// session secret and, later, the TMDB key. Values never go to logs or the database.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { masterKeyFile, secretsFile } from './paths.mjs';

export interface Secrets {
  adult_pin_hash?: string;
  guest_pin_hash?: string;
  session_secret?: string;
  tmdb_api_key?: string;
}

function writePrivate(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function masterKey(): Buffer {
  const file = masterKeyFile();
  if (!fs.existsSync(file)) writePrivate(file, crypto.randomBytes(32).toString('hex') + '\n');
  const key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  if (key.length !== 32) throw new Error('secret store key file is not 32 bytes of hex');
  return key;
}

export function readSecrets(): Secrets {
  const file = secretsFile();
  if (!fs.existsSync(file)) return {};
  const box = JSON.parse(fs.readFileSync(file, 'utf8')) as { v: number; iv: string; tag: string; data: string };
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as Secrets;
}

export function writeSecrets(next: Secrets): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
  const box = { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  writePrivate(secretsFile(), JSON.stringify(box) + '\n');
}

export function updateSecrets(patch: Partial<Secrets>): Secrets {
  const next = { ...readSecrets(), ...patch };
  writeSecrets(next);
  return next;
}

/** The session secret, created on first use. */
export function sessionSecret(): string {
  const s = readSecrets();
  if (s.session_secret) return s.session_secret;
  return updateSecrets({ session_secret: crypto.randomBytes(32).toString('hex') }).session_secret as string;
}
