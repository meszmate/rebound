/*
 * Rebound host, Color (set the fill color of selected layers).
 *
 * For each selected layer we pick a strategy by layer kind:
 *   shape , recurse the root vectors tree and recolor every Fill operator.
 *   solid , recolor the layer's SolidSource directly.
 *   other , add a Fill effect and set its color.
 * Layers we cannot color (e.g. a null with no source) are reported as skipped.
 * Colors arrive as a 0..1 RGB triplet; AE color properties take [r, g, b].
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  var ROOT = 'ADBE Root Vectors Group';
  var GROUP_CONTENTS = 'ADBE Vectors Group';
  var FILL = 'ADBE Vector Graphic - Fill';
  var FILL_COLOR = 'ADBE Vector Fill Color';
  var EFFECT_PARADE = 'ADBE Effect Parade';
  var FILL_EFFECT = 'ADBE Fill';

  function clamp01(v) {
    if (v == null || isNaN(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  // Normalize the incoming triplet into a 3-component [r, g, b] in 0..1.
  function readColor(rgb) {
    if (!rgb || rgb.length < 3) throw new Error('No color was supplied.');
    return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
  }

  // Write [r, g, b] to a color property unless it is keyframed or expression-driven.
  function setColorProp(prop, rgb) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    var v = [rgb[0], rgb[1], rgb[2]];
    // Some color properties carry a 4th (alpha) component; preserve its width.
    if (prop.value && prop.value.length > 3) v.push(prop.value[3]);
    prop.setValue(v);
    return true;
  }

  // Recurse a vectors group, recoloring every Fill operator found within.
  function recolorFills(group, rgb) {
    var hit = 0;
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === FILL) {
        if (setColorProp(child.property(FILL_COLOR), rgb)) hit++;
      } else if (child.matchName === GROUP_CONTENTS) {
        hit += recolorFills(child, rgb);
      }
    }
    return hit;
  }

  function isSolid(layer) {
    return layer.source && layer.source.mainSource &&
      layer.source.mainSource instanceof SolidSource;
  }

  // Add (or reuse) a Fill effect on the layer and set its color.
  function colorViaFillEffect(layer, rgb) {
    var fx = layer.property(EFFECT_PARADE);
    if (!fx) return false;
    var fill = fx.addProperty(FILL_EFFECT);
    // The Fill effect's color is its Color parameter (matchName-stable by index).
    var colorProp = fill.property('Color') || fill.property(2);
    if (!colorProp) return false;
    return setColorProp(colorProp, rgb);
  }

  function colorLayer(layer, rgb) {
    var root = layer.property(ROOT);
    if (root) {
      return recolorFills(root, rgb) > 0;
    }
    if (isSolid(layer)) {
      layer.source.mainSource.color = [rgb[0], rgb[1], rgb[2]];
      return true;
    }
    return colorViaFillEffect(layer, rgb);
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more layers to color.');

    var rgb = readColor(args && args.rgb);

    var colored = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (colorLayer(layer, rgb)) colored++;
      else skipped.push(layer.name + ' (cannot be colored)');
    }

    return { colored: colored, skipped: skipped };
  }

  R.register('color.apply', apply, 'Rebound: Color');
})();