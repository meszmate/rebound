/*
 * Rebound, motion behavior library (pure).
 *
 * A browse-and-apply set of parametric animations (entrances / exits / emphasis).
 * Each behavior.build(controls) returns a plain SPEC that the host turns into
 * real, editable keyframes with real eases — so the output is clean keyframes you
 * can hand-tune, not a locked expression. Kept dependency-free and unit-tested.
 *
 * SPEC = {
 *   durFrames,
 *   props: [{
 *     prop: 'opacity'|'position'|'scale'|'rotation',
 *     relative: bool,                 // values are offsets from the layer's current value
 *     keys: [{ f: 0..1, v: Number|Number[] }],   // f = fraction of the duration
 *     ease: { x1, y1, x2, y2 }        // applied to every segment
 *   }]
 * }
 * controls = { durFrames, distance, direction:'left'|'right'|'top'|'bottom', amount }
 */
;(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.Rebound = root.Rebound || {};
  root.Rebound.behaviors = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Snappy standard eases (expo-ish), as normalized cubic-beziers.
  var EASE_OUT = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 };
  var EASE_IN = { x1: 0.7, y1: 0, x2: 0.84, y2: 0 };
  var EASE_INOUT = { x1: 0.65, y1: 0, x2: 0.35, y2: 1 };

  // Offset vector for an entrance/exit direction at a given distance (Y-down).
  function dirOffset(direction, dist) {
    switch (direction) {
      case 'right': return [dist, 0];
      case 'top': return [0, -dist];
      case 'bottom': return [0, dist];
      case 'left':
      default: return [-dist, 0];
    }
  }

  function defaults(c) {
    c = c || {};
    return {
      durFrames: c.durFrames || 20,
      distance: c.distance != null ? c.distance : 200,
      direction: c.direction || 'left',
      amount: c.amount != null ? c.amount : 15
    };
  }

  var BEHAVIORS = [
    // ---- Entrances ----
    { id: 'fade-in', name: 'Fade In', category: 'in', desc: 'Opacity 0 → 100',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'opacity', relative: false, keys: [{ f: 0, v: 0 }, { f: 1, v: 100 }], ease: EASE_OUT }] }; } },
    { id: 'scale-in', name: 'Scale In', category: 'in', desc: 'Scale 0 → 100',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'scale', relative: false, keys: [{ f: 0, v: [0, 0] }, { f: 1, v: [100, 100] }], ease: EASE_OUT }] }; } },
    { id: 'pop-in', name: 'Pop In', category: 'in', desc: 'Scale up past 100 and settle',
      build: function (c) { c = defaults(c); var o = 100 + c.amount; return { durFrames: c.durFrames, props: [
        { prop: 'scale', relative: false, keys: [{ f: 0, v: [0, 0] }, { f: 0.7, v: [o, o] }, { f: 1, v: [100, 100] }], ease: EASE_OUT }] }; } },
    { id: 'slide-in', name: 'Slide In', category: 'in', desc: 'Move in from a direction',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'position', relative: true, keys: [{ f: 0, v: dirOffset(c.direction, c.distance) }, { f: 1, v: [0, 0] }], ease: EASE_OUT }] }; } },
    { id: 'rise-in', name: 'Rise In', category: 'in', desc: 'Move up + fade in',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'position', relative: true, keys: [{ f: 0, v: [0, c.distance] }, { f: 1, v: [0, 0] }], ease: EASE_OUT },
        { prop: 'opacity', relative: false, keys: [{ f: 0, v: 0 }, { f: 1, v: 100 }], ease: EASE_OUT }] }; } },

    // ---- Exits ----
    { id: 'fade-out', name: 'Fade Out', category: 'out', desc: 'Opacity 100 → 0',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'opacity', relative: false, keys: [{ f: 0, v: 100 }, { f: 1, v: 0 }], ease: EASE_IN }] }; } },
    { id: 'scale-out', name: 'Scale Out', category: 'out', desc: 'Scale 100 → 0',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'scale', relative: false, keys: [{ f: 0, v: [100, 100] }, { f: 1, v: [0, 0] }], ease: EASE_IN }] }; } },
    { id: 'slide-out', name: 'Slide Out', category: 'out', desc: 'Move out in a direction',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'position', relative: true, keys: [{ f: 0, v: [0, 0] }, { f: 1, v: dirOffset(c.direction, c.distance) }], ease: EASE_IN }] }; } },
    { id: 'sink-out', name: 'Sink Out', category: 'out', desc: 'Move down + fade out',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'position', relative: true, keys: [{ f: 0, v: [0, 0] }, { f: 1, v: [0, c.distance] }], ease: EASE_IN },
        { prop: 'opacity', relative: false, keys: [{ f: 0, v: 100 }, { f: 1, v: 0 }], ease: EASE_IN }] }; } },

    // ---- Emphasis ----
    { id: 'pulse', name: 'Pulse', category: 'emphasis', desc: 'Scale up then back',
      build: function (c) { c = defaults(c); var p = 100 + c.amount; return { durFrames: c.durFrames, props: [
        { prop: 'scale', relative: false, keys: [{ f: 0, v: [100, 100] }, { f: 0.5, v: [p, p] }, { f: 1, v: [100, 100] }], ease: EASE_INOUT }] }; } },
    { id: 'pop', name: 'Pop', category: 'emphasis', desc: 'Quick overshoot in place',
      build: function (c) { c = defaults(c); var p = 100 + c.amount; return { durFrames: Math.max(6, Math.round(c.durFrames * 0.6)), props: [
        { prop: 'scale', relative: false, keys: [{ f: 0, v: [100, 100] }, { f: 0.4, v: [p, p] }, { f: 1, v: [100, 100] }], ease: EASE_OUT }] }; } },
    { id: 'spin', name: 'Spin', category: 'emphasis', desc: 'One full rotation',
      build: function (c) { c = defaults(c); return { durFrames: c.durFrames, props: [
        { prop: 'rotation', relative: true, keys: [{ f: 0, v: 0 }, { f: 1, v: 360 }], ease: EASE_INOUT }] }; } }
  ];

  var byId = {};
  BEHAVIORS.forEach(function (b) { byId[b.id] = b; });

  function build(id, controls) {
    var b = byId[id];
    if (!b) return null;
    return b.build(controls || {});
  }

  return {
    BEHAVIORS: BEHAVIORS,
    byId: byId,
    build: build,
    EASE_OUT: EASE_OUT,
    EASE_IN: EASE_IN,
    EASE_INOUT: EASE_INOUT,
    dirOffset: dirOffset
  };
});
