/**
 * Rebound — Penner easing equations.
 *
 * Robert Penner's classic easing set, normalized to take a progress value
 * t in [0, 1] and return an eased value (also roughly [0, 1], though `back`
 * and `elastic` intentionally overshoot outside that range).
 *
 * These functions describe the *shape* of a curve. Monotonic shapes can be
 * applied to AE keyframes as a fitted bezier ease; overshooting / oscillating
 * shapes (back, elastic, bounce) are applied by baking samples or via an
 * expression — see sampler.js.
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.easing = root.Rebound.easing || {};
  root.Rebound.easing.penner = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PI = Math.PI;
  var c1 = 1.70158; // standard "back" overshoot constant
  var c2 = c1 * 1.525;
  var c3 = c1 + 1;
  var c4 = (2 * PI) / 3;
  var c5 = (2 * PI) / 4.5;
  var n1 = 7.5625;
  var d1 = 2.75;

  function bounceOut(t) {
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }

  // Each entry is a pure function of t in [0, 1].
  var fns = {
    linear: function (t) {
      return t;
    },

    quadIn: function (t) {
      return t * t;
    },
    quadOut: function (t) {
      return 1 - (1 - t) * (1 - t);
    },
    quadInOut: function (t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    cubicIn: function (t) {
      return t * t * t;
    },
    cubicOut: function (t) {
      return 1 - Math.pow(1 - t, 3);
    },
    cubicInOut: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    quartIn: function (t) {
      return t * t * t * t;
    },
    quartOut: function (t) {
      return 1 - Math.pow(1 - t, 4);
    },
    quartInOut: function (t) {
      return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    },

    quintIn: function (t) {
      return t * t * t * t * t;
    },
    quintOut: function (t) {
      return 1 - Math.pow(1 - t, 5);
    },
    quintInOut: function (t) {
      return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    },

    sineIn: function (t) {
      return 1 - Math.cos((t * PI) / 2);
    },
    sineOut: function (t) {
      return Math.sin((t * PI) / 2);
    },
    sineInOut: function (t) {
      return -(Math.cos(PI * t) - 1) / 2;
    },

    expoIn: function (t) {
      return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    },
    expoOut: function (t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    },
    expoInOut: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },

    circIn: function (t) {
      return 1 - Math.sqrt(1 - Math.pow(t, 2));
    },
    circOut: function (t) {
      return Math.sqrt(1 - Math.pow(t - 1, 2));
    },
    circInOut: function (t) {
      return t < 0.5
        ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
        : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    },

    backIn: function (t) {
      return c3 * t * t * t - c1 * t * t;
    },
    backOut: function (t) {
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    backInOut: function (t) {
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },

    elasticIn: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    elasticOut: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    elasticInOut: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    },

    bounceIn: function (t) {
      return 1 - bounceOut(1 - t);
    },
    bounceOut: bounceOut,
    bounceInOut: function (t) {
      return t < 0.5
        ? (1 - bounceOut(1 - 2 * t)) / 2
        : (1 + bounceOut(2 * t - 1)) / 2;
    },
  };

  /**
   * Look up an easing function by name. Returns linear for unknown names.
   */
  function get(name) {
    return fns[name] || fns.linear;
  }

  /** Names that overshoot or oscillate and therefore can't be a single bezier. */
  var NON_MONOTONIC = [
    'backIn', 'backOut', 'backInOut',
    'elasticIn', 'elasticOut', 'elasticInOut',
    'bounceIn', 'bounceOut', 'bounceInOut',
  ];

  function isMonotonic(name) {
    return NON_MONOTONIC.indexOf(name) === -1;
  }

  return {
    fns: fns,
    get: get,
    names: Object.keys(fns),
    isMonotonic: isMonotonic,
  };
});
