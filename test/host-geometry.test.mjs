import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load and run the ACTUAL host geometry (ExtendScript, ES3) in Node by shimming
// the `$` global it reads at load. This is the RENDERING half of the pipeline:
// the exporter emits cornerRadii/arc metadata (covered in figma-export.test.mjs);
// here we prove the host turns that into the exact bezier path AE draws. Together
// both halves of "per-corner rounded card", "pie/ring", "ellipse" are validated
// without needing After Effects running.

const K = 0.5523; // quarter-circle kappa used by the host

let geom;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, '../host/commands/import/geometry.jsx'), 'utf8');
  const sandbox = { __rebound: { importer: {} } };
  // The file is `(function(){ var R = $.__rebound; ... R.importer.geometry = {...} })()`.
  // Bind `$` to our sandbox and run it; it attaches the geometry API onto sandbox.
  new Function('$', src)(sandbox);
  geom = sandbox.__rebound.importer.geometry;
});

describe('host geometry.roundedRect (per-corner bezier the host actually draws)', () => {
  it('draws the real gradient card 1:1 — top corners rounded 5px, bottom SQUARE', () => {
    // Same node the exporter test asserts on: 332x168, {tl:5,tr:5,br:0,bl:0}.
    const sp = geom.roundedRect(332, 168, { tl: 5, tr: 5, br: 0, bl: 0 });
    expect(sp.closed).toBe(true);
    const v = sp.vertices;
    expect(v.length).toBe(8);

    // Top-left + top-right carry curved tangents (radius 5).
    expect(v[0].x).toBe(5); expect(v[0].y).toBe(0);
    expect(v[0].inTangent[0]).toBeCloseTo(-5 * K, 4);
    expect(v[2].x).toBe(332); expect(v[2].y).toBe(5);
    expect(v[2].inTangent[1]).toBeCloseTo(-5 * K, 4);

    // Bottom corners are SHARP: the two bottom-right verts coincide at (332,168)
    // with zero tangents, likewise bottom-left at (0,168) — a real square corner,
    // not a flattened-uniform rounding.
    expect([v[3].x, v[3].y]).toEqual([332, 168]);
    expect([v[4].x, v[4].y]).toEqual([332, 168]);
    expect(v[3].outTangent).toEqual([0, 0]);
    expect(v[4].inTangent).toEqual([0, 0]);
    expect([v[5].x, v[5].y]).toEqual([0, 168]);
    expect([v[6].x, v[6].y]).toEqual([0, 168]);
  });

  it('clamps each radius to half the shorter side (no self-overlap)', () => {
    const sp = geom.roundedRect(20, 10, { tl: 100, tr: 0, br: 0, bl: 0 });
    // maxR = min(20,10)/2 = 5, so tl is clamped from 100 -> 5.
    expect(sp.vertices[0].x).toBe(5);
    expect(sp.vertices[7].y).toBe(5);
  });

  it('a uniform-radius rect still produces a valid 8-point path', () => {
    const sp = geom.roundedRect(100, 100, { tl: 12, tr: 12, br: 12, bl: 12 });
    expect(sp.vertices.length).toBe(8);
    expect(sp.vertices[0].x).toBe(12);
  });
});

describe('host geometry.ellipsePath', () => {
  it('draws a 4-point kappa ellipse in local space', () => {
    const sp = geom.ellipsePath(80, 80);
    expect(sp.closed).toBe(true);
    expect(sp.vertices.length).toBe(4);
    expect([sp.vertices[0].x, sp.vertices[0].y]).toEqual([40, 0]);
    expect([sp.vertices[1].x, sp.vertices[1].y]).toEqual([80, 40]);
    expect(sp.vertices[0].outTangent[0]).toBeCloseTo(40 * K, 4);
  });
});

