/*
 * Rebound — tool demo overrides.
 * Loaded after the generated demos to replace any that read poorly. Animating a
 * path's `d` between mismatched shapes looks like the line "snapping", so these
 * use crossfades / transforms instead.
 */
;(function (R) {
  'use strict';
  if (!R.registerToolDemo) return;

  // Smooth: jagged keyframe dots settle into place with a buttery overshoot
  // while the flowing curve draws on through them, then gently re-jitter and
  // loop. The curve's `d` never morphs (it is fixed at the settled shape and
  // revealed via stroke-dashoffset), so there is no snapping.
  var DUR = '4s';
  var KT = '0;0.42;0.82;1';
  // jagged settle hold rejitter: overshoot in, hold, ease back.
  var EASE_CY = '0.34 1.45 0.5 1;0 0 1 1;0.5 0 0.6 1';
  var EASE_DRAW = '0.4 0 0.15 1;0 0 1 1;0.5 0 0.6 1';

  function vertex(cx, jag, set) {
    return '<circle cx="' + cx + '" cy="' + jag + '" r="2.7">' +
      '<animate attributeName="cy" values="' + jag + ';' + set + ';' + set + ';' + jag + '" ' +
      'keyTimes="' + KT + '" dur="' + DUR + '" calcMode="spline" keySplines="' + EASE_CY + '" repeatCount="indefinite"/></circle>';
  }

  R.registerToolDemo(
    'smooth',
    '<strong>Smooth keyframes.</strong> Jagged keys settle into a flowing curve with a buttery overshoot, then re-jitter and repeat.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="12" y1="59" x2="108" y2="59" stroke="var(--rb-border)" stroke-width="1"/>' +
      '<path fill="none" style="stroke:var(--rb-accent)" stroke-width="2" stroke-linecap="round" ' +
        'd="M14 42 C21 38 27 33 33 33 C41 33 46 37 52 37 C59 37 64 33 71 33 C78 33 84 35 90 35 C96 35 102 36 106 36" ' +
        'stroke-dasharray="170" stroke-dashoffset="170">' +
        '<animate attributeName="stroke-dashoffset" values="170;0;0;170" keyTimes="' + KT + '" dur="' + DUR + '" ' +
        'calcMode="spline" keySplines="' + EASE_DRAW + '" repeatCount="indefinite"/></path>' +
      '<g style="fill:var(--rb-accent)">' +
        vertex(14, 50, 42) + vertex(33, 16, 33) + vertex(52, 54, 37) +
        vertex(71, 18, 33) + vertex(90, 48, 35) + vertex(106, 30, 36) +
      '</g>' +
      '</svg>'
  );
})(window.Rebound = window.Rebound || {});
