/*
 * Rebound shared, effects + blend helpers.
 *
 * One canonical home for the layer-style / blend conversions every exporter and
 * the After Effects importer need, so they never drift apart:
 *   - offset <-> distance/angle (shadows are stored as an offset in the IR but
 *     After Effects layer styles want distance + lighting angle)
 *   - IR blend mode -> the After Effects layer-style "mode2" ordinal
 *   - normalising an IR effect into a layerStyle object (the importer talks to
 *     AE layer styles in exactly one place)
 *
 * ES3/ES5 common denominator (panel, ExtendScript, Node, Figma bundler).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.ReboundEffects = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The eight scriptable styles plus the canonical effect types that map to them.
  var LAYER_STYLE_TYPES = ['DROP_SHADOW', 'INNER_SHADOW', 'OUTER_GLOW', 'INNER_GLOW', 'BEVEL_EMBOSS', 'SATIN', 'COLOR_OVERLAY', 'GRADIENT_OVERLAY', 'STROKE'];

  function isLayerStyleEffect(type) {
    if (type === 'LAYER_BLUR' || type === 'BACKGROUND_BLUR') return false;
    for (var i = 0; i < LAYER_STYLE_TYPES.length; i++) { if (LAYER_STYLE_TYPES[i] === type) return true; }
    return false;
  }

  // Photoshop/AE convention: angle is the light direction, the shadow falls
  // opposite it, Y is down. offsetX = -d*cos(a), offsetY = d*sin(a).
  function offsetFromDistanceAngle(distance, angleDeg) {
    var a = angleDeg * Math.PI / 180;
    return [-distance * Math.cos(a), distance * Math.sin(a)];
  }
  function distanceAngleFromOffset(off) {
    var dx = off[0], dy = off[1];
    return { distance: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, -dx) * 180 / Math.PI };
  }

  // IR blend mode -> the layer-style "mode2" dropdown ordinal.
  var MODE2 = {
    NORMAL: 1, DISSOLVE: 2, DARKEN: 3, MULTIPLY: 4, COLOR_BURN: 5, LINEAR_BURN: 6, DARKER_COLOR: 7,
    LIGHTEN: 8, SCREEN: 9, COLOR_DODGE: 10, LINEAR_DODGE: 11, LIGHTER_COLOR: 12,
    OVERLAY: 13, SOFT_LIGHT: 14, HARD_LIGHT: 15, VIVID_LIGHT: 16, LINEAR_LIGHT: 17, PIN_LIGHT: 18, HARD_MIX: 19,
    DIFFERENCE: 20, EXCLUSION: 21, SUBTRACT: 22, DIVIDE: 23, HUE: 24, SATURATION: 25, COLOR: 26, LUMINOSITY: 27
  };
  function blendModeToLayerStyleOrdinal(mode) {
    var o = MODE2[mode];
    return o ? o : 1;
  }

  // Normalise an IR effect (shadow/glow/overlay) into a layerStyle object the
  // importer's single layer-style applier understands. Blurs return null (they
  // are not layer styles).
  function effectToLayerStyle(e) {
    if (!e || !e.type || !isLayerStyleEffect(e.type)) return null;
    var ls = { type: e.type, enabled: e.visible !== false };
    if (e.blendMode) ls.blendMode = e.blendMode;
    if (e.color) ls.color = e.color;
    if (typeof e.opacity === 'number') ls.opacity = e.opacity;
    else if (e.color && typeof e.color.a === 'number') ls.opacity = e.color.a;
    if (e.offset) {
      ls.offset = e.offset;
      var da = distanceAngleFromOffset(e.offset);
      ls.distance = da.distance;
      ls.angle = da.angle;
    }
    if (typeof e.radius === 'number') ls.size = e.radius;
    if (typeof e.spread === 'number') { ls.spread = e.spread; ls.choke = e.spread; }
    return ls;
  }

  return {
    LAYER_STYLE_TYPES: LAYER_STYLE_TYPES,
    isLayerStyleEffect: isLayerStyleEffect,
    offsetFromDistanceAngle: offsetFromDistanceAngle,
    distanceAngleFromOffset: distanceAngleFromOffset,
    blendModeToLayerStyleOrdinal: blendModeToLayerStyleOrdinal,
    effectToLayerStyle: effectToLayerStyle
  };
});
