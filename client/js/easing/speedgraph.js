/**
 * Rebound, speed-graph view of a cubic-bezier ease.
 *
 * After Effects' Graph Editor defaults to the SPEED graph (velocity over time),
 * while a CSS-style cubic-bezier is a VALUE/progress curve. They describe the
 * same ease but look completely different (an S-curve in value space is a hump
 * in speed space), which is endlessly confusing. This module lets the editor
 * render and edit the SAME `{x1,y1,x2,y2}` curve as a speed graph, 1:1 with AE.
 *
 * Speeds here are NORMALIZED: 1 == the segment's average speed (dv/dt), so the
 * view is value-delta independent. Multiply by avg to get real units/second
 * (exactly bezier.bezierToTemporalEase). The endpoint relationships are:
 *   start speed s1 = y1 / x1            (slope of the value curve at t=0)
 *   end   speed s2 = (1 - y2)/(1 - x2)  (slope at t=1)
 *   x1 = outInfluence,  1-x2 = inInfluence
 * which is why the handle's X is influence and its height is speed.
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.easing = root.Rebound.easing || {};
  root.Rebound.easing.speedgraph = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Parametric cubic coefficients for control points (0, c1, c2, 1).
  function coeffs(c1, c2) {
    var c = 3 * c1;
    var b = 3 * (c2 - c1) - c;
    var a = 1 - c - b;
    return { a: a, b: b, c: c };
  }
  function val(co, t) { return ((co.a * t + co.b) * t + co.c) * t; }
  function deriv(co, t) { return (3 * co.a * t + 2 * co.b) * t + co.c; }

  // Normalized start/end speeds (avg == 1). Matches the x1===0 / 1-x2===0 guards
  // in bezier.bezierToTemporalEase so the speed graph agrees with what Apply sets.
  function endpointSpeeds(curve) {
    var den = 1 - curve.x2;
    return {
      start: curve.x1 === 0 ? 0 : curve.y1 / curve.x1,
      end: den === 0 ? 0 : (1 - curve.y2) / den
    };
  }

  // Set y1 so the start speed becomes `s` (influence/x1 unchanged).
  function withStartSpeed(curve, s) {
    var out = { type: 'bezier', x1: curve.x1, y1: s * curve.x1, x2: curve.x2, y2: curve.y2 };
    return out;
  }
  // Set y2 so the end speed becomes `s` (influence/x2 unchanged).
  function withEndSpeed(curve, s) {
    return { type: 'bezier', x1: curve.x1, y1: curve.y1, x2: curve.x2, y2: 1 - s * (1 - curve.x2) };
  }

  // Sample the speed profile as { x: time 0..1, s: normalized speed }. X(t) is
  // monotonic for handles in [0,1], so x spans [0,1]; the endpoints equal
  // endpointSpeeds(). A near-zero dX/dt (e.g. x1 == 0) is floored so an instant
  // start renders as a tall finite spike instead of Infinity.
  function sampleSpeed(curve, segments) {
    segments = segments || 96;
    var cx = coeffs(curve.x1, curve.x2);
    var cy = coeffs(curve.y1, curve.y2);
    var ends = endpointSpeeds(curve);
    var pts = [];
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var s;
      if (i === 0) s = ends.start;
      else if (i === segments) s = ends.end;
      else {
        var dx = deriv(cx, t);
        s = dx > 1e-4 ? deriv(cy, t) / dx : ends.start;
      }
      pts.push({ x: val(cx, t), s: s });
    }
    return pts;
  }

  // Min/max normalized speed across the profile, so the editor can scale its Y.
  function speedRange(curve, segments) {
    var pts = sampleSpeed(curve, segments || 160);
    var min = 0, max = 1;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].s < min) min = pts[i].s;
      if (pts[i].s > max) max = pts[i].s;
    }
    return { min: min, max: max };
  }

  return {
    endpointSpeeds: endpointSpeeds,
    withStartSpeed: withStartSpeed,
    withEndSpeed: withEndSpeed,
    sampleSpeed: sampleSpeed,
    speedRange: speedRange
  };
});
