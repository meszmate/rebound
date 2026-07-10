import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the generator-tool audit fixes against the REAL host .jsx files, run
// with a recording $ mock (same pattern as host-anchor.test.mjs):
//  - backdrop: vector fill/stroke colours must be written as 3-component RGB
//    (a 4th component throws in AE, leaving default red/white), opacities as
//    percent, and the final stack must be pattern ABOVE the background solid.
//  - gradient: stop colours must go through $.__rebound.grad (the .ffx preset
//    trick; 'ADBE Vector Grad Colors' is NO_VALUE and setValue is ignored),
//    the added G-Fill must render above an existing solid Fill, failures must
//    surface with grad.reason(), and read() must say colorsUnreadable instead
//    of fabricating black->white.
//  - radial: the host must share the panel preview's angle convention
//    (0 deg = 12 o'clock) and face-centre rotation (angle - 180).

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadHost(file, $) {
  const src = readFileSync(path.join(dir, '..', file), 'utf8');
  // CameraLayer/LightLayer are AE globals referenced by radial.jsx.
  new Function('$', 'CameraLayer', 'LightLayer', src)($, class {}, class {});
}

// A generic recording property-group mock: addProperty() appends a child,
// property(name) lazily creates a leaf, property(i) is 1-based, and children
// support moveTo()/remove() within their parent collection.
function mockGroup(matchName) {
  const props = [];
  const g = {
    matchName,
    value: undefined,
    sets: [],
    get numProperties() { return props.length; },
    setValue(v) { g.value = v; g.sets.push(v); },
    addProperty(mn) {
      const child = mockGroup(mn);
      child.moveTo = (idx) => { props.splice(props.indexOf(child), 1); props.splice(idx - 1, 0, child); };
      child.remove = () => { props.splice(props.indexOf(child), 1); };
      props.push(child);
      return child;
    },
    property(key) {
      if (typeof key === 'number') return props[key - 1];
      let hit = props.find((p) => p.matchName === key);
      if (!hit) hit = g.addProperty(key);
      return hit;
    },
    _props: props
  };
  return g;
}

// Depth-first: every recorded setValue on properties with this matchName.
function allSets(group, matchName, out = []) {
  for (const p of group._props) {
    if (p.matchName === matchName) out.push(...p.sets);
    allSets(p, matchName, out);
  }
  return out;
}

const MATCH = {
  transform: 'ADBE Transform Group',
  anchor: 'ADBE Anchor Point',
  position: 'ADBE Position',
  positionX: 'ADBE Position_0',
  positionY: 'ADBE Position_1',
  rotation: 'ADBE Rotate Z'
};

// ---- Backdrop --------------------------------------------------------------

describe('backdrop.make (real host code, mock AE tree)', () => {
  let commands, comp, moveOrder;

  beforeEach(() => {
    commands = {};
    moveOrder = [];

    function makeLayer(kind) {
      const tree = mockGroup('layer');
      return {
        kind,
        name: '',
        comment: '',
        moveToEnd() { moveOrder.push(kind); },
        property(name) { return tree.property(name); },
        _tree: tree
      };
    }

    comp = {
      width: 400,
      height: 300,
      pixelAspect: 1,
      layers: {
        addSolid(color, name, w, h, pa) {
          const l = makeLayer('solid');
          l._solidColor = color;
          l._solidSize = [w, h, pa];
          return l;
        },
        addShape() { return makeLayer('shape'); }
      },
      _layers: []
    };

    const $ = {
      __rebound: {
        util: { MATCH, activeComp: () => comp },
        beginUndo() {},
        endUndo() {},
        register(name, fn) { commands[name] = fn; }
      }
    };
    loadHost('host/commands/backdrop.jsx', $);
  });

  it('fill colour is [r,g,b] (no alpha), opacity is 0-100', () => {
    let shapeLayer = null;
    const addShape = comp.layers.addShape;
    comp.layers.addShape = () => { shapeLayer = addShape(); return shapeLayer; };
    commands['backdrop.make']({ pattern: 'dots', color: '#ff8800', bg: '#112233', opacity: 60, size: 6, spacing: 60 });

    const colorSets = allSets(shapeLayer._tree, 'ADBE Vector Fill Color');
    expect(colorSets.length).toBeGreaterThan(0);
    for (const v of colorSets) {
      expect(v.length).toBe(3);
      expect(v[0]).toBeCloseTo(1, 6);
      expect(v[1]).toBeCloseTo(0x88 / 255, 6);
      expect(v[2]).toBeCloseTo(0, 6);
    }
    const opacitySets = allSets(shapeLayer._tree, 'ADBE Vector Fill Opacity');
    expect(opacitySets.length).toBeGreaterThan(0);
    for (const v of opacitySets) expect(v).toBeCloseTo(60, 6);
  });

  it('stroke colour is [r,g,b] (no alpha) for stroked patterns', () => {
    let shapeLayer = null;
    const addShape = comp.layers.addShape;
    comp.layers.addShape = () => { shapeLayer = addShape(); return shapeLayer; };
    commands['backdrop.make']({ pattern: 'rings', color: '#00ff00', bg: '#112233', opacity: 80, size: 6, spacing: 60 });

    const strokeSets = allSets(shapeLayer._tree, 'ADBE Vector Stroke Color');
    expect(strokeSets.length).toBeGreaterThan(0);
    for (const v of strokeSets) expect(v.length).toBe(3);
    const opacitySets = allSets(shapeLayer._tree, 'ADBE Vector Stroke Opacity');
    for (const v of opacitySets) expect(v).toBeCloseTo(80, 6);
  });

  it('make background: pattern ends up ABOVE the solid (solid sent to bottom last)', () => {
    commands['backdrop.make']({ pattern: 'dots', color: '#ff8800', bg: '#112233', opacity: 60, size: 6, spacing: 60, transparent: false });
    // moveToEnd order decides the stack: the LAST layer sent to the end sits at
    // the very bottom. Pattern first, then solid => pattern above solid.
    expect(moveOrder).toEqual(['shape', 'solid']);
  });

  it('transparent backdrop adds no solid at all', () => {
    commands['backdrop.make']({ pattern: 'dots', color: '#ff8800', opacity: 60, size: 6, spacing: 60, transparent: true });
    expect(moveOrder).toEqual(['shape']);
  });
});

