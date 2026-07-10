import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the temporal-ease fixes against the REAL host code (util.jsx +
// ease/copyease/smooth/velocity.jsx) running over a mock AE property tree:
//   1. Temporal-ease dimensionality: COLOR has 4 value components but takes
//      exactly ONE KeyframeEase; CUSTOM_VALUE/SHAPE take one too. The mock's
//      setTemporalEaseAtKey enforces the AE-side array length, so the old
//      `spatial ? 1 : dimensionsOf(prop)` sizing (4 for COLOR, 0 for
//      CUSTOM_VALUE) throws exactly like AE does.
//   2. Per-side interpolation: easing/pasting/smoothing one side must not
//      flip a deliberate HOLD on the other side to BEZIER.
//   3. Roving is spatial-only: smooth.apply must report the skip instead of
//      swallowing setRovingAtKey's throw under a success.

const KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
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
    if (!Number.isFinite(speed) || !Number.isFinite(influence)) {
      throw new Error('KeyframeEase: speed/influence must be finite numbers');
    }
    if (influence < 0.1 || influence > 100) {
      throw new Error('KeyframeEase: influence out of range: ' + influence);
    }
    this.speed = speed;
    this.influence = influence;
  }
}

class CompItem {}

// The number of KeyframeEase elements AE actually expects per side.
function aeTemporalDims(vt) {
  if (vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL) return 1;
  if (vt === PropertyValueType.ThreeD) return 3;
  if (vt === PropertyValueType.TwoD) return 2;
  return 1;
}

class Property {
  constructor({ name = 'Prop', valueType, values, times, selected = null }) {
    this.name = name;
    this.propertyValueType = valueType;
    this.canVaryOverTime = true;
    this.expressionEnabled = false;
    this.propertyDepth = 1;
    this._values = values;
    this._times = times;
    this.numKeys = values.length;
    this.selectedKeys = selected || values.map((_, i) => i + 1);
    const td = aeTemporalDims(valueType);
    const def = () => Array.from({ length: td }, () => new KeyframeEase(0, 16.666667));
    this._in = values.map(def);
    this._out = values.map(def);
    this._inT = values.map(() => KeyframeInterpolationType.LINEAR);
    this._outT = values.map(() => KeyframeInterpolationType.LINEAR);
    this._roving = {};
  }
  propertyGroup() { return { name: 'Layer 1' }; }
  keyValue(i) { return this._values[i - 1]; }
  keyTime(i) { return this._times[i - 1]; }
  valueAtTime(t) {
    // Linear interpolation between keys (enough for spatialArcLength sampling).
    const n = this.numKeys;
    if (t <= this._times[0]) return this._values[0];
    if (t >= this._times[n - 1]) return this._values[n - 1];
    for (let i = 0; i < n - 1; i++) {
      const t0 = this._times[i], t1 = this._times[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        const a = this._values[i], b = this._values[i + 1];
        if (Array.isArray(a)) return a.map((v, d) => v + (b[d] - v) * f);
        return a + (b - a) * f;
      }
    }
    return this._values[n - 1];
  }
  keyInInterpolationType(i) { return this._inT[i - 1]; }
  keyOutInterpolationType(i) { return this._outT[i - 1]; }
  setInterpolationTypeAtKey(i, inType, outType) {
    this._inT[i - 1] = inType;
    this._outT[i - 1] = outType;
  }
  keyInTemporalEase(i) { return this._in[i - 1]; }
  keyOutTemporalEase(i) { return this._out[i - 1]; }
  setTemporalEaseAtKey(i, inArr, outArr) {
    const want = aeTemporalDims(this.propertyValueType);
    if (!Array.isArray(inArr) || !Array.isArray(outArr) ||
        inArr.length !== want || outArr.length !== want) {
      throw new Error('After Effects error: wrong number of KeyframeEase elements (expected ' + want + ')');
    }
    for (const e of inArr.concat(outArr)) {
      if (!(e instanceof KeyframeEase)) throw new Error('not a KeyframeEase');
    }
    this._in[i - 1] = inArr.slice();
    this._out[i - 1] = outArr.slice();
  }
  setRovingAtKey(i, v) {
    const vt = this.propertyValueType;
    if (vt !== PropertyValueType.TwoD_SPATIAL && vt !== PropertyValueType.ThreeD_SPATIAL) {
      throw new Error('After Effects error: roving is only valid on spatial properties');
    }
    this._roving[i] = v;
  }
  setTemporalAutoBezierAtKey() {}
  setSpatialAutoBezierAtKey() {}
}

let commands;
let comp;
let util;

function loadJsx(rel, globals) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, '..', rel), 'utf8');
  const names = Object.keys(globals);
  new Function(...names, src)(...names.map((n) => globals[n]));
}

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
  util = $.__rebound.util;
  const G = { $, Property, KeyframeEase, KeyframeInterpolationType, PropertyValueType };
  loadJsx('host/commands/ease.jsx', G);
  loadJsx('host/commands/copyease.jsx', G);
  loadJsx('host/commands/smooth.jsx', G);
  loadJsx('host/commands/velocity.jsx', G);
});

