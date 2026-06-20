import { describe, it, expect } from 'vitest';
import { bezier } from './helpers/easing.mjs';

const { cubicBezier, bezierToTemporalEase, temporalEaseToBezier } = bezier;

describe('cubicBezier', () => {
  it('pins endpoints to 0 and 1', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('is the identity for the linear curve', () => {
    const ease = cubicBezier(0, 0, 1, 1);
    for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(ease(x)).toBeCloseTo(x, 6);
    }
  });

  it('matches the symmetric ease-in-out midpoint', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
  });

  it('is monotonic for a standard ease', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const y = ease(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it('overshoots above 1 when a handle exceeds the unit square', () => {
    const ease = cubicBezier(0.2, 1.6, 0.2, 1); // anticipatory overshoot
    let max = 0;
    for (let i = 0; i <= 200; i++) max = Math.max(max, ease(i / 200));
    expect(max).toBeGreaterThan(1);
  });
});

describe('bezierToTemporalEase', () => {
  it('maps handle extents to influence percentages', () => {
    const e = bezierToTemporalEase({ x1: 0.33, y1: 0, x2: 0.67, y2: 1 }, 100, 1);
    expect(e.out.influence).toBeCloseTo(33, 5);
    expect(e.in.influence).toBeCloseTo(33, 5); // (1 - 0.67) * 100
  });

  it('produces zero starting speed for a flat outgoing handle', () => {
    const e = bezierToTemporalEase({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 }, 200, 2);
    expect(e.out.speed).toBe(0);
  });

  it('clamps influence into the AE-legal 0.1..100 range', () => {
    const e = bezierToTemporalEase({ x1: 0, y1: 0, x2: 1, y2: 1 }, 50, 1);
    expect(e.out.influence).toBeGreaterThanOrEqual(0.1);
    expect(e.in.influence).toBeGreaterThanOrEqual(0.1);
  });

  it('round-trips with temporalEaseToBezier', () => {
    const h = { x1: 0.3, y1: 0.05, x2: 0.7, y2: 0.95 };
    const dv = 120;
    const dt = 1.5;
    const e = bezierToTemporalEase(h, dv, dt);
    const back = temporalEaseToBezier(e.out, e.in, dv, dt);
    expect(back.x1).toBeCloseTo(h.x1, 4);
    expect(back.y1).toBeCloseTo(h.y1, 4);
    expect(back.x2).toBeCloseTo(h.x2, 4);
    expect(back.y2).toBeCloseTo(h.y2, 4);
  });
});
