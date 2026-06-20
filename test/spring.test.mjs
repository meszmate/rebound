import { describe, it, expect } from 'vitest';
import { spring } from './helpers/easing.mjs';

describe('spring', () => {
  it('starts at 0 and settles toward 1', () => {
    const s = spring.spring({ mass: 1, stiffness: 120, damping: 14 });
    expect(s.fn(0)).toBeCloseTo(0, 6);
    expect(s.fn(s.settleTime * 4)).toBeCloseTo(1, 2);
  });

  it('classifies damping regimes', () => {
    expect(spring.spring({ mass: 1, stiffness: 100, damping: 5 }).regime).toBe('underdamped');
    expect(spring.spring({ mass: 1, stiffness: 100, damping: 20 }).regime).toBe('critical');
    expect(spring.spring({ mass: 1, stiffness: 100, damping: 60 }).regime).toBe('overdamped');
  });

  it('underdamped springs overshoot past the target', () => {
    const s = spring.spring({ mass: 1, stiffness: 200, damping: 6 });
    let max = 0;
    const dt = s.settleTime / 400;
    for (let t = 0; t <= s.settleTime; t += dt) max = Math.max(max, s.fn(t));
    expect(max).toBeGreaterThan(1);
  });

  it('overdamped springs never overshoot', () => {
    const s = spring.spring({ mass: 1, stiffness: 100, damping: 80 });
    const dt = s.settleTime / 400;
    for (let t = 0; t <= s.settleTime; t += dt) {
      expect(s.fn(t)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('respects initial velocity', () => {
    const still = spring.spring({ mass: 1, stiffness: 100, damping: 8, velocity: 0 });
    const kicked = spring.spring({ mass: 1, stiffness: 100, damping: 8, velocity: 5 });
    // A positive initial velocity moves it further early on.
    expect(kicked.fn(0.02)).toBeGreaterThan(still.fn(0.02));
  });

  it('maps Apple response/bounce: bounce>0 => underdamped, bounce<0 => overdamped', () => {
    expect(spring.spring({ response: 0.5, bounce: 0.4 }).regime).toBe('underdamped');
    expect(spring.spring({ response: 0.5, bounce: 0 }).regime).toBe('critical');
    expect(spring.spring({ response: 0.5, bounce: -0.4 }).regime).toBe('overdamped');
  });

  it('maps response/dampingFraction to the expected damping ratio', () => {
    const s = spring.spring({ response: 0.5, dampingFraction: 0.7 });
    expect(s.zeta).toBeCloseTo(0.7, 6);
  });

  it('settle time shrinks as damping grows', () => {
    const light = spring.spring({ mass: 1, stiffness: 100, damping: 6 });
    const heavy = spring.spring({ mass: 1, stiffness: 100, damping: 18 });
    expect(heavy.settleTime).toBeLessThan(light.settleTime);
  });

  it('springNormalized maps the full curve onto [0,1] time', () => {
    const ease = spring.springNormalized({ response: 0.4, bounce: 0.3 });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease.spec.regime).toBe('underdamped');
  });
});
