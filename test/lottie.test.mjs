import { describe, it, expect } from 'vitest';
import '../client/js/export/lottie.js';

const lottie = globalThis.Rebound.exporters.lottie;
const { exportLottie, lottieProp, hex, shapeItems } = lottie;

describe('lottie.lottieProp', () => {
  it('emits a static scalar property', () => {
    expect(lottieProp({ static: true, value: 100 })).toEqual({ a: 0, k: 100 });
  });

  it('emits a static vector property', () => {
    expect(lottieProp({ static: true, value: [960, 540] })).toEqual({ a: 0, k: [960, 540] });
  });

  it('collapses a single-key animation to static', () => {
    expect(lottieProp({ static: false, keys: [{ t: 0, v: [10, 20], bez: null }] })).toEqual({ a: 0, k: [10, 20] });
  });

  it('maps a 2-key segment ease straight into Lottie o/i tangents', () => {
    const p = lottieProp({
      static: false,
      keys: [
        { t: 0, v: [0, 0], bez: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
        { t: 30, v: [200, 0], bez: null }
      ]
    });
    expect(p.a).toBe(1);
    expect(p.k.length).toBe(2);
    // start key carries the segment's out/in tangents == our {x1,y1,x2,y2}
    expect(p.k[0]).toMatchObject({ t: 0, s: [0, 0], o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } });
    // last key is a bare hold (no o/i)
    expect(p.k[1]).toMatchObject({ t: 30, s: [200, 0] });
    expect(p.k[1].o).toBeUndefined();
  });

  it('falls back to a linear (diagonal) tangent when bez is null', () => {
    const p = lottieProp({ static: false, keys: [{ t: 0, v: 0, bez: null }, { t: 10, v: 1, bez: null }] });
    expect(p.k[0].o).toEqual({ x: [0.333], y: [0.333] });
    expect(p.k[0].i).toEqual({ x: [0.667], y: [0.667] });
  });
});

describe('lottie.hex', () => {
  it('converts normalized rgb to #rrggbb', () => {
    expect(hex([1, 0, 0])).toBe('#ff0000');
    expect(hex([0, 0.5019607843, 0])).toBe('#008000');
    expect(hex([0, 0, 0])).toBe('#000000');
  });
  it('clamps out-of-range channels', () => {
    expect(hex([2, -1, 0.5])).toBe('#ff0080');
  });
});

describe('lottie.exportLottie', () => {
  const doc = {
    name: 'Test', width: 1920, height: 1080, fps: 24, durationFrames: 48,
    layers: [
      {
        name: 'BG', type: 'solid', color: [1, 0, 0], size: [1920, 1080], inFrame: 0, outFrame: 48,
        transform: {
          opacity: { static: true, value: 100 },
          position: { static: false, keys: [
            { t: 0, v: [0, 0], bez: { x1: 0.3, y1: 0, x2: 0.7, y2: 1 } },
            { t: 24, v: [100, 0], bez: null }
          ] }
        }
      },
      { name: 'Ctrl', type: 'null', transform: { rotation: { static: true, value: 0 } } }
    ]
  };

  it('writes the comp header in frames', () => {
    const out = exportLottie(doc);
    expect(out).toMatchObject({ v: '5.7.0', fr: 24, ip: 0, op: 48, w: 1920, h: 1080, nm: 'Test' });
    expect(out.layers.length).toBe(2);
  });

  it('emits a solid layer (ty:1) with size + hex color', () => {
    const out = exportLottie(doc);
    const bg = out.layers[0];
    expect(bg.ty).toBe(1);
    expect(bg.sw).toBe(1920);
    expect(bg.sh).toBe(1080);
    expect(bg.sc).toBe('#ff0000');
    expect(bg.ind).toBe(1);
    expect(bg.ks.p.a).toBe(1); // animated position
    expect(bg.ks.p.k[0].o).toEqual({ x: [0.3], y: [0] });
  });

  it('emits a null layer (ty:3) with transform only', () => {
    const out = exportLottie(doc);
    const ctrl = out.layers[1];
    expect(ctrl.ty).toBe(3);
    expect(ctrl.sw).toBeUndefined();
    expect(ctrl.ks.r).toEqual({ a: 0, k: 0 });
  });

  it('produces JSON-serializable output', () => {
    expect(() => JSON.stringify(exportLottie(doc))).not.toThrow();
  });
});

