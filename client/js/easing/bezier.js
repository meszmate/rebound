/**
 * Rebound, cubic bezier easing.
 *
 * A normalized cubic bezier easing curve is defined by two control points
 * P1 = (x1, y1) and P2 = (x2, y2) on the unit square; the endpoints are fixed
 * at (0, 0) and (1, 1). This is the same parameterization as CSS
 * `cubic-bezier(x1, y1, x2, y2)`.
 *
 * The solver maps an input x (normalized time) to output y (normalized value)
 * using Newton-Raphson with a bisection fallback, the classic WebKit
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

  // The smallest/largest handle X After Effects can store: influence is a
  // percentage in [0.1, 100], so x (=influence/100) lives in [0.001, 0.999].
  var X_MIN = 0.001;
  var X_MAX = 0.999;

  /**
   * Constrain a curve's handles to the domain After Effects can reproduce as an
   * EXACT native temporal ease, so "what you drew" == "what plays back":
   *   - X in [0.001, 0.999]  (influence's real 0.1%..100% range).
   * The handles MAY cross in X (x1 > x2): each keyframe's influence is its own
   * independent 0.1..100% (out = 100*x1, in = 100*(1-x2)), so a strong
   * ease-in-out like cubic-bezier(0.87, 0, 0.13, 1) is exactly representable,
   * and x(t) stays monotonic for ANY x1,x2 in [0,1]. (An earlier version
   * forbade crossing on the wrong assumption that the influences must sum to
   * 100%, which made strong eases impossible to draw.)
   * Y is deliberately left free: a single cubic with y1<0 or y2>1 is genuine
   * anticipation / overshoot and AE renders it faithfully via handle speed, so
   * clamping Y would throw away a real, representable feature.
   */
  function sanitizeHandles(h) {
    return {
      x1: clamp(h.x1, X_MIN, X_MAX), y1: h.y1,
      x2: clamp(h.x2, X_MIN, X_MAX), y2: h.y2,
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
   * The handles are sanitized first, and crucially the SPEED is derived from the
   * SAME clamped x used for the influence — so the (influence, speed) pair AE
   * stores reconstructs the exact handle point that was drawn. (The old code
   * clamped influence but computed speed from the raw x, so a sub-0.1%-influence
   * handle round-tripped to a different, steeper/overshooting curve than drawn.)
   *
   * @param {{x1:number,y1:number,x2:number,y2:number}} h handle coordinates
   * @param {number} dv value delta between the two keyframes
   * @param {number} dt time delta in seconds between the two keyframes
   * @returns {{out:{influence:number,speed:number},in:{influence:number,speed:number}}}
   */
  function bezierToTemporalEase(h, dv, dt) {
    var avgSpeed = dt !== 0 ? dv / dt : 0;
    var s = sanitizeHandles(h);
    var inDen = 1 - s.x2;

    return {
      out: { influence: s.x1 * 100, speed: (s.y1 / s.x1) * avgSpeed },
      in: { influence: inDen * 100, speed: ((1 - s.y2) / inDen) * avgSpeed },
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
    sanitizeHandles: sanitizeHandles,
    clamp: clamp,
  };
});
