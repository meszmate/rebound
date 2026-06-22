import { describe, it, expect } from 'vitest';
import normalize from '../shared/lib/normalize.js';
import bezier from '../shared/lib/bezier.js';

const { clamp01, normalizeColor, decomposeMatrix, degToRad, trackingFromLetterSpacing, leadingFromLineHeight, flipY } = normalize;
const { svgPathToSubpaths, absToRel, vertexFromDirections } = bezier;

describe('normalize: colour', () => {
  it('clamps channels into 0..1 and defaults alpha', () => {
    const c = normalizeColor({ r: 1.4, g: -0.2, b: 0.5 });
    expect(c).toEqual({ r: 1, g: 0, b: 0.5, a: 1 });
  });
  it('accepts array form with optional alpha', () => {
    expect(normalizeColor([0.1, 0.2, 0.3, 0.4])).toEqual({ r: 0.1, g: 0.2, b: 0.3, a: 0.4 });
  });
  it('clamp01 handles NaN and out-of-range', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
});

describe('normalize: matrix decomposition', () => {
  it('identity yields no rotation and unit scale', () => {
    const d = decomposeMatrix([1, 0, 0, 1, 0, 0]);
    expect(d.rotationDeg).toBeCloseTo(0, 6);
    expect(d.scaleX).toBeCloseTo(1, 6);
    expect(d.scaleY).toBeCloseTo(1, 6);
    expect(d.x).toBe(0);
    expect(d.y).toBe(0);
  });
  it('pure translation', () => {
    const d = decomposeMatrix([1, 0, 0, 1, 30, -12]);
    expect(d.x).toBe(30);
    expect(d.y).toBe(-12);
    expect(d.rotationDeg).toBeCloseTo(0, 6);
  });
  it('90 degree rotation (Y-down, clockwise)', () => {
    // Clockwise 90deg in a Y-down space: a=0,b=1,c=-1,d=0.
    const d = decomposeMatrix([0, 1, -1, 0, 0, 0]);
    expect(Math.abs(d.rotationDeg)).toBeCloseTo(90, 4);
    expect(d.scaleX).toBeCloseTo(1, 6);
    expect(d.scaleY).toBeCloseTo(1, 6);
  });
  it('non-uniform scale', () => {
    const d = decomposeMatrix([2, 0, 0, 3, 0, 0]);
    expect(d.scaleX).toBeCloseTo(2, 6);
    expect(d.scaleY).toBeCloseTo(3, 6);
  });
});

describe('normalize: angles and Y-flip', () => {
  it('degToRad', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 9);
  });
  it('flipY maps bottom-left to top-left', () => {
    expect(flipY(10, 100)).toBe(90);
  });
});

describe('normalize: text units', () => {
  it('percent letter spacing -> tracking (100% = 1000)', () => {
    expect(trackingFromLetterSpacing({ unit: 'PERCENT', value: 5 }, 32)).toBe(50);
  });
  it('pixel letter spacing -> tracking via font size', () => {
    expect(trackingFromLetterSpacing({ unit: 'PIXELS', value: 3.2 }, 32)).toBeCloseTo(100, 6);
  });
  it('auto line height flags auto leading', () => {
    expect(leadingFromLineHeight({ unit: 'AUTO' }, 32)).toEqual({ leading: 0, auto: true });
  });
  it('percent line height resolves through font size', () => {
    expect(leadingFromLineHeight({ unit: 'PERCENT', value: 150 }, 20)).toEqual({ leading: 30, auto: false });
  });
});

describe('bezier: tangents', () => {
  it('absToRel subtracts the anchor', () => {
    expect(absToRel([10, 10], [13, 6])).toEqual([3, -4]);
  });
  it('vertexFromDirections builds relative tangents', () => {
    const v = vertexFromDirections([10, 10], [7, 10], [13, 10]);
    expect(v.inTangent).toEqual([-3, 0]);
    expect(v.outTangent).toEqual([3, 0]);
  });
});

describe('bezier: SVG path parsing', () => {
  it('parses a closed triangle (M L L Z) into 3 vertices', () => {
    const subs = svgPathToSubpaths('M0 0 L10 0 L10 10 Z');
    expect(subs.length).toBe(1);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].vertices.length).toBe(3);
    expect(subs[0].vertices[0]).toMatchObject({ x: 0, y: 0 });
    expect(subs[0].vertices[1]).toMatchObject({ x: 10, y: 0 });
    expect(subs[0].vertices[2]).toMatchObject({ x: 10, y: 10 });
  });

  it('keeps cubic tangents relative to their vertex', () => {
    const subs = svgPathToSubpaths('M0 0 C0 5 5 10 10 10');
    expect(subs.length).toBe(1);
    expect(subs[0].closed).toBe(false);
    const v = subs[0].vertices;
    expect(v.length).toBe(2);
    // First vertex out-tangent is control1 - anchor.
    expect(v[0].outTangent).toEqual([0, 5]);
    // Last vertex in-tangent is control2 - anchor.
    expect(v[1].inTangent).toEqual([-5, 0]);
  });

  it('handles multiple subpaths and relative commands', () => {
    const subs = svgPathToSubpaths('M0 0 h10 v10 z m20 0 l5 5');
    expect(subs.length).toBe(2);
    expect(subs[0].closed).toBe(true);
    expect(subs[1].closed).toBe(false);
    expect(subs[1].vertices[0]).toMatchObject({ x: 20, y: 0 });
  });

  it('elevates a quadratic to a cubic without throwing', () => {
    const subs = svgPathToSubpaths('M0 0 Q5 10 10 0');
    expect(subs[0].vertices.length).toBe(2);
  });
});
