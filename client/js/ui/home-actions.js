/*
 * Rebound, home action catalog.
 *
 * The set of items the configurable Home screen can pin. An item is one of:
 *   kind 'apply'  - invokes a host command directly with fixed args (one click).
 *   kind 'open'   - opens a tool in the full detail view.
 *   kind 'widget' - embeds a tool's whole live UI right on the Home, so you can
 *                   use the actual controller (Align grid, Ease curve...) inline.
 * Every registered tool gets a generated open-<id> and widget-<id>, so anything
 * in Rebound is one pin away. Each item borrows its tool's icon.
 */
;(function (R) {
  'use strict';

  // Curated direct-apply actions across the tool set. Args mirror each host
  // command's expected shape.
  // config: fields the user can set up per tile in the customizer. Each field
  // overrides one invoke arg, so a single tile can be pointed at any easing type,
  // expression, or shape. type 'select' shows a dropdown, 'text' a text box.
  var EASE_CFG = [{ arg: 'type', label: 'Easing', type: 'select', options: [
    { value: 'easyEase', label: 'Easy Ease' },
    { value: 'easyEaseIn', label: 'Ease In' },
    { value: 'easyEaseOut', label: 'Ease Out' },
    { value: 'linear', label: 'Linear' },
    { value: 'hold', label: 'Hold' },
    { value: 'autoBezier', label: 'Auto Bezier' },
    { value: 'continuous', label: 'Smooth (continuous)' }
  ] }];
  var EXPR_CFG = [{ arg: 'code', label: 'Expression', type: 'text' }];
  var SHAPE_CFG = [{ arg: 'kind', label: 'Shape', type: 'select', options: [
    { value: 'rectangle', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }, { value: 'star', label: 'Star' }
  ] }];

  // display: the default tile look. 'visual' shows a recognizable easing curve,
  // 'text' a clear word label where an icon would be ambiguous, 'icon' an icon +
  // label. desc: the line shown in the big hover tooltip. The user can override
  // the look per tile in the customizer.
  var APPLY = [
    { id: 'easy-ease', label: 'Easy Ease', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', curve: 'ease', config: EASE_CFG, desc: 'Ease selected keyframes in and out (F9).', invoke: { method: 'keys.setInterp', args: { type: 'easyEase' } } },
    { id: 'ease-in', label: 'Ease In', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', curve: 'easeIn', config: EASE_CFG, desc: 'Ease into the next keyframe (slow start).', invoke: { method: 'keys.setInterp', args: { type: 'easyEaseIn' } } },
    { id: 'ease-out', label: 'Ease Out', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', curve: 'easeOut', config: EASE_CFG, desc: 'Ease out of a keyframe (slow finish).', invoke: { method: 'keys.setInterp', args: { type: 'easyEaseOut' } } },
    { id: 'ease-linear', label: 'Linear', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', curve: 'linear', config: EASE_CFG, desc: 'Constant-speed interpolation between keys.', invoke: { method: 'keys.setInterp', args: { type: 'linear' } } },
    { id: 'ease-hold', label: 'Hold', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', curve: 'hold', config: EASE_CFG, desc: 'Hold each value until the next keyframe.', invoke: { method: 'keys.setInterp', args: { type: 'hold' } } },
    { id: 'reverse-keys', label: 'Reverse Keys', toolId: 'reverse', group: 'Timing', kind: 'apply', display: 'text', desc: 'Reverse the order of the selected keyframes.', invoke: { method: 'reverse.apply', args: {} } },
    { id: 'trim-keys', label: 'Trim to Keys', toolId: 'trim', group: 'Timing', kind: 'apply', display: 'text', desc: 'Trim the layer to its first and last keyframe.', invoke: { method: 'trim.apply', args: { trimIn: true, trimOut: true, paddingFrames: 0 } } },
    { id: 'bake-frames', label: 'Bake Frames', toolId: 'bake', group: 'Easing', kind: 'apply', display: 'text', desc: 'Bake the animation to a keyframe on every frame.', invoke: { method: 'bake.apply', args: { range: 'work', stepFrames: 1, includeExpressions: false } } },

    { id: 'center-anchor', label: 'Center Anchor', toolId: 'anchor', group: 'Transform', kind: 'apply', display: 'text', desc: 'Move the anchor point to the layer center.', invoke: { method: 'anchor.move', args: { gx: 0.5, gy: 0.5 } } },
    { id: 'center-in-comp', label: 'Center in Comp', toolId: 'anchor', group: 'Transform', kind: 'apply', display: 'text', desc: 'Position the layer at the comp center.', invoke: { method: 'anchor.centerInComp', args: { x: true, y: true } } },
    { id: 'align-center', label: 'Align Center', toolId: 'align', group: 'Layout', kind: 'apply', display: 'text', desc: 'Align selected layers to the comp center.', invoke: { method: 'align.layers', args: { gx: 0.5, gy: 0.5, axes: 'both', relativeTo: 'comp', mode: 'each' } } },
    { id: 'reset-transform', label: 'Reset Transform', toolId: 'reset', group: 'Transform', kind: 'apply', display: 'text', desc: 'Reset position, scale, rotation and opacity.', invoke: { method: 'reset.apply', args: { position: true, scale: true, rotation: true, opacity: true, anchor: false } } },
    { id: 'add-null', label: 'Null + Parent', toolId: 'nullify', group: 'Transform', kind: 'apply', display: 'text', desc: 'Create a null and parent the selection to it.', invoke: { method: 'nullify.apply', args: { position: 'center', parent: true } } },

    { id: 'shape-rect', label: 'Rectangle', toolId: 'shapes', group: 'Shapes', kind: 'apply', display: 'icon', config: SHAPE_CFG, desc: 'Add a rectangle shape layer.', invoke: { method: 'shapes.add', args: { kind: 'rectangle' } } },
    { id: 'shape-ellipse', label: 'Ellipse', toolId: 'shapes', group: 'Shapes', kind: 'apply', display: 'icon', config: SHAPE_CFG, desc: 'Add an ellipse shape layer.', invoke: { method: 'shapes.add', args: { kind: 'ellipse' } } },
    { id: 'shape-star', label: 'Star', toolId: 'shapes', group: 'Shapes', kind: 'apply', display: 'icon', config: SHAPE_CFG, desc: 'Add a star shape layer.', invoke: { method: 'shapes.add', args: { kind: 'star' } } },

    { id: 'grid-thirds', label: 'Thirds Grid', toolId: 'grids', group: 'Layout', kind: 'apply', display: 'icon', desc: 'Overlay a rule-of-thirds guide grid.', invoke: { method: 'grids.apply', args: { preset: 'thirds', lineWidth: 2, color: [0, 0.85, 1], replace: true } } },
    { id: 'grid-tiktok', label: 'TikTok Safe', toolId: 'grids', group: 'Layout', kind: 'apply', display: 'icon', desc: 'Overlay TikTok safe-zone guides.', invoke: { method: 'grids.apply', args: { preset: 'social', platform: 'tiktok', lineWidth: 2, color: [1, 0.2, 0.8], replace: true } } },

    { id: 'expr-wiggle', label: 'Wiggle', toolId: 'expressions', group: 'Generators', kind: 'apply', display: 'text', config: EXPR_CFG, desc: 'Apply a wiggle(2, 30) expression.', invoke: { method: 'expressions.apply', args: { code: 'wiggle(2, 30)' } } },
    { id: 'expr-loop', label: 'Loop Out', toolId: 'expressions', group: 'Generators', kind: 'apply', display: 'text', config: EXPR_CFG, desc: 'Apply a loopOut("cycle") expression.', invoke: { method: 'expressions.apply', args: { code: 'loopOut("cycle")' } } },

    // The expression-rig physics tools are apply-and-forget, so they are buttons
    // (one click with sensible defaults), not live widgets. Open the full tool to
    // tune the sliders.
    { id: 'apply-bounce', label: 'Bounce', toolId: 'bounce', group: 'Physics', kind: 'apply', display: 'icon', desc: 'Rebound the value off its target after its last keyframe.', invoke: { method: 'bounce.apply', args: { elasticity: 0.7, gravity: 4, maxBounces: 4, eachKey: false } } },
    { id: 'apply-recoil', label: 'Recoil', toolId: 'recoil', group: 'Physics', kind: 'apply', display: 'icon', desc: 'Add elastic overshoot after a keyframe, scaled by the incoming velocity.', invoke: { method: 'recoil.apply', args: { overshoot: 60, bounce: 2, friction: 6, eachKey: true } } },
    { id: 'apply-drift', label: 'Drift', toolId: 'drift', group: 'Physics', kind: 'apply', display: 'icon', desc: 'Add living, organic random motion to the selected properties.', invoke: { method: 'drift.apply', args: { type: 'smooth', amount: 20, frequency: 2 } } }
  ];

  function applyActions() { return APPLY.slice(); }

  function openActions() {
    return (R.tools.list() || []).map(function (t) {
      return { id: 'open-' + t.id, label: t.title, toolId: t.id, group: t.group || 'Tools', kind: 'open', desc: 'Open the ' + t.title + ' tool in full.' };
    });
  }

  // A widget is worth it only for tools with a genuine live surface that fills the
  // box without scrolling. Two families qualify:
  //  - direct-manipulation: Ease curve, Anchor stage, Gradient bar (via WIDGET_FOCUS);
  //  - click-to-apply pickers: a grid of swatches / thumbnails / labels where one
  //    click applies (Align buttons, the Library preset grid, Palette + Colour
  //    swatches, Tag labels, Keyframe interpolation, Shape primitives), each built
  //    in the tool's own ctx.widget branch.
  // A control-panel tool (sliders/toggles + Apply, e.g. Velocity, Copy Ease, Smooth,
  // the physics rigs) is apply-and-forget and stays a one-click tile, never a widget
  // that would have to scroll to show its controls.
  var WIDGET_TOOLS = ['ease', 'anchor', 'gradient', 'align', 'library', 'palette', 'color', 'tags', 'keys', 'shapes'];
  function widgetActions() {
    return (R.tools.list() || []).filter(function (t) {
      return typeof t.mount === 'function' && WIDGET_TOOLS.indexOf(t.id) !== -1;
    }).map(function (t) {
      return { id: 'widget-' + t.id, label: t.title, toolId: t.id, group: t.group || 'Tools', kind: 'widget', desc: 'The ' + t.title + ' controller, live on your board.' };
    });
  }

  function scriptActions() { return (R.userScripts && R.userScripts.homeActions) ? R.userScripts.homeActions() : []; }

  function all() { return applyActions().concat(scriptActions()).concat(widgetActions()).concat(openActions()); }

  function byId(id) {
    var a = all();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  // A clean, dense starter board of compact one-click actions and quick tool
  // jumps. Widgets (whole-tool panels) are one Add away from the browser. Kept as
  // a flat fallback for the rich DEFAULT_BOARD below.
  var DEFAULT = [
    'easy-ease', 'ease-in', 'ease-out', 'ease-linear', 'ease-hold',
    'reverse-keys', 'trim-keys', 'center-anchor', 'align-center', 'add-null',
    'reset-transform', 'shape-rect', 'shape-ellipse', 'grid-thirds', 'expr-wiggle',
    'expr-loop', 'open-spring', 'open-scatter', 'open-gradient', 'open-expressions'
  ];

  // The board a new user starts on: a full, balanced 4-column layout that fills
  // the panel at any resolution (the grid stretches its rows to the height). Big
  // live widgets anchor it, the way Flow leads with its curve editor:
  //   - a 4x3 Ease curve hero across the top,
  //   - a band of two picker widgets (Align, Your colours) under it,
  //   - a row of quick easing actions,
  //   - a 3x3 Anchor widget at the bottom-left, with a column of rig tiles beside
  //     it (Null + Parent, Align Center, Reset Transform).
  // Dense row flow places each item top-to-bottom in this order. Tiles are 1x1, so
  // only the widgets carry a span. Items are the clean action ids (each is the
  // first, so it keeps its id and needs no ref).
  var DEFAULT_BOARD = {
    cols: 4,
    board: 'md',
    items: [
      'widget-ease',
      'widget-align', 'widget-color',
      'easy-ease', 'ease-in', 'ease-out', 'ease-hold',
      'widget-anchor',
      'add-null', 'align-center', 'reset-transform'
    ],
    spans: {
      'widget-ease': { c: 4, r: 3 },
      'widget-align': { c: 2, r: 2 },
      'widget-color': { c: 2, r: 2 },
      'widget-anchor': { c: 3, r: 3 }
    }
  };

  R.homeActions = { applyActions: applyActions, openActions: openActions, widgetActions: widgetActions, all: all, byId: byId, DEFAULT: DEFAULT, DEFAULT_BOARD: DEFAULT_BOARD };
})(window.Rebound = window.Rebound || {});
