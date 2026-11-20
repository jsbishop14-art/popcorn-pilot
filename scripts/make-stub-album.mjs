#!/usr/bin/env node
// Make the Family Album test fixtures (test/fixtures/album/): four small PNG pictures in the app's colors and a
// stand-in clip (a few bytes with an MP4 header; the tests only check it is cached and served, never played).
// Run once; the files are committed. Usage: node scripts/make-stub-album.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.join(process.cwd(), 'test/fixtures/album');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A width x height PNG: a vertical blend from one color to another. */
function png(width, height, from, to) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const px = from.map((f, i) => Math.round(f + (to[i] - f) * t));
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) row.set(px, 1 + x * 3);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const NAVY = [15, 27, 51];
const PICTURES = {
  'photo-1.png': [[255, 201, 74], NAVY],
  'photo-2.png': [[255, 138, 101], NAVY],
  'photo-3.png': [[127, 200, 169], NAVY],
  'photo-4.png': [[143, 179, 255], NAVY],
  'photo-2-new.png': [[255, 138, 101], [255, 201, 74]],
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, [a, b]] of Object.entries(PICTURES)) fs.writeFileSync(path.join(OUT, name), png(64, 36, a, b));
// ftyp box only: enough for a file type check, not a playable video.
fs.writeFileSync(path.join(OUT, 'clip-1.mp4'), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom', 'ascii'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2', 'ascii'), Buffer.alloc(64)]));
console.log(`wrote ${Object.keys(PICTURES).length + 1} files to ${path.relative(process.cwd(), OUT)}`);