// ---- Gradient ----------------------------------------------------------------

describe('gradient.apply / gradient.read (real host code, grad stub)', () => {
  const ROOT = 'ADBE Root Vectors Group';
  const VGROUP = 'ADBE Vector Group';
  const GROUP_CONTENTS = 'ADBE Vectors Group';
  const GFILL = 'ADBE Vector Graphic - G-Fill';
  const FILL = 'ADBE Vector Graphic - Fill';

  let commands, comp, gradCalls, gradColorsOk;

  beforeEach(() => {
    commands = {};
    comp = { selectedLayers: [] };
    gradCalls = { applyGradient: [], applyGradientColors: [] };
    gradColorsOk = true;

    const $ = {
      __rebound: {
        util: { MATCH, activeComp: () => comp },
        beginUndo() {},
        endUndo() {},
        register(name, fn) { commands[name] = fn; },
        grad: {
          applyGradient(op, opts) { gradCalls.applyGradient.push({ op, opts }); },
          applyGradientColors(op, stops) { gradCalls.applyGradientColors.push({ op, stops }); return gradColorsOk; },
          reason() { return 'cannot write temp preset'; }
        }
      }
    };
    loadHost('host/commands/gradient.jsx', $);
  });

  // A shape layer: root > Vector Group wrapper > Vectors Group contents.
  function shapeLayer({ withFill = false } = {}) {
    const root = mockGroup(ROOT);
    const wrapper = root.addProperty(VGROUP);
    const contents = wrapper.addProperty(GROUP_CONTENTS);
    if (withFill) contents.addProperty(FILL);
    return {
      name: 'Shape Layer 1',
      property(name) { return name === ROOT ? root : null; },
      _root: root,
      _contents: contents
    };
  }

  const ARGS = {
    type: 'linear',
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
    stops: [{ pos: 0, color: [1, 0, 0] }, { pos: 1, color: [0, 0, 1] }]
  };

  it('routes stop colours through grad.applyGradientColors, never a raw setValue', () => {
    const L = shapeLayer();
    comp.selectedLayers = [L];
    const res = commands['gradient.apply'](ARGS);

    expect(res.applied).toBe(1);
    expect(res.colorsApplied).toBe(true);
    expect(gradCalls.applyGradientColors.length).toBe(1);
    const call = gradCalls.applyGradientColors[0];
    expect(call.op.matchName).toBe(GFILL);
    expect(call.stops).toEqual([{ pos: 0, color: [1, 0, 0] }, { pos: 1, color: [0, 0, 1] }]);
    // 'ADBE Vector Grad Colors' must not be written directly (NO_VALUE in AE).
    expect(allSets(L._root, 'ADBE Vector Grad Colors')).toEqual([]);
    // Geometry goes through grad.applyGradient with mapped endpoints.
    expect(gradCalls.applyGradient.length).toBe(1);
    expect(gradCalls.applyGradient[0].opts).toEqual({ type: 1, start: [-100, 0], end: [100, 0] });
  });

  it('moves the G-Fill above an existing solid Fill (appended operators render behind)', () => {
    const L = shapeLayer({ withFill: true });
    comp.selectedLayers = [L];
    commands['gradient.apply'](ARGS);

    expect(L._contents.numProperties).toBe(2);
    expect(L._contents.property(1).matchName).toBe(GFILL); // on top
    expect(L._contents.property(2).matchName).toBe(FILL);  // solid kept
  });

  it('replaceFill removes the existing solid Fill only when explicitly asked', () => {
    const L = shapeLayer({ withFill: true });
    comp.selectedLayers = [L];
    commands['gradient.apply'](Object.assign({}, ARGS, { replaceFill: true }));

    expect(L._contents.numProperties).toBe(1);
    expect(L._contents.property(1).matchName).toBe(GFILL);
  });

  it('surfaces grad.reason() when the preset colour path fails', () => {
    gradColorsOk = false;
    comp.selectedLayers = [shapeLayer()];
    const res = commands['gradient.apply'](ARGS);

    expect(res.applied).toBe(1);
    expect(res.colorsApplied).toBe(false);
    expect(res.reason).toBe('cannot write temp preset');
  });

  it('read() reports colorsUnreadable with stops:null instead of fabricating black->white', () => {
    const root = mockGroup(ROOT);
    const gfill = root.addProperty(GFILL);
    gfill.property('ADBE Vector Grad Type').value = 2;
    gfill.property('ADBE Vector Grad Start Pt').value = [-100, 0];
    gfill.property('ADBE Vector Grad End Pt').value = [100, 0];
    // 'ADBE Vector Grad Colors' reads back nothing (NO_VALUE), like real AE.
    comp.selectedLayers = [{ name: 'G', property: (n) => (n === ROOT ? root : null) }];

    const res = commands['gradient.read']();
    expect(res.found).toBe(true);
    expect(res.colorsUnreadable).toBe(true);
    expect(res.stops).toBeNull();
    expect(res.type).toBe('radial'); // geometry/type still reported
    expect(res.start).toEqual({ x: 0, y: 0.5 });
    expect(res.end).toEqual({ x: 1, y: 0.5 });
  });
});

