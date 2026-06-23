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

  /**
   * A sparse set of { t, y } anchors that captures an overshooting curve's
   * shape: every turning point and endpoint, plus the curve-sampled midpoint of
   * each gap so the arcs between extrema stay faithful. Typically 8-20 points
   * for an elastic/bounce, vs hundreds for a per-frame bake. The host places a
   * keyframe at each (auto-bezier smoothed) so the curve is visible and editable
   * in the Graph Editor.
   */
  function sparseSamples(curve) {
    // Just the turning points and endpoints. The host gives every key a
    // continuous bezier handle, so the arcs between extrema stay smooth with the
    // fewest possible keyframes (one per peak/valley), each editable by hand.
    return turningPoints(curve, 600);
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
    sparseSamples: sparseSamples,
    fitBezierHandles: fitBezierHandles,
    toTemporalEase: toTemporalEase,
  };
});
