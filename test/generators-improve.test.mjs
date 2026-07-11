import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Runs the REAL host command files (color.jsx, rename.jsx) against a mock AE
// tree (the host-anchor.test.mjs pattern), locking the behaviours the panel
// depends on after the improvement wave:
//   - color.apply rgbs: a palette cycles across the selection in top-to-bottom
//     INDEX order, wrapping when there are more layers than colors.
//   - palette.collect: distinct fill/stroke/solid colors, deduped on hex,
//     capped at 10.
//   - rename.apply: only names that actually change are touched and counted.
//   - recolorSolid: a SolidSource shared by several layers is duplicated
//     before recoloring, so siblings keep their color.

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- mock AE ---------------------------------------------------------------

class SolidSource {
  constructor(color) { this.color = color; }
}
const PropertyValueType = { COLOR: 6418 };

let comp; // the "active comp", swapped per test

function loadHost(file) {
  const commands = {};
  const $ = {
    __rebound: {
      util: { activeComp: () => comp },
      rig: { findByName: () => null },
      register(name, fn) { commands[name] = fn; },
      beginUndo() {},
      endUndo() {}
    }
  };
  new Function('$', 'SolidSource', 'PropertyValueType',
    readFileSync(path.join(dir, file), 'utf8'))($, SolidSource, PropertyValueType);
  return commands;
}

const ROOT = 'ADBE Root Vectors Group';
const FILL = 'ADBE Vector Graphic - Fill';
const FILL_COLOR = 'ADBE Vector Fill Color';
const STROKE = 'ADBE Vector Graphic - Stroke';
const STROKE_COLOR = 'ADBE Vector Stroke Color';

function colorProp(v) {
  return { value: v, numKeys: 0, expressionEnabled: false, expression: '', setValue(nv) { this.value = nv; } };
}
// A Fill or Stroke operator carrying one color parameter.
function op(matchName, colorMatch, rgb) {
  const c = colorProp(rgb.slice());
  return { matchName, _c: c, property(m) { return m === colorMatch ? c : null; } };
}
const fillOp = (rgb) => op(FILL, FILL_COLOR, rgb);
const strokeOp = (rgb) => op(STROKE, STROKE_COLOR, rgb);

function container(children, matchName) {
  return { matchName, numProperties: children.length, property(i) { return children[i - 1]; } };
}
function shapeLayer(name, index, ops) {
  const root = container(ops, ROOT);
  return { name, index, _ops: ops, property(n) { return n === ROOT ? root : null; } };
}

function solidItem(color, name = 'Solid') {
  return { name, width: 200, height: 100, pixelAspect: 1, mainSource: new SolidSource(color.slice()), usedIn: [] };
}
function solidLayer(name, index, item) {
  return { name, index, source: item, property() { return null; }, replaceSource(dup) { this.source = dup; } };
}

function makeComp(layers, selected) {
  return {
    numLayers: layers.length,
    layer(i) { return layers[i - 1]; },
    selectedLayers: selected,
    layers: {
      addSolid(color, name, w, h, pa) {
        const item = { name, width: w, height: h, pixelAspect: pa, mainSource: new SolidSource(color.slice()), usedIn: [] };
        return { source: item, remove() {} };
      }
    }
  };
}

// ---- color.apply rgbs cycling ----------------------------------------------

describe('color.apply rgbs cycling (real host code, mock AE tree)', () => {
  let commands;
  beforeAll(() => { commands = loadHost('../host/commands/color.jsx'); });

  const RED = [1, 0, 0], GREEN = [0, 1, 0], BLUE = [0, 0, 1];

  it('cycles the palette in top-to-bottom index order, not click order', () => {
    const l1 = shapeLayer('Top', 1, [fillOp([0, 0, 0])]);
    const l2 = shapeLayer('Mid', 2, [fillOp([0, 0, 0])]);
    const l3 = shapeLayer('Bot', 3, [fillOp([0, 0, 0])]);
    // Selected bottom-first: index order must still win.
    comp = makeComp([l1, l2, l3], [l3, l1, l2]);
    const res = commands['color.apply']({ rgbs: [RED, GREEN, BLUE], target: 'fill' });
    expect(res.colored).toBe(3);
    expect(res.skipped).toEqual([]);
    expect(l1._ops[0]._c.value).toEqual(RED);
    expect(l2._ops[0]._c.value).toEqual(GREEN);
    expect(l3._ops[0]._c.value).toEqual(BLUE);
  });

  it('wraps when there are more layers than colors', () => {
    const layers = [1, 2, 3, 4].map((i) => shapeLayer('L' + i, i, [fillOp([0, 0, 0])]));
    comp = makeComp(layers, layers.slice());
    const res = commands['color.apply']({ rgbs: [RED, BLUE], target: 'fill' });
    expect(res.colored).toBe(4);
    expect(layers[0]._ops[0]._c.value).toEqual(RED);
    expect(layers[1]._ops[0]._c.value).toEqual(BLUE);
    expect(layers[2]._ops[0]._c.value).toEqual(RED);
    expect(layers[3]._ops[0]._c.value).toEqual(BLUE);
  });

  it('a single rgb (no rgbs) still colors every layer the same', () => {
    const l1 = shapeLayer('A', 1, [fillOp([0, 0, 0])]);
    const l2 = shapeLayer('B', 2, [fillOp([0, 0, 0])]);
    comp = makeComp([l1, l2], [l1, l2]);
    const res = commands['color.apply']({ rgb: GREEN, target: 'fill' });
    expect(res.colored).toBe(2);
    expect(l1._ops[0]._c.value).toEqual(GREEN);
    expect(l2._ops[0]._c.value).toEqual(GREEN);
  });
});

