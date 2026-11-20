// PP6: the sideload script (run later on the Pi, with hardware). Here only what needs no Roku: a home network address
// is required, the password must be given, and the dry run says what it would send. Nothing is sent from here.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.join(process.cwd(), 'scripts', 'roku-sideload.sh');

function run(args: string[], env: Record<string, string> = {}) {
  const e: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (!('ROKU_DEV_PASSWORD' in env)) delete e.ROKU_DEV_PASSWORD;
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: e, timeout: 180_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('roku-sideload.sh', () => {
  it('dry run on a home network address: says what it would send, sends nothing', () => {
    const r = run(['--dry-run', '192.168.1.40']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^\[dry run\] would send build\/popcorn-pilot-channel\.zip \(\d+ bytes\) to http:\/\/192\.168\.1\.40\/plugin_install as rokudev/m);
  }, 200_000);

  it('refuses an address outside the home network (control)', () => {
    for (const a of ['8.8.8.8', '172.32.0.1', '192.169.1.1', 'roku.example.com', '300.1.1.1']) {
      const r = run(['--dry-run', a]);
      expect([a, r.code]).toEqual([a, 2]);
      expect(r.out).toContain('is not a home network address');
    }
    for (const a of ['10.0.0.5', '172.16.4.2', '172.31.255.1']) expect(run(['--dry-run', a]).code).toBe(0);
  });

  it('needs the developer password from ROKU_DEV_PASSWORD (asked before anything is sent)', () => {
    const r = run(['192.168.1.40']);
    expect(r.code).toBe(2);
    expect(r.out).toContain('Set ROKU_DEV_PASSWORD');
  });

  it('needs an address', () => {
    expect(run([]).code).toBe(2);
  });
});
