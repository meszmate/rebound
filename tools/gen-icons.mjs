#!/usr/bin/env node
/*
 * Generate Rebound's panel menu icons (the four CEP states) as small PNGs.
 * The mark is a simple disc — Rebound's "bouncing dot" — drawn anti-aliased in
 * the per-state colour. No external image libraries: a minimal PNG encoder.
 *
 *   node tools/gen-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client',
  'assets',
  'icons'
);

const SIZE = 24;

// CRC32 for PNG chunks.
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = 0 (deflate, adaptive filter, no interlace)
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function disc(color) {
  const [r, g, b] = color;
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const cx = SIZE / 2 - 0.5;
  const cy = SIZE / 2 - 0.5;
  const radius = SIZE * 0.4;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // smooth 1px edge
      let a = 1 - (d - (radius - 0.5));
      a = Math.max(0, Math.min(1, a));
      const i = (y * SIZE + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return buf;
}

const states = {
  'panel-normal': [74, 74, 74],
  'panel-rollover': [73, 144, 226],
  'panel-darknormal': [184, 188, 196],
  'panel-darkrollover': [106, 168, 255],
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, color] of Object.entries(states)) {
  const png = encodePng(disc(color), SIZE, SIZE);
  fs.writeFileSync(path.join(outDir, name + '.png'), png);
  console.log('wrote', name + '.png');
}
console.log('Icons generated in', outDir);
