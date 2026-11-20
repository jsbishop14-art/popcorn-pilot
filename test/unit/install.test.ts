// Check 7: the install script passes shellcheck and a dry run. Also covers the updater script and the service files.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPTS = ['scripts/install-pi.sh', 'scripts/update.sh'];

describe('install script (check 7)', () => {
  it('passes shellcheck (install and updater scripts)', () => {
    const r = spawnSync('shellcheck', ['--severity=style', ...SCRIPTS], { encoding: 'utf8' });
    expect(r.error, 'shellcheck must be installed').toBeUndefined();
    expect(r.stdout + r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('shellcheck catches a planted problem (control)', () => {
    const tmp = path.join(fs.mkdtempSync('/tmp/pp-sc-'), 'bad.sh');
    fs.writeFileSync(tmp, '#!/usr/bin/env bash\nrm -rf $1/*\n');
    const r = spawnSync('shellcheck', [tmp], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
  });

  it('dry run prints every step, changes nothing and exits 0', () => {
    const r = spawnSync('bash', ['scripts/install-pi.sh', '--dry-run'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const out = r.stdout;
    for (const step of [
      'Installing system packages',
      'Installing Node 20',
      'Creating the service user and folders',
      'Creating the secret store key',
      'Getting the app',
      'Installing, building and setting up the database',
      'Installing the services',
      'Checking the app answers',
    ])
      expect(out).toContain(`== ${step}`);
    expect(out).toContain('node scripts/migrate.mjs');
    expect(out).toContain('systemctl enable --now popcorn-pilot.service popcorn-pilot-update.timer popcorn-pilot-update.path popcorn-pilot-backup.timer');
    expect(out).toContain('PP_MASTER_KEY_FILE=/etc/popcorn-pilot/master.key');
    // Every command is printed, not run.
    for (const line of out.split('\n').filter((l) => /^\s+(apt-get|useradd|install|systemctl|runuser)\b/.test(l))) expect(line).toContain('[dry run]');
  });

  it('refuses unknown options', () => {
    const r = spawnSync('bash', ['scripts/install-pi.sh', '--bogus'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
  });

  it('installs only service files that exist, and they point at the app, the data folder and the env file', () => {
    const src = fs.readFileSync('scripts/install-pi.sh', 'utf8');
    const units = src.match(/popcorn-pilot[a-z-]*\.(service|timer|path)/g) ?? [];
    expect(units.length).toBeGreaterThan(5);
    for (const u of new Set(units)) expect(fs.existsSync(path.join('deploy/systemd', u)), u).toBe(true);
    const app = fs.readFileSync('deploy/systemd/popcorn-pilot.service', 'utf8');
    expect(app).toContain('EnvironmentFile=/etc/popcorn-pilot/env');
    expect(app).toContain('User=popcorn');
    expect(app).toContain('WantedBy=multi-user.target');
    expect(fs.readFileSync('deploy/systemd/popcorn-pilot-update.path', 'utf8')).toContain('PathExists=/var/lib/popcorn-pilot/update-requested');
    const sudoers = fs.readFileSync('deploy/sudoers-popcorn-pilot', 'utf8');
    expect(sudoers).toMatch(/^popcorn ALL=\(root\) NOPASSWD: \/usr\/bin\/systemctl stop popcorn-pilot, \/usr\/bin\/systemctl start popcorn-pilot, \/usr\/bin\/systemctl restart popcorn-pilot$/m);
  });
});