function select(...props) {
  comp.selectedProperties = props;
}

const CURVE = { x1: 0.4, y1: 0, x2: 0.6, y2: 1 };

function colorProp(extra = {}) {
  return new Property({
    name: 'Color',
    valueType: PropertyValueType.COLOR,
    values: [[1, 0, 0, 1], [0, 1, 0, 1]],
    times: [0, 1],
    ...extra
  });
}

describe('util.temporalDims (real util.jsx)', () => {
  const P = (vt) => ({ propertyValueType: vt });
  it('COLOR takes ONE ease despite having 4 value components', () => {
    expect(util.temporalDims(P(PropertyValueType.COLOR))).toBe(1);
    expect(util.dimensionsOf(P(PropertyValueType.COLOR))).toBe(4); // value math unchanged
  });
  it('CUSTOM_VALUE/SHAPE take ONE ease (dimensionsOf says 0)', () => {
    expect(util.temporalDims(P(PropertyValueType.CUSTOM_VALUE))).toBe(1);
    expect(util.temporalDims(P(PropertyValueType.SHAPE))).toBe(1);
    expect(util.dimensionsOf(P(PropertyValueType.CUSTOM_VALUE))).toBe(0);
  });
  it('spatial takes one, plain TwoD/ThreeD take 2/3', () => {
    expect(util.temporalDims(P(PropertyValueType.TwoD_SPATIAL))).toBe(1);
    expect(util.temporalDims(P(PropertyValueType.ThreeD_SPATIAL))).toBe(1);
    expect(util.temporalDims(P(PropertyValueType.TwoD))).toBe(2);
    expect(util.temporalDims(P(PropertyValueType.ThreeD))).toBe(3);
    expect(util.temporalDims(P(PropertyValueType.OneD))).toBe(1);
  });
});

describe('ease.apply temporal dims + hold sides', () => {
  it('eases a COLOR property with ONE KeyframeEase per side (was 4 → AE throw)', () => {
    const p = colorProp();
    select(p);
    const res = commands['ease.apply']({ curve: CURVE, scope: 'inout' });
    expect(res.segments).toBe(1);
    expect(p.keyOutTemporalEase(1)).toHaveLength(1);
    expect(p.keyInTemporalEase(2)).toHaveLength(1);
    expect(p.keyOutTemporalEase(1)[0].influence).toBeCloseTo(40, 4);
  });

  it('eases a CUSTOM_VALUE property (was 0 eases → AE throw); speed falls back to 0', () => {
    const p = new Property({
      valueType: PropertyValueType.CUSTOM_VALUE,
      values: [{ shape: 'a' }, { shape: 'b' }],
      times: [0, 1]
    });
    select(p);
    const res = commands['ease.apply']({ curve: CURVE, scope: 'inout' });
    expect(res.segments).toBe(1);
    expect(p.keyOutTemporalEase(1)).toHaveLength(1);
    expect(p.keyOutTemporalEase(1)[0].speed).toBe(0);
  });

  it('spatial position still gets a single along-the-path ease', () => {
    const p = new Property({
      valueType: PropertyValueType.TwoD_SPATIAL,
      values: [[0, 0], [100, 0]],
      times: [0, 1]
    });
    select(p);
    const res = commands['ease.apply']({ curve: CURVE, scope: 'inout' });
    expect(res.segments).toBe(1);
    expect(p.keyOutTemporalEase(1)).toHaveLength(1);
  });

  it('ease.read on COLOR clamps the ease index to the single ease (no undefined read)', () => {
    // Channel 1 (green) moves the most, so the value-dim scan picks dim=1 —
    // which does not exist in the 1-element ease array unless clamped.
    const p = new Property({
      valueType: PropertyValueType.COLOR,
      values: [[0, 0, 0, 1], [0.2, 1, 0.1, 1]],
      times: [0, 1]
    });
    p._out[0] = [new KeyframeEase(0, 40)];
    p._in[1] = [new KeyframeEase(0, 40)];
    select(p);
    const res = commands['ease.read']();
    expect(res.found).toBe(true);
    expect(res.curve.x1).toBeCloseTo(0.4, 4);
  });

  it('easing the out side leaves a HOLD on the in side of the same key', () => {
    const p = new Property({
      valueType: PropertyValueType.OneD,
      values: [0, 100],
      times: [0, 1]
    });
    p._inT[0] = KeyframeInterpolationType.HOLD;
    select(p);
    commands['ease.apply']({ curve: CURVE, scope: 'inout' });
    expect(p.keyInInterpolationType(1)).toBe(KeyframeInterpolationType.HOLD);
    expect(p.keyOutInterpolationType(1)).toBe(KeyframeInterpolationType.BEZIER);
  });
});

