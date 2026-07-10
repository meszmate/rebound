import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the timing-tool fixes against mock AE objects, running the REAL host
// command files (loaded via new Function with a recording $ mock, the same
// pattern as host-anchor.test.mjs):
//
// - reverse.jsx must capture spatial tangents and the auto/continuous/roving
//   flags and restore the tangents SWAPPED (in <-> out), so a curved motion
//   path keeps its exact shape when played backwards. It used to drop them,
//   flattening every curved path to straight segments.
// - fade.jsx must ramp to the layer's own opacity (not a hardcoded 100), clear
//   stale keys inside the fade ranges on re-apply, and scale both ramps down
//   when the layer is shorter than in + out.
// - break.jsx must skip a single-group shape layer instead of duplicating it
//   and reporting "Broke into 1 layer".

const MATCH = {
  transform: 'ADBE Transform Group',
  opacity: 'ADBE Opacity'
};

const KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
class KeyframeEase {
  constructor(speed, influence) { this.speed = speed; this.influence = influence; }
}
class CameraLayer {}
class LightLayer {}

// A minimal keyframed AE Property: keys live in a time-sorted array and every
// key* accessor / set*AtKey mutator the commands touch is implemented.
class MockProperty {
  constructor({ spatial = false, value = 0 } = {}) {
    this._spatial = spatial;
    this.value = value;
    this.keys = [];
    this.selectedKeys = [];
    this.canVaryOverTime = true;
    this.expressionEnabled = false;
    this.expression = '';
  }
  get numKeys() { return this.keys.length; }
  _k(i) {
    if (i < 1 || i > this.keys.length) throw new Error('bad key index ' + i);
    return this.keys[i - 1];
  }
  keyTime(i) { return this._k(i).time; }
  keyValue(i) { return this._k(i).value; }
  keyInTemporalEase(i) { return this._k(i).inEase; }
  keyOutTemporalEase(i) { return this._k(i).outEase; }
  keyInInterpolationType(i) { return this._k(i).inInterp; }
  keyOutInterpolationType(i) { return this._k(i).outInterp; }
  keyTemporalAutoBezier(i) { return !!this._k(i).auto; }
  keyTemporalContinuous(i) { return !!this._k(i).cont; }
  keyRoving(i) { return !!this._k(i).rove; }
  keyInSpatialTangent(i) {
    if (!this._spatial) throw new Error('not spatial');
    return this._k(i).inSpatial;
  }
  keyOutSpatialTangent(i) {
    if (!this._spatial) throw new Error('not spatial');
    return this._k(i).outSpatial;
  }
  nearestKeyIndex(t) {
    let best = 0, bestD = Infinity;
    this.keys.forEach((k, idx) => {
      const d = Math.abs(k.time - t);
      if (d < bestD) { bestD = d; best = idx + 1; }
    });
    return best;
  }
  valueAtTime() { return this.value; }
  removeKey(i) { this._k(i); this.keys.splice(i - 1, 1); }
  setValueAtTime(t, v) {
    const existing = this.keys.find((k) => Math.abs(k.time - t) < 1e-9);
    if (existing) { existing.value = v; return; }
    this.keys.push({
      time: t,
      value: v,
      inInterp: KeyframeInterpolationType.LINEAR,
      outInterp: KeyframeInterpolationType.LINEAR,
      inEase: [new KeyframeEase(0, 16.67)],
      outEase: [new KeyframeEase(0, 16.67)],
      inSpatial: [0, 0],
      outSpatial: [0, 0],
      auto: false,
      cont: false,
      rove: false
    });
    this.keys.sort((a, b) => a.time - b.time);
  }
  setInterpolationTypeAtKey(i, inI, outI) {
    const k = this._k(i);
    k.inInterp = inI;
    k.outInterp = outI;
  }
  setTemporalEaseAtKey(i, inE, outE) {
    const k = this._k(i);
    k.inEase = inE;
    k.outEase = outE;
  }
  setSpatialTangentsAtKey(i, inT, outT) {
    if (!this._spatial) throw new Error('not spatial');
    const k = this._k(i);
    k.inSpatial = inT;
    k.outSpatial = outT;
  }
  setTemporalAutoBezierAtKey(i, v) { this._k(i).auto = v; }
  setTemporalContinuousAtKey(i, v) { this._k(i).cont = v; }
  setRovingAtKey(i, v) { this._k(i).rove = v; }
  addKey(time, value, attrs = {}) {
    this.setValueAtTime(time, value);
    Object.assign(this.keys.find((k) => k.time === time), attrs);
  }
}

