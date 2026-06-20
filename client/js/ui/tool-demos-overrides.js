/*
 * Rebound — tool demo overrides.
 * Loaded after the generated demos to replace any that read poorly. Animating a
 * path's `d` between mismatched shapes looks like the line "snapping", so these
 * use crossfades / transforms instead.
 */
;(function (R) {
  'use strict';
  if (!R.registerToolDemo) return;

  // Smooth: a jagged value path crossfades into a flowing curve (no d morph).
  R.registerToolDemo(
    'smooth',
    '<strong>Smooth keyframes.</strong> A jagged value path relaxes into a flowing curve, easing out the jitter.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<g opacity="1"><animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.38;0.5;0.88;1" dur="4.5s" repeatCount="indefinite"/>' +
      '<path fill="none" style="stroke:var(--rb-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M16 48 L33 20 L50 52 L67 18 L84 50 L104 26"/>' +
      '<g style="fill:var(--rb-accent)"><circle cx="16" cy="48" r="2.6"/><circle cx="33" cy="20" r="2.6"/><circle cx="50" cy="52" r="2.6"/><circle cx="67" cy="18" r="2.6"/><circle cx="84" cy="50" r="2.6"/><circle cx="104" cy="26" r="2.6"/></g></g>' +
      '<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.38;0.5;0.88;1" dur="4.5s" repeatCount="indefinite"/>' +
      '<path fill="none" style="stroke:var(--rb-accent)" stroke-width="2" stroke-linecap="round" d="M16 42 C33 34 38 35 50 35 C64 35 70 33 84 34 C95 35 100 35 104 35"/>' +
      '<g style="fill:var(--rb-accent)"><circle cx="16" cy="42" r="2.6"/><circle cx="33" cy="35" r="2.6"/><circle cx="50" cy="35" r="2.6"/><circle cx="67" cy="34" r="2.6"/><circle cx="84" cy="34" r="2.6"/><circle cx="104" cy="35" r="2.6"/></g></g>' +
      '</svg>'
  );
})(window.Rebound = window.Rebound || {});
