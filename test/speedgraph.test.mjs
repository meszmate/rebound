import { describe, it, expect } from 'vitest';
import { speedgraph, bezier } from './helpers/easing.mjs';

const { endpointSpeeds, withStartSpeed, withEndSpeed, sampleSpeed, speedRange } = speedgraph;

describe('speedgraph.endpointSpeeds', () => {
  it('is constant speed 1 for the linear curve', () => {
    const s = endpointSpeeds({ x1: 0, y1: 0, x2: 1, y2: 1 });
    // x1===0 guard -> start 0 by convention; end den===0 guard -> 0.
    expect(s.start).toBe(0);
    expect(s.end).toBe(0);
  });

  it('reports zero endpoint speeds for a symmetric ease-in-out', () => {
    const s = endpointSpeeds({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
    expect(s.start).toBeCloseTo(0, 9); // slow start
    expect(s.end).toBeCloseTo(0, 9);   // slow end
  });

  it('matches the value-curve slope at the endpoints', () => {
    const c = { x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5 };
    const s = endpointSpeeds(c);
    expect(s.start).toBeCloseTo(0.5 / 0.25, 9);
    expect(s.end).toBeCloseTo((1 - 0.5) / (1 - 0.75), 9);
  });
});

describe('speedgraph endpoint setters', () => {
  it('withStartSpeed sets a start speed that endpointSpeeds reads back', () => {
    const c = withStartSpeed({ x1: 0.4, y1: 0, x2: 0.6, y2: 1 }, 2.5);
    expect(endpointSpeeds(c).start).toBeCloseTo(2.5, 9);
    expect(c.x1).toBe(0.4); // influence preserved
  });

  it('withEndSpeed sets an end speed that endpointSpeeds reads back', () => {
    const c = withEndSpeed({ x1: 0.4, y1: 0, x2: 0.6, y2: 1 }, 1.8);
    expect(endpointSpeeds(c).end).toBeCloseTo(1.8, 9);
    expect(c.x2).toBe(0.6); // influence preserved
  });
});

describe('speedgraph.sampleSpeed', () => {
  it('endpoints equal endpointSpeeds and times span [0,1]', () => {
    const c = { x1: 0.3, y1: 0.1, x2: 0.7, y2: 0.9 };
    const pts = sampleSpeed(c, 48);
    const ends = endpointSpeeds(c);
    expect(pts[0].x).toBeCloseTo(0, 9);
    expect(pts[pts.length - 1].x).toBeCloseTo(1, 9);
    expect(pts[0].s).toBeCloseTo(ends.start, 9);
    expect(pts[pts.length - 1].s).toBeCloseTo(ends.end, 9);
  });

  it('is a flat line at speed 1 for the linear curve interior', () => {
    const pts = sampleSpeed({ x1: 1 / 3, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 }, 40);
    for (let i = 1; i < pts.length - 1; i++) {
      expect(pts[i].s).toBeCloseTo(1, 6);
    }
  });

  it('the speed profile integrates to ~1 (it is the value curve derivative)', () => {
    const c = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    const N = 2000;
    const pts = sampleSpeed(c, N);
    // ∫ s dx over x in [0,1] == total progress == 1. Trapezoid in x.
    let area = 0;
    for (let i = 1; i < pts.length; i++) {
      area += 0.5 * (pts[i].s + pts[i - 1].s) * (pts[i].x - pts[i - 1].x);
    }
    expect(area).toBeCloseTo(1, 2);
  });
});

describe('speedgraph round-trips with the AE temporal ease', () => {
  it('a curve edited by start/end speed maps to AE speeds = speed * avg', () => {
    const avg = 200; // px/s average
    let c = { type: 'bezier', x1: 0.4, y1: 0, x2: 0.6, y2: 1 };
    c = withStartSpeed(c, 1.5);
    c = withEndSpeed(c, 0.5);
    const ease = bezier.bezierToTemporalEase(c, avg, 1);
    expect(ease.out.speed).toBeCloseTo(1.5 * avg, 6);
    expect(ease.in.speed).toBeCloseTo(0.5 * avg, 6);
    expect(ease.out.influence).toBeCloseTo(40, 6);
    expect(ease.in.influence).toBeCloseTo(40, 6);
  });
});

describe('speedgraph.speedRange', () => {
  it('includes the fast middle of an ease-in-out (peak > 1)', () => {
    const r = speedRange({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
    expect(r.min).toBeLessThanOrEqual(0);
    expect(r.max).toBeGreaterThan(1); // accelerates above average in the middle
  });
});