describe('host geometry.ellipseArcPath (pie / ring)', () => {
  it('builds a ring wedge (inner radius > 0) as outer + reversed inner edge', () => {
    // Matches the exporter pieEllipse: 0->180deg, innerRadius 0.5 on an 80x80 box.
    const sp = geom.ellipseArcPath(80, 80, { startAngle: 0, endAngle: 180, innerRadius: 0.5 });
    expect(sp.closed).toBe(true);
    // sweep 180deg -> 2 segments -> 3 outer + 3 inner points.
    expect(sp.vertices.length).toBe(6);
    // First outer point sits at 3 o'clock: (cx+rx, cy) = (80, 40).
    expect([sp.vertices[0].x, sp.vertices[0].y]).toEqual([80, 40]);
  });

  it('builds a pie (inner radius 0) that closes to the centre', () => {
    const sp = geom.ellipseArcPath(80, 80, { startAngle: 0, endAngle: 90, innerRadius: 0 });
    const last = sp.vertices[sp.vertices.length - 1];
    // The wedge closes on the ellipse centre (40,40).
    expect([last.x, last.y]).toEqual([40, 40]);
  });

  it('reversed inner ring edge swaps each vertex tangent pair (curvature stays on the circle)', () => {
    // Reversing a bezier path must swap in/out tangents; a bare reverse() left
    // the inner donut edge with inverted curvature (S-shaped lobes). For the
    // reversed inner edge, each MIDDLE vertex's outTangent must equal the
    // forward walk's inTangent at the same point (and vice versa).
    const sp = geom.ellipseArcPath(80, 80, { startAngle: 0, endAngle: 180, innerRadius: 0.5 });
    const inner = sp.vertices.slice(3); // 3 outer + 3 inner
    // Middle inner vertex sits at the ring bottom-ish point (12 o'clock of the
    // reversed walk): its tangents must be exact negations of each other and
    // TANGENT to the circle (pure x-direction at the 90deg point: (cx, cy+r)).
    const mid = inner[1];
    expect(mid.x).toBeCloseTo(40, 4);
    expect(mid.y).toBeCloseTo(60, 4); // cy + inner radius (40 + 20)
    // Tangent at that point is horizontal; the reversed walk travels right->left
    // on the way back, so outTangent points toward NEGATIVE x... direction aside,
    // both tangents must be horizontal (y component ~0) and mirrored.
    expect(Math.abs(mid.outTangent[1])).toBeLessThan(1e-6);
    expect(Math.abs(mid.inTangent[1])).toBeLessThan(1e-6);
    expect(mid.outTangent[0]).toBeCloseTo(-mid.inTangent[0], 6);
    // And the reversed walk's direction: from (60,40) [inner start, angle 180
    // reversed = a1 side] toward (20,40): the first inner vertex's outTangent
    // must point toward the next vertex's side (positive y going down around
    // the bottom of the inner arc is wrong; the inner edge of a TOP-half ring
    // walks the BOTTOM... assert the control point lies ON the circle side:
    // for the vertex at (60,40) the circle tangent is vertical.
    expect(Math.abs(inner[0].outTangent[0])).toBeLessThan(1e-6);
  });

  it('zeroes the straight radial edges of a ring wedge (no bulge)', () => {
    const sp = geom.ellipseArcPath(80, 80, { startAngle: 0, endAngle: 180, innerRadius: 0.5 });
    const v = sp.vertices;
    const outerLast = v[2], innerFirst = v[3], innerLast = v[5], outerFirst = v[0];
    // outer end -> inner start is a straight radial edge; so is inner end -> outer start.
    expect(outerLast.outTangent).toEqual([0, 0]);
    expect(innerFirst.inTangent).toEqual([0, 0]);
    expect(innerLast.outTangent).toEqual([0, 0]);
    expect(outerFirst.inTangent).toEqual([0, 0]);
  });

  it('zeroes the pie wedge closing edges but keeps a full-circle ring seamless', () => {
    const pie = geom.ellipseArcPath(80, 80, { startAngle: 0, endAngle: 90, innerRadius: 0 });
    const pv = pie.vertices;
    expect(pv[pv.length - 2].outTangent).toEqual([0, 0]); // arc end -> centre
    expect(pv[0].inTangent).toEqual([0, 0]);              // centre -> arc start
    // Full-circle donut: the closing edges are zero-length; curvature must stay.
    const donut = geom.ellipseArcPath(80, 80, { startAngle: 0, endAngle: 360, innerRadius: 0.5 });
    const dOuterFirst = donut.vertices[0];
    expect(Math.abs(dOuterFirst.inTangent[0]) + Math.abs(dOuterFirst.inTangent[1])).toBeGreaterThan(0.1);
  });
});
