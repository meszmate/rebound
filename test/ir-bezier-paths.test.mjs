import { describe, it, expect } from 'vitest';
import bezier from '../shared/lib/bezier.js';

const { svgPathToSubpaths } = bezier;

// Locks in vector-path accuracy across every SVG command, including the tricky
// reflections (S/T), relative commands, arcs, and closed-loop tangent merging.
// Tangents are stored RELATIVE to their vertex (control - anchor).

function close(a, b, p = 4) {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
}

describe('svg path: smooth cubic (S) reflects the previous control', () => {
  it('reflects c2 about the join', () => {
    const v = svgPathToSubpaths('M0 0 C0 5 5 10 10 10 S20 10 20 0')[0].vertices;
    expect(v.length).toBe(3);
    close(v[1].inTangent, [-5, 0]);
    close(v[1].outTangent, [5, 0]); // reflection of c2 (5,10) about (10,10) -> (15,10)
    close(v[2].inTangent, [0, 10]);
  });
});

describe('svg path: relative commands', () => {
  it('relative cubic matches the absolute form', () => {
    const v = svgPathToSubpaths('M0 0 c0 5 5 10 10 10')[0].vertices;
    expect(v.length).toBe(2);
    close(v[0].outTangent, [0, 5]);
    close(v[1].inTangent, [-5, 0]);
  });
  it('relative h/v/z build a closed subpath', () => {
    const subs = svgPathToSubpaths('M0 0 h10 v10 h-10 z');
    expect(subs[0].closed).toBe(true);
    expect(subs[0].vertices.length).toBe(4);
  });
});

describe('svg path: quadratic + smooth quadratic (T)', () => {
  it('elevates Q to cubic and reflects T', () => {
    const v = svgPathToSubpaths('M0 0 Q5 10 10 0 T20 0')[0].vertices;
    expect(v.length).toBe(3);
    close(v[0].outTangent, [10 / 3, 20 / 3]);
    close(v[1].inTangent, [-10 / 3, 20 / 3]);
    close(v[1].outTangent, [10 / 3, -20 / 3]); // T reflects (5,10) about (10,0)
  });
});

describe('svg path: arcs become kappa cubics', () => {
  it('a semicircle splits into quarter arcs with the right endpoints', () => {
    const v = svgPathToSubpaths('M0 0 A5 5 0 0 1 10 0')[0].vertices;
    close([v[0].x, v[0].y], [0, 0]);
    const last = v[v.length - 1];
    close([last.x, last.y], [10, 0]);
    // midpoint of a clockwise semicircle of r=5 sits at (5,-5).
    const mid = v.find((p) => Math.abs(p.x - 5) < 0.001);
    expect(mid).toBeTruthy();
    expect(mid.y).toBeCloseTo(-5, 4);
  });
});

describe('svg path: closed loop merges the duplicate end vertex', () => {
  it('folds the final in-tangent onto the first vertex', () => {
    const sp = svgPathToSubpaths('M0 0 C0 -5 10 -5 10 0 C10 5 0 5 0 0 Z')[0];
    expect(sp.closed).toBe(true);
    expect(sp.vertices.length).toBe(2);
    close(sp.vertices[0].inTangent, [0, 5]);
    close(sp.vertices[0].outTangent, [0, -5]);
  });
});

describe('svg path: multiple subpaths (compound shape / hole)', () => {
  it('keeps each subpath separate with its winding', () => {
    const subs = svgPathToSubpaths('M0 0 L10 0 L10 10 Z M2 2 L4 2 L4 4 Z');
    expect(subs.length).toBe(2);
    expect(subs[0].vertices.length).toBe(3);
    expect(subs[1].vertices.length).toBe(3);
    expect(subs[1].vertices[0]).toMatchObject({ x: 2, y: 2 });
  });
});
