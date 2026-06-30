import { describe, it, expect } from 'vitest';
import '../client/js/export/lottie.js';

const lottie = globalThis.Rebound.exporters.lottie;
const { exportLottie, lottieProp, hex } = lottie;

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
