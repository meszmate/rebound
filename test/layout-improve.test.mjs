import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the layout improvement wave by running the REAL host code (util.jsx +
// commands) against a mock AE property tree, same pattern as host-layout-fixes:
//  - align relativeTo 'key': everything lines up with the LAST selected layer,
//    which itself stays put (per-layer and group modes);
//  - distribute mode 'gap' now works from TWO layers (auto still needs three);
//  - layout.read: the read-only selection minimap payload (comp frame + boxes);
//  - nullify: bounds-center placement, one-null-per-layer parenting, and
//    auto-incremented names so repeated applies never stack duplicates;
//  - precompose trim: the new comp is cut to the union layer span and the
//    nested layer re-timed so content plays exactly where it was.

const MATCH = {
  transform: 'ADBE Transform Group',
  anchor: 'ADBE Anchor Point',
  position: 'ADBE Position',
  positionX: 'ADBE Position_0',
  positionY: 'ADBE Position_1',
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
  index = 1,
  pos = [0, 0],
  anchor = [0, 0],
  scale = [100, 100],
  rot = 0,
  rect = { left: 0, top: 0, width: 100, height: 100 },
  parent = null
} = {}) {
  const channels = {
    [MATCH.anchor]: prop(anchor.slice()),
    [MATCH.position]: prop(pos.slice()),
    [MATCH.scale]: prop(scale.slice()),
    [MATCH.rotation]: prop(rot),
    [MATCH.opacity]: prop(100)
  };
  const tr = { property(n) { return channels[n] || null; } };
  return {
    name,
    index,
    parent,
    label: 0,
    property(n) { return n === MATCH.transform ? tr : null; },
    sourceRectAtTime() { return rect; },
    moveBefore() {},
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
  // layout.read reads app.project.activeItem directly (no undo group).
  globalThis.app = { project: { get activeItem() { return comp; } } };
  new Function('$', 'app', readFileSync(path.join(dir, '../host/commands/align.jsx'), 'utf8'))($, globalThis.app);
  for (const f of ['nullify.jsx', 'precompose.jsx']) {
    new Function('$', readFileSync(path.join(dir, '../host/commands/', f), 'utf8'))($);
  }
});

beforeEach(() => {
  // A CompItem-shaped comp so util.isComp/layout.read accept it.
  comp = Object.assign(Object.create(globalThis.CompItem.prototype), {
    time: 0,
    width: 1000,
    height: 800,
    selectedLayers: []
  });
});

function close(arr, exp) {
  expect(arr.length).toBe(exp.length);
  arr.forEach((v, i) => expect(v).toBeCloseTo(exp[i], 6));
}

describe('align.layers relativeTo "key" (line up with the last selected layer)', () => {
  it('per-layer: movables meet the key edge, the key layer stays put', () => {
    const a = makeLayer({ name: 'A', index: 1, pos: [100, 100], rect: { left: 0, top: 0, width: 50, height: 30 } });
    const b = makeLayer({ name: 'B', index: 2, pos: [300, 50], rect: { left: 0, top: 0, width: 80, height: 40 } });
    const key = makeLayer({ name: 'Key', index: 3, pos: [500, 200], rect: { left: 0, top: 0, width: 60, height: 60 } });
    comp.selectedLayers = [a, b, key];
    const res = commands['align.layers']({ gx: 0, axes: 'x', relativeTo: 'key', mode: 'each' });
    expect(res.moved).toBe(2);
    expect(a._ch[MATCH.position].value[0]).toBeCloseTo(500, 6); // left edge -> key left
    expect(b._ch[MATCH.position].value[0]).toBeCloseTo(500, 6);
    close(key._ch[MATCH.position].value, [500, 200]);           // key untouched
    expect(a._ch[MATCH.position].value[1]).toBeCloseTo(100, 6); // y untouched (x-only)
  });

  it('group mode: the union of the MOVABLE layers centres on the key, spacing kept', () => {
    const a = makeLayer({ name: 'A', index: 1, pos: [100, 100], rect: { left: 0, top: 0, width: 50, height: 30 } });
    const b = makeLayer({ name: 'B', index: 2, pos: [300, 50], rect: { left: 0, top: 0, width: 80, height: 40 } });
    const key = makeLayer({ name: 'Key', index: 3, pos: [500, 200], rect: { left: 0, top: 0, width: 60, height: 60 } });
    comp.selectedLayers = [a, b, key];
    const res = commands['align.layers']({ gx: 0.5, axes: 'x', relativeTo: 'key', mode: 'group' });
    expect(res.moved).toBe(2);
    // Movable union 100..380 (centre 240), key 500..560 (centre 530): dx 290.
    expect(a._ch[MATCH.position].value[0]).toBeCloseTo(390, 6);
    expect(b._ch[MATCH.position].value[0]).toBeCloseTo(590, 6);
    close(key._ch[MATCH.position].value, [500, 200]);
  });

  it('a lone layer with "key" falls back to the comp frame', () => {
    const a = makeLayer({ name: 'A', pos: [100, 100], rect: { left: 0, top: 0, width: 50, height: 30 } });
    comp.selectedLayers = [a];
    const res = commands['align.layers']({ gx: 0.5, axes: 'x', relativeTo: 'key', mode: 'each' });
    expect(res.moved).toBe(1);
    expect(a._ch[MATCH.position].value[0]).toBeCloseTo(475, 6); // box centre -> 500
  });
});

