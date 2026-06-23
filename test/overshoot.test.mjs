import { describe, it, expect } from 'vitest';
import overshoot from '../client/js/easing/overshoot.js';

const PI = Math.PI;
// Reference implementation straight from the AE expression's formula.
function ref(freq, decay) {
  return (t) => Math.sin(2 * PI * freq * t) * Math.exp(-decay * t);
}

describe('overshoot.dampedSine', () => {
  it('matches the AE expression shape sin(2*PI*freq*t)*exp(-decay*t)', () => {
    const f = overshoot.dampedSine(2, 6);
    const r = ref(2, 6);
    for (const t of [0.01, 0.1, 0.25, 0.5, 0.8]) {
      expect(f(t)).toBeCloseTo(r(t), 12);
    }
  });

  it('starts at 0 and decays toward 0', () => {
    const f = overshoot.dampedSine(2, 6);
    expect(f(0)).toBe(0);
    expect(Math.abs(f(2))).toBeLessThan(0.01);
  });
});

describe('overshoot.extremaTimes', () => {
  it('finds points where the derivative is ~0 (peaks/valleys)', () => {
    const freq = 2, decay = 6;
    const s = overshoot.dampedSine(freq, decay);
    const ts = overshoot.extremaTimes(freq, decay, 1.5);
    expect(ts.length).toBeGreaterThan(1);
    const h = 1e-6;
    for (const t of ts) {
      const deriv = (s(t + h) - s(t - h)) / (2 * h);
      expect(Math.abs(deriv)).toBeLessThan(1e-3);
    }
  });

  it('the first extremum is the overshoot peak (a maximum > 0)', () => {
    const freq = 2, decay = 6;
    const s = overshoot.dampedSine(freq, decay);
    const ts = overshoot.extremaTimes(freq, decay, 1.5);
    const first = ts[0];
    expect(s(first)).toBeGreaterThan(0);
    // It is higher than its immediate neighbourhood.
    expect(s(first)).toBeGreaterThan(s(first - 0.02));
    expect(s(first)).toBeGreaterThan(s(first + 0.02));
  });

  it('extrema are spaced half a period apart', () => {
    const freq = 3, decay = 4;
    const ts = overshoot.extremaTimes(freq, decay, 2);
    const half = 1 / (2 * freq);
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i] - ts[i - 1]).toBeCloseTo(half, 9);
    }
  });

  it('stays within the requested duration', () => {
    const ts = overshoot.extremaTimes(2, 6, 0.5);
    for (const t of ts) expect(t).toBeLessThan(0.5);
  });
});

describe('overshoot.autoDuration', () => {
  it('shrinks as decay grows and is clamped', () => {
    expect(overshoot.autoDuration(6)).toBeGreaterThan(0.5);
    expect(overshoot.autoDuration(6)).toBeLessThan(1);
    expect(overshoot.autoDuration(50)).toBe(0.25); // clamped low
    expect(overshoot.autoDuration(0.1)).toBe(2.0); // clamped high
  });
});

describe('overshoot.crossingTimes / extremaAndCrossings', () => {
  it('crossings land where the shape is zero (k*PI/omega)', () => {
    const freq = 2, decay = 5;
    const s = overshoot.dampedSine(freq, decay);
    const cr = overshoot.crossingTimes(freq, decay, 1.2);
    expect(cr.length).toBeGreaterThan(0);
    for (const t of cr) expect(Math.abs(s(t))).toBeLessThan(1e-9);
  });

  it('combines extrema and crossings, sorted and de-duped', () => {
    const ts = overshoot.extremaAndCrossings(2, 5, 1.2);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    // every extremum and every crossing is present
    const ex = overshoot.extremaTimes(2, 5, 1.2);
    const cr = overshoot.crossingTimes(2, 5, 1.2);
    expect(ts.length).toBe(ex.length + cr.length);
  });
});

