import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import normalize from '../shared/lib/normalize.js';

// Validate the AE-runtime POSITIONING glue — the host code that calls
// layer.property('ADBE Transform Group').property('ADBE Position').setValue([...]) —
// by running the REAL host/commands/import/transform.jsx against a recording mock
// of the AE property tree. We assert the exact numbers the host sends to After
// Effects for a given source node (translation / rotation / scale / opacity /
// blend). This does NOT prove AE renders them (that needs AE), but it proves the
// glue computes and dispatches the correct 1:1 placement — the layer that decides
// whether things land "aligned well". Uses the real shared decomposeMatrix.

// ---- a recording mock of an AE property tree -----------------------------
function makeProp() {
  const kids = {};
  const self = {
    _value: undefined,
    property(name) { return kids[name] || (kids[name] = makeProp()); },
    addProperty(name) { const c = makeProp(); c._name = name; return c; },
    setValue(v) { self._value = v; return v; },
    get value() { return self._value; },
    remove() {}
  };
  return self;
}
function makeLayer() {
  const root = makeProp();
  return {
    _root: root, name: '', blendingMode: null, preserveTransparency: null,
    property(name) { return root.property(name); },
    remove() {}
  };
}
// Read a transform channel's recorded value off a built layer.
function chan(layer, matchName) {
  return layer.property('ADBE Transform Group').property(matchName).value;
}

let apply;
const noteLog = [];

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const read = (p) => readFileSync(path.join(dir, '..', p), 'utf8');
  const $ = { __rebound: {} };
  // AE's BlendingMode enum (only the members the glue reads).
  globalThis.BlendingMode = { MULTIPLY: 'MULTIPLY', SCREEN: 'SCREEN', OVERLAY: 'OVERLAY' };
  const run = (src) => new Function('$', src)($);
  // util.jsx sets $.__rebound.util (MATCH + helpers); it is load-clean (no app/File).
  run(read('host/lib/util.jsx'));
  // transform.jsx captures R.util, R.ir.N and R.importer at load — provide them.
  // Route the host's approximation/skip notes into a log the tests can inspect.
  $.__rebound.ir = { N: normalize };
  $.__rebound.importer = { util: { note: (report, level, o) => noteLog.push({ level, o }) } };
  run(read('host/commands/import/transform.jsx'));
  apply = $.__rebound.importer.transform.apply;
});

describe('host transform.apply — AE-runtime positioning glue (real code, mock DOM)', () => {
  it('always resets the anchor to the local origin [0,0]', () => {
    const layer = makeLayer();
    apply(layer, { transform: { x: 5, y: 5 } }, {});
    expect(chan(layer, 'ADBE Anchor Point')).toEqual([0, 0]);
  });

  it('places a pure-translation matrix at exactly its (tx,ty)', () => {
    const layer = makeLayer();
    // matrix [a,b,c,d,tx,ty] = translate(56,56) — the hoisted gradient-card offset.
    apply(layer, { transform: { matrix: [1, 0, 0, 1, 56, 56] } }, {});
    expect(chan(layer, 'ADBE Position')).toEqual([56, 56]);
    // No rotation/scale channels touched for an identity-rotation, unit-scale node.
    expect(chan(layer, 'ADBE Rotate Z')).toBeUndefined();
    expect(chan(layer, 'ADBE Scale')).toBeUndefined();
  });

  it('decomposes a rotation matrix to the right degrees (Y-down clockwise)', () => {
    const layer = makeLayer();
    const t = 30 * Math.PI / 180;
    // 30deg rotation about the origin, translated to (10,20).
    apply(layer, { transform: { matrix: [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 10, 20] } }, {});
    expect(chan(layer, 'ADBE Position')).toEqual([10, 20]);
    expect(chan(layer, 'ADBE Rotate Z')).toBeCloseTo(30, 4);
    // Unit scale must NOT be written (avoids a spurious 100% keyframe).
    expect(chan(layer, 'ADBE Scale')).toBeUndefined();
  });

  it('decomposes non-uniform scale to AE percent [sx*100, sy*100]', () => {
    const layer = makeLayer();
    apply(layer, { transform: { matrix: [2, 0, 0, 3, 0, 0] } }, {});
    const s = chan(layer, 'ADBE Scale');
    expect(s[0]).toBeCloseTo(200, 4);
    expect(s[1]).toBeCloseTo(300, 4);
  });

  it('falls back to plain (x,y) when no matrix is present', () => {
    const layer = makeLayer();
    apply(layer, { transform: { x: 12, y: 34, rotation: 45 } }, {});
    expect(chan(layer, 'ADBE Position')).toEqual([12, 34]);
    expect(chan(layer, 'ADBE Rotate Z')).toBe(45);
  });

  it('writes opacity as a 0..100 percentage only when below 1', () => {
    const half = makeLayer();
    apply(half, { transform: { x: 0, y: 0 }, opacity: 0.5 }, {});
    expect(chan(half, 'ADBE Opacity')).toBe(50);
    const full = makeLayer();
    apply(full, { transform: { x: 0, y: 0 }, opacity: 1 }, {});
    expect(chan(full, 'ADBE Opacity')).toBeUndefined();
  });

  it('maps a non-normal blend mode onto the AE layer (and leaves NORMAL alone)', () => {
    const mul = makeLayer();
    apply(mul, { transform: { x: 0, y: 0 }, blendMode: 'MULTIPLY' }, {});
    expect(mul.blendingMode).toBe(globalThis.BlendingMode.MULTIPLY);
    const norm = makeLayer();
    apply(norm, { transform: { x: 0, y: 0 }, blendMode: 'PASS_THROUGH' }, {});
    expect(norm.blendingMode).toBe(null);
  });

  it('reports a sheared source instead of silently dropping the skew', () => {
    noteLog.length = 0;
    const layer = makeLayer();
    // A shear matrix [1, 0, 0.5, 1, 0, 0] (x' = x + 0.5y) has a non-zero skew that
    // an AE 2D layer transform cannot represent. Position still lands, and the skew
    // is surfaced as an approximation note rather than lost quietly.
    apply(layer, { name: 'Sheared', transform: { matrix: [1, 0, 0.5, 1, 0, 0] } }, {});
    expect(chan(layer, 'ADBE Position')).toEqual([0, 0]);
    const skew = noteLog.filter((n) => n.level === 'approximated' && /shear|skew/i.test(n.o.detail));
    expect(skew.length).toBe(1);
  });
});