describe('align.distribute mode "gap" from two layers', () => {
  it('two layers: the second snaps to first + gap', () => {
    const a = makeLayer({ name: 'A', pos: [0, 0], rect: { left: 0, top: 0, width: 100, height: 20 } });
    const b = makeLayer({ name: 'B', pos: [300, 0], rect: { left: 0, top: 0, width: 50, height: 20 } });
    comp.selectedLayers = [a, b];
    const res = commands['align.distribute']({ axis: 'x', mode: 'gap', gap: 20 });
    expect(res.moved).toBe(2);
    expect(res.gap).toBe(20);
    expect(a._ch[MATCH.position].value[0]).toBeCloseTo(0, 6);
    expect(b._ch[MATCH.position].value[0]).toBeCloseTo(120, 6); // 0 + 100 + 20
  });

  it('auto mode still requires three layers', () => {
    const a = makeLayer({ name: 'A', pos: [0, 0] });
    const b = makeLayer({ name: 'B', pos: [300, 0] });
    comp.selectedLayers = [a, b];
    expect(() => commands['align.distribute']({ axis: 'x', mode: 'auto' }))
      .toThrow(/three or more/);
  });

  it('gap mode with a single layer still refuses', () => {
    comp.selectedLayers = [makeLayer({ name: 'A' })];
    expect(() => commands['align.distribute']({ axis: 'x', mode: 'gap', gap: 10 }))
      .toThrow(/two or more/);
  });
});

describe('layout.read (selection minimap payload)', () => {
  it('returns the comp frame and each selected layer box as plain numbers', () => {
    const a = makeLayer({ name: 'A', index: 1, pos: [100, 100], rect: { left: 0, top: 0, width: 50, height: 30 } });
    const b = makeLayer({ name: 'B', index: 2, pos: [300, 50], rect: { left: 0, top: 0, width: 80, height: 40 } });
    comp.selectedLayers = [a, b];
    const res = commands['layout.read']();
    expect(res.found).toBe(true);
    expect(res.width).toBe(1000);
    expect(res.height).toBe(800);
    expect(res.boxes).toEqual([
      { name: 'A', index: 1, x: 100, y: 100, w: 50, h: 30 },
      { name: 'B', index: 2, x: 300, y: 50, w: 80, h: 40 }
    ]);
  });

  it('reports found:false with no usable selection', () => {
    comp.selectedLayers = [];
    expect(commands['layout.read']().found).toBe(false);
  });

  it('reports found:false when the active item is not a comp', () => {
    comp = null;
    expect(commands['layout.read']().found).toBe(false);
  });
});

