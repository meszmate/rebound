import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the boolean/merged-shape CHILD PLACEMENT in the real host shape.jsx:
// a child's IR offset is a FRAME-space delta, but the layer already carries the
// node's rotation via its own transform — so the delta must be mapped through
// the inverse of the node's linear matrix (it used to be applied raw, rotating
// it twice), and a child rotated RELATIVE to the node must keep that rotation
// via its vector group's transform (it used to be dropped: rotated boolean
// operands rendered axis-aligned).

// Recording mock of AE's shape property tree.
function prop(name) {
  const kids = {};
  const added = [];
  return {
    _name: name,
    _added: added,
    _value: undefined,
    property(n) { return kids[n] || (kids[n] = prop(n)); },
    addProperty(n) { const c = prop(n); added.push(c); return c; },
    setValue(v) { this._value = v; },
    get value() { return this._value; },
    remove() { const i = added.indexOf(this); if (i >= 0) added.splice(i, 1); }
  };
}
function mockComp() {
  return {
    layers: {
      addShape() {
        const root = prop('root');
        return { name: '', property(n) { return root.property(n); }, remove() {}, _root: root };
      }
    }
  };
}

let builders, buildMergedShape;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const $ = {
    __rebound: {
      importer: {
        util: { note() {} },
        paint: { applyStroke() {}, applyFills() {}, gradientEffect() {} },
        transform: { apply() {} },
        effect: { apply() {} },
        layerStyle: { collect() {} },
        builders: {}
      }
    }
  };
  const src = readFileSync(path.join(dir, '../host/commands/import/shape.jsx'), 'utf8');
  // addSubpath does `new Shape()`; give the sandbox a plain-object Shape.
  new Function('$', 'Shape', src)($, function Shape() {});
  builders = $.__rebound.importer.builders;
  buildMergedShape = $.__rebound.importer.buildMergedShape;
});

function vec(id, x, y, matrix) {
  return {
    id, name: 'piece', type: 'VECTOR', visible: true,
    transform: { x, y, width: 10, height: 10, matrix: matrix || [1, 0, 0, 1, x, y] },
    paths: [{ vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true }],
    fills: []
  };
}

// Walk a built layer's root group for added vector groups / shapes. The real
// code creates its top group via addProperty, so it lives in _added.
function contentsOf(layer) {
  const root = layer.property('ADBE Root Vectors Group');
  const grp = root._added.find(p => p._name === 'ADBE Vector Group');
  return grp.property('ADBE Vectors Group');
}

describe('boolean/merged child placement (real shape.jsx, mock AE tree)', () => {
  it('maps a frame-space child delta through the inverse of a rotated node matrix', () => {
    // Node rotated 90 deg: matrix columns (0,1) and (-1,0). A child that sits at
    // frame-space delta R(90)*(20,0) = (0,20) must land at LOCAL (20,0) — the
    // raw delta (0,20) would be rotated a second time by the layer transform.
    const bx = 100, by = 50;
    const node = {
      name: 'Bool', type: 'BOOLEAN',
      transform: { x: bx, y: by, width: 40, height: 40, matrix: [0, 1, -1, 0, bx, by] },
      boolean: { op: 'UNION' },
      children: [vec('c1', bx + 0, by + 20, [0, 1, -1, 0, bx + 0, by + 20])],
      fills: []
    };
    const layer = builders.BOOLEAN(mockComp(), node, { layersBuilt: 0 });
    const shapes = contentsOf(layer)._added.filter(p => p._name === 'ADBE Vector Shape - Group');
    expect(shapes.length).toBe(1);
    const verts = shapes[0].property('ADBE Vector Shape').value.vertices;
    // Local delta (20,0): first vertex (0,0) + (20,0).
    expect(verts[0][0]).toBeCloseTo(20, 6);
    expect(verts[0][1]).toBeCloseTo(0, 6);
  });

  it('gives a relatively-rotated boolean operand its own rotated vector group', () => {
    // Identity node; child rotated 90 with translation (10,10): the operand used
    // to render axis-aligned. Now it must sit in a sub-group whose transform
    // carries rotation 90 about the child's top-left.
    const node = {
      name: 'Bool', type: 'BOOLEAN',
      transform: { x: 0, y: 0, width: 40, height: 40, matrix: [1, 0, 0, 1, 0, 0] },
      boolean: { op: 'UNION' },
      children: [vec('c1', 10, 10, [0, 1, -1, 0, 10, 10])],
      fills: []
    };
    const layer = builders.BOOLEAN(mockComp(), node, { layersBuilt: 0 });
    const groups = contentsOf(layer)._added.filter(p => p._name === 'ADBE Vector Group');
    expect(groups.length).toBe(1);
    const gtr = groups[0].property('ADBE Vector Transform Group');
    expect(gtr.property('ADBE Vector Rotation').value).toBeCloseTo(90, 4);
    expect(gtr.property('ADBE Vector Position').value[0]).toBeCloseTo(10, 6);
    expect(gtr.property('ADBE Vector Position').value[1]).toBeCloseTo(10, 6);
    expect(gtr.property('ADBE Vector Anchor').value).toEqual([0, 0]);
    // Geometry inside the rotated group stays child-local (no baked offset).
    const inner = groups[0].property('ADBE Vectors Group');
    const sh = inner._added.filter(p => p._name === 'ADBE Vector Shape - Group')[0];
    expect(sh.property('ADBE Vector Shape').value.vertices[0]).toEqual([0, 0]);
  });

  it('merged icon: unrotated children keep the plain offset path (byte-stable with the audit-locked board)', () => {
    const node = {
      name: 'Icon', type: 'GROUP', merged: true,
      transform: { x: 5, y: 7, width: 40, height: 40, matrix: [1, 0, 0, 1, 5, 7] },
      children: [vec('c1', 25, 7)]
    };
    const layer = buildMergedShape(mockComp(), node, { layersBuilt: 0 });
    const root = layer.property('ADBE Root Vectors Group');
    const grp = root._added.filter(p => p._name === 'ADBE Vector Group')[0];
    const sh = grp.property('ADBE Vectors Group')._added.filter(p => p._name === 'ADBE Vector Shape - Group')[0];
    // Frame delta (20,0) through an identity matrix stays (20,0), baked into vertices.
    expect(sh.property('ADBE Vector Shape').value.vertices[0]).toEqual([20, 0]);
    // No group transform was written for the straight case.
    expect(grp.property('ADBE Vector Transform Group').property('ADBE Vector Rotation').value).toBeUndefined();
  });
});