let commands;
let comp;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  commands = {};
  comp = { time: 0, frameRate: 24, selectedLayers: [], selectedProperties: [] };
  const $ = {
    __rebound: {
      util: {
        MATCH,
        activeComp() { return comp; },
        isSpatial(p) { return !!p._spatial; }
      },
      beginUndo() {},
      endUndo() {},
      register(name, fn) { commands[name] = fn; }
    }
  };
  const load = (file, extraNames, extraValues) => {
    const code = readFileSync(path.join(dir, '../host/commands/' + file), 'utf8');
    new Function('$', ...extraNames, code)($, ...extraValues);
  };
  load('reverse.jsx', ['Property'], [MockProperty]);
  load('fade.jsx', ['CameraLayer', 'LightLayer', 'KeyframeInterpolationType', 'KeyframeEase'],
    [CameraLayer, LightLayer, KeyframeInterpolationType, KeyframeEase]);
  load('break.jsx', [], []);
});

// ---- reverse.jsx ------------------------------------------------------------

function spatialProp() {
  const p = new MockProperty({ spatial: true });
  p.addKey(0, [0, 0], {
    inInterp: KeyframeInterpolationType.BEZIER,
    outInterp: KeyframeInterpolationType.BEZIER,
    inEase: [new KeyframeEase(0, 16.67)],
    outEase: [new KeyframeEase(0, 80)],
    inSpatial: [0, 0],
    outSpatial: [10, 0]
  });
  p.addKey(1, [50, 20], {
    inInterp: KeyframeInterpolationType.BEZIER,
    outInterp: KeyframeInterpolationType.BEZIER,
    inSpatial: [-5, -5],
    outSpatial: [5, 5],
    auto: true,
    cont: true
  });
  p.addKey(2, [100, 0], {
    inInterp: KeyframeInterpolationType.BEZIER,
    outInterp: KeyframeInterpolationType.LINEAR,
    inEase: [new KeyframeEase(0, 60)],
    inSpatial: [-10, 0],
    outSpatial: [0, 0]
  });
  return p;
}

describe('reverse.apply spatial tangents and flags (real host code)', () => {
  it('restores spatial tangents swapped in <-> out at mirrored times', () => {
    const p = spatialProp();
    comp.selectedProperties = [p];
    const res = commands['reverse.apply']();
    expect(res.keys).toBe(3);
    expect(p.numKeys).toBe(3);

    // t=0 now holds the old t=2 key: value kept, tangents swapped.
    expect(p.keyTime(1)).toBe(0);
    expect(p.keyValue(1)).toEqual([100, 0]);
    expect(p.keyInSpatialTangent(1)).toEqual([0, 0]);   // old OUT tangent
    expect(p.keyOutSpatialTangent(1)).toEqual([-10, 0]); // old IN tangent

    // Middle key: symmetric time, tangents swapped.
    expect(p.keyTime(2)).toBe(1);
    expect(p.keyValue(2)).toEqual([50, 20]);
    expect(p.keyInSpatialTangent(2)).toEqual([5, 5]);
    expect(p.keyOutSpatialTangent(2)).toEqual([-5, -5]);

    // t=2 now holds the old t=0 key.
    expect(p.keyTime(3)).toBe(2);
    expect(p.keyValue(3)).toEqual([0, 0]);
    expect(p.keyInSpatialTangent(3)).toEqual([10, 0]);
    expect(p.keyOutSpatialTangent(3)).toEqual([0, 0]);
  });

  it('swaps interpolation and temporal ease, and keeps auto/continuous flags', () => {
    const p = spatialProp();
    comp.selectedProperties = [p];
    commands['reverse.apply']();

    // Old first key's OUT ease (influence 80) now leads IN to the last key.
    expect(p.keyInTemporalEase(3)[0].influence).toBe(80);
    // Old last key's IN ease (influence 60) now leads OUT of the first key.
    expect(p.keyOutTemporalEase(1)[0].influence).toBe(60);
    // Old last key's LINEAR out side now faces in on the first key.
    expect(p.keyInInterpolationType(1)).toBe(KeyframeInterpolationType.LINEAR);
    // The middle key's auto/continuous flags survive the round trip.
    expect(p.keyTemporalAutoBezier(2)).toBe(true);
    expect(p.keyTemporalContinuous(2)).toBe(true);
  });

  it('still reverses a non-spatial property without touching spatial APIs', () => {
    const p = new MockProperty();
    p.addKey(0, 10);
    p.addKey(2, 90);
    comp.selectedProperties = [p];
    const res = commands['reverse.apply']();
    expect(res.keys).toBe(2);
    expect(p.keyValue(1)).toBe(90);
    expect(p.keyValue(2)).toBe(10);
  });
});

