import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import normalize from '../shared/lib/normalize.js';
import bezier from '../shared/lib/bezier.js';

// Locks the exporter -> host PRECOMP CONTRACT: when the user turns every precomp
// toggle off, a small nested frame builds FLAT, even when it clips overflowing
// content (the "crop by frame" pattern: Figma hides the overflow, so the frame
// looks tiny and tidy, yet used to become a comp anyway). The REAL exporter
// produces the IR; the REAL host decision code (R.importer.decide, the CI seam
// build.jsx exports) judges it — no After Effects binary needed.

const MIXED = Symbol('figma.mixed');

function piece(id, x, y, w, h) {
  const d = `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
  return {
    id, name: 'piece-' + id, type: 'VECTOR', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
    width: w, height: h, rotation: 0,
    absoluteTransform: [[1, 0, 500 + x], [0, 1, 300 + y]],
    absoluteBoundingBox: { x: 500 + x, y: 300 + y, width: w, height: h },
    fills: [{ type: 'SOLID', color: { r: 1, g: 0.3, b: 0.3 }, opacity: 1, visible: true }],
    strokes: [], effects: [],
    fillGeometry: [{ data: d }],
    vectorPaths: [{ windingRule: 'NONZERO', data: d }]
  };
}

// A small logo-like frame: 38x57, five vector pieces. `overflow` makes the last
// piece extend 6px past the bottom edge (the crop-by-frame pattern).
function logoFrame({ clips, overflow }) {
  return {
    id: '9:1', name: 'Figma logo', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH', isMask: false,
    width: 38, height: 57, rotation: 0, clipsContent: clips,
    absoluteTransform: [[1, 0, 500], [0, 1, 300]],
    absoluteBoundingBox: { x: 500, y: 300, width: 38, height: 57 },
    fills: [], strokes: [], effects: [], cornerRadius: 0, cornerSmoothing: 0, layoutMode: 'NONE',
    children: [
      piece('9:2', 0, 0, 19, 19), piece('9:3', 19, 0, 19, 19),
      piece('9:4', 0, 19, 19, 19), piece('9:5', 19, 19, 19, 19),
      piece('9:6', 0, 38, 19, overflow ? 25 : 19)
    ]
  };
}

function screen(logoOpts) {
  return {
    id: '8:1', name: 'Screen', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH', isMask: false,
    width: 1440, height: 900, rotation: 0, clipsContent: true,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
    fills: [], strokes: [], effects: [], cornerRadius: 0, cornerSmoothing: 0, layoutMode: 'NONE',
    children: [logoFrame(logoOpts)]
  };
}

let buildIR, R;

beforeAll(async () => {
  globalThis.ReboundNormalize = normalize;
  globalThis.ReboundBezier = bezier;
  globalThis.figma = { mixed: MIXED, root: { name: 'Test' }, base64Encode: () => '' };
  await import('../plugins/figma/src/ir-build.js');
  buildIR = globalThis.ReboundFigma.buildIR;

  // Load the REAL host builder with a minimal $.__rebound; `app` is only touched
  // inside build(), which these tests never call.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const $ = { __rebound: { util: {}, register() {}, ir: { N: normalize } } };
  new Function('$', readFileSync(path.join(dir, '../host/commands/import/build.jsx'), 'utf8'))($);
  R = $.__rebound;
});

// The exact expression buildNode uses to route a nested FRAME.
function needPrecomp(node) {
  const d = R.importer.decide;
  return d.frameIsBig(node) ||
    (R.importer.opts && R.importer.opts.precompFrames && d.frameWantsPrecomp(node)) ||
    !!node.isMask || (d.frameShouldClip(node) && d.precompsAllowed());
}

async function logoIR(logoOpts) {
  const ir = await buildIR([screen(logoOpts)]);
  const logo = ir.document.frames[0].children.find((k) => /logo/i.test(k.name));
  expect(logo).toBeTruthy();
  return logo;
}

const ALL_OFF = { precompFrames: false, autoPrecompThreshold: 0 };
const DEFAULTS = { precompFrames: false, autoPrecompThreshold: 40 };

describe('nested-frame precomp decision (exporter -> host contract)', () => {
  it('small clean clipping frame stays flat under default options', async () => {
    const logo = await logoIR({ clips: true, overflow: false });
    R.importer.opts = DEFAULTS;
    expect(needPrecomp(logo)).toBe(false);
  });

  it('crop-by-frame (clip + overflow) precomps under DEFAULT options for 1:1 clipping', async () => {
    const logo = await logoIR({ clips: true, overflow: true });
    R.importer.opts = DEFAULTS;
    expect(R.importer.decide.frameShouldClip(logo)).toBe(true);
    expect(needPrecomp(logo)).toBe(true);
  });

  it('crop-by-frame builds FLAT when the user turned every precomp off', async () => {
    const logo = await logoIR({ clips: true, overflow: true });
    R.importer.opts = ALL_OFF;
    expect(R.importer.decide.precompsAllowed()).toBe(false);
    expect(needPrecomp(logo)).toBe(false); // this was the bug: it precomped anyway
  });

  it('a frame below the threshold never precomps for size', async () => {
    const logo = await logoIR({ clips: true, overflow: false });
    R.importer.opts = DEFAULTS;
    expect(R.importer.decide.countLayers(logo)).toBeLessThan(40);
    expect(R.importer.decide.frameIsBig(logo)).toBe(false);
  });

  it('a mask frame still precomps even with everything off (mattes need a pixel layer)', async () => {
    const logo = await logoIR({ clips: true, overflow: true });
    logo.isMask = true;
    R.importer.opts = ALL_OFF;
    expect(needPrecomp(logo)).toBe(true);
  });

  it('a non-clipping small logo merges to one shape and is no FRAME at all', async () => {
    const ir = await buildIR([screen({ clips: false, overflow: false })]);
    const logo = ir.document.frames[0].children.find((k) => /logo/i.test(k.name));
    expect(logo.type).toBe('GROUP');
    expect(logo.merged).toBe(true);
  });
});
