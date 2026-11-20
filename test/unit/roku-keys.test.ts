// PP6 check 2 in CI: the channel's key handling (roku/components/lib/KeyPolicy.brs) and screen routing
// (Router.brs), run by the brs BrightScript interpreter with the same cases as the Rooibos suite that runs on a
// Roku (roku/tests/KeyCases.brs, KeyPolicy.spec.bs). In kid mode only the arrows, OK and volume act.
// Also: the channel has exactly one key handler, and it asks the key policy before anything else (audit by what is
// called), and a control: a policy that lets Back through in kid mode fails the same cases.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ROKU = path.join(process.cwd(), 'roku');
const BRS = path.join(process.cwd(), 'node_modules', 'brs', 'bin', 'cli.js');

function runCases(policyFile: string) {
  // brs reads every file given, in one scope; -r sets pkg: to a folder with nothing else in it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-brs-'));
  const files = [policyFile, path.join(ROKU, 'components/lib/Router.brs'), path.join(ROKU, 'tests/KeyCases.brs'), path.join(ROKU, 'tests/run_keys.brs')];
  const r = spawnSync(process.execPath, [BRS, '-r', dir, ...files], { encoding: 'utf8', timeout: 60_000 });
  const m = r.stdout.match(/RESULT\s*(\d+)\s+passed\s*(\d+)\s+failed/);
  return { exit: r.status, out: r.stdout + r.stderr, passed: m ? Number(m[1]) : -1, failed: m ? Number(m[2]) : -1 };
}

describe('check 2: key handling in kid mode (brs interpreter, the Rooibos cases)', () => {
  it('every case passes: only arrows, OK and volume act in kid mode; grid, PIN pad, screens', () => {
    const r = runCases(path.join(ROKU, 'components/lib/KeyPolicy.brs'));
    expect(r.exit, r.out).toBe(0);
    expect(r.out).not.toContain('FAIL');
    // 25 key cases, 10 grid, 7 PIN pad, 9 routes, 12 screens.
    expect([r.passed, r.failed]).toEqual([63, 0]);
  });

  it('control: a policy that lets Back act in kid mode fails', () => {
    const src = fs.readFileSync(path.join(ROKU, 'components/lib/KeyPolicy.brs'), 'utf8');
    const broken = src.replace('return ["up", "down", "left", "right", "OK"]', 'return ["up", "down", "left", "right", "OK", "back"]');
    expect(broken).not.toBe(src);
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pp-brs-bad-')), 'KeyPolicy.brs');
    fs.writeFileSync(f, broken);
    const r = runCases(f);
    expect(r.failed).toBe(1);
    expect(r.out).toMatch(/FAIL key\s+back\s+kid\s+true\s*: got\s+act\s+want\s+ignore/);
  });

  it('the channel has one key handler (MainScene), and it asks the key policy first', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(brs|bs)$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(ROKU, 'components'));
    walk(path.join(ROKU, 'source'));
    const handlers = files.filter((f) => /^\s*function\s+onKeyEvent\s*\(/im.test(fs.readFileSync(f, 'utf8')));
    expect(handlers.map((f) => path.relative(ROKU, f))).toEqual(['components/MainScene.brs']);
    const body = fs.readFileSync(handlers[0], 'utf8').split(/function\s+onKeyEvent/i)[1].split(/end function/i)[0];
    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith("'"));
    // The release check, then the policy, before any screen sees the key.
    expect(lines[1]).toBe('if not press then return true');
    expect(lines[2]).toBe('if ppKeyDecision(key, isKid()) = "ignore" then return true');
    // Every screen is reached only through handleKey, called from that handler.
    expect(body).toContain('m.screen.callFunc("handleKey", { key: key })');
  });

  it('every screen the channel can show exists, with the handleKey function MainScene calls', () => {
    const router = fs.readFileSync(path.join(ROKU, 'components/lib/Router.brs'), 'utf8');
    const names = new Set<string>([...router.matchAll(/"([A-Z][A-Za-z]+)"/g)].map((m) => m[1]));
    for (const n of names) {
      const xml = path.join(ROKU, 'components/screens', `${n}Screen.xml`);
      expect(fs.existsSync(xml), `${n}Screen.xml`).toBe(true);
      expect(fs.readFileSync(xml, 'utf8')).toContain('<function name="handleKey" />');
      expect(fs.readFileSync(xml.replace(/\.xml$/, '.brs'), 'utf8')).toMatch(/function handleKey\(e as object\) as boolean/);
    }
    expect(names.size).toBeGreaterThanOrEqual(12);
  });
});