describe('nullify.apply (bounds centre, per-layer nulls, name auto-increment)', () => {
  let compLayers;

  function wireNullComp() {
    compLayers = [];
    comp.selectedLayers = [];
    Object.defineProperty(comp, 'numLayers', { get: () => compLayers.length, configurable: true });
    comp.layer = (i) => compLayers[i - 1];
    comp.layers = {
      addNull() {
        const nl = makeLayer({ name: 'Null 1', index: 0, rect: { left: 0, top: 0, width: 100, height: 100 } });
        compLayers.unshift(nl);
        return nl;
      }
    };
  }

  function addSelected(opts) {
    const L = makeLayer(opts);
    compLayers.push(L);
    comp.selectedLayers.push(L);
    return L;
  }

  beforeEach(wireNullComp);

  it('bounds centre: the null lands at the visual middle, not the anchor average', () => {
    // Anchors sit at (0,0) and (200,150) -> average (100,75); the union of the
    // boxes is 0..300 x 0..200 -> visual centre (150,100).
    addSelected({ name: 'A', index: 1, pos: [0, 0], rect: { left: 0, top: 0, width: 100, height: 50 } });
    addSelected({ name: 'B', index: 2, pos: [200, 150], rect: { left: 0, top: 0, width: 100, height: 50 } });
    const res = commands['nullify.apply']({ position: 'bounds', parent: false });
    expect(res).toEqual({ created: 1, parented: 0 });
    const nl = compLayers[0];
    expect(nl.name).toBe('Control');
    close(nl._ch[MATCH.position].value, [150, 100]);
    close(nl._ch[MATCH.anchor].value, [50, 50]); // centred on its own square
  });

  it('mode "each": one null per layer, at its position, named after it, parented', () => {
    const a = addSelected({ name: 'A', index: 1, pos: [100, 100] });
    const b = addSelected({ name: 'B', index: 2, pos: [300, 200] });
    a.label = 9;
    const res = commands['nullify.apply']({ mode: 'each', parent: true });
    expect(res).toEqual({ created: 2, parented: 2 });
    expect(a.parent).toBeTruthy();
    expect(b.parent).toBeTruthy();
    expect(a.parent).not.toBe(b.parent);
    expect(a.parent.name).toBe('A Ctrl');
    expect(b.parent.name).toBe('B Ctrl');
    expect(a.parent.label).toBe(9); // label colour matched
    close(a.parent._ch[MATCH.position].value, [100, 100]);
    close(b.parent._ch[MATCH.position].value, [300, 200]);
  });

  it('names auto-increment instead of stacking duplicates', () => {
    addSelected({ name: 'Control', index: 1, pos: [10, 10] }); // an old null in the comp
    const res1 = commands['nullify.apply']({ position: 'center', parent: false });
    expect(res1.created).toBe(1);
    expect(compLayers[0].name).toBe('Control 2');
    const res2 = commands['nullify.apply']({ position: 'center', parent: false, name: 'Rig' });
    expect(res2.created).toBe(1);
    expect(compLayers[0].name).toBe('Rig'); // custom base unused so far
  });
});

describe('precompose.apply trim (cut the new comp to the union layer span)', () => {
  let inner;
  let newComp;
  let nested;
  let precomposeCalls;

  beforeEach(() => {
    inner = [
      { name: 'A', inPoint: 2, outPoint: 5, startTime: 1 },
      { name: 'B', inPoint: 3, outPoint: 7, startTime: 3 }
    ];
    newComp = {
      name: 'Precomp',
      frameDuration: 1 / 30,
      frameRate: 30,
      duration: 60,
      get numLayers() { return inner.length; },
      layer(i) { return inner[i - 1]; }
    };
    nested = { name: 'Precomp', startTime: 0, inPoint: 0, outPoint: 60, get source() { return newComp; } };
    precomposeCalls = [];
    comp.selectedLayers = [{ index: 1 }, { index: 2 }];
    comp.numLayers = 1;
    comp.layer = () => nested;
    comp.layers = {
      precompose(indices, name, moveAttributes) {
        precomposeCalls.push({ indices, name, moveAttributes });
        return newComp;
      }
    };
  });

  it('shifts the inner layers to 0, sizes the comp, and re-times the nested layer', () => {
    const res = commands['precompose.apply']({ name: 'Hero Precomp', moveAttributes: true, trim: true });
    expect(res).toEqual({ created: 1, name: 'Precomp', trimmed: true });
    expect(precomposeCalls).toEqual([{ indices: [1, 2], name: 'Hero Precomp', moveAttributes: true }]);
    // Union span 2..7: every inner startTime shifts by -2, duration becomes 5.
    expect(inner[0].startTime).toBeCloseTo(-1, 6);
    expect(inner[1].startTime).toBeCloseTo(1, 6);
    expect(newComp.duration).toBeCloseTo(5, 6);
    // The nested layer plays the content exactly where it was.
    expect(nested.startTime).toBeCloseTo(2, 6);
    expect(nested.inPoint).toBeCloseTo(2, 6);
    expect(nested.outPoint).toBeCloseTo(7, 6);
  });

  it('trim off leaves every time untouched and reports trimmed:false', () => {
    const res = commands['precompose.apply']({ name: 'X', moveAttributes: true, trim: false });
    expect(res.trimmed).toBe(false);
    expect(inner[0].startTime).toBe(1);
    expect(newComp.duration).toBe(60);
    expect(nested.startTime).toBe(0);
  });

  it('a sub-frame span is clamped to one frame', () => {
    inner = [{ name: 'A', inPoint: 2, outPoint: 2.01, startTime: 2 }];
    const res = commands['precompose.apply']({ name: 'X', moveAttributes: true, trim: true });
    expect(res.trimmed).toBe(true);
    expect(newComp.duration).toBeCloseTo(1 / 30, 6);
  });
});
