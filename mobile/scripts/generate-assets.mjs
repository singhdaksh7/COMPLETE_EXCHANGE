// Generates EXORA's branded PNG assets (app icon, Android adaptive foreground,
// splash logo, web favicon) with zero external dependencies — only Node's zlib.
//
// The mark is a bold gold "E" monogram on the dark exchange background, matching
// the in-app theme. Re-run with: `node scripts/generate-assets.mjs`.
//
// This keeps binary assets reproducible and reviewable in source control.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');
mkdirSync(ASSETS, { recursive: true });

const GOLD = [0xf5, 0xc2, 0x42, 0xff];
const DARK = [0x0b, 0x0e, 0x11, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

/* ---------------- tiny PNG encoder (RGBA, 8-bit) ---------------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = 0 (compression, filter, interlace)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- drawing ---------------- */
function canvas(size, bg) {
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) px.set(bg, i * 4);
  return px;
}
function rect(px, size, x0, y0, x1, y1, color) {
  const xa = Math.max(0, Math.round(x0));
  const ya = Math.max(0, Math.round(y0));
  const xb = Math.min(size, Math.round(x1));
  const yb = Math.min(size, Math.round(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) px.set(color, (y * size + x) * 4);
  }
}
/** Draw a blocky "E" monogram inside a centered box of side `boxFrac` * size. */
function drawE(px, size, boxFrac, color) {
  const w = size * boxFrac;
  const x = (size - w) / 2;
  const y = (size - w) / 2;
  const s = w * 0.2; // stroke
  rect(px, size, x, y, x + s, y + w, color); // spine
  rect(px, size, x, y, x + w, y + s, color); // top arm
  const my = y + w / 2 - s / 2;
  rect(px, size, x, my, x + w * 0.82, my + s, color); // middle arm
  rect(px, size, x, y + w - s, x + w, y + w, color); // bottom arm
}

function write(name, size, bg, glyph, boxFrac) {
  const px = canvas(size, bg);
  if (glyph) drawE(px, size, boxFrac, glyph);
  writeFileSync(join(ASSETS, name), encodePNG(size, px));
  console.log('wrote', name, `${size}x${size}`);
}

// App icon: full-bleed gold with a dark E (bold, exchange-style).
write('icon.png', 1024, GOLD, DARK, 0.5);
// Android adaptive foreground: transparent with a gold E in the safe center.
write('adaptive-icon.png', 1024, TRANSPARENT, GOLD, 0.42);
// Splash logo: transparent gold E (placed on dark background by the splash plugin).
write('splash-icon.png', 1024, TRANSPARENT, GOLD, 0.4);
// Web favicon.
write('favicon.png', 48, GOLD, DARK, 0.52);
console.log('done.');
