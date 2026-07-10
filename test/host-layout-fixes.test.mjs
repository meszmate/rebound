import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the layout-audit fixes by running the REAL host code (util.jsx +
// commands) against a mock AE property tree, same pattern as host-anchor:
//  - util.jsx parent-chain matrix helpers (hoisted from align.jsx) vs known
//    transforms — the shared math align/arrange/flip/comp/pins/nullify/reset
//    now all use;
//  - flip with Separate Dimensions on: used to negate scale, then throw on the
//    hidden unified Position and leave the layer half-flipped;
//  - link parent-cycle guard: linking an ancestor of the chosen parent used to
//    throw AE's raw error mid-loop;
//  - reset anchor on a layer without a source rect (audio): used to abort the
//    whole loop.

const MATCH = {
  transform: 'ADBE Transform Group',
  anchor: 'ADBE Anchor Point',
  position: 'ADBE Position',
  positionX: 'ADBE Position_0',
  positionY: 'ADBE Position_1',
  positionZ: 'ADBE Position_2',
  scale: 'ADBE Scale',
  rotation: 'ADBE Rotate Z',
  opacity: 'ADBE Opacity'
};

// instanceof checks in the host code need these to exist as globals.
globalThis.CameraLayer = globalThis.CameraLayer || class {};
globalThis.LightLayer = globalThis.LightLayer || class {};
globalThis.CompItem = globalThis.CompItem || class {};

function prop(value) {
  return {
    value,
    numKeys: 0,
    expressionEnabled: false,
    expression: '',
    dimensionsSeparated: false,
    setValue(v) { this.value = v; },
    valueAtTime() { return this.value; },
    keyTime() { throw new Error('no keys'); },
    keyValue() { throw new Error('no keys'); },
    setValueAtTime() { throw new Error('no keys'); }
  };
}

// A minimal AE layer: transform channels, sourceRectAtTime, parent chain.
function makeLayer({
  name = 'Layer',
  pos = [0, 0],
  anchor = [0, 0],
  scale = [100, 100],
  rot = 0,
  rect = { left: 0, top: 0, width: 100, height: 100 },
  parent = null,
  sep = false
} = {}) {
  const channels = {
    [MATCH.anchor]: prop(anchor.slice()),
    [MATCH.position]: prop(pos.slice()),
    [MATCH.scale]: prop(scale.slice()),
    [MATCH.rotation]: prop(rot),
    [MATCH.opacity]: prop(100)
  };
  if (sep) {
    channels[MATCH.position].dimensionsSeparated = true;
    // AE: setting the hidden unified leader throws while separated.
    channels[MATCH.position].setValue = () => { throw new Error('After Effects error: a parent property is hidden'); };
    channels[MATCH.positionX] = prop(pos[0]);
    channels[MATCH.positionY] = prop(pos[1]);
  }
  const tr = { property(n) { return channels[n] || null; } };
  return {
    name,
    parent,
    property(n) { return n === MATCH.transform ? tr : null; },
    sourceRectAtTime() { return rect; },
    _ch: channels
  };
}

let util;
let commands;
let comp;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const $ = { __rebound: {} };
  new Function('$', readFileSync(path.join(dir, '../host/lib/util.jsx'), 'utf8'))($);
  util = $.__rebound.util;
  util.activeComp = () => comp; // the real one needs a live AE `app`
  commands = {};
  $.__rebound.register = (name, fn) => { commands[name] = fn; };
  $.__rebound.beginUndo = () => {};
  $.__rebound.endUndo = () => {};
  for (const f of ['flip.jsx', 'link.jsx', 'reset.jsx']) {
    new Function('$', readFileSync(path.join(dir, '../host/commands/', f), 'utf8'))($);
  }
});

beforeEach(() => {
  comp = { time: 0, selectedLayers: [], width: 1000, height: 800 };
});

function close(arr, exp) {
  expect(arr.length).toBe(exp.length);
  arr.forEach((v, i) => expect(v).toBeCloseTo(exp[i], 6));
}