// ---- palette.collect dedupe --------------------------------------------------

describe('palette.collect (real host code, mock AE tree)', () => {
  let commands;
  beforeAll(() => { commands = loadHost('../host/commands/color.jsx'); });

  it('collects fill, stroke, and solid colors deduped on hex', () => {
    const shape = shapeLayer('Art', 1, [
      fillOp([1, 0, 0]),
      fillOp([1, 0, 0]),        // duplicate fill: deduped
      strokeOp([0, 0, 1])
    ]);
    const solid = solidLayer('BG', 2, solidItem([0, 1, 0]));
    comp = makeComp([shape, solid], [shape, solid]);
    const res = commands['palette.collect']({});
    expect(res.colors).toEqual(['#ff0000', '#0000ff', '#00ff00']);
  });

  it('dedupes on the ROUNDED hex, so near-identical floats collapse', () => {
    const shape = shapeLayer('Art', 1, [
      fillOp([0.5, 0, 0]),
      fillOp([0.5004, 0, 0]) // rounds to the same #80 channel
    ]);
    comp = makeComp([shape], [shape]);
    const res = commands['palette.collect']({});
    expect(res.colors).toEqual(['#800000']);
  });

  it('caps the palette at 10 colors', () => {
    const ops = [];
    for (let i = 0; i < 12; i++) ops.push(fillOp([i / 20, 0, 0]));
    const shape = shapeLayer('Rainbow', 1, ops);
    comp = makeComp([shape], [shape]);
    const res = commands['palette.collect']({});
    expect(res.colors.length).toBe(10);
  });

  it('falls back to every comp layer when nothing is selected', () => {
    const shape = shapeLayer('Art', 1, [fillOp([1, 0, 0])]);
    const solid = solidLayer('BG', 2, solidItem([0, 0, 1]));
    comp = makeComp([shape, solid], []);
    const res = commands['palette.collect']({});
    expect(res.colors).toEqual(['#ff0000', '#0000ff']);
  });
});

// ---- rename.apply changed-only counting --------------------------------------

describe('rename.apply changed-only counting (real host code, mock layers)', () => {
  let commands;
  beforeAll(() => { commands = loadHost('../host/commands/rename.jsx'); });

  function nameLayer(name, index) { return { name, index }; }

  it('counts and touches only the names that actually change', () => {
    const l1 = nameLayer('Fire', 1);
    const l2 = nameLayer('Water', 2);
    const l3 = nameLayer('Fireplace', 3);
    comp = makeComp([l1, l2, l3], [l1, l2, l3]);
    const res = commands['rename.apply']({ find: 'Fire', replace: 'Ice' });
    expect(res.renamed).toBe(2);
    expect(l1.name).toBe('Ice');
    expect(l2.name).toBe('Water');   // untouched
    expect(l3.name).toBe('Iceplace');
  });

  it('an already-matching numbering pattern renames zero layers', () => {
    const l1 = nameLayer('Layer 01', 1);
    const l2 = nameLayer('Layer 02', 2);
    comp = makeComp([l1, l2], [l1, l2]);
    const res = commands['rename.apply']({ base: 'Layer ', number: true, start: 1, padding: 2 });
    expect(res.renamed).toBe(0);
    expect(l1.name).toBe('Layer 01');
    expect(l2.name).toBe('Layer 02');
  });

  it('numbering runs in index order even when selected bottom-first', () => {
    const l1 = nameLayer('A', 1);
    const l2 = nameLayer('B', 2);
    comp = makeComp([l1, l2], [l2, l1]);
    const res = commands['rename.apply']({ base: 'X', number: true, start: 1, padding: 1 });
    expect(res.renamed).toBe(2);
    expect(l1.name).toBe('X1');
    expect(l2.name).toBe('X2');
  });
});

// ---- shared SolidSource duplication ------------------------------------------

describe('color.apply on solids: shared sources are duplicated (real host code)', () => {
  let commands;
  beforeAll(() => { commands = loadHost('../host/commands/color.jsx'); });

  it('recoloring one of two layers sharing a SolidSource leaves the sibling alone', () => {
    const item = solidItem([0, 0, 0], 'Shared');
    const l1 = solidLayer('One', 1, item);
    const l2 = solidLayer('Two', 2, item);
    comp = makeComp([l1, l2], [l1]);
    item.usedIn.push(comp);
    const res = commands['color.apply']({ rgb: [1, 0, 0], target: 'fill' });
    expect(res.colored).toBe(1);
    expect(l1.source).not.toBe(item);                    // fresh source swapped in
    expect(l1.source.mainSource.color).toEqual([1, 0, 0]);
    expect(l1.source.name).toBe('One');                  // named after the layer
    expect(l2.source).toBe(item);                        // sibling untouched
    expect(item.mainSource.color).toEqual([0, 0, 0]);
  });

  it('an unshared solid is recolored in place (no duplicate source)', () => {
    const item = solidItem([0, 0, 0], 'Solo');
    const l1 = solidLayer('Only', 1, item);
    comp = makeComp([l1], [l1]);
    item.usedIn.push(comp);
    const res = commands['color.apply']({ rgb: [0, 1, 0], target: 'fill' });
    expect(res.colored).toBe(1);
    expect(l1.source).toBe(item);
    expect(item.mainSource.color).toEqual([0, 1, 0]);
  });
});
