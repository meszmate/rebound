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
  // Ease: a dot eases along a curve.
  D.ease = demo(
    'Shape a cubic-bezier and apply it to your keyframes.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<path d="M16 54 C 44 54, 60 18, 104 18" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>' +
      '<circle r="5" style="fill:var(--rb-accent)">' +
      '<animateMotion dur="2.8s" repeatCount="indefinite" keyPoints="0;1;1;0" keyTimes="0;0.45;0.55;1" calcMode="linear" ' +
      'path="M16 54 C 44 54, 60 18, 104 18"/></circle></svg>'
  );

  // Spring: a box pops in with overshoot and settles (scale).
  D.spring = demo('Physical spring with real overshoot.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet"><g transform="translate(60,38)">' +
    '<rect x="-17" y="-13" width="34" height="26" rx="5" style="fill:var(--rb-accent)">' +
    '<animateTransform attributeName="transform" type="scale" values="0.15;1.2;0.9;1.07;0.97;1;1;0.15" ' +
    'keyTimes="0;0.4;0.55;0.69;0.81;0.9;0.97;1" dur="3.2s" calcMode="spline" ' +
    'keySplines="0.3 0 0.3 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0 0 1 1" repeatCount="indefinite"/>' +
    '</rect></g></svg>');

  // Recoil: a box flies in toward its mark and oscillates back to rest (horizontal).
  D.recoil = demo('Velocity-driven overshoot after a keyframe.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
    '<line x1="60" y1="16" x2="60" y2="56" stroke="currentColor" stroke-width="1" stroke-dasharray="2 3" opacity="0.3"/>' +
    '<rect x="45" y="24" width="30" height="24" rx="4" style="fill:var(--rb-accent)">' +
    '<animateTransform attributeName="transform" type="translate" values="-62,0;0,0;17,0;-10,0;6,0;-3,0;1,0;0,0" ' +
    'keyTimes="0;0.3;0.42;0.55;0.68;0.79;0.88;1" dur="3.3s" calcMode="spline" ' +
    'keySplines="0.45 0 0.1 1;0.3 0 0.5 1;0.3 0 0.5 1;0.3 0 0.5 1;0.3 0 0.5 1;0.3 0 0.5 1;0 0 1 1" repeatCount="indefinite"/>' +
    '</rect></svg>');

  // Bounce: a ball drops and rebounds off a floor, each bounce smaller.
  D.bounce = demo('Gravitational rebound, each bounce smaller.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
    '<line x1="18" y1="58" x2="102" y2="58" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>' +
    '<circle cx="60" r="8" style="fill:var(--rb-accent)">' +
    '<animate attributeName="cy" values="14;50;30;50;39;50;45;50;14" ' +
    'keyTimes="0;0.26;0.42;0.56;0.68;0.78;0.87;0.96;1" dur="2.8s" calcMode="spline" ' +
    'keySplines="0.4 0 1 0.6;0.1 0.5 0.5 1;0.4 0 1 0.6;0.1 0.5 0.5 1;0.4 0 1 0.6;0.1 0.5 0.5 1;0.4 0 1 0.6;0 0 1 1" repeatCount="indefinite"/>' +
    '</circle></svg>');

  // Import: a design (text + shapes) on the left streams across into an After
  // Effects comp on the right, landing as native layer bars, one by one.
  D.import = demo(
    'Sends a <strong>Figma</strong>, <strong>Illustrator</strong>, or <strong>Photoshop</strong> design across as native, <strong>editable</strong> After Effects layers.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="6" y="15" width="42" height="42" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>' +
      '<g style="fill:var(--rb-accent)">' +
      '<rect x="13" y="23" width="22" height="4" rx="2" opacity="0.9"/>' +
      '<circle cx="19" cy="43" r="6" opacity="0.85"/>' +
      '<rect x="29" y="38" width="13" height="11" rx="2" opacity="0.6"/></g>' +
      '<rect x="72" y="15" width="42" height="42" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>' +
      '<g style="fill:var(--rb-accent)">' +
      '<rect x="79" y="24" width="28" height="5" rx="2"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.22;0.9;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '<rect x="79" y="33" width="28" height="5" rx="2"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.22;0.42;0.9;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '<rect x="79" y="42" width="28" height="5" rx="2"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.42;0.62;0.9;1" dur="4s" repeatCount="indefinite"/></rect></g>' +
      '<g stroke="currentColor" opacity="0.4" fill="none">' +
      '<line x1="50" y1="36" x2="69" y2="36" stroke-width="1.2" stroke-dasharray="2 2"/>' +
      '<path d="M66 33 l3 3 -3 3" stroke-width="1.2"/></g>' +
      '<g style="fill:var(--rb-accent)">' +
      '<circle cy="36" r="2.4" opacity="0"><animate attributeName="cx" values="50;70" dur="1.35s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" dur="1.35s" repeatCount="indefinite"/></circle>' +
      '<circle cy="36" r="2.4" opacity="0"><animate attributeName="cx" values="50;70" dur="1.35s" begin="0.67s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" dur="1.35s" begin="0.67s" repeatCount="indefinite"/></circle></g>' +
      '</svg>'
  );

  // Pin Rig: a controller null moves and the puppet mesh corner follows it.
  D.pins = demo(
    'Binds Puppet pins to <strong>controller nulls</strong>, animate the nulls and the mesh follows.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<path style="fill:var(--rb-accent)" fill-opacity="0.18" stroke="var(--rb-accent)" stroke-opacity="0.5" d="M30 26 L80 26 L80 52 L30 52 Z">' +
      '<animate attributeName="d" values="M30 26 L80 26 L80 52 L30 52 Z;M30 26 L96 14 L80 52 L30 52 Z;M30 26 L80 26 L80 52 L30 52 Z" dur="3s" repeatCount="indefinite"/>' +
      '</path>' +
      '<line x1="80" y1="26" x2="94" y2="18" stroke="var(--rb-accent)" stroke-width="1" stroke-dasharray="2 2" stroke-opacity="0.6">' +
      '<animate attributeName="x1" values="80;96;80" dur="3s" repeatCount="indefinite"/><animate attributeName="y1" values="26;14;26" dur="3s" repeatCount="indefinite"/>' +
      '<animate attributeName="x2" values="94;110;94" dur="3s" repeatCount="indefinite"/><animate attributeName="y2" values="18;6;18" dur="3s" repeatCount="indefinite"/></line>' +
      '<g fill="var(--rb-accent)"><circle cx="30" cy="26" r="2.6"/><circle cx="30" cy="52" r="2.6"/><circle cx="80" cy="52" r="2.6"/>' +
      '<circle cx="80" cy="26" r="2.6"><animate attributeName="cx" values="80;96;80" dur="3s" repeatCount="indefinite"/><animate attributeName="cy" values="26;14;26" dur="3s" repeatCount="indefinite"/></circle></g>' +
      '<rect x="91" y="15" width="6" height="6" fill="none" stroke="var(--rb-accent)" stroke-width="1.4">' +
      '<animateTransform attributeName="transform" type="translate" values="0 0;16 -12;0 0" dur="3s" repeatCount="indefinite"/></rect>' +
      '</svg>'
  );

  // Path Follow: a layer marker rides an S-curve, oriented along the path.
  D.pathfollow = demo(
    'Sends layers along a path you draw as a mask, with optional <strong>orient along the path</strong>.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<path d="M14 56 C 40 8, 80 64, 106 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.45"/>' +
      '<g><rect x="-8" y="-5" width="16" height="10" rx="2" style="fill:var(--rb-accent)">' +
      '<animateMotion dur="3s" repeatCount="indefinite" rotate="auto" path="M14 56 C 40 8, 80 64, 106 16"/>' +
      '</rect></g></svg>'
  );

  // Throw: a ball is launched, then bounces several shrinking times and rolls.
  D['throw'] = demo(
    'Bakes a thrown trajectory with <strong>momentum, gravity, and bounces that settle</strong>.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="12" y1="56" x2="108" y2="56" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>' +
      '<path d="M12 18 Q 30 54 40 56 Q 48 36 56 56 Q 62 46 70 56 Q 75 52 80 56 L 102 56" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.4"/>' +
      '<circle r="5" style="fill:var(--rb-accent)">' +
      '<animateMotion dur="2.8s" repeatCount="indefinite" path="M12 18 Q 30 54 40 56 Q 48 36 56 56 Q 62 46 70 56 Q 75 52 80 56 L 102 56"/>' +
      '</circle></svg>'
  );

  // Squash: a ball drops, squashes wide on impact, stretches tall on rebound.
  D.squash = demo(
    'Squashes and stretches a layer while preserving volume, by hand or <strong>automatically from its motion</strong>.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<line x1="34" y1="57" x2="86" y2="57" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>' +
      '<ellipse cx="60" style="fill:var(--rb-accent)">' +
      '<animate attributeName="cy" values="18;44;49;26;44;18" keyTimes="0;0.3;0.42;0.6;0.85;1" dur="2.6s" repeatCount="indefinite"/>' +
      '<animate attributeName="rx" values="12;12;18;9;12;12" keyTimes="0;0.3;0.42;0.6;0.85;1" dur="2.6s" repeatCount="indefinite"/>' +
      '<animate attributeName="ry" values="12;12;8;17;12;12" keyTimes="0;0.3;0.42;0.6;0.85;1" dur="2.6s" repeatCount="indefinite"/>' +
      '</ellipse></svg>'
  );

  // Rename: three layer name rows get a sequential number badge, top to bottom.
  D.rename = demo(
    'Batch-renames the selected layers, with find/replace, prefix/suffix, and <strong>top-to-bottom numbering</strong>.',
    '<svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">' +
      '<g fill="currentColor" opacity="0.5">' +
      '<rect x="14" y="13" width="50" height="8" rx="2"/>' +
      '<rect x="14" y="31" width="50" height="8" rx="2"/>' +
      '<rect x="14" y="49" width="50" height="8" rx="2"/></g>' +
      '<g style="fill:var(--rb-accent)">' +
      '<rect x="72" y="11" width="20" height="12" rx="3"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.18;0.9;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '<rect x="72" y="29" width="20" height="12" rx="3"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.18;0.36;0.9;1" dur="4s" repeatCount="indefinite"/></rect>' +
      '<rect x="72" y="47" width="20" height="12" rx="3"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.36;0.54;0.9;1" dur="4s" repeatCount="indefinite"/></rect></g>' +
      '</svg>'
  );

  R.toolDemos = D;
  R.registerToolDemo = function (id, caption, svg) { D[id] = demo(caption, svg); };
})(window.Rebound = window.Rebound || {});
