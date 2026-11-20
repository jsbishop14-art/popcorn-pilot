#!/usr/bin/env node
// Pictures and fonts for the Popcorn Pilot Roku channel (PP6), made at build time so nothing binary is kept in the
// repo: white shapes the channel tints (blendColor) for rounded boxes, circles, rings and icons; the channel's
// home screen icons and splash; and the Fredoka and Nunito fonts (TTF, as Roku needs) copied from npm.
// Usage: node scripts/roku-assets.mjs <out dir>   (writes <out>/images and <out>/fonts)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------------------------- PNG

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

/** An RGBA image as a PNG file. */
export function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------------------------- drawing

/** A canvas filled by coverage: inside(x, y) for points, 4x4 samples per pixel for smooth edges. */
function canvas(w, h) {
  const px = Buffer.alloc(w * h * 4);
  return {
    w,
    h,
    px,
    /** Paint where inside(x, y) is true, in color [r, g, b] over what is there. */
    fill(inside, color = [255, 255, 255], alpha = 1) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let n = 0;
          for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
          if (!n) continue;
          const a = (n / 16) * alpha;
          const i = (y * w + x) * 4;
          const da = px[i + 3] / 255;
          const oa = a + da * (1 - a);
          for (let c = 0; c < 3; c++) px[i + c] = Math.round((color[c] * a + px[i + c] * da * (1 - a)) / (oa || 1));
          px[i + 3] = Math.round(oa * 255);
        }
      }
      return this;
    },
    png() {
      return png(w, h, px);
    },
  };
}

const inRoundRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inCircle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inRing = (cx, cy, r, t) => (x, y) => {
  const d = (x - cx) ** 2 + (y - cy) ** 2;
  return d <= r * r && d >= (r - t) ** 2;
};
function inPolygon(pts) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
const inThickLine = (ax, ay, bx, by, t) => (x, y) => {
  const dx = bx - ax;
  const dy = by - ay;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return (x - ax - k * dx) ** 2 + (y - ay - k * dy) ** 2 <= (t / 2) ** 2;
};
const any = (...fs) => (x, y) => fs.some((f) => f(x, y));
const but = (a, b) => (x, y) => a(x, y) && !b(x, y);

/**
 * A white rounded box as a Roku 9-patch (.9.png): the corners keep their size and the middle stretches. The 1 pixel
 * black guides on the top and left edges mark the stretchable middle (Roku 9-patch format).
 */
function ninePatch(r) {
  const inner = 2 * r + 2;
  const w = inner + 2;
  const c = canvas(w, w);
  c.fill(inRoundRect(1, 1, 1 + inner, 1 + inner, r));
  for (const i of [r + 1, r + 2]) {
    // top and left guides: black, opaque
    c.px.set([0, 0, 0, 255], (0 * w + i) * 4);
    c.px.set([0, 0, 0, 255], (i * w + 0) * 4);
  }
  return c.png();
}

function star(c, cx, cy, ro, ri, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? ri : ro;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return c.fill(inPolygon(pts), color);
}