// ---- Radial ------------------------------------------------------------------

describe('radial.apply angle convention (real host code, mock layers)', () => {
  let commands, comp;

  function prop(value) {
    return {
      value,
      numKeys: 0,
      expressionEnabled: false,
      expression: '',
      dimensionsSeparated: false,
      setValue(v) { this.value = v; }
    };
  }

  let dups;
  function layer(pos, rot = 0) {
    const channels = {
      [MATCH.position]: prop(Array.isArray(pos) ? pos.slice() : pos),
      [MATCH.rotation]: prop(rot)
    };
    const tr = { property: (n) => channels[n] || null };
    return {
      property: (n) => (n === MATCH.transform ? tr : null),
      duplicate() { const d = layer(channels[MATCH.position].value, channels[MATCH.rotation].value); dups.push(d); return d; },
      _ch: channels
    };
  }

  beforeEach(() => {
    commands = {};
    dups = [];
    comp = { selectedLayers: [] };
    const $ = {
      __rebound: {
        util: { MATCH, activeComp: () => comp },
        beginUndo() {},
        endUndo() {},
        register(name, fn) { commands[name] = fn; }
      }
    };
    loadHost('host/commands/radial.jsx', $);
  });

  function posOf(d) { return d._ch[MATCH.position].value; }
  function rotOf(d) { return d._ch[MATCH.rotation].value; }

  it('places the first copy at 12 o clock for startAngle 0 (matches the panel preview)', () => {
    comp.selectedLayers = [layer([500, 400])];
    const res = commands['radial.apply']({ count: 4, radius: 100, startAngle: 0, arc: 360, orient: false });
    expect(res.created).toBe(4);

    const expected = [
      [500, 300], // angle 0   -> top
      [600, 400], // angle 90  -> right
      [500, 500], // angle 180 -> bottom
      [400, 400]  // angle 270 -> left
    ];
    dups.forEach((d, i) => {
      expect(posOf(d)[0]).toBeCloseTo(expected[i][0], 6);
      expect(posOf(d)[1]).toBeCloseTo(expected[i][1], 6);
    });
  });

  it('mirrors the panel formula (startAngle + step*i - 90) for a partial arc', () => {
    comp.selectedLayers = [layer([0, 0])];
    commands['radial.apply']({ count: 3, radius: 100, startAngle: 30, arc: 180, orient: false });

    // Panel: a = (startAngle + step*i - 90) deg, step = arc/(count-1) = 90.
    [30, 120, 210].forEach((angle, i) => {
      const a = (angle - 90) * Math.PI / 180;
      expect(posOf(dups[i])[0]).toBeCloseTo(Math.cos(a) * 100, 6);
      expect(posOf(dups[i])[1]).toBeCloseTo(Math.sin(a) * 100, 6);
    });
  });

  it('orient rotates each copy by (angle - 180) so its "up" points at the centre', () => {
    comp.selectedLayers = [layer([500, 400])];
    commands['radial.apply']({ count: 4, radius: 100, startAngle: 0, arc: 360, orient: true });

    // AE rotation r maps the up vector (0,-1) to (sin r, -cos r); with
    // r = angle - 180 that is the inward radial for every copy.
    const expectedRot = [-180, -90, 0, 90];
    dups.forEach((d, i) => {
      expect(rotOf(d)).toBeCloseTo(expectedRot[i], 6);
      // Cross-check the invariant itself: up-after-rotation == unit vector from
      // the copy back to the centre.
      const r = rotOf(d) * Math.PI / 180;
      const up = [Math.sin(r), -Math.cos(r)];
      const toCentre = [500 - posOf(d)[0], 400 - posOf(d)[1]];
      const len = Math.hypot(toCentre[0], toCentre[1]);
      expect(up[0]).toBeCloseTo(toCentre[0] / len, 6);
      expect(up[1]).toBeCloseTo(toCentre[1] / len, 6);
    });
  });
});
