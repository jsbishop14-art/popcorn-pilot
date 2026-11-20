// Migrations read back their expected objects; profiles and TVs work and record activity.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir } from './helpers';
import { listMigrations, migrate, verify } from '@/lib/db/migrator.mjs';
import { createProfile, deleteProfile, describeProfileChange, getProfile, listProfiles, updateProfile } from '@/lib/profiles';
import { addTv, deleteTv, getTv, listTvs, refreshTvs, updateTv } from '@/lib/tvs';
import { getDb } from '@/lib/db';
import { startFakeRoku, type FakeRoku } from '../fake-roku/server';
import { BadRequest } from '@/lib/route';

const MIG = path.join(process.cwd(), 'migrations');

describe('migrations', () => {
  it('apply in order and every expected object reads back', () => {
    const db = new Database(':memory:');
    expect(migrate(db, MIG)).toEqual(listMigrations(MIG).map((m) => m.file));
    const v = verify(db, MIG);
    expect(v.missing).toEqual([]);
    expect(v.checked).toBe(listMigrations(MIG).reduce((n, m) => n + m.expected.length, 0));
    expect(v.checked).toBeGreaterThanOrEqual(13);
    expect(migrate(db, MIG)).toEqual([]);
  });

  it('reports a missing object (control)', () => {
    const db = new Database(':memory:');
    migrate(db, MIG);
    db.exec('DROP TABLE activity');
    expect(verify(db, MIG).missing).toContain('table activity (001_init.sql)');
  });

  it('reads back an added column, and reports one that is missing (control)', () => {
    const db = new Database(':memory:');
    migrate(db, MIG);
    expect(listMigrations(MIG).find((m) => m.file === '006_channel.sql')?.expected).toEqual([
      { type: 'column', name: 'playback.bridge_until' },
      { type: 'column', name: 'playback.warn_resume_at' },
    ]);
    expect(verify(db, MIG).missing).toEqual([]);
    db.exec('ALTER TABLE playback DROP COLUMN warn_resume_at');
    expect(verify(db, MIG).missing).toEqual(['column playback.warn_resume_at (006_channel.sql)']);
  });

  it('generated types are up to date', () => {
    const out = execFileSync('node', ['scripts/gen-types.mjs', '--check'], { encoding: 'utf8' });
    expect(out).toContain('up to date');
  });
});

describe('profiles', () => {
  beforeAll(() => freshDataDir());

  it('creates, edits and soft-deletes profiles; nothing is built in', () => {
    expect(listProfiles()).toEqual([]);
    const kid = createProfile({ name: '  Kid  one ', color: '#7FC8A9', type: 'kid' });
    expect(kid).toMatchObject({ name: 'Kid one', initial: 'K', type: 'kid' });
    expect(kid.summary).toBe('TV-Y, TV-Y7, TV-G, G · 60 min weekdays');
    const adult = createProfile({ name: 'family', color: '#FF8A65', type: 'adult' });
    expect(adult).toMatchObject({ initial: 'F', summary: 'No limits' });
    const r = updateProfile(kid.id, { name: 'Kid two', type: 'adult' });
    expect(r && describeProfileChange(r.before, r.after)).toBe('Renamed Kid one to Kid two, changed Kid two to Adult');
    // Safeguards are kept so switching back restores them.
    expect(getDb().prepare('SELECT count(*) AS n FROM kid_safeguards WHERE profile_id = ?').get(kid.id)).toEqual({ n: 1 });
    expect(deleteProfile(kid.id)?.name).toBe('Kid two');
    expect(getProfile(kid.id)).toBeNull();
    expect(getDb().prepare('SELECT deleted_at FROM profiles WHERE id = ?').get(kid.id)).toMatchObject({ deleted_at: expect.any(String) });
    expect(listProfiles().map((p) => p.name)).toEqual(['family']);
  });

  it('refuses bad input', () => {
    expect(() => createProfile({ name: '', color: '#7FC8A9', type: 'kid' })).toThrow(BadRequest);
    expect(() => createProfile({ name: 'x'.repeat(41), color: '#7FC8A9', type: 'kid' })).toThrow(BadRequest);
    expect(() => createProfile({ name: 'A', color: '#000000', type: 'kid' })).toThrow(BadRequest);
    expect(() => createProfile({ name: 'A', color: '#7FC8A9', type: 'teen' })).toThrow(BadRequest);
  });
});

describe('TVs (check 5, hub side)', () => {
  let roku: FakeRoku;
  beforeAll(async () => {
    freshDataDir();
    roku = await startFakeRoku({ name: 'Den Roku', serial: 'S9', model: 'Roku Express' });
  });
  afterAll(async () => roku.close());

  it('adds a TV by address and reads its name from the TV', async () => {
    const tv = await addTv({ address: `127.0.0.1:${roku.port}`, room: 'Living room' });
    expect(tv).toMatchObject({ name: 'Den Roku', room: 'Living room', online: true, model: 'Roku Express', port: roku.port });
    await expect(addTv({ address: `127.0.0.1:${roku.port}` })).rejects.toThrow('already added');
  });

  it('adds a TV that does not answer, shown as offline', async () => {
    const tv = await addTv({ address: '127.0.0.1:1', name: 'Guest room' });
    expect(tv).toMatchObject({ name: 'Guest room', online: false });
  });

  it('refuses addresses outside the home network', async () => {
    await expect(addTv({ address: '8.8.8.8' })).rejects.toThrow(BadRequest);
    await expect(addTv({ address: 'roku.example.com' })).rejects.toThrow(BadRequest);
  });

  it('refresh marks a TV offline when it stops answering, and online again', async () => {
    const den = listTvs().find((t) => t.name === 'Den Roku');
    if (!den) throw new Error('missing');
    getDb().prepare('UPDATE tvs SET port = 2 WHERE id = ?').run(den.id);
    expect((await refreshTvs(500)).find((t) => t.id === den.id)?.online).toBe(false);
    getDb().prepare('UPDATE tvs SET port = ? WHERE id = ?').run(roku.port, den.id);
    expect((await refreshTvs(500)).find((t) => t.id === den.id)?.online).toBe(true);
  });

  it('renames, sets room and default profile, and soft-deletes', () => {
    const p = createProfile({ name: 'Kid', color: '#8FB3FF', type: 'kid' });
    const tv = listTvs()[0];
    const r = updateTv(tv.id, { name: 'Living room', defaultProfileId: p.id });
    expect(r?.after).toMatchObject({ name: 'Living room', defaultProfileName: 'Kid' });
    expect(() => updateTv(tv.id, { defaultProfileId: 999 })).toThrow(BadRequest);
    deleteProfile(p.id);
    expect(getTv(tv.id)?.defaultProfileId).toBeNull();
    expect(deleteTv(tv.id)?.name).toBe('Living room');
    expect(getTv(tv.id)).toBeNull();
  });
});