// The icons, white on transparent, 96x96 (the channel tints and sizes them).
const ICONS = {
  star: (c) => star(c, 48, 50, 44, 19),
  lock: (c) => c.fill(any(inRoundRect(18, 42, 78, 88, 8), but(inRoundRect(28, 10, 68, 60, 20), inRoundRect(38, 20, 58, 60, 10)))),
  play: (c) => c.fill(inPolygon([[28, 16], [80, 48], [28, 80]])),
  skip: (c) => c.fill(any(inPolygon([[16, 18], [56, 48], [16, 78]]), inRoundRect(62, 18, 76, 78, 3))),
  back: (c) => c.fill(any(inThickLine(30, 48, 52, 26, 12), inThickLine(30, 48, 52, 70, 12), inThickLine(32, 48, 76, 48, 12))),
  check: (c) => c.fill(any(inThickLine(18, 50, 40, 72, 14), inThickLine(40, 72, 80, 28, 14))),
  clock: (c) => c.fill(any(inRing(48, 48, 42, 10), inThickLine(48, 48, 48, 22, 9), inThickLine(48, 48, 66, 58, 9))),
  arrows: (c) => c.fill(any(inPolygon([[48, 6], [66, 28], [30, 28]]), inPolygon([[48, 90], [66, 68], [30, 68]]), inPolygon([[6, 48], [28, 30], [28, 66]]), inPolygon([[90, 48], [68, 30], [68, 66]]))),
  hand: (c) => c.fill(any(inRoundRect(26, 40, 74, 88, 16), ...[30, 42, 54, 66].map((x) => inRoundRect(x - 5, 10, x + 5, 56, 5)))),
  person: (c) => c.fill(any(inCircle(48, 30, 18), inRoundRect(16, 54, 80, 96, 26))),
  photo: (c) => c.fill(any(but(inRoundRect(8, 16, 88, 80, 8), inRoundRect(16, 24, 80, 72, 4)), inCircle(34, 38, 7), inPolygon([[16, 72], [46, 46], [62, 60], [70, 52], [80, 62], [80, 72]]))),
  popcorn: (c) => c.fill(any(inPolygon([[22, 44], [74, 44], [66, 92], [30, 92]]), inCircle(30, 38, 12), inCircle(48, 30, 14), inCircle(66, 38, 12), inCircle(40, 22, 10), inCircle(58, 22, 10))),
  task: (c) => c.fill(any(but(inRoundRect(18, 10, 78, 88, 10), inRoundRect(28, 22, 68, 78, 4)), inThickLine(34, 52, 44, 62, 8), inThickLine(44, 62, 62, 40, 8))),
  // Routine icons (lib/routines.ts: sun, tv, moon, star).
  sun: (c) => c.fill(any(inCircle(48, 48, 20), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => inThickLine(48 + 30 * Math.cos((i * Math.PI) / 4), 48 + 30 * Math.sin((i * Math.PI) / 4), 48 + 42 * Math.cos((i * Math.PI) / 4), 48 + 42 * Math.sin((i * Math.PI) / 4), 8)))),
  tv: (c) => c.fill(any(but(inRoundRect(8, 18, 88, 74, 8), inRoundRect(16, 26, 80, 66, 4)), inRoundRect(30, 80, 66, 88, 4))),
  moon: (c) => c.fill(but(inCircle(44, 50, 38), inCircle(66, 34, 32))),
  // Task pictures (lib/safeguards.ts PICTURES): the app shows emoji, which a Roku font cannot draw.
  'pic-toys': (c) => c.fill(any(inCircle(48, 58, 28), inCircle(48, 28, 20), inCircle(28, 14, 10), inCircle(68, 14, 10))),
  'pic-teeth': (c) => c.fill(any(inThickLine(18, 78, 70, 26, 12), inRoundRect(60, 8, 90, 30, 6))),
  'pic-table': (c) => c.fill(any(inRing(48, 50, 30, 10), inThickLine(10, 20, 10, 80, 6), inThickLine(86, 20, 86, 80, 6))),
  'pic-pajamas': (c) => c.fill(but(inCircle(44, 50, 38), inCircle(66, 34, 32))),
  'pic-book': (c) => c.fill(any(inPolygon([[8, 22], [46, 28], [46, 84], [8, 78]]), inPolygon([[50, 28], [88, 22], [88, 78], [50, 84]]))),
  'pic-bed': (c) => c.fill(any(inRoundRect(8, 48, 88, 72, 6), inRoundRect(12, 34, 38, 50, 6), inRoundRect(8, 30, 14, 86, 3), inRoundRect(82, 52, 88, 86, 3))),
  'pic-plant': (c) => c.fill(any(inPolygon([[26, 58], [70, 58], [64, 90], [32, 90]]), inCircle(36, 36, 14), inCircle(60, 32, 14), inThickLine(48, 58, 48, 24, 6))),
  'pic-pet': (c) => c.fill(any(inCircle(48, 62, 20), inCircle(22, 40, 10), inCircle(38, 22, 10), inCircle(58, 22, 10), inCircle(74, 40, 10))),
  'pic-laundry': (c) => c.fill(any(inPolygon([[10, 40], [86, 40], [76, 88], [20, 88]]), but(inCircle(48, 40, 26), inCircle(48, 40, 18)))),
  'pic-shoes': (c) => c.fill(any(inRoundRect(8, 56, 88, 78, 10), inRoundRect(8, 30, 44, 70, 10))),
};

