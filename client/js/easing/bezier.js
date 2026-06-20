/**
 * Rebound — cubic bezier easing.
 *
 * A normalized cubic bezier easing curve is defined by two control points
 * P1 = (x1, y1) and P2 = (x2, y2) on the unit square; the endpoints are fixed
 * at (0, 0) and (1, 1). This is the same parameterization as CSS
 * `cubic-bezier(x1, y1, x2, y2)`.
 *
 * The solver maps an input x (normalized time) to output y (normalized value)
 * using Newton-Raphson with a bisection fallback — the classic WebKit
 * UnitBezier algorithm.
 *
 * It also converts a bezier curve into After Effects temporal-ease values
 * (influence % + speed), which is how an easing curve is applied natively to a
 * pair of keyframes without baking.
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.easing = root.Rebound.easing || {};
  root.Rebound.easing.bezier = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NEWTON_ITERATIONS = 8;
  var SUBDIVISION_EPSILON = 1e-7;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /**
   * Build an easing function ease(x) -> y for cubic-bezier(x1, y1, x2, y2).
   * x is clamped to [0, 1]. y may exceed [0, 1] when handles overshoot.
   */
  function cubicBezier(x1, y1, x2, y2) {
    // Linear fast-path.
    var linear = x1 === y1 && x2 === y2;

    var cx = 3 * x1;
    var bx = 3 * (x2 - x1) - cx;
    var ax = 1 - cx - bx;
    var cy = 3 * y1;
    var by = 3 * (y2 - y1) - cy;
    var ay = 1 - cy - by;

    function sampleX(t) {
      return ((ax * t + bx) * t + cx) * t;
    }
    function sampleY(t) {
      return ((ay * t + by) * t + cy) * t;
    }
    function sampleDerivX(t) {
      return (3 * ax * t + 2 * bx) * t + cx;
    }

    function solveT(x) {
      // Newton-Raphson.
      var t = x;
      for (var i = 0; i < NEWTON_ITERATIONS; i++) {
        var xErr = sampleX(t) - x;
        if (Math.abs(xErr) < SUBDIVISION_EPSILON) return t;
        var d = sampleDerivX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= xErr / d;
      }
      // Bisection fallback for robustness.
      var lo = 0;
      var hi = 1;
      t = x;
      while (lo < hi) {
        var xEst = sampleX(t);
        if (Math.abs(xEst - x) < SUBDIVISION_EPSILON) return t;
        if (x > xEst) lo = t;
        else hi = t;
        t = (hi - lo) * 0.5 + lo;
      }
      return t;
    }

    return function ease(x) {
      if (linear) return x;
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return sampleY(solveT(x));
    };
  }

  /**
   * Convert a unit-square cubic bezier into After Effects temporal-ease values
   * for the two keyframes it spans.
   *
   * AE describes the interpolation between two keyframes with an outgoing ease
   * on the first key and an incoming ease on the second; each ease is a
   * { speed, influence } pair. Speed is in value-units/second; influence is the
   * horizontal extent of the handle as a percentage (0.1 - 100).
   *
   * For a curve P1 = (x1, y1), P2 = (x2, y2) spanning a value delta `dv` over a
   * time delta `dt` seconds:
   *   outgoing influence = x1 * 100            (handle 1 horizontal extent)
   *   outgoing speed     = (y1 / x1) * (dv/dt) (handle 1 slope * average speed)
   *   incoming influence = (1 - x2) * 100
   *   incoming speed     = ((1 - y2) / (1 - x2)) * (dv/dt)
   *
   * @param {{x1:number,y1:number,x2:number,y2:number}} h handle coordinates
   * @param {number} dv value delta between the two keyframes
   * @param {number} dt time delta in seconds between the two keyframes
   * @returns {{out:{influence:number,speed:number},in:{influence:number,speed:number}}}
   */
  function bezierToTemporalEase(h, dv, dt) {
    var avgSpeed = dt !== 0 ? dv / dt : 0;
    var x1 = clamp(h.x1, 0, 1);
    var x2 = clamp(h.x2, 0, 1);

    var outInfluence = clamp(x1 * 100, 0.1, 100);
    var outSpeed = x1 === 0 ? 0 : (h.y1 / x1) * avgSpeed;

    var inDen = 1 - x2;
    var inInfluence = clamp(inDen * 100, 0.1, 100);
    var inSpeed = inDen === 0 ? 0 : ((1 - h.y2) / inDen) * avgSpeed;

    return {
      out: { influence: outInfluence, speed: outSpeed },
      in: { influence: inInfluence, speed: inSpeed },
    };
  }

  /**
   * Inverse of bezierToTemporalEase: derive unit-square handles from a pair of
   * AE eases, used when reading an existing keyframe pair back into the editor.
   */
  function temporalEaseToBezier(outEase, inEase, dv, dt) {
    var avgSpeed = dt !== 0 ? dv / dt : 0;
    var x1 = clamp(outEase.influence / 100, 0, 1);
    var x2 = 1 - clamp(inEase.influence / 100, 0, 1);
    var y1 = avgSpeed === 0 ? x1 : (outEase.speed / avgSpeed) * x1;
    var y2 = avgSpeed === 0 ? x2 : 1 - (inEase.speed / avgSpeed) * (1 - x2);
    return { x1: x1, y1: y1, x2: x2, y2: y2 };
  }

  return {
    cubicBezier: cubicBezier,
    bezierToTemporalEase: bezierToTemporalEase,
    temporalEaseToBezier: temporalEaseToBezier,
    clamp: clamp,
  };
});
