/**
 * Rebound, curve sampling and application strategy.
 *
 * Bridges the pure math (bezier / penner / spring) and the host. Given an
 * easing definition it can:
 *   - sample points for previewing the curve in the editor,
 *   - convert a monotonic curve into native AE temporal-ease values,
 *   - bake an arbitrary (overshooting / oscillating) curve into per-keyframe
 *     interpolation factors the host applies between two values.
 *
 * Depends on Rebound.easing.{bezier,penner,spring} being loaded first in the
 * browser. Under Node/Vitest it requires them relatively.
 */
;(function (root, factory) {
  // Each easing module always registers on root.Rebound.easing (even under a
  // CommonJS loader), so resolve dependencies from there first. Fall back to
  // require() only if the globals are genuinely absent.
  var E = (root.Rebound && root.Rebound.easing) || {};
  var bezier = E.bezier;
  var penner = E.penner;
  var spring = E.spring;
  if ((!bezier || !penner || !spring) && typeof require === 'function') {
    try {
      bezier = bezier || require('./bezier.js');
      penner = penner || require('./penner.js');
      spring = spring || require('./spring.js');
    } catch (e) {
      /* not a CommonJS environment */
    }
  }
  var mod = factory(bezier, penner, spring);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.easing = root.Rebound.easing || {};
  root.Rebound.easing.sampler = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (bezier, penner, spring) {
  'use strict';

  /**
   * Resolve a curve definition into a normalized easing function ease(t)->v
   * for t in [0, 1]. v may overshoot for spring / back / elastic / bounce.
   *
   * A curve is one of:
   *   { type: 'bezier', x1, y1, x2, y2 }
   *   { type: 'penner', name }
   *   { type: 'spring', ...springOpts }
   *   { type: 'fn', fn }
   */
  function toFunction(curve) {
    if (!curve) return function (t) { return t; };
    switch (curve.type) {
      case 'bezier':
        return bezier.cubicBezier(curve.x1, curve.y1, curve.x2, curve.y2);
      case 'penner':
        return penner.get(curve.name);
      case 'spring':
        return spring.springNormalized(curve);
      case 'fn':
        return curve.fn;
      default:
        return function (t) { return t; };
    }
  }

  /**
   * Decide how a curve should be applied to keyframes.
   *   'temporal-ease', exact, native, editable AE ease (monotonic only).
   *   'bake'         , sampled keyframes (overshoot / oscillation).
   * Springs and non-monotonic penner shapes always bake.
   */
  function strategy(curve) {
    if (!curve) return 'temporal-ease';
    if (curve.type === 'bezier') return 'temporal-ease';
    if (curve.type === 'spring') return 'bake';
    if (curve.type === 'penner') {
      return penner.isMonotonic(curve.name) ? 'temporal-ease' : 'bake';
    }
    return 'bake';
  }

  /**
   * Sample a curve into { x, y } points for previewing. x spans [0, 1]; y is
   * the eased value (may exceed [0, 1]).
   */
  function samplePoints(curve, segments) {
    segments = segments || 96;
    var fn = toFunction(curve);
    var pts = [];
    for (var i = 0; i <= segments; i++) {
      var x = i / segments;
      pts.push({ x: x, y: fn(x) });
    }
    return pts;
  }

  /**
   * Report the min/max of the sampled y range, so the editor can pad its
   * viewport to show overshoot above 1 or below 0.
   */
  function range(curve, segments) {
    var pts = samplePoints(curve, segments || 192);
    var min = 0;
    var max = 1;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].y < min) min = pts[i].y;
      if (pts[i].y > max) max = pts[i].y;
    }
    return { min: min, max: max };
  }

  /**
   * Bake a curve into interpolation factors for `count` keyframes inclusive of
   * both endpoints. factor[0] === fn(0), factor[count-1] === fn(1). The host
   * computes each keyframe value as start + (end - start) * factor.
   */
  function bakeFactors(curve, count) {
    count = Math.max(2, count | 0);
    var fn = toFunction(curve);
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(fn(i / (count - 1)));
    }
    return out;
  }

  /**
   * Turning points (local minima/maxima) of a curve plus both endpoints, as
   * { t, y } in [0, 1]. The basis for baking an overshooting curve to a FEW
   * editable keyframes (one per peak/valley) instead of one per frame.
   */
  function turningPoints(curve, samples) {
    var fn = toFunction(curve);
    var N = samples || 600;
    var out = [{ t: 0, y: fn(0) }];
    var prev = fn(0);
    var prevT = 0;
    var prevSign = 0;
    for (var i = 1; i <= N; i++) {
      var t = i / N;
      var y = fn(t);
      var dy = y - prev;
      var sign = dy > 1e-9 ? 1 : (dy < -1e-9 ? -1 : prevSign);
      if (prevSign !== 0 && sign !== 0 && sign !== prevSign) {
        out.push({ t: prevT, y: prev }); // extremum at the previous sample
      }
      prevSign = sign;
      prev = y;
      prevT = t;
    }
    out.push({ t: 1, y: fn(1) });
    return out;
  }

  // Numeric slope dy/dt of a normalized easing fn at t in [0,1]. The samples are
  // kept strictly inside (0,1): a spring's normalized fn is clamped flat at the
  // exact endpoints (y=1 at t>=1) even while the underlying curve is still
  // moving, so sampling the boundary itself yields a spurious huge slope. Insetting
  // gives the endpoints their true leaving/arriving slope instead.
  function slopeAt(fn, t) {
    var h = 1e-3;
    var lo = 5e-4, hi = 1 - 5e-4;
    var a = t - h, b = t + h;
    if (a < lo) a = lo;
    if (b > hi) b = hi;
    if (b <= a) { a = lo; b = hi; }
    return (fn(b) - fn(a)) / (b - a);
  }

  /**
   * A faithful, sparse anchor set for baking an overshooting curve as a FEW
   * editable keyframes that actually match the math. Each anchor is
   * { t, y, m } where t in [0,1], y is the (over/undershooting) value and m is
   * the true slope dy/dt in normalized time. Anchors are placed at:
   *   - both endpoints (exact, so the user's keyframe values are preserved),
   *   - every extremum (each overshoot peak / undershoot valley),
   *   - every target crossing (where the value passes 1) — the steep midpoints
   *     the old extrema-only bake missed, which made the arcs sag.
   * The host pins each keyframe's temporal handle to m, so the cubic between
   * anchors is the Hermite that hugs the curve (see host/commands/spring.jsx),
   * exactly the technique the unit-tested recoil bake uses. Near-duplicate
   * anchors (a tail wiggle a hair before the end) are merged into the endpoint
   * so no zero-length reversal key is written.
   */
  function fitSamples(curve) {
    var fn = toFunction(curve);
    var N = 600;
    var eps = 0.008; // merge anchors closer than this (normalized time)
    var raw = [{ t: 0, y: fn(0) }];
    var prevY = fn(0), prevT = 0, prevDSign = 0, prevRel = fn(0) - 1;
    for (var i = 1; i <= N; i++) {
      var t = i / N;
      var y = fn(t);
      var dy = y - prevY;
      var dSign = dy > 1e-9 ? 1 : (dy < -1e-9 ? -1 : prevDSign);
      // Extremum at the previous sample (the slope just changed direction).
      if (prevDSign !== 0 && dSign !== 0 && dSign !== prevDSign) raw.push({ t: prevT, y: prevY });
      // Target crossing (value passes 1) between prevT and t: interpolate the
      // exact time and anchor it on the target so the pass-through stays crisp.
      // The <=/>= comparisons catch a crossing that lands exactly on a sample
      // (elastic/back curves with clean periods hit y=1 on the grid, and a
      // strict !=0 test would skip them entirely).
      var rel = y - 1;
      if ((prevRel < 0 && rel >= 0) || (prevRel > 0 && rel <= 0)) {
        var denom = prevRel - rel;
        var frac = denom !== 0 ? prevRel / denom : 0;
        if (frac < 0) frac = 0;
        if (frac > 1) frac = 1;
        raw.push({ t: prevT + (t - prevT) * frac, y: 1 });
      }
      prevDSign = dSign; prevY = y; prevT = t; prevRel = rel;
    }
    raw.push({ t: 1, y: fn(1) });

    raw.sort(function (p, q) { return p.t - q.t; });
    var out = [];
    for (var j = 0; j < raw.length; j++) {
      var p = raw[j];
      if (p.t < 0) p.t = 0;
      if (p.t > 1) p.t = 1;
      if (out.length) {
        var lastP = out[out.length - 1];
        if (p.t - lastP.t < eps) {
          // Prefer the true endpoint over a near-coincident interior wiggle.
          if (p.t >= 1 - 1e-9) out[out.length - 1] = p;
          continue;
        }
      }
      out.push(p);
    }
    // Pin exact endpoints (the user's keyframe values ride on y=0 and y=1).
    out[0] = { t: 0, y: fn(0) };
    out[out.length - 1] = { t: 1, y: fn(1) };
    for (var k = 0; k < out.length; k++) out[k].m = slopeAt(fn, out[k].t);

    // Adaptive refinement: the extrema/crossing seeds land on the curve's
    // features, but a single Hermite across a long arc (e.g. a rest-released
    // spring's accelerating rise, which has an inflection) can still drift.
    // Greedily insert an anchor at the worst-fitting point of the worst segment
    // until every segment is within tolerance (or a sane key budget is hit), so
    // the baked keyframes reproduce ANY overshoot curve, not just gentle ones.
    var tol = 0.01;        // 1% of travel — visually indistinguishable
    var maxAnchors = 48;   // backstop against pathological curves
    while (out.length < maxAnchors) {
      var worstErr = 0, wi = -1, wt = -1;
      for (var si = 0; si < out.length - 1; si++) {
        var w = worstInSegment(fn, out[si], out[si + 1]);
        if (w.err > worstErr) { worstErr = w.err; wi = si; wt = w.t; }
      }
      if (worstErr <= tol || wt < 0) break;
      out.splice(wi + 1, 0, { t: wt, y: fn(wt), m: slopeAt(fn, wt) });
    }
    return out;
  }

  // Cubic-Hermite value between two { t, y, m } anchors (m = dy/dt), matching
  // exactly what the host bakes (handle pinned to slope at 1/3 influence).
  function hermiteAt(a, b, t) {
    var h = b.t - a.t;
    if (h <= 0) return a.y;
    var u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.y
      + (u3 - 2 * u2 + u) * h * a.m
      + (-2 * u3 + 3 * u2) * b.y
      + (u3 - u2) * h * b.m;
  }

  // Worst Hermite-vs-true error inside a segment and where it occurs.
  function worstInSegment(fn, a, b) {
    var worst = 0, wt = -1, K = 16;
    for (var i = 1; i < K; i++) {
      var t = a.t + (b.t - a.t) * (i / K);
      var e = Math.abs(hermiteAt(a, b, t) - fn(t));
      if (e > worst) { worst = e; wt = t; }
    }
    return { err: worst, t: wt };
  }

  /**
   * A sparse set of { t, y, m } anchors that captures an overshooting curve's
   * shape (turning points, target crossings, endpoints) with the true slope at
   * each, so the host can bake a FEW editable keyframes that match the curve.
   */
  function sparseSamples(curve) {
    return fitSamples(curve);
  }

  /**
   * Approximate a monotonic easing function with a single cubic bezier by
   * matching the slopes at both endpoints. Used to apply penner monotonic
   * shapes (sine/expo/circ/quad/...) as a native, editable AE ease.
   */
  function fitBezierHandles(curve) {
    var fn = toFunction(curve);
    var h = 1e-3;
    var m0 = (fn(h) - fn(0)) / h;
    var m1 = (fn(1) - fn(1 - h)) / h;
    return { x1: 1 / 3, y1: m0 / 3, x2: 2 / 3, y2: 1 - m1 / 3 };
  }

  /**
   * Convert a curve to AE temporal ease for a keyframe pair. For bezier curves
   * this is exact; for monotonic penner curves it fits handles first.
   */
  function toTemporalEase(curve, dv, dt) {
    var h;
    if (curve.type === 'bezier') {
      h = { x1: curve.x1, y1: curve.y1, x2: curve.x2, y2: curve.y2 };
    } else {
      h = fitBezierHandles(curve);
    }
    return bezier.bezierToTemporalEase(h, dv, dt);
  }

  return {
    toFunction: toFunction,
    strategy: strategy,
    samplePoints: samplePoints,
    range: range,
    bakeFactors: bakeFactors,
    turningPoints: turningPoints,
    fitSamples: fitSamples,
    sparseSamples: sparseSamples,
    fitBezierHandles: fitBezierHandles,
    toTemporalEase: toTemporalEase,
  };
});
