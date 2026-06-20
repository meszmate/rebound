/*
 * Rebound, tool presentation metadata.
 *
 * Keeps the 45 feature files clean: this single file maps each tool id to a
 * goal-shaped section, a line icon, and a one-line description for the Home
 * launcher and search. Sections are display-only (the registry still owns
 * groups); the launcher renders SECTIONS in order and falls back to a tool's
 * registry group if it has no entry here.
 *
 * Icons are inline SVG inner-markup, drawn on a 24x24 grid with 2px strokes and
 * currentColor, so they recolor with the host theme for free.
 */
;(function (R) {
  'use strict';

  var ICONS = {
    curve: '<path d="M3 19c7 0 7-14 18-14"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    gauge: '<path d="M4 19a8 8 0 1 1 16 0"/><path d="M12 15l4-4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    wave: '<path d="M3 12c2-6 5-6 7 0s5 6 7 0"/>',
    bake: '<path d="M12 4v10m0 0l-3-3m3 3l3-3"/><path d="M5 20h14"/>',
    spring: '<path d="M5 5h14M5 19h14M9 5l6 4-6 4 6 4-6 2"/>',
    orbit: '<circle cx="12" cy="12" r="7"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>',
    link: '<path d="M9 12a4 4 0 0 1 4-4h2a4 4 0 0 1 0 8h-1"/><path d="M15 12a4 4 0 0 1-4 4H9a4 4 0 0 1 0-8h1"/>',
    target: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    align: '<path d="M4 3v18"/><rect x="8" y="6" width="11" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    stack: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 16V7a2 2 0 0 1 2-2h9"/>',
    shape: '<path d="M12 3l2.6 6.3L21 10l-4.8 4.2L17.5 21 12 17.3 6.5 21l1.3-6.8L3 10l6.4-.7z"/>',
    scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 8l12 8M8 16L20 8"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    droplet: '<path d="M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z"/>',
    tag: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'
  };

  var SECTIONS = [
    { id: 'ease', name: 'Ease & curves', icon: ICONS.curve },
    { id: 'physics', name: 'Springs & physics', icon: ICONS.spring },
    { id: 'timing', name: 'Timing', icon: ICONS.clock },
    { id: 'transform', name: 'Transform & rig', icon: ICONS.target },
    { id: 'layout', name: 'Layout & align', icon: ICONS.align },
    { id: 'generate', name: 'Generators', icon: ICONS.stack },
    { id: 'shapes', name: 'Shapes & paths', icon: ICONS.shape },
    { id: 'color', name: 'Color', icon: ICONS.droplet },
    { id: 'organize', name: 'Organize & help', icon: ICONS.tag }
  ];

  function t(section, icon, desc) {
    return { section: section, icon: icon, desc: desc };
  }

  var TOOLS = {
    // Ease & curves
    ease: t('ease', ICONS.curve, 'Shape a cubic-bezier and apply it to keyframes'),
    library: t('ease', ICONS.grid, 'Browse and apply easing presets'),
    velocity: t('ease', ICONS.gauge, 'Set keyframe speed and influence numerically'),
    copyease: t('ease', ICONS.copy, "Copy a keyframe's ease and paste it"),
    smooth: t('ease', ICONS.wave, 'Smooth keyframes into a flowing curve'),
    bake: t('ease', ICONS.bake, 'Bake expressions into clean keyframes'),

    // Springs & physics
    spring: t('physics', ICONS.spring, 'Physical spring easing with real overshoot'),
    recoil: t('physics', ICONS.spring, 'Elastic overshoot after each keyframe'),
    drift: t('physics', ICONS.wave, 'Organic wiggle and randomness'),
    bounce: t('physics', ICONS.spring, 'Gravitational rebound off the target'),
    motion: t('physics', ICONS.orbit, 'Orbit, spin, or look-at rigs'),
    follow: t('physics', ICONS.link, 'Followers trail a lead layer'),
    lean: t('physics', ICONS.gauge, 'Tilt a layer into its motion'),
    kinetic: t('physics', ICONS.gauge, "React to another layer's velocity"),

    // Timing
    stagger: t('timing', ICONS.clock, 'Cascade layers in time'),
    sequence: t('timing', ICONS.clock, 'Line layers up end-to-end'),
    trim: t('timing', ICONS.scissors, 'Fit in/out points to keyframes'),
    reverse: t('timing', ICONS.clock, 'Mirror keyframes in time'),
    fade: t('timing', ICONS.clock, 'Add opacity fade in / out'),
    keys: t('timing', ICONS.clock, 'Set keyframe interpolation'),

    // Transform & rig
    anchor: t('transform', ICONS.target, 'Move the anchor without moving the layer'),
    reset: t('transform', ICONS.target, 'Restore transforms to defaults'),
    nullify: t('transform', ICONS.link, 'Drop a control null and parent to it'),
    separate: t('transform', ICONS.target, 'Separate position dimensions'),
    link: t('transform', ICONS.link, 'Parent layers to one target'),

    // Layout & align
    align: t('layout', ICONS.align, 'Align layers to the comp or selection'),
    arrange: t('layout', ICONS.layout, 'Pack layers into a grid'),
    flip: t('layout', ICONS.align, 'Mirror layers across an axis'),
    grids: t('layout', ICONS.layout, 'Add guide grids and overlays'),
    comp: t('layout', ICONS.layout, 'Edit the composition settings'),
    precompose: t('layout', ICONS.stack, 'Nest layers into a new comp'),

    // Generators
    multiply: t('generate', ICONS.stack, 'Duplicate into a progressive stack'),
    radial: t('generate', ICONS.orbit, 'Duplicate into a ring'),
    echo: t('generate', ICONS.copy, 'Add an optical echo trail'),
    vignette: t('generate', ICONS.shape, 'Darken the frame edges'),

    // Shapes & paths
    shapes: t('shapes', ICONS.shape, 'Insert shape primitives'),
    trimpaths: t('shapes', ICONS.scissors, 'Animate a path write-on'),
    break: t('shapes', ICONS.shape, 'Split a shape layer into groups'),
    textbreak: t('shapes', ICONS.shape, 'Split text into letters / words / lines'),

    // Color
    color: t('color', ICONS.droplet, 'Set fill, solid, or effect color'),
    palette: t('color', ICONS.grid, 'Apply color schemes'),
    stroke: t('color', ICONS.pen, 'Add or update a shape stroke'),
    gradient: t('color', ICONS.droplet, 'Add a gradient fill'),

    // Organize & help
    tags: t('organize', ICONS.tag, 'Tag and select layers'),
    demo: t('organize', ICONS.play, 'Build a practice composition')
  };

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  R.toolMeta = {
    ICONS: ICONS,
    SECTIONS: SECTIONS,
    TOOLS: TOOLS,
    svg: svg,
    forTool: function (id) { return TOOLS[id] || null; }
  };
})(window.Rebound = window.Rebound || {});