// ---- fade.jsx ---------------------------------------------------------------

function fadeLayer({ opacity = 40, inPoint = 0, outPoint = 2 } = {}) {
  const op = new MockProperty({ value: opacity });
  const tr = { property(m) { return m === MATCH.opacity ? op : null; } };
  return {
    name: 'Layer 1',
    inPoint,
    outPoint,
    property(m) { return m === MATCH.transform ? tr : null; },
    _op: op
  };
}

describe('fade.apply opacity, stale keys, and short layers (real host code)', () => {
  it('ramps to the layer\'s current opacity, not a hardcoded 100', () => {
    const L = fadeLayer({ opacity: 40 });
    comp.selectedLayers = [L];
    const res = commands['fade.apply']({ inFrames: 12, outFrames: 12 });
    expect(res.faded).toBe(1);
    const keys = L._op.keys.map((k) => [k.time, k.value]);
    expect(keys).toEqual([[0, 0], [0.5, 40], [1.5, 40], [2, 0]]);
  });

  it('clears stale keys inside the fade ranges on re-apply', () => {
    const L = fadeLayer({ opacity: 100 });
    // Lumpy leftovers from an earlier, shorter fade.
    L._op.addKey(0, 0);
    L._op.addKey(0.2, 55);
    L._op.addKey(0.35, 100);
    L._op.addKey(1.7, 100);
    L._op.addKey(2, 0);
    L._op.valueAtTime = () => 100; // plateau between the old ramps
    comp.selectedLayers = [L];
    commands['fade.apply']({ inFrames: 12, outFrames: 12 });
    const times = L._op.keys.map((k) => k.time);
    expect(times).toEqual([0, 0.5, 1.5, 2]);
    const values = L._op.keys.map((k) => k.value);
    expect(values).toEqual([0, 100, 100, 0]);
  });

  it('scales both ramps down proportionally on a short layer, keys stay ordered', () => {
    const L = fadeLayer({ opacity: 100, inPoint: 0, outPoint: 0.6 });
    comp.selectedLayers = [L];
    // 12 + 12 frames = 1s of fades on a 0.6s layer -> scaled to 0.3 + 0.3.
    commands['fade.apply']({ inFrames: 12, outFrames: 12 });
    const times = L._op.keys.map((k) => k.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBeCloseTo(0.6, 9);
    expect(times).toContain(0.3); // the two mid keys collapse into the joint
    L._op.keys.forEach((k) => {
      expect(k.time).toBeGreaterThanOrEqual(0);
      expect(k.time).toBeLessThanOrEqual(0.6 + 1e-9);
    });
  });
});

// ---- break.jsx --------------------------------------------------------------

const ROOT = 'ADBE Root Vectors Group';

function shapeLayer(name, groupNames) {
  const children = groupNames.map((n) => {
    const child = {
      matchName: 'ADBE Vector Group',
      name: n,
      remove() { children.splice(children.indexOf(child), 1); }
    };
    return child;
  });
  const root = {
    get numProperties() { return children.length; },
    property(i) { return children[i - 1]; }
  };
  return {
    name,
    _root: root,
    duplicate() {
      const dup = shapeLayer(name + ' copy', children.map((c) => c.name));
      created.push(dup);
      return dup;
    },
    property(m) {
      if (m !== ROOT) throw new Error('not a shape layer');
      return root;
    }
  };
}

let created;

describe('break.apply single-group skip (real host code)', () => {
  it('skips a single-group layer instead of cloning it', () => {
    created = [];
    const L = shapeLayer('One Group', ['Only Group']);
    comp.selectedLayers = [L];
    const res = commands['break.apply']({});
    expect(res.created).toBe(0);
    expect(created.length).toBe(0); // no duplicate was ever made
    expect(res.skipped).toEqual(['One Group (single group)']);
  });

  it('still breaks a multi-group layer into one layer per group', () => {
    created = [];
    const L = shapeLayer('Three Groups', ['A', 'B', 'C']);
    comp.selectedLayers = [L];
    const res = commands['break.apply']({});
    expect(res.created).toBe(3);
    expect(res.skipped).toEqual([]);
    expect(created.length).toBe(3);
    expect(created.map((d) => d.name)).toEqual(['A', 'B', 'C']);
    created.forEach((d) => expect(d._root.numProperties).toBe(1));
  });
});
