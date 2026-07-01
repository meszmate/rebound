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

describe('sampler.fitSamples', () => {
  // Cubic Hermite between two anchors using their true normalized-time slopes,
  // exactly what the host bakes (handle pinned to slope at 1/3 influence).
  function hermite(a, b, t) {
    const h = b.t - a.t;
    const u = (t - a.t) / h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.y
      + (u3 - 2 * u2 + u) * h * a.m
      + (-2 * u3 + 3 * u2) * b.y
      + (u3 - u2) * h * b.m;
  }
  function maxErr(anchors, fn) {
    let m = 0;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      for (let k = 0; k <= 20; k++) {
        const t = a.t + (b.t - a.t) * (k / 20);
        m = Math.max(m, Math.abs(hermite(a, b, t) - fn(t)));
      }
    }
    return m;
  }

  it('pins exact endpoints and a true slope on every anchor', () => {
    const curve = { type: 'spring', mass: 1, stiffness: 120, damping: 12 };
    const pts = sampler.fitSamples(curve);
    expect(pts[0].t).toBe(0);
    expect(pts[pts.length - 1].t).toBe(1);
    expect(pts[0].y).toBeCloseTo(0, 6);
    expect(pts[pts.length - 1].y).toBeCloseTo(1, 6);
    for (const p of pts) expect(typeof p.m).toBe('number');
  });

  it('reconstructs a physical spring within ~1.2% via its true-slope Hermite', () => {
    const curve = { type: 'spring', mass: 1, stiffness: 120, damping: 12 };
    const fn = sampler.toFunction(curve);
    expect(maxErr(sampler.fitSamples(curve), fn)).toBeLessThan(0.012);
  });

  it('reconstructs a bouncy perceptual spring within ~1.2%', () => {
    const curve = { type: 'spring', response: 0.5, bounce: 0.3 };
    const fn = sampler.toFunction(curve);
    expect(maxErr(sampler.fitSamples(curve), fn)).toBeLessThan(0.012);
  });

  it('anchors target crossings even when they land exactly on 1 (elastic)', () => {
    const curve = { type: 'penner', name: 'elasticOut' };
    const fn = sampler.toFunction(curve);
    const pts = sampler.fitSamples(curve);
    // At least one interior anchor sits on the target (a crossing), and the
    // Hermite reconstruction is faithful.
    expect(pts.filter((p) => Math.abs(p.y - 1) < 1e-6 && p.t > 0 && p.t < 1).length).toBeGreaterThan(0);
    expect(maxErr(pts, fn)).toBeLessThan(0.012);
  });

  it('adaptively refines a steep curve until every segment is within tolerance', () => {
    // A hard back-in/out overshoot: seeds alone under-fit; refinement must add
    // anchors until the Hermite hugs it, without blowing the key budget.
    const curve = { type: 'penner', name: 'backInOut' };
    const fn = sampler.toFunction(curve);
    const pts = sampler.fitSamples(curve);
    expect(maxErr(pts, fn)).toBeLessThan(0.015);
    expect(pts.length).toBeLessThanOrEqual(48);
  });

  it('never emits a zero-length reversal key at the end (no near-duplicate anchors)', () => {
    const curve = { type: 'spring', mass: 1, stiffness: 120, damping: 12 };
    const pts = sampler.fitSamples(curve);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].t - pts[i - 1].t).toBeGreaterThan(1e-3);
    }
  });

  it('is far more faithful than the old extrema-only anchors', () => {
    const curve = { type: 'spring', mass: 1, stiffness: 120, damping: 12 };
    const fn = sampler.toFunction(curve);
    // Old approach: turning points only, slopes ~0 at each (continuous bezier).
    const old = sampler.turningPoints(curve, 600).map((p) => ({ t: p.t, y: p.y, m: 0 }));
    expect(maxErr(sampler.fitSamples(curve), fn)).toBeLessThan(maxErr(old, fn) / 2);
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