describe('copyease.paste temporal dims + hold sides', () => {
  const EASE = {
    inEase: { speed: 0, influence: 80 },
    outEase: { speed: 0, influence: 60 }
  };

  it('pastes ONE ease onto a COLOR key (was 4 → AE throw)', () => {
    const p = colorProp({ selected: [1] });
    select(p);
    const res = commands['copyease.paste']({ ease: EASE, mode: 'both' });
    expect(res.keys).toBe(1);
    expect(p.keyInTemporalEase(1)).toHaveLength(1);
    expect(p.keyInTemporalEase(1)[0].influence).toBeCloseTo(80, 4);
  });

  it('preserves a HOLD out side: interpolation and ease stay untouched', () => {
    const p = new Property({ valueType: PropertyValueType.OneD, values: [0, 100], times: [0, 1], selected: [1] });
    p._outT[0] = KeyframeInterpolationType.HOLD;
    const beforeOut = p.keyOutTemporalEase(1)[0];
    select(p);
    const res = commands['copyease.paste']({ ease: EASE, mode: 'both' });
    expect(res.keys).toBe(1);
    expect(p.keyOutInterpolationType(1)).toBe(KeyframeInterpolationType.HOLD);
    expect(p.keyOutTemporalEase(1)[0]).toBe(beforeOut); // ease not overwritten
    expect(p.keyInInterpolationType(1)).toBe(KeyframeInterpolationType.BEZIER);
    expect(p.keyInTemporalEase(1)[0].influence).toBeCloseTo(80, 4);
  });

  it('skips (and reports) a key held on BOTH sides', () => {
    const p = new Property({ valueType: PropertyValueType.OneD, values: [0, 100], times: [0, 1], selected: [1] });
    p._inT[0] = KeyframeInterpolationType.HOLD;
    p._outT[0] = KeyframeInterpolationType.HOLD;
    select(p);
    const res = commands['copyease.paste']({ ease: EASE, mode: 'both' });
    expect(res.keys).toBe(0);
    expect(res.skippedHold).toBe(1);
    expect(p.keyInInterpolationType(1)).toBe(KeyframeInterpolationType.HOLD);
    expect(p.keyOutInterpolationType(1)).toBe(KeyframeInterpolationType.HOLD);
  });
});

describe('velocity.apply temporal dims + side gates', () => {
  it('writes ONE ease per side on a COLOR key (was 4 → AE throw)', () => {
    const p = colorProp({ selected: [1] });
    select(p);
    const res = commands['velocity.apply']({ setInfluence: true, inInfluence: 50, outInfluence: 50 });
    expect(res.keys).toBe(1);
    expect(p.keyInTemporalEase(1)).toHaveLength(1);
    expect(p.keyOutTemporalEase(1)).toHaveLength(1);
  });

  it('editing only the in side leaves a HOLD out side alone', () => {
    const p = new Property({ valueType: PropertyValueType.OneD, values: [0, 100], times: [0, 1], selected: [1] });
    p._outT[0] = KeyframeInterpolationType.HOLD;
    select(p);
    commands['velocity.apply']({ setInfluence: true, inInfluence: 75, outInfluence: 75, applyIn: true, applyOut: false });
    expect(p.keyOutInterpolationType(1)).toBe(KeyframeInterpolationType.HOLD);
    expect(p.keyInInterpolationType(1)).toBe(KeyframeInterpolationType.BEZIER);
    expect(p.keyInTemporalEase(1)[0].influence).toBeCloseTo(75, 4);
  });
});

describe('smooth.apply temporal dims, side gates, roving honesty', () => {
  it('smooths a COLOR key with ONE ease (was 4 → AE throw, silently caught)', () => {
    const p = colorProp({ selected: [1] });
    select(p);
    const res = commands['smooth.apply']({ amount: 60 });
    expect(res.keys).toBe(1);
    expect(p.keyInTemporalEase(1)).toHaveLength(1);
  });

  it("sides:'in' leaves a HOLD out side alone", () => {
    const p = new Property({ valueType: PropertyValueType.OneD, values: [0, 100], times: [0, 1], selected: [1] });
    p._outT[0] = KeyframeInterpolationType.HOLD;
    const beforeOut = p.keyOutTemporalEase(1)[0];
    select(p);
    const res = commands['smooth.apply']({ amount: 60, sides: 'in' });
    expect(res.keys).toBe(1);
    expect(p.keyOutInterpolationType(1)).toBe(KeyframeInterpolationType.HOLD);
    expect(p.keyOutTemporalEase(1)[0]).toBe(beforeOut);
    expect(p.keyInInterpolationType(1)).toBe(KeyframeInterpolationType.BEZIER);
  });

  it('reports roving skipped on non-spatial props instead of a silent no-op', () => {
    const p = new Property({ valueType: PropertyValueType.OneD, values: [0, 50, 100], times: [0, 1, 2] });
    select(p);
    const res = commands['smooth.apply']({ amount: 60, roving: true });
    expect(res.keys).toBe(3); // eases were still written
    expect(res.rovingSkipped).toBe(1); // the interior key could not rove
    expect(Object.keys(p._roving)).toHaveLength(0);
  });

  it('roving still applies on spatial properties', () => {
    const p = new Property({
      valueType: PropertyValueType.TwoD_SPATIAL,
      values: [[0, 0], [50, 0], [100, 0]],
      times: [0, 1, 2]
    });
    select(p);
    const res = commands['smooth.apply']({ amount: 60, roving: true });
    expect(res.rovingSkipped).toBe(0);
    expect(p._roving[2]).toBe(true);
  });
});
