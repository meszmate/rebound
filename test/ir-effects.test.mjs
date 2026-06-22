import { describe, it, expect } from 'vitest';
import fx from '../shared/lib/effects.js';

const { offsetFromDistanceAngle, distanceAngleFromOffset, blendModeToLayerStyleOrdinal, effectToLayerStyle, isLayerStyleEffect } = fx;

describe('effects: offset <-> distance/angle', () => {
  it('round-trips an offset', () => {
    const da = distanceAngleFromOffset([2.5, 4.33]);
    const back = offsetFromDistanceAngle(da.distance, da.angle);
    expect(back[0]).toBeCloseTo(2.5, 4);
    expect(back[1]).toBeCloseTo(4.33, 4);
  });
  it('matches the Photoshop down-right default (angle 120, distance 5)', () => {
    const off = offsetFromDistanceAngle(5, 120);
    expect(off[0]).toBeCloseTo(2.5, 4);   // right
    expect(off[1]).toBeCloseTo(4.330, 3); // down
  });
});

describe('effects: blend ordinal', () => {
  it('maps known modes to the mode2 ordinal', () => {
    expect(blendModeToLayerStyleOrdinal('NORMAL')).toBe(1);
    expect(blendModeToLayerStyleOrdinal('MULTIPLY')).toBe(4);
    expect(blendModeToLayerStyleOrdinal('SCREEN')).toBe(9);
    expect(blendModeToLayerStyleOrdinal('LUMINOSITY')).toBe(27);
  });
  it('falls back to Normal for unknown', () => {
    expect(blendModeToLayerStyleOrdinal('NOPE')).toBe(1);
  });
});

describe('effects: effectToLayerStyle', () => {
  it('converts a drop shadow with offset', () => {
    const ls = effectToLayerStyle({ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.5 }, offset: [0, 4], radius: 8, spread: 0 });
    expect(ls.type).toBe('DROP_SHADOW');
    expect(ls.size).toBe(8);
    expect(ls.opacity).toBe(0.5);
    expect(ls.distance).toBeCloseTo(4, 6);
  });
  it('converts a glow (radius to size)', () => {
    const ls = effectToLayerStyle({ type: 'OUTER_GLOW', color: { r: 1, g: 1, b: 0 }, radius: 12 });
    expect(ls.type).toBe('OUTER_GLOW');
    expect(ls.size).toBe(12);
  });
  it('returns null for blurs', () => {
    expect(effectToLayerStyle({ type: 'LAYER_BLUR', radius: 4 })).toBe(null);
    expect(isLayerStyleEffect('BACKGROUND_BLUR')).toBe(false);
    expect(isLayerStyleEffect('INNER_SHADOW')).toBe(true);
  });
});
