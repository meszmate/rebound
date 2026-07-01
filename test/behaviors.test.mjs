import { describe, it, expect } from 'vitest';
import '../client/js/behaviors/library.js';

const behaviors = globalThis.Rebound.behaviors;
const { build, BEHAVIORS, byId, dirOffset } = behaviors;

describe('behaviors.build', () => {
  it('fade-in ramps opacity 0 -> 100 over the duration', () => {
    const spec = build('fade-in', { durFrames: 24 });
    expect(spec.durFrames).toBe(24);
    expect(spec.props.length).toBe(1);
    const p = spec.props[0];
    expect(p.prop).toBe('opacity');
    expect(p.relative).toBe(false);
    expect(p.keys).toEqual([{ f: 0, v: 0 }, { f: 1, v: 100 }]);
    expect(p.ease).toMatchObject({ x1: 0.16, y1: 1 });
  });

  it('pop-in overshoots past 100 then settles (3 keys)', () => {
    const spec = build('pop-in', { amount: 20 });
    const p = spec.props[0];
    expect(p.prop).toBe('scale');
    expect(p.keys.map((k) => k.v[0])).toEqual([0, 120, 100]);
    expect(p.keys.map((k) => k.f)).toEqual([0, 0.7, 1]);
  });

  it('slide-in is a relative move that ends at the layer position', () => {
    const spec = build('slide-in', { distance: 300, direction: 'left' });
    const p = spec.props[0];
    expect(p.prop).toBe('position');
    expect(p.relative).toBe(true);
    expect(p.keys[0].v).toEqual([-300, 0]); // start offset left
    expect(p.keys[1].v).toEqual([0, 0]);    // ends where the layer is
  });

  it('honors slide direction', () => {
    expect(build('slide-in', { distance: 100, direction: 'top' }).props[0].keys[0].v).toEqual([0, -100]);
    expect(build('slide-in', { distance: 100, direction: 'bottom' }).props[0].keys[0].v).toEqual([0, 100]);
    expect(build('slide-in', { distance: 100, direction: 'right' }).props[0].keys[0].v).toEqual([100, 0]);
  });

  it('rise-in combines a relative move with a fade', () => {
    const spec = build('rise-in', { distance: 120 });
    expect(spec.props.map((p) => p.prop).sort()).toEqual(['opacity', 'position']);
    const pos = spec.props.find((p) => p.prop === 'position');
    expect(pos.keys[0].v).toEqual([0, 120]);
    expect(pos.keys[1].v).toEqual([0, 0]);
  });

  it('spin is a relative +360 rotation', () => {
    const spec = build('spin', {});
    const p = spec.props[0];
    expect(p.prop).toBe('rotation');
    expect(p.relative).toBe(true);
    expect(p.keys).toEqual([{ f: 0, v: 0 }, { f: 1, v: 360 }]);
  });

  it('returns null for an unknown behavior', () => {
    expect(build('nope', {})).toBe(null);
  });

  it('applies sensible defaults with no controls', () => {
    const spec = build('fade-in');
    expect(spec.durFrames).toBeGreaterThan(0);
  });
});

describe('behaviors catalog', () => {
  it('every behavior has an id, name, category, and builds a valid spec', () => {
    const cats = { in: 0, out: 0, emphasis: 0 };
    BEHAVIORS.forEach((b) => {
      expect(b.id && b.name && b.category).toBeTruthy();
      expect(byId[b.id]).toBe(b);
      cats[b.category] = (cats[b.category] || 0) + 1;
      const spec = b.build({});
      expect(spec.props.length).toBeGreaterThanOrEqual(1);
      spec.props.forEach((p) => {
        expect(['opacity', 'position', 'scale', 'rotation']).toContain(p.prop);
        expect(p.keys.length).toBeGreaterThanOrEqual(2);
        expect(p.keys[0].f).toBe(0);
        expect(p.keys[p.keys.length - 1].f).toBe(1);
      });
    });
    expect(cats.in).toBeGreaterThan(0);
    expect(cats.out).toBeGreaterThan(0);
    expect(cats.emphasis).toBeGreaterThan(0);
  });
});

describe('behaviors.dirOffset', () => {
  it('maps directions to Y-down offsets', () => {
    expect(dirOffset('left', 50)).toEqual([-50, 0]);
    expect(dirOffset('top', 50)).toEqual([0, -50]);
  });
});
