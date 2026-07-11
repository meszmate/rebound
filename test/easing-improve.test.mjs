import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks two host-side easing improvements against the REAL .jsx files running
// over mock AE objects (the host-anchor.test.mjs pattern):
//   1. bake.apply's Reduce mode: Ramer-Douglas-Peucker over the captured
//      samples, per dimension, each normalized by ITS OWN value range, with
//      the survivors written back as auto-bezier keys.
//   2. copyease.copy's returned shape: alongside the raw in/out ease it now
//      hands back a normalized cubic-bezier (reconstructed with the ease.jsx
//      math, per adjacent segment) plus the source layer/property names, so
//      the panel can preview the REAL copied ease.

function loadJsx(rel, globals) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, '..', rel), 'utf8');
  const names = Object.keys(globals);
  new Function(...names, src)(...names.map((n) => globals[n]));
}

const KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };

// ---------------------------------------------------------------------------
// bake.apply Reduce mode (real host/commands/bake.jsx)
// ---------------------------------------------------------------------------

describe('bake.apply Reduce mode (RDP, real bake.jsx)', () => {
  // A keyframe-less animated property whose live value is `fn(t)`; the bake
  // writes into _keys, so the survivors and their interpolation are observable.
  class Property {
    constructor(fn) {
      this.fn = fn;
      this.isTimeVarying = true;
      this.expressionEnabled = false;
      this.expression = '';
      this._keys = []; // { t, v, inT, outT, auto }
    }
    get numKeys() { return this._keys.length; }
    valueAtTime(t) { return this.fn(t); }
    keyTime(i) { return this._keys[i - 1].t; }
    removeKey(i) { this._keys.splice(i - 1, 1); }
    setValueAtTime(t, v) {
      this._keys.push({ t, v, inT: null, outT: null, auto: false });
      this._keys.sort((a, b) => a.t - b.t);
    }
    setInterpolationTypeAtKey(i, inT, outT) {
      this._keys[i - 1].inT = inT;
      this._keys[i - 1].outT = outT;
    }
    setTemporalAutoBezierAtKey(i, v) { this._keys[i - 1].auto = v; }
  }

  let commands;
  let comp;

  beforeAll(() => {
    commands = {};
    // 10 fps over a 2s work area: step 1 samples t = 0, 0.1, ... 2.0.
    comp = { frameRate: 10, workAreaStart: 0, workAreaDuration: 2, selectedProperties: [] };
    const $ = {
      __rebound: {
        util: {
          activeComp() { return comp; },
          layerOfProperty() { return { name: 'Layer 1', inPoint: 0, outPoint: 2 }; }
        },
        rig: {
          MARKER: '/* @rebound */',
          clearExpression(p) { p.expression = ''; }
        },
        register(name, fn) { commands[name] = fn; }
      }
    };
    loadJsx('host/commands/bake.jsx', { $, Property, KeyframeInterpolationType });
  });

  function bake(fn, args = {}) {
    const p = new Property(fn);
    comp.selectedProperties = [p];
    const res = commands['bake.apply']({ range: 'work', stepFrames: 1, ...args });
    return { p, res };
  }

  it('without simplify, every sample becomes a key and interpolation is untouched', () => {
    const { p, res } = bake((t) => t * 50);
    expect(res.keys).toBe(res.sampled);
    expect(res.keys).toBeGreaterThan(10);
    expect(p._keys.every((k) => k.inT === null && k.auto === false)).toBe(true);
  });

  it('a linear ramp reduces to its two endpoints', () => {
    const { p, res } = bake((t) => t * 50, { simplify: 0.01 });
    expect(res.keys).toBe(2);
    expect(res.sampled).toBeGreaterThan(2);
    expect(p.keyTime(1)).toBeCloseTo(0, 6);
    expect(p.keyTime(2)).toBeCloseTo(2, 6);
  });

  it('a piecewise-linear corner survives: exactly 3 keys, one at the corner', () => {
    const { p, res } = bake((t) => (t <= 1 ? t * 100 : 100), { simplify: 0.01 });
    expect(res.keys).toBe(3);
    expect(p.keyTime(2)).toBeCloseTo(1, 4);
  });

  it('a constant value reduces to endpoints only (a flat dimension carries no shape)', () => {
    const { res } = bake(() => 42, { simplify: 0.01 });
    expect(res.keys).toBe(2);
  });

  it('surviving keys are written as AUTO_BEZIER (bezier both sides + auto flag)', () => {
    const { p } = bake((t) => (t <= 1 ? t * 100 : 100), { simplify: 0.01 });
    for (const k of p._keys) {
      expect(k.inT).toBe(KeyframeInterpolationType.BEZIER);
      expect(k.outT).toBe(KeyframeInterpolationType.BEZIER);
      expect(k.auto).toBe(true);
    }
  });

  it('normalizes per dimension: a small-range wiggle is kept next to a huge linear dim', () => {
    // dim 0 sweeps 0..2000 (pure linear, no survivors of its own); dim 1 is a
    // 0..1 triangle. Normalized by ITS OWN range the apex is a full-size corner
    // — global normalization would flatten it below any sane tolerance.
    const { p, res } = bake((t) => [t * 1000, t <= 1 ? t : 2 - t], { simplify: 0.01 });
    expect(res.keys).toBe(3);
    expect(p.keyTime(2)).toBeCloseTo(1, 4);
  });

  it('a looser tolerance keeps fewer keys (monotonic on a sine)', () => {
    const sine = (t) => Math.sin(t * Math.PI) * 100;
    const tight = bake(sine, { simplify: 0.005 }).res.keys;
    const loose = bake(sine, { simplify: 0.05 }).res.keys;
    expect(tight).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// copyease.copy returned shape (real util.jsx + copyease.jsx)
// ---------------------------------------------------------------------------

describe('copyease.copy returns the reconstructed curve + source names', () => {
  const PropertyValueType = {
    NO_VALUE: 6412,
    ThreeD_SPATIAL: 6413,
    ThreeD: 6414,
    TwoD_SPATIAL: 6415,
    TwoD: 6416,
    OneD: 6417,
    COLOR: 6418,
    CUSTOM_VALUE: 6419,
    MARKER: 6420,
    SHAPE: 6421
  };

  class KeyframeEase {
    constructor(speed, influence) {
      this.speed = speed;
      this.influence = influence;
    }
  }

  class CompItem {}

  class Property {
    constructor({ name = 'Opacity', values, times, selected }) {
      this.name = name;
      this.propertyValueType = PropertyValueType.OneD;
      this.canVaryOverTime = true;
      this.propertyDepth = 1;
      this._values = values;
      this._times = times;
      this.numKeys = values.length;
      this.selectedKeys = selected;
      const def = () => [new KeyframeEase(0, 16.666667)];
      this._in = values.map(def);
      this._out = values.map(def);
    }
    propertyGroup() { return { name: 'Layer 1' }; }
    keyValue(i) { return this._values[i - 1]; }
    keyTime(i) { return this._times[i - 1]; }
    keyInTemporalEase(i) { return this._in[i - 1]; }
    keyOutTemporalEase(i) { return this._out[i - 1]; }
  }

  let commands;
  let comp;

  beforeAll(() => {
    commands = {};
    comp = Object.assign(new CompItem(), { time: 0, selectedProperties: [] });
    const app = { project: { activeItem: comp } };
    const $ = {
      __rebound: {
        register(name, fn) { commands[name] = fn; },
        beginUndo() {},
        endUndo() {}
      }
    };
    loadJsx('host/lib/util.jsx', { $, app, CompItem, Property, PropertyValueType, KeyframeEase, KeyframeInterpolationType });
    loadJsx('host/commands/copyease.jsx', { $, Property, KeyframeEase, KeyframeInterpolationType });
  });

  function copyFrom(prop) {
    comp.selectedProperties = [prop];
    return commands['copyease.copy']({});
  }

  it('an easy-eased middle key reads back as the classic 0.33/0/0.67/1 curve', () => {
    const p = new Property({ values: [0, 100, 200], times: [0, 1, 2], selected: [2] });
    p._in[1] = [new KeyframeEase(0, 33.33)];
    p._out[1] = [new KeyframeEase(0, 33.33)];
    const res = copyFrom(p);
    expect(res.curve.type).toBe('bezier');
    expect(res.curve.x1).toBeCloseTo(0.3333, 3);
    expect(res.curve.y1).toBeCloseTo(0, 6);
    expect(res.curve.x2).toBeCloseTo(0.6667, 3);
    expect(res.curve.y2).toBeCloseTo(1, 6);
  });

  it('carries the source layer and property names, and the paste-compatible ease pair', () => {
    const p = new Property({ name: 'Opacity', values: [0, 100, 200], times: [0, 1, 2], selected: [2] });
    const res = copyFrom(p);
    expect(res.layerName).toBe('Layer 1');
    expect(res.propertyName).toBe('Opacity');
    expect(res.inEase).toEqual({ speed: 0, influence: 16.666667 });
    expect(res.outEase).toEqual({ speed: 0, influence: 16.666667 });
  });

  it('normalizes each handle by its OWN adjacent segment speed (ease.jsx math)', () => {
    // avg in = (100-0)/1 = 100, avg out = (200-100)/1 = 100.
    // out: infl 40, speed 50  -> x1 = 0.4,  y1 = (50/100)*0.4  = 0.2
    // in:  infl 25, speed 30  -> x2 = 0.75, y2 = 1-(30/100)*0.25 = 0.925
    const p = new Property({ values: [0, 100, 200], times: [0, 1, 2], selected: [2] });
    p._out[1] = [new KeyframeEase(50, 40)];
    p._in[1] = [new KeyframeEase(30, 25)];
    const res = copyFrom(p);
    expect(res.curve.x1).toBeCloseTo(0.4, 6);
    expect(res.curve.y1).toBeCloseTo(0.2, 6);
    expect(res.curve.x2).toBeCloseTo(0.75, 6);
    expect(res.curve.y2).toBeCloseTo(0.925, 6);
  });

  it('a first key has no incoming segment: the in side reads back linear (y2 = x2)', () => {
    const p = new Property({ values: [0, 100], times: [0, 1], selected: [1] });
    p._in[0] = [new KeyframeEase(75, 60)]; // no preceding segment -> unrecoverable
    p._out[0] = [new KeyframeEase(0, 33.33)];
    const res = copyFrom(p);
    expect(res.curve.y2).toBeCloseTo(res.curve.x2, 6);
    expect(res.curve.x1).toBeCloseTo(0.3333, 3);
    expect(res.curve.y1).toBeCloseTo(0, 6);
  });

  it('a non-moving neighbor segment reads that side back linear instead of dividing by ~0', () => {
    const p = new Property({ values: [0, 100, 100], times: [0, 1, 2], selected: [2] });
    p._out[1] = [new KeyframeEase(50, 40)]; // outgoing segment is flat (100 -> 100)
    const res = copyFrom(p);
    expect(res.curve.y1).toBeCloseTo(res.curve.x1, 6);
    expect(Number.isFinite(res.curve.y1)).toBe(true);
  });
});
