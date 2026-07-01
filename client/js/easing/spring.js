/**
 * Rebound, physical spring (damped harmonic oscillator).
 *
 * This drives Rebound's signature "bouncy / overshoot" easing, modelled the
 * same way SwiftUI / iOS springs are: a mass on a spring with damping, released
 * from a displacement and settling toward its target. Depending on the damping
 * ratio it overshoots (underdamped), arrives crisply (critically damped) or
 * crawls in (overdamped).
 *
 * We solve the IVP for normalized motion from 0 -> 1. Let y = x - 1 be the
 * displacement from the target, so y(0) = -1 and y'(0) = v0 (initial velocity).
 *
 *   x'' + 2*zeta*w0*x' + w0^2*(x - 1) = 0
 *
 * with w0 = sqrt(k/m) the natural angular frequency and zeta = c / (2*sqrt(k*m))
 * the damping ratio. Closed-form solutions per regime are below.
 *
 * Two friendly parameterizations are supported and converted to (mass,
 * stiffness, damping, velocity):
 *   - physical:  { mass, stiffness, damping, velocity }
 *   - perceptual:{ response, bounce } (Apple `spring(duration:bounce:)`)
 *   - perceptual:{ response, dampingFraction } (Apple `spring(response:dampingFraction:)`)
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.easing = root.Rebound.easing || {};
  root.Rebound.easing.spring = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TWO_PI = Math.PI * 2;

  function num(v, dflt) {
    return typeof v === 'number' && isFinite(v) ? v : dflt;
  }

  /**
   * Normalize any supported config into physical { mass, stiffness, damping,
   * velocity }. `velocity` is the normalized initial velocity (units of the
   * full 0..1 travel per second).
   */
  function resolveParams(opts) {
    opts = opts || {};

    // Perceptual: Apple spring(duration:bounce:).
    if (opts.response != null && opts.bounce != null) {
      var mass = num(opts.mass, 1);
      var w0 = TWO_PI / Math.max(opts.response, 1e-4);
      var bounce = opts.bounce;
      var zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
      var k = w0 * w0 * mass;
      var c = 2 * zeta * w0 * mass;
      return {
        mass: mass,
        stiffness: k,
        damping: c,
        velocity: num(opts.velocity, 0),
      };
    }

    // Perceptual: Apple spring(response:dampingFraction:).
    if (opts.response != null && opts.dampingFraction != null) {
      var m2 = num(opts.mass, 1);
      var w = TWO_PI / Math.max(opts.response, 1e-4);
      var z = opts.dampingFraction;
      return {
        mass: m2,
        stiffness: w * w * m2,
        damping: 2 * z * w * m2,
        velocity: num(opts.velocity, 0),
      };
    }

    // Physical.
    return {
      mass: num(opts.mass, 1),
      stiffness: num(opts.stiffness, 100),
      damping: num(opts.damping, 10),
      velocity: num(opts.velocity, 0),
    };
  }

  /**
   * Build a spring easing function and report derived properties.
   * Returns { fn, settleTime, omega0, zeta, regime, params }.
   *   fn(t) -> displacement curve value at time t seconds (target = 1).
   */
  function spring(opts) {
    var p = resolveParams(opts);
    var m = p.mass;
    var k = p.stiffness;
    var c = p.damping;
    var v0 = p.velocity;

    var w0 = Math.sqrt(k / m); // natural angular frequency
    var zeta = c / (2 * Math.sqrt(k * m)); // damping ratio
    var fn;
    var regime;

    if (zeta < 1) {
      // Underdamped: oscillates and overshoots.
      regime = 'underdamped';
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      var A = -1;
      // x'(0) = -zeta*w0*A + wd*B must equal v0, so B = (v0 + zeta*w0*A)/wd.
      // With A = -1 that is (v0 - zeta*w0)/wd — the spring is released from REST
      // when velocity is 0 (a previous sign slip left it launching at 2*zeta*w0,
      // which also made the real overshoot ~2x the reported figure).
      var B = (v0 + zeta * w0 * A) / wd;
      fn = function (t) {
        var env = Math.exp(-zeta * w0 * t);
        return 1 + env * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
      };
    } else if (zeta === 1 || Math.abs(zeta - 1) < 1e-6) {
      // Critically damped.
      regime = 'critical';
      var A2 = -1;
      var B2 = v0 + w0 * A2; // y'(0) = -w0*A2 + B2 = v0 => B2 = v0 - w0 (rest release)
      fn = function (t) {
        return 1 + Math.exp(-w0 * t) * (A2 + B2 * t);
      };
    } else {
      // Overdamped.
      regime = 'overdamped';
      var s = w0 * Math.sqrt(zeta * zeta - 1);
      var r1 = -zeta * w0 + s;
      var r2 = -zeta * w0 - s;
      var C1 = (v0 + r2) / (r1 - r2);
      var C2 = -1 - C1;
      fn = function (t) {
        return 1 + C1 * Math.exp(r1 * t) + C2 * Math.exp(r2 * t);
      };
    }

    return {
      fn: fn,
      omega0: w0,
      zeta: zeta,
      regime: regime,
      settleTime: settleTime(w0, zeta),
      params: p,
    };
  }

  /**
   * Estimate the time (seconds) for the spring to settle within `epsilon` of
   * its target and stay there. The decay envelope is e^(-zeta*w0*t), so the
   * amplitude falls below epsilon at t = -ln(epsilon) / (zeta*w0).
   */
  function settleTime(w0, zeta, epsilon) {
    epsilon = epsilon || 0.005; // 0.5% of travel
    var decay = zeta * w0;
    if (decay <= 0) return Infinity;
    return -Math.log(epsilon) / decay;
  }

  /**
   * Convenience: a spring as a normalized easing over [0, 1] time, scaling its
   * own settle time onto the unit interval. Useful for previewing the curve
   * shape independent of real duration.
   */
  function springNormalized(opts) {
    var s = spring(opts);
    var dur = isFinite(s.settleTime) ? s.settleTime : 1;
    var ease = function (tNorm) {
      if (tNorm <= 0) return 0;
      if (tNorm >= 1) return 1;
      return s.fn(tNorm * dur);
    };
    ease.spec = s;
    return ease;
  }

  return {
    resolveParams: resolveParams,
    spring: spring,
    springNormalized: springNormalized,
    settleTime: settleTime,
  };
});
