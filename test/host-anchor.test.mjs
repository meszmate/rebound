import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the anchor.move POSITION COMPENSATION against a mock AE property tree,
// running the REAL host/commands/anchor.jsx. The invariant under test is the
// one the user feels: moving the anchor must not move the layer, which means
// delta(Position) = R * S * delta(Anchor) in the layer's own transform. The 2D
// path (Z rotation only) is long-validated; these tests lock the 3D path —
// rotation X/Y and orientation used to be ignored entirely, so any rotated 3D
// layer visibly jumped (or, with an expression-driven anchor, shifted with no
// anchor change at all).

const MATCH = {
  transform: 'ADBE Transform Group',
  anchor: 'ADBE Anchor Point',
  position: 'ADBE Position',
  positionX: 'ADBE Position_0',
  positionY: 'ADBE Position_1',
  positionZ: 'ADBE Position_2',
  scale: 'ADBE Scale',
  rotation: 'ADBE Rotate Z',
  rotationX: 'ADBE Rotate X',
  rotationY: 'ADBE Rotate Y',
  orientation: 'ADBE Orientation'
};

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

// A minimal AE layer: transform channels + sourceRectAtTime. Rect is a 100x50
// box centred on the layer origin (the usual shape-layer geometry).
function makeLayer({ threeD = false, rot = {}, orient = [0, 0, 0], anchorZ = 0 } = {}) {
  const channels = {
    [MATCH.anchor]: prop(threeD ? [0, 0, anchorZ] : [0, 0]),
    [MATCH.position]: prop(threeD ? [640, 360, 0] : [640, 360]),
    [MATCH.scale]: prop(threeD ? [100, 100, 100] : [100, 100]),
    [MATCH.rotation]: prop(rot.z || 0),
    [MATCH.rotationX]: prop(rot.x || 0),
    [MATCH.rotationY]: prop(rot.y || 0),
    [MATCH.orientation]: prop(orient)
  };
  const tr = { property(name) { return channels[name] || null; } };
  return {
    name: 'Shape Layer 1',
    threeDLayer: threeD,
    property(name) { return name === MATCH.transform ? tr : null; },
    sourceRectAtTime() { return { left: -50, top: -25, width: 100, height: 50 }; },
    _ch: channels
  };
}

let commands;
let comp;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  commands = {};
  comp = { time: 0, selectedLayers: [], width: 1280, height: 720 };
  const $ = {
    __rebound: {
      util: { MATCH, activeComp() { return comp; } },
      beginUndo() {},
      endUndo() {},
      register(name, fn) { commands[name] = fn; }
    }
  };
  new Function('$', readFileSync(path.join(dir, '../host/commands/anchor.jsx'), 'utf8'))($);
});

function move(layer, gx, gy) {
  comp.selectedLayers = [layer];
  return commands['anchor.move']({ gx, gy });
}

function close(arr, exp) {
  expect(arr.length).toBe(exp.length);
  arr.forEach((v, i) => expect(v).toBeCloseTo(exp[i], 6));
}

describe('anchor.move position compensation (real host code, mock AE tree)', () => {
  it('plain 3D layer: bottom-center moves anchor and compensates position 1:1', () => {
    const L = makeLayer({ threeD: true });
    const res = move(L, 0.5, 1);
    expect(res.moved).toBe(1);
    expect(res.skipped).toEqual([]);
    close(L._ch[MATCH.anchor].value, [0, 25, 0]);      // rect bottom-center
    close(L._ch[MATCH.position].value, [640, 385, 0]); // shifted by the same 25px
  });

  it('3D layer rotated 90 in X: the anchor delta compensates in Z, not Y', () => {
    const L = makeLayer({ threeD: true, rot: { x: 90 } });
    const res = move(L, 0.5, 1);
    expect(res.moved).toBe(1);
    close(L._ch[MATCH.anchor].value, [0, 25, 0]);
    // The layer plane is tipped 90: a +25 anchor move along layer-Y lands along
    // parent-Z. The old Z-only compensation moved Position in Y and the layer
    // visibly jumped.
    close(L._ch[MATCH.position].value, [640, 360, 25]);
  });

  it('3D layer oriented 90 in Y: a layer-X anchor delta compensates in -Z', () => {
    const L = makeLayer({ threeD: true, orient: [0, 90, 0] });
    const res = move(L, 1, 0.5);
    expect(res.moved).toBe(1);
    close(L._ch[MATCH.anchor].value, [50, 0, 0]);
    close(L._ch[MATCH.position].value, [640, 360, -50]);
  });

  it('3D anchor keeps its existing Z', () => {
    const L = makeLayer({ threeD: true, anchorZ: 12 });
    move(L, 0, 0);
    close(L._ch[MATCH.anchor].value, [-50, -25, 12]);
  });

  it('2D layer rotated 90 in Z keeps the long-standing behaviour', () => {
    const L = makeLayer({ rot: { z: 90 } });
    const res = move(L, 0.5, 1);
    expect(res.moved).toBe(1);
    close(L._ch[MATCH.anchor].value, [0, 25]);
    // rotZ(90) maps (0, 25) to (-25, 0).
    close(L._ch[MATCH.position].value, [615, 360]);
  });

  it('an expression-driven anchor is skipped with a reason, nothing shifts', () => {
    const L = makeLayer({ threeD: true });
    L._ch[MATCH.anchor].expressionEnabled = true;
    L._ch[MATCH.anchor].expression = 'wiggle(1, 5)';
    const res = move(L, 0.5, 1);
    expect(res.moved).toBe(0);
    expect(res.skipped).toEqual(['Shape Layer 1 (anchor expression)']);
    close(L._ch[MATCH.anchor].value, [0, 0, 0]);
    close(L._ch[MATCH.position].value, [640, 360, 0]);
  });
});