describe('util parent-chain matrix helpers (hoisted from align.jsx)', () => {
  it('compMatrix maps a child point through a rotated, translated parent', () => {
    // Parent at (100,100) rotated 90 (clockwise, y down); child at (10,0) in
    // parent space. The child anchor's comp point is parent-pos + rot90(10,0).
    const parent = makeLayer({ name: 'P', pos: [100, 100], rot: 90 });
    const child = makeLayer({ name: 'C', pos: [10, 0], parent });
    const wp = util.applyMat(util.compMatrix(child, 0), 0, 0);
    close(wp, [100, 110]);
  });

  it('bboxOf is rotation-aware (the stale copies in arrange/flip/comp were not)', () => {
    // 100x50 rect centred on the origin, rotated 90: the axis-aligned comp box
    // must be 50 wide x 100 tall, not 100x50.
    const L = makeLayer({ rot: 90, rect: { left: -50, top: -25, width: 100, height: 50 } });
    const b = util.bboxOf(L, 0);
    expect(b.minX).toBeCloseTo(-25, 6);
    expect(b.maxX).toBeCloseTo(25, 6);
    expect(b.minY).toBeCloseTo(-50, 6);
    expect(b.maxY).toBeCloseTo(50, 6);
  });

  it('compDeltaToParent inverts the parent frame so a comp-space move lands 1:1', () => {
    const parent = makeLayer({ name: 'P', pos: [100, 100], rot: 90 });
    const child = makeLayer({ name: 'C', pos: [10, 0], parent });
    const dd = util.compDeltaToParent(child, 10, 0, 0);
    close(dd, [0, -10]); // rot90 parent: comp +x is parent-space -y
    // Round-trip: the parent's linear part maps it back to the comp delta.
    const pm = util.compMatrix(parent, 0);
    close([pm[0] * dd[0] + pm[2] * dd[1], pm[1] * dd[0] + pm[3] * dd[1]], [10, 0]);
  });

  it('compPointToParent converts a comp POINT into parent space (reset uses this for comp centre)', () => {
    const parent = makeLayer({ name: 'P', pos: [100, 100], rot: 90 });
    const child = makeLayer({ name: 'C', pos: [10, 0], parent });
    // The child's own comp-space point (100,110) must convert back to its raw
    // parent-space Position (10,0); an unparented layer passes through as-is.
    close(util.compPointToParent(child, 100, 110, 0), [10, 0]);
    close(util.compPointToParent(makeLayer(), 33, 44, 0), [33, 44]);
  });

  it('bboxOf and posOf honour separated dimensions', () => {
    const L = makeLayer({ pos: [200, 100], sep: true, rect: { left: 0, top: 0, width: 50, height: 50 } });
    const b = util.bboxOf(L, 0);
    expect(b.minX).toBeCloseTo(200, 6);
    expect(b.minY).toBeCloseTo(100, 6);
  });
});

describe('flip.apply with Separate Dimensions (no more half-flipped layers)', () => {
  it('drives the X/Y followers instead of the hidden unified Position', () => {
    // L1 (separated) box 50..150, L2 (unified) box 250..350 -> centre 200.
    const L1 = makeLayer({ name: 'A', pos: [100, 100], anchor: [50, 50], sep: true });
    const L2 = makeLayer({ name: 'B', pos: [300, 100], anchor: [50, 50] });
    comp.selectedLayers = [L1, L2];
    const res = commands['flip.apply']({ axis: 'horizontal', pivot: 'selection' });
    expect(res.flipped).toBe(2);
    expect(res.skipped).toEqual([]);
    close(L1._ch[MATCH.scale].value, [-100, 100]);
    expect(L1._ch[MATCH.positionX].value).toBeCloseTo(300, 6); // reflected across 200
    expect(L1._ch[MATCH.positionY].value).toBeCloseTo(100, 6);
    close(L2._ch[MATCH.position].value, [100, 100]);
  });

  it('a keyed follower is skipped BEFORE scale is negated (the half-flip regression)', () => {
    const L1 = makeLayer({ name: 'A', pos: [100, 100], anchor: [50, 50], sep: true });
    L1._ch[MATCH.positionX].numKeys = 2;
    const L2 = makeLayer({ name: 'B', pos: [300, 100], anchor: [50, 50] });
    comp.selectedLayers = [L1, L2];
    const res = commands['flip.apply']({ axis: 'horizontal', pivot: 'selection' });
    expect(res.flipped).toBe(1);
    expect(res.skipped).toEqual(['A (position animated)']);
    close(L1._ch[MATCH.scale].value, [100, 100]); // NOT negated: no half-flip
    expect(L1._ch[MATCH.positionX].value).toBe(100);
  });

  it('comp-pivot flip on a separated layer still just negates scale', () => {
    const L = makeLayer({ name: 'A', pos: [100, 100], anchor: [50, 50], sep: true });
    comp.selectedLayers = [L];
    const res = commands['flip.apply']({ axis: 'vertical' });
    expect(res.flipped).toBe(1);
    close(L._ch[MATCH.scale].value, [100, -100]);
    expect(L._ch[MATCH.positionX].value).toBe(100); // position untouched
  });
});

