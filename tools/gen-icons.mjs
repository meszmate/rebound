#!/usr/bin/env node
/*
 * Generate Rebound's panel menu icons (the four CEP states) as small PNGs.
 * The mark is Rebound's "bounce" — a ball dropped upper-left that bounces with
 * decaying humps and settles flat (the Branding file's Primary mark). Drawn
 * anti-aliased via a distance field, in the per-state colour. No external image
 * libraries: a minimal PNG encoder.
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

// Source mark geometry, in the Branding file's Primary-mark space (170×155,
// node 5:7): a ball at the release point and a decaying round-capped bounce.
const FIG_BALL = { cx: 27.05, cy: 34, r: 11.59 };
const FIG_STROKE = 10.05; // round-capped stroke width
const FIG_START = [27.05, 44.82];
// The bounce path as four cubic segments: each is [control1, control2, end].
const FIG_SEGS = [
  [[31.68, 92.21], [39.67, 115.91], [51, 115.91]],
  [[66.45, 58.73], [83.45, 58.73], [98.91, 115.91]],
  [[108.18, 85], [115.91, 85], [123.64, 115.91]],
  [[129.82, 103.55], [134.45, 103.55], [139.09, 115.91]],
];
// Tight bounding box of the inked mark (ball + stroked path) in source space.
const FIG_BBOX = { minX: 15.46, minY: 22.41, maxX: 144.11, maxY: 120.93 };

function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

// Distance from point (px,py) to segment (ax,ay)–(bx,by).
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function mark(color) {
  const [r, g, b] = color;
  const buf = Buffer.alloc(SIZE * SIZE * 4);

  // Fit the mark's bounding box into the icon, centred, with a small margin.
  const margin = 2;
  const span = Math.max(FIG_BBOX.maxX - FIG_BBOX.minX, FIG_BBOX.maxY - FIG_BBOX.minY);
  const s = (SIZE - 2 * margin) / span;
  const offX = SIZE / 2 - (s * (FIG_BBOX.minX + FIG_BBOX.maxX)) / 2;
  const offY = SIZE / 2 - (s * (FIG_BBOX.minY + FIG_BBOX.maxY)) / 2;
  const tx = (x) => s * x + offX;
  const ty = (y) => s * y + offY;

  // Flatten the bounce path (start point + four cubics) to a polyline.
  const pts = [[tx(FIG_START[0]), ty(FIG_START[1])]];
  let prev = FIG_START;
  const PER = 28;
  for (const [c1, c2, end] of FIG_SEGS) {
    for (let i = 1; i <= PER; i++) {
      const t = i / PER;
      pts.push([
        tx(cubic(prev[0], c1[0], c2[0], end[0], t)),
        ty(cubic(prev[1], c1[1], c2[1], end[1], t)),
      ]);
    }
    prev = end;
  }
  const ballCx = tx(FIG_BALL.cx);
  const ballCy = ty(FIG_BALL.cy);
  const ballR = s * FIG_BALL.r;
  const half = (s * FIG_STROKE) / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Stroke coverage — nearest distance to the bounce polyline (round caps
      // and joins fall out of the point-to-segment distance for free).
      let dMin = Infinity;
      for (let i = 1; i < pts.length; i++) {
        const d = distToSeg(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        if (d < dMin) dMin = d;
      }
      const aStroke = Math.max(0, Math.min(1, half + 0.5 - dMin));
      // Ball coverage.
      const dBall = Math.hypot(x - ballCx, y - ballCy);
      const aBall = Math.max(0, Math.min(1, ballR + 0.5 - dBall));
      const a = Math.max(aStroke, aBall);
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
  const png = encodePng(mark(color), SIZE, SIZE);
  fs.writeFileSync(path.join(outDir, name + '.png'), png);
  console.log('wrote', name + '.png');
}
console.log('Icons generated in', outDir);