describe('overshoot.dampedSineDeriv', () => {
  it('matches a numeric derivative of the shape', () => {
    const s = overshoot.dampedSine(3, 4);
    const sp = overshoot.dampedSineDeriv(3, 4);
    const h = 1e-6;
    for (const t of [0.05, 0.2, 0.4, 0.7]) {
      const num = (s(t + h) - s(t - h)) / (2 * h);
      expect(sp(t)).toBeCloseTo(num, 4);
    }
  });
});

describe('overshoot.fitAnchors fidelity', () => {
  // Cubic Hermite between two anchors using their true slopes.
  function hermite(a, b, t) {
    const h = b.t - a.t;
    const u = (t - a.t) / h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.s
      + (u3 - 2 * u2 + u) * h * a.sp
      + (-2 * u3 + 3 * u2) * b.s
      + (u3 - u2) * h * b.sp;
  }

  it('quarter-cycle anchors + true slopes reconstruct the curve within ~1%', () => {
    const freq = 2, decay = 6;
    const s = overshoot.dampedSine(freq, decay);
    const anchors = overshoot.fitAnchors(freq, decay, 0);
    let maxErr = 0;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      for (let k = 0; k <= 20; k++) {
        const t = a.t + (b.t - a.t) * (k / 20);
        maxErr = Math.max(maxErr, Math.abs(hermite(a, b, t) - s(t)));
      }
    }
    // Peak amplitude is ~0.6; staying within 0.02 absolute is ~2% of the peak,
    // visually indistinguishable from the true curve.
    expect(maxErr).toBeLessThan(0.02);
  });

  it('is dramatically more faithful than extrema-only baking', () => {
    const freq = 2, decay = 6;
    const s = overshoot.dampedSine(freq, decay);
    // extrema-only with true slopes (slopes are ~0 there): big sag between peaks
    const ex = [{ t: 0, s: 0, sp: overshoot.dampedSineDeriv(freq, decay)(0) }]
      .concat(overshoot.extremaTimes(freq, decay, overshoot.autoDuration(decay)).map((t) => ({ t, s: s(t), sp: 0 })));
    function maxErrOf(anchors) {
      let m = 0;
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i + 1], h = b.t - a.t;
        for (let k = 0; k <= 20; k++) {
          const u = k / 20, u2 = u * u, u3 = u2 * u;
          const v = (2 * u3 - 3 * u2 + 1) * a.s + (u3 - 2 * u2 + u) * h * a.sp
            + (-2 * u3 + 3 * u2) * b.s + (u3 - u2) * h * b.sp;
          m = Math.max(m, Math.abs(v - s(a.t + h * u)));
        }
      }
      return m;
    }
    const fit = overshoot.fitAnchors(freq, decay, 0);
    expect(maxErrOf(fit)).toBeLessThan(maxErrOf(ex) / 2);
  });
});

describe('overshoot.followThroughAnchors', () => {
  it('begins at the landing (0,0) and ends near settled', () => {
    const a = overshoot.followThroughAnchors(2, 6, 0);
    expect(a[0]).toEqual({ t: 0, s: 0 });
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(a[a.length - 1].s)).toBeLessThan(0.05);
  });

  it('every interior anchor is a real extremum of the shape', () => {
    const freq = 2, decay = 5, dur = 1.2;
    const s = overshoot.dampedSine(freq, decay);
    const a = overshoot.followThroughAnchors(freq, decay, dur);
    const h = 1e-6;
    for (let i = 1; i < a.length - 1; i++) {
      const t = a[i].t;
      const deriv = (s(t + h) - s(t - h)) / (2 * h);
      expect(Math.abs(deriv)).toBeLessThan(1e-3);
      expect(a[i].s).toBeCloseTo(s(t), 12);
    }
  });

  it('alternates overshoot above and below the target', () => {
    const a = overshoot.followThroughAnchors(2, 5, 1.2).slice(1, -1);
    for (let i = 1; i < a.length; i++) {
      expect(Math.sign(a[i].s)).toBe(-Math.sign(a[i - 1].s));
    }
  });
});
