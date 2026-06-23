import { describe, it, expect } from 'vitest';
import { penner } from './helpers/easing.mjs';

describe('penner', () => {
  it('exposes the full classic set', () => {
    for (const fam of ['quad', 'cubic', 'quart', 'quint', 'sine', 'expo', 'circ', 'back', 'elastic', 'bounce']) {
      for (const dir of ['In', 'Out', 'InOut']) {
        expect(typeof penner.get(fam + dir)).toBe('function');
      }
    }
  });

  it('pins endpoints to 0 and 1 for every easing', () => {
    for (const name of penner.names) {
      const fn = penner.get(name);
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
    }
  });

  it('falls back to linear for unknown names', () => {
    const fn = penner.get('nope');
    expect(fn(0.42)).toBeCloseTo(0.42, 9);
  });

  it('classifies overshoot/oscillating shapes as non-monotonic', () => {
    expect(penner.isMonotonic('sineInOut')).toBe(true);
    expect(penner.isMonotonic('cubicOut')).toBe(true);
    expect(penner.isMonotonic('backOut')).toBe(false);
    expect(penner.isMonotonic('elasticOut')).toBe(false);
    expect(penner.isMonotonic('bounceOut')).toBe(false);
  });

  it('keeps monotonic shapes monotonic', () => {
    for (const name of penner.names) {
      if (!penner.isMonotonic(name)) continue;
      const fn = penner.get(name);
      let prev = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const y = fn(i / 100);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = y;
      }
    }
  });

  it('backOut overshoots above 1', () => {
    const fn = penner.get('backOut');
    let max = 0;
    for (let i = 0; i <= 200; i++) max = Math.max(max, fn(i / 200));
    expect(max).toBeGreaterThan(1);
  });

  describe('elasticOutWith (configurable elastic)', () => {
    it('pins endpoints and overshoots, settling cleanly to 1', () => {
      const fn = penner.elasticOutWith(1.6, 2, 8);
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
      let max = 0;
      for (let i = 0; i <= 400; i++) max = Math.max(max, fn(i / 400));
      expect(max).toBeGreaterThan(1); // overshoots the target
      // The tail must resolve near 1 BEFORE the forced endpoint, so there is no
      // snap: the last sampled value before t=1 should be within a hair of 1.
      expect(fn(0.97)).toBeCloseTo(1, 1);
    });

    it('more oscillations means more sign changes around the target', () => {
      function crossings(fn) {
        let n = 0, prev = fn(0.001) - 1;
        for (let i = 2; i <= 400; i++) {
          const cur = fn(i / 400) - 1;
          if (prev !== 0 && cur !== 0 && (prev < 0) !== (cur < 0)) n++;
          prev = cur;
        }
        return n;
      }
      expect(crossings(penner.elasticOutWith(1.6, 5, 6))).toBeGreaterThan(
        crossings(penner.elasticOutWith(1.6, 1.5, 6))
      );
    });

    it('clamps degenerate inputs instead of producing NaN', () => {
      const fn = penner.elasticOutWith(0.2, 0, 0); // below the floors
      for (let i = 0; i <= 50; i++) expect(Number.isNaN(fn(i / 50))).toBe(false);
    });
  });
});
