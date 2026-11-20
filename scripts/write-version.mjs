#!/usr/bin/env node
// Record the git version being built, for Settings > Hub (lib/version.gen.json, not committed).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

let sha = 'unknown';
try {
  sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // not a git checkout
}
fs.writeFileSync('lib/version.gen.json', JSON.stringify({ sha, built_at: new Date().toISOString() }) + '\n');
console.log(`version ${sha.slice(0, 7)}`);
