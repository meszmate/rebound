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
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
    // A general-purpose set so any tile can pick an icon it likes.
    star: '<path d="M12 3l2.6 6.3L21 10l-4.8 4.2L17.5 21 12 17.3 6.5 21l1.3-6.8L3 10l6.4-.7z"/>',
    heart: '<path d="M12 20s-7-4.6-9-9a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c-2 4.4-7 9-7 9z"/>',
    bolt: '<path d="M13 3L5 13h6l-2 8 8-10h-6z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    magic: '<path d="M5 19l9-9M14 6l1.5-1.5M19 9l1.5-1.5M16 4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l2-3h4l2 3"/><circle cx="12" cy="13" r="3"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    scale: '<path d="M4 4h7M4 4v7M4 4l8 8M20 20h-7M20 20v-7M20 20l-8-8"/>',
    text: '<path d="M5 5h14M12 5v14M9 19h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 16l-5-5L5 20"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    crop: '<path d="M6 2v16h16M2 6h16v16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    code: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>',
    importIn: '<path d="M12 3v10M8 11l4 4 4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    pin: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'
  };

  var SECTIONS = [
    { id: 'ease', name: 'Ease & curves', icon: ICONS.curve },
    { id: 'physics', name: 'Springs & physics', icon: ICONS.spring },
    { id: 'timing', name: 'Timing', icon: ICONS.clock },
    { id: 'transform', name: 'Transform & rig', icon: ICONS.target },
    { id: 'layout', name: 'Layout & align', icon: ICONS.align },
    { id: 'generate', name: 'Generators', icon: ICONS.stack },
    { id: 'shapes', name: 'Shapes & paths', icon: ICONS.shape },
    { id: 'convert', name: 'Convert & import', icon: ICONS.importIn },
    { id: 'color', name: 'Color', icon: ICONS.droplet },
    { id: 'organize', name: 'Organize & help', icon: ICONS.tag }
  ];

  // `diff` (optional) is a short "what Rebound does differently" note, shown only
  // for tools that overlap a built-in After Effects feature.
  function t(section, icon, desc, diff) {
    return { section: section, icon: icon, desc: desc, diff: diff || null };
  }

  var TOOLS = {
    // Ease & curves
    ease: t('ease', ICONS.curve, 'Shape a cubic-bezier and apply it to keyframes'),
    library: t('ease', ICONS.grid, 'Browse and apply easing presets'),
    velocity: t('ease', ICONS.gauge, 'Set keyframe speed and influence numerically'),
    copyease: t('ease', ICONS.copy, "Copy a keyframe's ease and paste it"),
    smooth: t('ease', ICONS.wave, 'Smooth keyframes into a flowing curve',
      'After Effects has a Smoother and roving keyframes. Rebound rolls bezier, auto-bezier, and roving into one pass and reports only the keys it actually changed.'),
    bake: t('ease', ICONS.bake, 'Bake expressions into clean keyframes',
      'Like Convert Expression to Keyframes, but it preserves keyframes outside the baked range and never deletes a hand-written expression, it just disables it.'),

    // Springs & physics
    spring: t('physics', ICONS.spring, 'Physical spring easing with real overshoot'),
    recoil: t('physics', ICONS.spring, 'Elastic overshoot after each keyframe'),
    drift: t('physics', ICONS.wave, 'Organic wiggle and randomness'),
    bounce: t('physics', ICONS.spring, 'Gravitational rebound off the target'),
    motion: t('physics', ICONS.orbit, 'Orbit, spin, or look-at rigs'),
    follow: t('physics', ICONS.link, 'Followers trail a lead layer'),
    lean: t('physics', ICONS.gauge, 'Tilt a layer into its motion'),
    kinetic: t('physics', ICONS.gauge, "React to another layer's velocity"),
    squash: t('physics', ICONS.scale, 'Squash and stretch, manual or auto from motion'),
    throw: t('physics', ICONS.bolt, 'Throw a layer with momentum, drag, and gravity'),
    pathfollow: t('physics', ICONS.pen, 'Send layers along a mask path'),

    // Timing
    stagger: t('timing', ICONS.clock, 'Cascade layers in time'),
    sequence: t('timing', ICONS.clock, 'Line layers up end-to-end'),
    trim: t('timing', ICONS.scissors, 'Fit in/out points to keyframes',
      'Alt+[ and Alt+] trim to the playhead. Rebound trims each layer to its own first and last keyframe instead, with separate in and out padding.'),
    reverse: t('timing', ICONS.clock, 'Mirror keyframes in time',
      'Like Time-Reverse Keyframes, but it runs across every selected property at once and keeps your selection afterward.'),
    fade: t('timing', ICONS.clock, 'Add opacity fade in / out'),
    keys: t('timing', ICONS.clock, 'Set keyframe interpolation',
      'Beyond F9 Easy Ease: set Linear, Hold, Bezier, or Easy Ease across every selected key, with the correct single ease for spatial properties, and it never aborts on an edge key.'),

    // Transform & rig
    anchor: t('transform', ICONS.target, 'Move the anchor without moving the layer',
      'The Pan-Behind tool moves the anchor by eye. Rebound snaps it to a chosen point of the layer bounds and compensates position so nothing shifts on screen.'),
    reset: t('transform', ICONS.target, 'Restore transforms to defaults'),
    nullify: t('transform', ICONS.link, 'Drop a control null and parent to it',
      'Does the create-null-then-parent dance for you, centered on the selection, in one undoable step.'),
    separate: t('transform', ICONS.target, 'Separate position dimensions',
      'Same as right-click Separate Dimensions, but applied to every selected layer at once.'),
    link: t('transform', ICONS.link, 'Parent layers to one target'),
    pins: t('transform', ICONS.pin, 'Bind puppet pins to controller nulls and sliders'),

    // Layout & align
    align: t('layout', ICONS.align, 'Align layers to the comp or selection',
      'The Align panel only aligns to the selection or the comp. Rebound does both, distributes by real gaps, and moves the whole selection as a group when you want.'),
    arrange: t('layout', ICONS.layout, 'Pack layers into a grid',
      'The Align panel can only distribute along one axis. Rebound packs the selection into a true rows-and-columns grid.'),
    flip: t('layout', ICONS.align, 'Mirror layers across an axis',
      'Scaling to -100% flips around the anchor and shifts the layer. Rebound mirrors across the layer or comp axis and compensates so it stays put.'),
    pinrig: t('layout', ICONS.target, 'Build a construction overlay: pins, guides, and measurements',
      'A logo/typography construction rig: generates pins, bounding box, bezier handles, edge/coord/angle measurements, grid/circle/margin guides, and a dot field in one custom color theme, all editable and removable.'),
    grids: t('layout', ICONS.layout, 'Add guide grids and overlays',
      'AE guides are single draggable lines. Rebound drops a full thirds, golden, column, or safe-area overlay as one non-rendering guide layer.'),
    comp: t('layout', ICONS.layout, 'Edit the composition settings',
      'Like Composition Settings, but changing the resolution keeps your content centered instead of shifting it toward a corner.'),
    precompose: t('layout', ICONS.stack, 'Nest layers into a new comp'),

    // Generators
    backdrop: t('generate', ICONS.grid, 'Make a textured background and stylize effects'),
    multiply: t('generate', ICONS.stack, 'Duplicate into a progressive stack'),
    radial: t('generate', ICONS.orbit, 'Duplicate into a ring'),
    echo: t('generate', ICONS.copy, 'Add an optical echo trail'),
    vignette: t('generate', ICONS.shape, 'Darken the frame edges'),

    // Shapes & paths
    shapes: t('shapes', ICONS.shape, 'Insert shape primitives'),
    trimpaths: t('shapes', ICONS.scissors, 'Animate a path write-on'),
    break: t('shapes', ICONS.shape, 'Split a shape layer into groups'),
    textbreak: t('shapes', ICONS.shape, 'Split text into letters / words / lines'),

    // Convert & import
    import: t('convert', ICONS.importIn, 'Bring a Figma, Illustrator, or Photoshop design in as native, editable layers'),

    // Color
    color: t('color', ICONS.droplet, 'Set fill, solid, or effect color'),
    palette: t('color', ICONS.grid, 'Apply color schemes'),
    stroke: t('color', ICONS.pen, 'Add or update a shape stroke'),
    gradient: t('color', ICONS.droplet, 'Add a gradient fill'),

    // Organize & help
    tags: t('organize', ICONS.tag, 'Tag and select layers'),
    rename: t('organize', ICONS.text, 'Batch-rename layers with numbering',
      'Renames every selected layer at once with find/replace, prefix/suffix, and top-to-bottom sequential numbering, in one undoable step.'),
    scripts: t('organize', ICONS.code, 'Save, run and organize scripts and expressions'),
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
