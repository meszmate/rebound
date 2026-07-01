import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import normalize from '../shared/lib/normalize.js';

// Regression lock for the "red borders" fix: the real host applyStroke must draw a
// SOLID stroke as a shape stroke whose COLOUR is set deterministically — for both
// CENTER and INSIDE/OUTSIDE alignment (Figma's default is INSIDE). Previously an
// inside/outside solid stroke was skipped here and reproduced as a Stroke LAYER
// STYLE, which left AE's default RED border when its scripted colour set failed.
// We load the actual host/commands/import/paint.jsx in Node against a recording
// mock of the AE shape-property tree and assert the stroke colour lands.

function makeProp() {
  const kids = {};
  const added = [];
  const self = {
    _value: undefined, _kids: kids, _added: added, _name: null,
    property(name) { return kids[name] || (kids[name] = makeProp()); },
    addProperty(name) { const c = makeProp(); c._name = name; added.push(c); return c; },
    setValue(v) { self._value = v; return v; },
    get value() { return self._value; },
    remove() {}
  };
  return self;
}
// Find the first stroke operator anywhere in the (possibly nested, e.g. inside an
// Offset Paths group) contents tree.
function findByName(node, name, seen) {
  if (!node || (seen = seen || new Set()).has(node)) return null;
  seen.add(node);
  const lists = [node._added || [], Object.keys(node._kids || {}).map((k) => node._kids[k])];
  for (const list of lists) {
    for (const c of list) {
      if (c && c._name === name) return c;
      const deep = findByName(c, name, seen);
      if (deep) return deep;
    }
  }
  return null;
}
function strokeColorOf(contents) {
  const stroke = findByName(contents, 'ADBE Vector Graphic - Stroke');
  if (!stroke) return null;
  return stroke.property('ADBE Vector Stroke Color').value;
}

let applyStroke;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, '../host/commands/import/paint.jsx'), 'utf8');
  const $ = { __rebound: {} };
  $.__rebound.ir = { N: normalize };
  // offsetStrokeGroup (INSIDE/OUTSIDE) copies geometry via R.importer.addGeometry;
  // stub it to report success so the offset group is built.
  $.__rebound.importer = { addGeometry: function () { return 1; }, util: { note: function () {} } };
  $.__rebound.grad = { applyGradient: function () {}, applyGradientColors: function () { return true; } };
  new Function('$', src)($);
  applyStroke = $.__rebound.importer.paint.applyStroke;
});

function solidStrokeNode(align) {
  return {
    name: 'Card',
    stroke: {
      weight: 1,
      align: align,
      cap: 'NONE',
      join: 'MITER',
      paints: [{ type: 'SOLID', visible: true, opacity: 1, color: { r: 0.231, g: 0.235, b: 0.251, a: 1 } }]
    }
  };
}

describe('host paint.applyStroke — solid borders are coloured shape strokes (no red default)', () => {
  it('a CENTER solid stroke sets the stroke colour on the shared contents', () => {
    const contents = makeProp();
    applyStroke(contents, solidStrokeNode('CENTER'), {});
    const col = strokeColorOf(contents);
    expect(col).not.toBeNull();
    expect(col[0]).toBeCloseTo(0.231, 3);
    expect(col[1]).toBeCloseTo(0.235, 3);
    expect(col[2]).toBeCloseTo(0.251, 3);
  });

  it('an INSIDE solid stroke is still drawn as a coloured shape stroke (via Offset Paths), NOT skipped', () => {
    const contents = makeProp();
    applyStroke(contents, solidStrokeNode('INSIDE'), {});
    const col = strokeColorOf(contents);
    // The whole point of the fix: an inside border is a real coloured stroke, not a
    // layer-style stroke left at AE's default red.
    expect(col).not.toBeNull();
    expect(col[0]).toBeCloseTo(0.231, 3);
    expect(col[2]).toBeCloseTo(0.251, 3);
  });

  it('an OUTSIDE solid stroke is coloured too', () => {
    const contents = makeProp();
    applyStroke(contents, solidStrokeNode('OUTSIDE'), {});
    expect(strokeColorOf(contents)).not.toBeNull();
  });

  it('no stroke operator is added when there is no visible paint (nothing to colour red)', () => {
    const contents = makeProp();
    applyStroke(contents, { name: 'x', stroke: { weight: 1, align: 'INSIDE', paints: [{ type: 'SOLID', visible: false }] } }, {});
    expect(strokeColorOf(contents)).toBeNull();
  });
});
