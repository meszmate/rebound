/*
 * Rebound, built-in easing presets.
 *
 * The classic Penner family expressed as resolution-independent cubic-bezier
 * tuples (the widely-published easings.net control points), so each preset
 * retargets to any distance/duration. These ship read-only; users duplicate to
 * edit. Overshooting members (Back) intentionally carry handles outside [0,1].
 */
;(function (R) {
  'use strict';

  function p(id, name, collection, x1, y1, x2, y2, tags) {
    return {
      id: id,
      name: name,
      collection: collection,
      builtin: true,
      tags: tags || [],
      curve: { type: 'bezier', x1: x1, y1: y1, x2: x2, y2: y2 }
    };
  }

  // A Penner curve that overshoots/oscillates (elastic) and so can't be a single
  // cubic-bezier; it applies by baking samples to keyframes, like a spring.
  function pp(id, name, collection, pennerName, tags) {
    return {
      id: id,
      name: name,
      collection: collection,
      builtin: true,
      tags: tags || [],
      curve: { type: 'penner', name: pennerName }
    };
  }

  var presets = [
    p('linear', 'Linear', 'Basic', 0, 0, 1, 1, ['linear', 'constant']),

    p('sine-in', 'Sine In', 'Sine', 0.12, 0, 0.39, 0, ['gentle', 'in']),
    p('sine-out', 'Sine Out', 'Sine', 0.61, 1, 0.88, 1, ['gentle', 'out']),
    p('sine-inout', 'Sine In Out', 'Sine', 0.37, 0, 0.63, 1, ['gentle', 'inout']),

    p('quad-in', 'Quad In', 'Quad', 0.11, 0, 0.5, 0, ['in']),
    p('quad-out', 'Quad Out', 'Quad', 0.5, 1, 0.89, 1, ['out']),
    p('quad-inout', 'Quad In Out', 'Quad', 0.45, 0, 0.55, 1, ['inout']),

    p('cubic-in', 'Cubic In', 'Cubic', 0.32, 0, 0.67, 0, ['in']),
    p('cubic-out', 'Cubic Out', 'Cubic', 0.33, 1, 0.68, 1, ['out', 'snappy']),
    p('cubic-inout', 'Cubic In Out', 'Cubic', 0.65, 0, 0.35, 1, ['inout']),

    p('quart-in', 'Quart In', 'Quart', 0.5, 0, 0.75, 0, ['in']),
    p('quart-out', 'Quart Out', 'Quart', 0.25, 1, 0.5, 1, ['out', 'snappy']),
    p('quart-inout', 'Quart In Out', 'Quart', 0.76, 0, 0.24, 1, ['inout']),

    p('quint-in', 'Quint In', 'Quint', 0.64, 0, 0.78, 0, ['in']),
    p('quint-out', 'Quint Out', 'Quint', 0.22, 1, 0.36, 1, ['out', 'snappy']),
    p('quint-inout', 'Quint In Out', 'Quint', 0.83, 0, 0.17, 1, ['inout']),

    p('expo-in', 'Expo In', 'Expo', 0.7, 0, 0.84, 0, ['in', 'sharp']),
    p('expo-out', 'Expo Out', 'Expo', 0.16, 1, 0.3, 1, ['out', 'sharp']),
    p('expo-inout', 'Expo In Out', 'Expo', 0.87, 0, 0.13, 1, ['inout', 'sharp']),

    p('circ-in', 'Circ In', 'Circ', 0.55, 0, 1, 0.45, ['in']),
    p('circ-out', 'Circ Out', 'Circ', 0, 0.55, 0.45, 1, ['out']),
    p('circ-inout', 'Circ In Out', 'Circ', 0.85, 0, 0.15, 1, ['inout']),

    p('back-in', 'Back In', 'Back', 0.36, 0, 0.66, -0.56, ['anticipate', 'overshoot', 'in']),
    p('back-out', 'Back Out', 'Back', 0.34, 1.56, 0.64, 1, ['overshoot', 'out']),
    p('back-inout', 'Back In Out', 'Back', 0.68, -0.6, 0.32, 1.6, ['overshoot', 'inout']),

    // Elastic oscillates past the target and rings out, so it bakes to keyframes.
    pp('elastic-in', 'Elastic In', 'Elastic', 'elasticIn', ['overshoot', 'elastic', 'in']),
    pp('elastic-out', 'Elastic Out', 'Elastic', 'elasticOut', ['overshoot', 'elastic', 'out']),
    pp('elastic-inout', 'Elastic In Out', 'Elastic', 'elasticInOut', ['overshoot', 'elastic', 'inout'])
  ];

  R.presets = R.presets || {};
  R.presets.defaults = presets;
})(window.Rebound = window.Rebound || {});
