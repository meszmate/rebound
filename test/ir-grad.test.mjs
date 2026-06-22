import { describe, it, expect } from 'vitest';
import grad from '../shared/lib/grad.js';

const { encode, decode } = grad;

describe('grad: encode', () => {
  it('lays out colour stops then alpha stops', () => {
    const out = encode([
      { pos: 0, color: [1, 0, 0] },
      { pos: 1, color: [0, 0, 1] }
    ]);
    // 2 colour stops (4 each) + 2 alpha stops (2 each) = 12 numbers.
    expect(out.length).toBe(12);
    expect(out.slice(0, 8)).toEqual([0, 1, 0, 0, 1, 0, 0, 1]);
    expect(out.slice(8)).toEqual([0, 1, 1, 1]); // alpha defaults to 1
  });

  it('preserves per-stop alpha', () => {
    const out = encode([
      { pos: 0, color: [1, 1, 1], alpha: 0.25 },
      { pos: 1, color: [0, 0, 0], alpha: 1 }
    ]);
    expect(out.slice(8)).toEqual([0, 0.25, 1, 1]);
  });

  it('sorts stops by position', () => {
    const out = encode([
      { pos: 1, color: [0, 0, 0] },
      { pos: 0, color: [1, 1, 1] }
    ]);
    expect(out[0]).toBe(0);
    expect(out.slice(1, 4)).toEqual([1, 1, 1]);
  });

  it('clamps channels and positions', () => {
    const out = encode([{ pos: -1, color: [2, -1, 0.5] }, { pos: 2, color: [0, 0, 0] }]);
    expect(out.slice(0, 4)).toEqual([0, 1, 0, 0.5]);
  });

  it('always yields a length divisible by 6', () => {
    for (const n of [2, 3, 5]) {
      const stops = [];
      for (let i = 0; i < n; i++) stops.push({ pos: i / (n - 1), color: [0, 0, 0] });
      expect(encode(stops).length % 6).toBe(0);
    }
  });
});

describe('grad: decode', () => {
  it('round-trips encode', () => {
    const stops = [
      { pos: 0, color: [0.2, 0.4, 0.9], alpha: 1 },
      { pos: 0.5, color: [1, 1, 1], alpha: 0.5 },
      { pos: 1, color: [0.6, 0.2, 0.8], alpha: 1 }
    ];
    const back = decode(encode(stops));
    expect(back.length).toBe(3);
    expect(back[1].color).toEqual([1, 1, 1]);
    expect(back[1].alpha).toBe(0.5);
    expect(back[2].pos).toBe(1);
  });

  it('rejects malformed arrays', () => {
    expect(decode([1, 2, 3])).toBe(null);
    expect(decode(null)).toBe(null);
  });
});
