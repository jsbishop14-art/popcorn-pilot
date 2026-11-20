#!/usr/bin/env node
// Build and check the Popcorn Pilot Roku channel (PP6 check 1): make its pictures and fonts, compile it with the
// BrighterScript compiler (bsc), and package it as the zip that is sideloaded on each Roku. Then read the zip back:
// it must hold the manifest, components, source, images and fonts.
// Also compiles the channel with its Rooibos tests (roku/bsconfig.tests.json), so the tests that run on a Roku
// build cleanly here too.
// Usage: node scripts/roku-build.mjs           -> build/popcorn-pilot-channel.zip
// Exit 0: zero compile errors in both builds and every required part in the zip. Exit 1 otherwise.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ProgramBuilder, DiagnosticSeverity } from 'brighterscript';
import { writeAssets } from './roku-assets.mjs';

const root = process.cwd();
const build = path.join(root, 'build');

/** The file names in a zip (its central directory). */
export function zipEntries(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file} is not a zip`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
  }
  return names;
}

/** One entry's bytes (stored or deflated). */
export function zipRead(file, name) {
  const buf = fs.readFileSync(file);
  let p = 0;
  while (p < buf.length - 4 && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const n = buf.toString('utf8', p + 30, p + 30 + nameLen);
    const start = p + 30 + nameLen + extra;
    if (n === name) {
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p = start + size;
  }
  return null;
}

async function compile(project) {
  const b = new ProgramBuilder();
  b.logger.logLevel = 'error';
  await b.run({ project, cwd: path.dirname(project), watch: false, logLevel: 'error' });
  const diags = b.program.getDiagnostics();
  const errors = diags.filter((d) => d.severity === DiagnosticSeverity.Error);
  const warnings = diags.filter((d) => d.severity === DiagnosticSeverity.Warning);
  for (const d of [...errors, ...warnings]) {
    const f = d.file?.srcPath ? path.relative(root, d.file.srcPath) : '?';
    console.log(`  ${d.severity === DiagnosticSeverity.Error ? 'error' : 'warning'} ${f}:${d.range.start.line + 1} ${d.message}`);
  }
  b.dispose?.();
  return { errors: errors.length, warnings: warnings.length };
}

export const REQUIRED = ['manifest', 'source/main.brs', 'components/MainScene.xml', 'components/MainScene.brs', 'images/splash_fhd.png', 'images/channel-poster_fhd.png', 'fonts/Fredoka-Bold.ttf', 'fonts/Nunito-ExtraBold.ttf'];

async function main() {
  fs.rmSync(path.join(build, 'roku-staging'), { recursive: true, force: true });
  fs.rmSync(path.join(build, 'roku-tests-staging'), { recursive: true, force: true });
  const assets = writeAssets(path.join(build, 'roku-assets'));
  console.log(`assets: ${assets.length} files`);
  const zip = path.join(build, 'popcorn-pilot-channel.zip');
  fs.rmSync(zip, { force: true });
  const app = await compile(path.join(root, 'roku', 'bsconfig.json'));
  console.log(`channel: ${app.errors} errors, ${app.warnings} warnings`);
  const tests = await compile(path.join(root, 'roku', 'bsconfig.tests.json'));
  console.log(`channel with Rooibos tests: ${tests.errors} errors, ${tests.warnings} warnings`);
  let missing = REQUIRED.slice();
  let entries = [];
  if (fs.existsSync(zip)) {
    entries = zipEntries(zip);
    missing = REQUIRED.filter((r) => !entries.includes(r));
    const tops = [...new Set(entries.map((e) => e.split('/')[0]))].sort();
    console.log(`zip: ${path.relative(root, zip)}, ${fs.statSync(zip).size} bytes, ${entries.length} files; top level: ${tops.join(', ')}`);
    const screens = entries.filter((e) => /^components\/screens\/.*\.xml$/.test(e)).length;
    console.log(`zip: ${screens} screen components`);
  } else {
    console.log('zip: not made');
  }
  for (const m of missing) console.log(`  missing in zip: ${m}`);
  const ok = app.errors === 0 && tests.errors === 0 && missing.length === 0;
  console.log(ok ? 'roku build: OK' : 'roku build: FAILED');
  process.exitCode = ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