// The host (lottie.jsx readShapes) hands the panel a nested tree of
// gr/sh/rc/el/fl/st items with group-local coordinates; shapeItems must map it
// 1:1 into Lottie shape items, appending each group's 'tr' transform.
describe('lottie.shapeItems (static shape geometry)', () => {
  const tree = [{
    ty: 'gr',
    name: 'Badge',
    transform: { anchor: [0, 0], position: [10, 20], scale: [50, 50], rotation: 45, skew: 10, skewAxis: 90, opacity: 80 },
    items: [
      { ty: 'rc', name: 'Box', size: [100, 60], position: [0, 0], roundness: 8 },
      { ty: 'el', name: 'Dot', size: [40, 40], position: [5, -5] },
      {
        ty: 'sh', name: 'Tri', closed: true,
        vertices: [[0, 0], [100, 0], [50, 80]],
        inTangents: [[0, 0], [-10, 5], [0, 0]],
        outTangents: [[10, -5], [0, 0], [0, 0]]
      },
      { ty: 'fl', name: 'Paint', color: [1, 0, 0], opacity: 100 },
      { ty: 'st', name: 'Edge', color: [0, 0, 1], opacity: 50, width: 3, lineCap: 2, lineJoin: 3 },
      {
        ty: 'gr', name: 'Inner', transform: { position: [1, 2] },
        items: [
          { ty: 'el', name: 'Eye', size: [8, 8], position: [0, 0] },
          { ty: 'fl', name: 'Ink', color: [0, 0, 0], opacity: 100 }
        ]
      },
      { ty: 'wat', name: 'Mystery' } // unknown kinds are dropped, not corrupted
    ]
  }];

  it('maps a group to gr with its children plus a trailing tr item', () => {
    const out = shapeItems(tree);
    expect(out.length).toBe(1);
    const gr = out[0];
    expect(gr.ty).toBe('gr');
    expect(gr.nm).toBe('Badge');
    // rc, el, sh, fl, st, inner gr (+ tr); the unknown 'wat' item is dropped
    expect(gr.it.length).toBe(7);
    expect(gr.it[gr.it.length - 1].ty).toBe('tr');
  });

  it('carries the group transform on the tr item, including skew', () => {
    const tr = shapeItems(tree)[0].it[6];
    expect(tr).toEqual({
      ty: 'tr',
      p: { a: 0, k: [10, 20] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [50, 50] },
      r: { a: 0, k: 45 },
      o: { a: 0, k: 80 },
      sk: { a: 0, k: 10 },
      sa: { a: 0, k: 90 }
    });
  });

  it('defaults a sparse group transform (p [0,0], s [100,100], r 0, o 100, no sk)', () => {
    const inner = shapeItems(tree)[0].it[5];
    expect(inner.ty).toBe('gr');
    const tr = inner.it[inner.it.length - 1];
    expect(tr.p.k).toEqual([1, 2]);
    expect(tr.a.k).toEqual([0, 0]);
    expect(tr.s.k).toEqual([100, 100]);
    expect(tr.r.k).toBe(0);
    expect(tr.o.k).toBe(100);
    expect(tr.sk).toBeUndefined();
    expect(tr.sa).toBeUndefined();
  });

  it('emits a parametric rectangle and ellipse', () => {
    const it0 = shapeItems(tree)[0].it;
    expect(it0[0]).toEqual({ ty: 'rc', d: 1, nm: 'Box', s: { a: 0, k: [100, 60] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 8 } });
    expect(it0[1]).toEqual({ ty: 'el', d: 1, nm: 'Dot', s: { a: 0, k: [40, 40] }, p: { a: 0, k: [5, -5] } });
  });

  it('emits a bezier path with i/o/v arrays and the closed flag', () => {
    const sh = shapeItems(tree)[0].it[2];
    expect(sh.ty).toBe('sh');
    expect(sh.ks.a).toBe(0);
    expect(sh.ks.k.c).toBe(true);
    expect(sh.ks.k.v).toEqual([[0, 0], [100, 0], [50, 80]]);
    expect(sh.ks.k.i).toEqual([[0, 0], [-10, 5], [0, 0]]);
    expect(sh.ks.k.o).toEqual([[10, -5], [0, 0], [0, 0]]);
  });

  it('emits a fill with alpha appended and rule 1', () => {
    const fl = shapeItems(tree)[0].it[3];
    expect(fl).toEqual({ ty: 'fl', nm: 'Paint', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 }, r: 1 });
  });

  it('emits a stroke with width, cap, join, and miter', () => {
    const st = shapeItems(tree)[0].it[4];
    expect(st).toEqual({
      ty: 'st', nm: 'Edge',
      c: { a: 0, k: [0, 0, 1, 1] },
      o: { a: 0, k: 50 },
      w: { a: 0, k: 3 },
      lc: 2, lj: 3, ml: 4
    });
  });

  it('a shape layer with host geometry exports it instead of the placeholder rect', () => {
    const doc = {
      name: 'Shapes', width: 100, height: 100, fps: 24, durationFrames: 24,
      layers: [{
        name: 'Real', type: 'shape', size: [100, 100], inFrame: 0, outFrame: 24,
        transform: { opacity: { static: true, value: 100 } },
        shapes: tree
      }]
    };
    const out = exportLottie(doc);
    expect(out.layers[0].ty).toBe(4);
    expect(out.layers[0].shapes[0].nm).toBe('Badge');
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('a shape layer without geometry still falls back to the colored rect', () => {
    const doc = {
      name: 'Shapes', width: 100, height: 100, fps: 24, durationFrames: 24,
      layers: [{
        name: 'Bare', type: 'shape', size: [80, 40], color: [0, 1, 0], inFrame: 0, outFrame: 24,
        transform: { opacity: { static: true, value: 100 } }
      }]
    };
    const out = exportLottie(doc);
    const gr = out.layers[0].shapes[0];
    expect(gr.ty).toBe('gr');
    expect(gr.nm).toBe('Rect');
  });
});
