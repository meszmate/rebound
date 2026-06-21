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
  var APPLY = [
    { id: 'easy-ease', label: 'Easy Ease', toolId: 'keys', group: 'Easing', kind: 'apply', invoke: { method: 'keys.setInterp', args: { type: 'easyEase' } } },
    { id: 'ease-linear', label: 'Linear', toolId: 'keys', group: 'Easing', kind: 'apply', invoke: { method: 'keys.setInterp', args: { type: 'linear' } } },
    { id: 'ease-hold', label: 'Hold', toolId: 'keys', group: 'Easing', kind: 'apply', invoke: { method: 'keys.setInterp', args: { type: 'hold' } } },
    { id: 'reverse-keys', label: 'Reverse Keys', toolId: 'reverse', group: 'Timing', kind: 'apply', invoke: { method: 'reverse.apply', args: {} } },
    { id: 'trim-keys', label: 'Trim to Keys', toolId: 'trim', group: 'Timing', kind: 'apply', invoke: { method: 'trim.apply', args: { trimIn: true, trimOut: true, paddingFrames: 0 } } },
    { id: 'bake-frames', label: 'Bake Frames', toolId: 'bake', group: 'Easing', kind: 'apply', invoke: { method: 'bake.apply', args: { range: 'work', stepFrames: 1, includeExpressions: false } } },

    { id: 'center-anchor', label: 'Center Anchor', toolId: 'anchor', group: 'Transform', kind: 'apply', invoke: { method: 'anchor.move', args: { gx: 0.5, gy: 0.5 } } },
    { id: 'center-in-comp', label: 'Center in Comp', toolId: 'anchor', group: 'Transform', kind: 'apply', invoke: { method: 'anchor.centerInComp', args: { x: true, y: true } } },
    { id: 'align-center', label: 'Align Center', toolId: 'align', group: 'Layout', kind: 'apply', invoke: { method: 'align.layers', args: { gx: 0.5, gy: 0.5, axes: 'both', relativeTo: 'comp', mode: 'each' } } },
    { id: 'reset-transform', label: 'Reset Transform', toolId: 'reset', group: 'Transform', kind: 'apply', invoke: { method: 'reset.apply', args: { position: true, scale: true, rotation: true, opacity: true, anchor: false } } },
    { id: 'add-null', label: 'Null + Parent', toolId: 'nullify', group: 'Transform', kind: 'apply', invoke: { method: 'nullify.apply', args: { position: 'center', parent: true } } },

    { id: 'shape-rect', label: 'Rectangle', toolId: 'shapes', group: 'Shapes', kind: 'apply', invoke: { method: 'shapes.add', args: { kind: 'rectangle' } } },
    { id: 'shape-ellipse', label: 'Ellipse', toolId: 'shapes', group: 'Shapes', kind: 'apply', invoke: { method: 'shapes.add', args: { kind: 'ellipse' } } },
    { id: 'shape-star', label: 'Star', toolId: 'shapes', group: 'Shapes', kind: 'apply', invoke: { method: 'shapes.add', args: { kind: 'star' } } },

    { id: 'grid-thirds', label: 'Thirds Grid', toolId: 'grids', group: 'Layout', kind: 'apply', invoke: { method: 'grids.apply', args: { preset: 'thirds', lineWidth: 2, color: [0, 0.85, 1], replace: true } } },
    { id: 'grid-tiktok', label: 'TikTok Safe', toolId: 'grids', group: 'Layout', kind: 'apply', invoke: { method: 'grids.apply', args: { preset: 'social', platform: 'tiktok', lineWidth: 2, color: [1, 0.2, 0.8], replace: true } } },

    { id: 'expr-wiggle', label: 'Wiggle', toolId: 'expressions', group: 'Generators', kind: 'apply', invoke: { method: 'expressions.apply', args: { code: 'wiggle(2, 30)' } } },
    { id: 'expr-loop', label: 'Loop Out', toolId: 'expressions', group: 'Generators', kind: 'apply', invoke: { method: 'expressions.apply', args: { code: 'loopOut("cycle")' } } }
  ];

  function applyActions() { return APPLY.slice(); }

  function openActions() {
    return (R.tools.list() || []).map(function (t) {
      return { id: 'open-' + t.id, label: t.title, toolId: t.id, group: t.group || 'Tools', kind: 'open' };
    });
  }

  // Every tool, as an embeddable widget (its whole live UI on the Home).
  function widgetActions() {
    return (R.tools.list() || []).filter(function (t) { return typeof t.mount === 'function'; }).map(function (t) {
      return { id: 'widget-' + t.id, label: t.title, toolId: t.id, group: t.group || 'Tools', kind: 'widget' };
    });
  }

  function all() { return applyActions().concat(widgetActions()).concat(openActions()); }

  function byId(id) {
    var a = all();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  // A sensible starter set for a first run: a row of one-click actions, a live
  // Align widget to show the concept, then more actions and quick tool jumps.
  var DEFAULT = [
    'easy-ease', 'center-anchor', 'align-center', 'add-null',
    'widget-align',
    'shape-rect', 'grid-thirds', 'expr-wiggle', 'reverse-keys',
    'open-ease', 'open-spring', 'open-scatter', 'open-gradient'
  ];

  R.homeActions = { applyActions: applyActions, openActions: openActions, widgetActions: widgetActions, all: all, byId: byId, DEFAULT: DEFAULT };
})(window.Rebound = window.Rebound || {});