describe('link.apply parent-cycle guard', () => {
  it('skips a selected ancestor of the chosen parent with a reason, links the rest', () => {
    // Chain: grandpa <- mid <- child. Linking selection [grandpa, other, child]
    // to `child` (last) must skip grandpa (cycle) and link `other`.
    const grandpa = makeLayer({ name: 'Grandpa' });
    const mid = makeLayer({ name: 'Mid', parent: grandpa });
    const child = makeLayer({ name: 'Child', parent: mid });
    const other = makeLayer({ name: 'Other' });
    comp.selectedLayers = [grandpa, other, child];
    const res = commands['link.apply']({ target: 'last' });
    expect(res.linked).toBe(1);
    expect(res.skipped).toEqual(['Grandpa (would create a loop)']);
    expect(other.parent).toBe(child);
    expect(grandpa.parent).toBe(null); // untouched, no AE error thrown
  });

  it('a direct parent of the target is skipped too', () => {
    const parent = makeLayer({ name: 'P' });
    const child = makeLayer({ name: 'C', parent });
    comp.selectedLayers = [parent, child];
    const res = commands['link.apply']({ target: 'last' });
    expect(res.linked).toBe(0);
    expect(res.skipped).toEqual(['P (would create a loop)']);
  });

  it('an unrelated selection links exactly as before', () => {
    const a = makeLayer({ name: 'A' });
    const b = makeLayer({ name: 'B' });
    const c = makeLayer({ name: 'C' });
    comp.selectedLayers = [a, b, c];
    const res = commands['link.apply']({ target: 'first' });
    expect(res.linked).toBe(2);
    expect(res.skipped).toEqual([]);
    expect(b.parent).toBe(a);
    expect(c.parent).toBe(a);
  });
});

describe('reset.apply hardening', () => {
  it('an audio-only layer (sourceRectAtTime throws) is skipped, not a mid-loop abort', () => {
    const audio = makeLayer({ name: 'Music' });
    audio.sourceRectAtTime = () => { throw new Error('After Effects error: invalid source rect'); };
    const shape = makeLayer({ name: 'Shape', anchor: [0, 0], rect: { left: 0, top: 0, width: 100, height: 50 } });
    comp.selectedLayers = [audio, shape];
    const res = commands['reset.apply']({ anchor: true });
    expect(res.reset).toBe(1); // the shape still got processed
    expect(res.skipped).toEqual(['Music (no visible bounds)']);
    close(shape._ch[MATCH.anchor].value, [50, 25]);
    close(audio._ch[MATCH.anchor].value, [0, 0]); // untouched
  });

  it('an empty 0x0 rect never sends the anchor to a degenerate point', () => {
    const empty = makeLayer({ name: 'Empty', anchor: [7, 7], rect: { left: 0, top: 0, width: 0, height: 0 } });
    comp.selectedLayers = [empty];
    const res = commands['reset.apply']({ anchor: true });
    expect(res.reset).toBe(0);
    expect(res.skipped).toEqual(['Empty (no visible bounds)']);
    close(empty._ch[MATCH.anchor].value, [7, 7]);
  });

  it('position reset lands a PARENTED layer at the visual comp centre', () => {
    const parent = makeLayer({ name: 'P', pos: [100, 100], rot: 90 });
    const child = makeLayer({ name: 'C', pos: [10, 0], parent });
    comp.selectedLayers = [child];
    const res = commands['reset.apply']({ position: true });
    expect(res.reset).toBe(1);
    // Comp centre is (500,400); written in parent space it is NOT (500,400) raw.
    const wp = util.applyMat(util.compMatrix(parent, 0), ...child._ch[MATCH.position].value);
    close(wp, [500, 400]);
  });

  it('separated position reset counts only when a follower was actually written', () => {
    const L = makeLayer({ name: 'Sep', pos: [1, 2], sep: true });
    L._ch[MATCH.positionX].numKeys = 2;
    L._ch[MATCH.positionY].numKeys = 2;
    comp.selectedLayers = [L];
    const res = commands['reset.apply']({ position: true });
    expect(res.reset).toBe(0); // both followers keyed -> nothing changed, nothing counted
    expect(L._ch[MATCH.positionX].value).toBe(1);
  });
});