// ---------------------------------------------------------------------------------------------- channel art

const NAVY = [0x0f, 0x1b, 0x33];
const YELLOW = [0xff, 0xc9, 0x4a];

/** The channel's logo: a popcorn yellow rounded square with a navy popcorn box, on the navy ground. */
function logoArt(w, h, scale) {
  const c = canvas(w, h).fill(() => true, NAVY);
  const s = 180 * scale;
  const x0 = (w - s) / 2;
  const y0 = (h - s) / 2;
  c.fill(inRoundRect(x0, y0, x0 + s, y0 + s, s * 0.28), YELLOW);
  const k = s / 96;
  const t = (f) => (x, y) => f((x - x0) / k, (y - y0) / k);
  c.fill(t(any(inPolygon([[30, 48], [66, 48], [60, 80], [36, 80]]), inCircle(36, 42, 9), inCircle(48, 36, 10), inCircle(60, 42, 9))), NAVY);
  return c.png();
}

// ---------------------------------------------------------------------------------------------- fonts

const FONTS = {
  'Fredoka-SemiBold.ttf': '@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf',
  'Fredoka-Bold.ttf': '@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf',
  'Nunito-Bold.ttf': '@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf',
  'Nunito-ExtraBold.ttf': '@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf',
};

/** The rounded box radii the channel uses, in 1080p pixels (mockup radius x 1.5). */
export const RADII = [12, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 60, 78];

export function writeAssets(out) {
  const img = path.join(out, 'images');
  const fonts = path.join(out, 'fonts');
  fs.mkdirSync(img, { recursive: true });
  fs.mkdirSync(fonts, { recursive: true });
  const files = [];
  const put = (name, buf) => {
    fs.writeFileSync(path.join(img, name), buf);
    files.push(`images/${name}`);
  };
  for (const r of RADII) put(`rr${r}.9.png`, ninePatch(r));
  put('circle.png', canvas(256, 256).fill(inCircle(128, 128, 127)).png());
  put('ring.png', canvas(144, 144).fill(inRing(72, 72, 71, 12)).png());
  put('blob.png', canvas(512, 512).fill(inCircle(256, 256, 255)).png());
  for (const [name, draw] of Object.entries(ICONS)) put(`icon-${name}.png`, draw(canvas(96, 96)).png());
  // Vertical fade for the bottom of the home screens (transparent at the top to solid at the bottom); the channel
  // tints it with the screen's ground color.
  const fade = canvas(8, 256);
  for (let y = 0; y < 256; y++) {
    const t = y / 255;
    const a = t < 0.4 ? (t / 0.4) * 0.9 : 0.9 + ((t - 0.4) / 0.6) * 0.1;
    for (let x = 0; x < 8; x++) fade.px.set([255, 255, 255, Math.round(a * 255)], (y * 8 + x) * 4);
  }
  put('fade.png', fade.png());
  // Home screen icons and splash (Roku sizes: FHD 540x405, HD 290x218; splash 1920x1080).
  put('channel-poster_fhd.png', logoArt(540, 405, 1.3));
  put('channel-poster_hd.png', logoArt(290, 218, 0.7));
  put('splash_fhd.png', logoArt(1920, 1080, 2));
  for (const [name, mod] of Object.entries(FONTS)) {
    fs.copyFileSync(require.resolve(mod), path.join(fonts, name));
    files.push(`fonts/${name}`);
  }
  fs.copyFileSync(require.resolve('@expo-google-fonts/fredoka/LICENSE_FONT'), path.join(fonts, 'Fredoka-OFL.txt'));
  fs.copyFileSync(require.resolve('@expo-google-fonts/nunito/LICENSE_FONT'), path.join(fonts, 'Nunito-OFL.txt'));
  files.push('fonts/Fredoka-OFL.txt', 'fonts/Nunito-OFL.txt');
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/roku-assets.mjs <out dir>');
    process.exit(2);
  }
  const files = writeAssets(path.resolve(out));
  console.log(`wrote ${files.length} files to ${out}`);
}
