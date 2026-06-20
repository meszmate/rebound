import { describe, it, expect } from 'vitest';
import { sampler } from './helpers/easing.mjs';

describe('sampler.strategy', () => {
  it('applies bezier and monotonic penner curves as native temporal ease', () => {
    expect(sampler.strategy({ type: 'bezier', x1: 0.4, y1: 0, x2: 0.6, y2: 1 })).toBe('temporal-ease');
    expect(sampler.strategy({ type: 'penner', name: 'sineInOut' })).toBe('temporal-ease');
  });

  it('bakes springs and overshooting penner curves', () => {
    expect(sampler.strategy({ type: 'spring', response: 0.4, bounce: 0.3 })).toBe('bake');
    expect(sampler.strategy({ type: 'penner', name: 'bounceOut' })).toBe('bake');
    expect(sampler.strategy({ type: 'penner', name: 'elasticOut' })).toBe('bake');
  });
});

describe('sampler.samplePoints', () => {
  it('returns segments+1 points spanning x in [0,1]', () => {
    const pts = sampler.samplePoints({ type: 'penner', name: 'cubicInOut' }, 50);
    expect(pts.length).toBe(51);
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBe(1);
  });
});

describe('sampler.range', () => {
  it('reports overshoot beyond [0,1] for springs', () => {
    const r = sampler.range({ type: 'spring', mass: 1, stiffness: 200, damping: 6 });
    expect(r.max).toBeGreaterThan(1);
  });

  it('stays within [0,1] for a plain ease', () => {
    const r = sampler.range({ type: 'penner', name: 'sineInOut' });
    expect(r.min).toBeGreaterThanOrEqual(-1e-6);
    expect(r.max).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe('sampler.bakeFactors', () => {
  it('includes both endpoints and the requested count', () => {
    const f = sampler.bakeFactors({ type: 'penner', name: 'quadOut' }, 10);
    expect(f.length).toBe(10);
    expect(f[0]).toBeCloseTo(0, 6);
    expect(f[9]).toBeCloseTo(1, 6);
  });
});

describe('sampler.fitBezierHandles', () => {
  it('produces handles that reproduce a monotonic shape closely', () => {
    const curve = { type: 'penner', name: 'sineInOut' };
    const h = sampler.fitBezierHandles(curve);
    const fitted = sampler.toFunction({ type: 'bezier', ...h });
    const ref = sampler.toFunction(curve);
    let maxErr = 0;
    for (let i = 0; i <= 50; i++) {
      const x = i / 50;
      maxErr = Math.max(maxErr, Math.abs(fitted(x) - ref(x)));
    }
    expect(maxErr).toBeLessThan(0.05);
  });
});

describe('sampler.toTemporalEase', () => {
  it('passes bezier handles through exactly', () => {
    const e = sampler.toTemporalEase({ type: 'bezier', x1: 0.3, y1: 0, x2: 0.7, y2: 1 }, 100, 1);
    expect(e.out.influence).toBeCloseTo(30, 5);
    expect(e.in.influence).toBeCloseTo(30, 5);
  });
});
