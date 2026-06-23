/**
 * Rebound, velocity-driven overshoot (follow-through) math.
 *
 * This is the baked-keyframe twin of the classic After Effects overshoot
 * expression:
 *
 *   v = velocityAtTime(key.time - frameDuration/10);
 *   value + v * amp * Math.sin(freq * t * 2*PI) / Math.exp(decay * t);
 *
 * After a property lands on a keyframe it keeps moving in the direction it was
 * travelling, then oscillates back and settles, a damped sine whose amplitude
 * is proportional to the speed of arrival. The host multiplies this shape by the
 * real per-dimension velocity it samples; here we only describe the normalized
 * shape s(t) = sin(2*PI*freq*t) * exp(-decay*t) and, crucially, the EXACT times
 * of its peaks/valleys so the curve can be baked with a few keyframes (one per
 * extremum) instead of one per frame.
 *
 * t is in SECONDS (real time after the landing keyframe), not normalized [0,1].
 *
 * The host (host/commands/recoil.jsx) duplicates the extrema-phase and
 * autoDuration math because code cannot cross the CEP boundary. This file is the
 * unit-tested source of truth; keep the two in sync.
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.easing = root.Rebound.easing || {};
  root.Rebound.easing.overshoot = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PI = Math.PI;

  // The normalized follow-through shape: a unit damped sine. s(0) = 0, rises to
  // a first peak, then oscillates with an exp(-decay*t) envelope toward 0.
  function dampedSine(freq, decay) {
    var omega = 2 * PI * freq;
    return function (t) {
      if (t <= 0) return 0;
      return Math.sin(omega * t) * Math.exp(-decay * t);
    };
  }

  // Exact times (seconds) where s'(t) = 0 within (0, dur]: the peaks and
  // valleys. s'(t) = e^{-decay t}(omega*cos(omega t) - decay*sin(omega t)) = 0
  // => tan(omega t) = omega/decay => omega t = atan2(omega, decay) + k*PI.
  function extremaTimes(freq, decay, dur) {
    var omega = 2 * PI * freq;
    var phase = Math.atan2(omega, decay); // in (0, PI/2) for omega,decay > 0
    var out = [];
    for (var k = 0; ; k++) {
      var t = (phase + k * PI) / omega;
      if (t >= dur) break;
      out.push(t);
      if (out.length > 256) break; // safety; never reached for sane inputs
    }
    return out;
  }

  // How long to bake for: until the envelope decays below ~0.8% of the start,
  // clamped to a sane window. Low decay never fully settles, so we cap it.
  function autoDuration(decay) {
    var d = Math.log(120) / Math.max(0.4, decay);
    if (d < 0.25) return 0.25;
    if (d > 2.0) return 2.0;
    return d;
  }

  // Sparse { t, s } anchors for baking: the start (0,0), every extremum, and the
  // end of the window. t in seconds, s the normalized shape value. The host
  // places a keyframe at landingTime + t with value landing + velocity*amp*s.
  function followThroughAnchors(freq, decay, dur) {
    if (!(dur > 0)) dur = autoDuration(decay);
    var s = dampedSine(freq, decay);
    var anchors = [{ t: 0, s: 0 }];
    var ext = extremaTimes(freq, decay, dur);
    for (var i = 0; i < ext.length; i++) anchors.push({ t: ext[i], s: s(ext[i]) });
    // Close the window on a real sample so the baked curve stays continuous.
    var last = anchors[anchors.length - 1];
    if (dur - last.t > 1e-4) anchors.push({ t: dur, s: s(dur) });
    return anchors;
  }

  return {
    dampedSine: dampedSine,
    extremaTimes: extremaTimes,
    autoDuration: autoDuration,
    followThroughAnchors: followThroughAnchors
  };
});
