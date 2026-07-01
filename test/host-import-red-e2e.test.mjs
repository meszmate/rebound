import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import normalize from '../shared/lib/normalize.js';

// END-TO-END red-border proof, entirely in CI.
//
// host-stroke.test locks the WRITER (paint.jsx colours every stroke/fill) and
// host-verify.test locks the READER (verify.jsx detects red). Neither proves they
// COMPOSE. This does: it runs the REAL importer paint code to build a shape tree
// for a realistic card (Figma's default INSIDE border + a fill), then runs the
// REAL verifier over that exact tree, and asserts the verdict is clean. It is the
// closest thing to "demonstrated removal" achievable without the After Effects
// binary — both real code paths, chained, over one shared mock of AE's property
// model.

// A single mock AE property node that satisfies BOTH APIs at once:
//   - the writer's:  addProperty(name) / property(stringName).setValue(v) / .value
//   - the reader's:  numProperties / property(index) / matchName
// so the tree paint.jsx builds is the very tree verify.jsx walks.
function node() {
  const kids = {};
  const added = [];
  const self = {
    _value: undefined, matchName: undefined,
    get numProperties() { return added.length; },
    property(name) {
      if (typeof name === 'number') return added[name - 1] || null; // reader: by index
      return kids[name] || (kids[name] = node());                   // writer: by name (lazy)
    },
    addProperty(name) { const c = node(); c.matchName = name; added.push(c); return c; },
    setValue(v) { self._value = v; return v; },
    get value() { return self._value; },
    remove() { const i = added.indexOf(self); if (i >= 0) added.splice(i, 1); }
  };
  return self;
}

let applyStroke, applyFills, verify;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const $ = { __rebound: { util: { note() {}, activeComp() { return null; } }, register() {} } };
  $.__rebound.ir = { N: normalize };
  $.__rebound.importer = { addGeometry() { return 1; }, util: { note() {} } };
  $.__rebound.grad = { applyGradient() {}, applyGradientColors() { return true; } };
  new Function('$', readFileSync(path.join(dir, '../host/commands/import/paint.jsx'), 'utf8'))($);
  new Function('$', readFileSync(path.join(dir, '../host/commands/import/verify.jsx'), 'utf8'))($);
  applyStroke = $.__rebound.importer.paint.applyStroke;
  applyFills = $.__rebound.importer.paint.applyFills;
  verify = $.__rebound.verify;
});

// Wrap a built contents group as a scannable AE layer + comp.
function layerWith(contents, { strokeStyle = null } = {}) {
  return {
    name: 'Card', source: null,
    property(n) {
      if (n === 'ADBE Root Vectors Group') return contents;
      if (n === 'ADBE Layer Styles') {
        if (strokeStyle === null) return { property() { return null; } };
        return { property(k) { return k === 'frameFX' ? { enabled: strokeStyle } : null; } };
      }
      return null;
    }
  };
}
function compWith(layer) { return { id: 1, name: 'Board', numLayers: 1, layer(i) { return i === 1 ? layer : null; } }; }

const GREY = { r: 0.231, g: 0.235, b: 0.251, a: 1 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };

describe('import → verify end-to-end: a real INSIDE-bordered card scans clean', () => {
  it('the real paint code builds a tree the real verifier certifies red-free', () => {
    const cardNode = {
      name: 'Card',
      stroke: { weight: 1, align: 'INSIDE', cap: 'NONE', join: 'MITER', paints: [{ type: 'SOLID', visible: true, opacity: 1, color: GREY }] },
      fills: [{ type: 'SOLID', visible: true, opacity: 1, color: WHITE }]
    };
    const contents = node();
    applyStroke(contents, cardNode, {}); // real host code — INSIDE stroke via Offset Paths
    applyFills(contents, cardNode, {});  // real host code — solid fill

    const v = verify.verdict(verify.scanComp(compWith(layerWith(contents))));
    expect(v.clean).toBe(true);
    expect(v.strokeLayerStyles).toHaveLength(0);
    expect(v.redPaints).toHaveLength(0);   // the border + fill are both explicitly coloured
    expect(v.shapeLayers).toBe(1);
  });

  it('CENTER-aligned border also composes to a clean scan', () => {
    const cardNode = {
      name: 'Card',
      stroke: { weight: 2, align: 'CENTER', paints: [{ type: 'SOLID', visible: true, opacity: 1, color: GREY }] },
      fills: [{ type: 'SOLID', visible: true, opacity: 1, color: WHITE }]
    };
    const contents = node();
    applyStroke(contents, cardNode, {});
    applyFills(contents, cardNode, {});
    const v = verify.verdict(verify.scanComp(compWith(layerWith(contents))));
    expect(v.clean).toBe(true);
    expect(v.redPaints).toHaveLength(0);
  });

  it('negative control: the same tree WITH a Stroke layer style fails the scan (guard works)', () => {
    // Proves the clean verdict above is meaningful — the verifier does fail when
    // AE's old default-red source (an enabled frameFX) is present.
    const contents = node();
    applyStroke(contents, { name: 'Card', stroke: { weight: 1, align: 'INSIDE', paints: [{ type: 'SOLID', visible: true, opacity: 1, color: GREY }] } }, {});
    const v = verify.verdict(verify.scanComp(compWith(layerWith(contents, { strokeStyle: true }))));
    expect(v.clean).toBe(false);
    expect(v.strokeLayerStyles).toHaveLength(1);
  });
});
