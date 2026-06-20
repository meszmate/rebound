/*
 * Rebound, tool demos.
 *
 * Each entry is a self-contained animated SVG (SMIL) that loops a small,
 * legible illustration of what the tool does, plus a one-or-two sentence
 * caption. The shell injects { svg, caption } above a tool's controls. SVGs use
 * currentColor for neutral parts and style="...var(--rb-accent)..." for accent
 * parts, so they recolor with the host theme.
 *
 * Easing/spring/physics tools use the live Preview Stage instead and are not
 * listed here. This file is appended to by the per-tool demo batches.
 */
;(function (R) {
  'use strict';

  function demo(caption, svg) { return { caption: caption, svg: svg }; }

  var D = {};

  // Anchor, the layer stays put while the anchor marker tours its 9 points.
  D.anchor = demo(
    'Moves the layer’s <strong>anchor point</strong> to any of nine bounding-box points, the layer itself does not move (Position is compensated).',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="34" y="18" width="52" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>' +
      '<g fill="currentColor" opacity="0.25">' +
      '<circle cx="34" cy="18" r="1.5"/><circle cx="60" cy="18" r="1.5"/><circle cx="86" cy="18" r="1.5"/>' +
      '<circle cx="34" cy="36" r="1.5"/><circle cx="60" cy="36" r="1.5"/><circle cx="86" cy="36" r="1.5"/>' +
      '<circle cx="34" cy="54" r="1.5"/><circle cx="60" cy="54" r="1.5"/><circle cx="86" cy="54" r="1.5"/></g>' +
      '<g style="fill:var(--rb-accent);stroke:var(--rb-accent)">' +
      '<circle cx="0" cy="0" r="3.6" fill="none" stroke-width="1.6"/>' +
      '<line x1="-5.5" y1="0" x2="5.5" y2="0" stroke-width="1.2"/>' +
      '<line x1="0" y1="-5.5" x2="0" y2="5.5" stroke-width="1.2"/>' +
      '<animateTransform attributeName="transform" type="translate" ' +
      'values="60,36; 34,18; 86,18; 86,54; 34,54; 60,36" ' +
      'keyTimes="0;0.2;0.4;0.6;0.8;1" dur="6s" calcMode="linear" repeatCount="indefinite"/></g>' +
      '</svg>'
  );

  // Align, three scattered boxes slide their left edges onto a shared guide.
  D.align = demo(
    'Snaps the selected layers to a shared <strong>edge or center</strong>, relative to the composition or the selection bounds.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="30" y1="8" x2="30" y2="64" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>' +
      '<g style="fill:var(--rb-accent)">' +
      '<rect y="13" width="24" height="12" rx="2"><animate attributeName="x" values="66;31;31;66" keyTimes="0;0.35;0.82;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '<rect y="30" width="24" height="12" rx="2"><animate attributeName="x" values="82;31;31;82" keyTimes="0;0.4;0.82;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '<rect y="47" width="24" height="12" rx="2"><animate attributeName="x" values="52;31;31;52" keyTimes="0;0.3;0.82;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '</g></svg>'
  );

  // Multiply, a base layer fans out into a progressively offset stack.
  D.multiply = demo(
    'Duplicates a layer into a <strong>progressively offset stack</strong>, each copy stepped in position, rotation, scale, or time.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="20" y="28" width="26" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>' +
      '<g style="fill:var(--rb-accent)">' +
      '<rect x="38" y="23" width="26" height="20" rx="3" opacity="0"><animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.25;0.85;1" dur="3.4s" begin="0.2s" repeatCount="indefinite"/></rect>' +
      '<rect x="56" y="18" width="26" height="20" rx="3" opacity="0"><animate attributeName="opacity" values="0;0.55;0.55;0" keyTimes="0;0.3;0.85;1" dur="3.4s" begin="0.45s" repeatCount="indefinite"/></rect>' +
      '<rect x="74" y="13" width="26" height="20" rx="3" opacity="0"><animate attributeName="opacity" values="0;0.4;0.4;0" keyTimes="0;0.35;0.85;1" dur="3.4s" begin="0.7s" repeatCount="indefinite"/></rect>' +
      '</g></svg>'
  );

  // Card visuals for the four tools that use the interactive Preview Stage on
  // their page (these captions are not shown on the page, only the SVG in cards).
  D.ease = demo(
    'Shape a cubic-bezier and apply it to your keyframes.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<path d="M16 54 C 44 54, 60 18, 104 18" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>' +
      '<circle r="5" style="fill:var(--rb-accent)">' +
      '<animateMotion dur="2.8s" repeatCount="indefinite" keyPoints="0;1;1;0" keyTimes="0;0.45;0.55;1" calcMode="linear" ' +
      'path="M16 54 C 44 54, 60 18, 104 18"/></circle></svg>'
  );
  D.spring = demo('Physical spring with real overshoot.', springCardSvg(1.2));
  D.recoil = demo('Velocity-driven overshoot.', springCardSvg(1.28));
  D.bounce = demo('Gravitational rebound.', springCardSvg(1.14));

  function springCardSvg(peak) {
    return '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<g transform="translate(60,38)"><rect x="-17" y="-13" width="34" height="26" rx="5" style="fill:var(--rb-accent)">' +
      '<animateTransform attributeName="transform" type="scale" ' +
      'values="0.2;' + peak + ';0.9;1.06;0.98;1;0.2" ' +
      'keyTimes="0;0.42;0.58;0.72;0.84;0.92;1" dur="3.2s" repeatCount="indefinite"/></rect></g></svg>';
  }

  R.toolDemos = D;
  R.registerToolDemo = function (id, caption, svg) { D[id] = demo(caption, svg); };
})(window.Rebound = window.Rebound || {});
