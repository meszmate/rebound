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
  // display: the default tile look. 'visual' shows a recognizable easing curve,
  // 'text' a clear word label where an icon would be ambiguous, 'icon' an icon +
  // label. desc: the line shown in the big hover tooltip. The user can override
  // the look per tile in the customizer.
  var APPLY = [
    { id: 'easy-ease', label: 'Easy Ease', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', desc: 'Ease selected keyframes in and out (F9).', invoke: { method: 'keys.setInterp', args: { type: 'easyEase' } } },
    { id: 'ease-linear', label: 'Linear', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', desc: 'Constant-speed interpolation between keys.', invoke: { method: 'keys.setInterp', args: { type: 'linear' } } },
    { id: 'ease-hold', label: 'Hold', toolId: 'keys', group: 'Easing', kind: 'apply', display: 'visual', desc: 'Hold each value until the next keyframe.', invoke: { method: 'keys.setInterp', args: { type: 'hold' } } },
    { id: 'reverse-keys', label: 'Reverse Keys', toolId: 'reverse', group: 'Timing', kind: 'apply', display: 'text', desc: 'Reverse the order of the selected keyframes.', invoke: { method: 'reverse.apply', args: {} } },
    { id: 'trim-keys', label: 'Trim to Keys', toolId: 'trim', group: 'Timing', kind: 'apply', display: 'text', desc: 'Trim the layer to its first and last keyframe.', invoke: { method: 'trim.apply', args: { trimIn: true, trimOut: true, paddingFrames: 0 } } },
    { id: 'bake-frames', label: 'Bake Frames', toolId: 'bake', group: 'Easing', kind: 'apply', display: 'text', desc: 'Bake the animation to a keyframe on every frame.', invoke: { method: 'bake.apply', args: { range: 'work', stepFrames: 1, includeExpressions: false } } },

    { id: 'center-anchor', label: 'Center Anchor', toolId: 'anchor', group: 'Transform', kind: 'apply', display: 'text', desc: 'Move the anchor point to the layer center.', invoke: { method: 'anchor.move', args: { gx: 0.5, gy: 0.5 } } },
    { id: 'center-in-comp', label: 'Center in Comp', toolId: 'anchor', group: 'Transform', kind: 'apply', display: 'text', desc: 'Position the layer at the comp center.', invoke: { method: 'anchor.centerInComp', args: { x: true, y: true } } },
    { id: 'align-center', label: 'Align Center', toolId: 'align', group: 'Layout', kind: 'apply', display: 'text', desc: 'Align selected layers to the comp center.', invoke: { method: 'align.layers', args: { gx: 0.5, gy: 0.5, axes: 'both', relativeTo: 'comp', mode: 'each' } } },
    { id: 'reset-transform', label: 'Reset Transform', toolId: 'reset', group: 'Transform', kind: 'apply', display: 'text', desc: 'Reset position, scale, rotation and opacity.', invoke: { method: 'reset.apply', args: { position: true, scale: true, rotation: true, opacity: true, anchor: false } } },
    { id: 'add-null', label: 'Null + Parent', toolId: 'nullify', group: 'Transform', kind: 'apply', display: 'text', desc: 'Create a null and parent the selection to it.', invoke: { method: 'nullify.apply', args: { position: 'center', parent: true } } },

    { id: 'shape-rect', label: 'Rectangle', toolId: 'shapes', group: 'Shapes', kind: 'apply', display: 'icon', desc: 'Add a rectangle shape layer.', invoke: { method: 'shapes.add', args: { kind: 'rectangle' } } },
    { id: 'shape-ellipse', label: 'Ellipse', toolId: 'shapes', group: 'Shapes', kind: 'apply', display: 'icon', desc: 'Add an ellipse shape layer.', invoke: { method: 'shapes.add', args: { kind: 'ellipse' } } },
    { id: 'shape-star', label: 'Star', toolId: 'shapes', group: 'Shapes', kind: 'apply', display: 'icon', desc: 'Add a star shape layer.', invoke: { method: 'shapes.add', args: { kind: 'star' } } },

    { id: 'grid-thirds', label: 'Thirds Grid', toolId: 'grids', group: 'Layout', kind: 'apply', display: 'icon', desc: 'Overlay a rule-of-thirds guide grid.', invoke: { method: 'grids.apply', args: { preset: 'thirds', lineWidth: 2, color: [0, 0.85, 1], replace: true } } },
    { id: 'grid-tiktok', label: 'TikTok Safe', toolId: 'grids', group: 'Layout', kind: 'apply', display: 'icon', desc: 'Overlay TikTok safe-zone guides.', invoke: { method: 'grids.apply', args: { preset: 'social', platform: 'tiktok', lineWidth: 2, color: [1, 0.2, 0.8], replace: true } } },

    { id: 'expr-wiggle', label: 'Wiggle', toolId: 'expressions', group: 'Generators', kind: 'apply', display: 'text', desc: 'Apply a wiggle(2, 30) expression.', invoke: { method: 'expressions.apply', args: { code: 'wiggle(2, 30)' } } },
    { id: 'expr-loop', label: 'Loop Out', toolId: 'expressions', group: 'Generators', kind: 'apply', display: 'text', desc: 'Apply a loopOut("cycle") expression.', invoke: { method: 'expressions.apply', args: { code: 'loopOut("cycle")' } } }
  ];

  function applyActions() { return APPLY.slice(); }

  function openActions() {
    return (R.tools.list() || []).map(function (t) {
      return { id: 'open-' + t.id, label: t.title, toolId: t.id, group: t.group || 'Tools', kind: 'open', desc: 'Open the ' + t.title + ' tool in full.' };
    });
  }

  // Every tool, as an embeddable widget (its whole live UI on the Home).
  function widgetActions() {
    return (R.tools.list() || []).filter(function (t) { return typeof t.mount === 'function'; }).map(function (t) {
      return { id: 'widget-' + t.id, label: t.title, toolId: t.id, group: t.group || 'Tools', kind: 'widget', desc: 'The full ' + t.title + ' controller, live on your board.' };
    });
  }

  function all() { return applyActions().concat(widgetActions()).concat(openActions()); }

  function byId(id) {
    var a = all();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  // A clean, dense starter board of compact one-click actions and quick tool
  // jumps. Widgets (whole-tool panels) are one Add away from the browser.
  var DEFAULT = [
    'easy-ease', 'ease-linear', 'ease-hold', 'reverse-keys', 'trim-keys',
    'center-anchor', 'align-center', 'add-null', 'reset-transform',
    'shape-rect', 'shape-ellipse', 'grid-thirds', 'expr-wiggle', 'expr-loop',
    'open-ease', 'open-spring', 'open-scatter', 'open-gradient', 'open-expressions'
  ];

  R.homeActions = { applyActions: applyActions, openActions: openActions, widgetActions: widgetActions, all: all, byId: byId, DEFAULT: DEFAULT };
})(window.Rebound = window.Rebound || {});
