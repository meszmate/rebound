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
  var VGROUP = 'ADBE Vector Group';      // a group wrapper ("Rectangle 1")
  var GROUP_CONTENTS = 'ADBE Vectors Group'; // its child container
  var FILL = 'ADBE Vector Graphic - Fill';
  var FILL_COLOR = 'ADBE Vector Fill Color';
  var STROKE = 'ADBE Vector Graphic - Stroke';
  var STROKE_COLOR = 'ADBE Vector Stroke Color';
  var EFFECT_PARADE = 'ADBE Effect Parade';
  var FILL_EFFECT = 'ADBE Fill';
  // Stable matchName for the Fill effect's Color parameter. The localized
  // display name ("Color") and the raw index both break: on a non-English AE
  // the name differs, and index 2 of ADBE Fill is the "All Masks" checkbox,
  // not the color (which is index 3 / matchName ADBE Fill-0003).
  var FILL_EFFECT_COLOR = 'ADBE Fill-0003';

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

  // Recurse a vectors group, recoloring every operator of the given matchName
  // (Fill or Stroke) found within. The color parameter differs per operator.
  function recolorOp(group, rgb, opMatch, colorMatch) {
    var hit = 0;
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === opMatch) {
        if (setColorProp(child.property(colorMatch), rgb)) hit++;
      } else if (child.matchName === GROUP_CONTENTS) {
        hit += recolorOp(child, rgb, opMatch, colorMatch);
      } else if (child.matchName === VGROUP) {
        // A group wrapper ("Rectangle 1"): its operators live in its contents.
        var contents = child.property(GROUP_CONTENTS);
        if (contents) hit += recolorOp(contents, rgb, opMatch, colorMatch);
      }
    }
    return hit;
  }

  function recolorFills(group, rgb) {
    return recolorOp(group, rgb, FILL, FILL_COLOR);
  }

  function recolorStrokes(group, rgb) {
    return recolorOp(group, rgb, STROKE, STROKE_COLOR);
  }

  function isSolid(layer) {
    return layer.source && layer.source.mainSource &&
      layer.source.mainSource instanceof SolidSource;
  }

  // Locate the Fill effect's Color parameter without relying on a localized
  // display name or a magic index: prefer the stable matchName, then fall back
  // to the first color-typed parameter on the effect.
  function fillColorParam(fill) {
    var byMatch = null;
    try { byMatch = fill.property(FILL_EFFECT_COLOR); } catch (eMatch) {}
    if (byMatch && byMatch.propertyValueType === PropertyValueType.COLOR) return byMatch;
    for (var i = 1; i <= fill.numProperties; i++) {
      var p = fill.property(i);
      if (p && p.propertyValueType === PropertyValueType.COLOR) return p;
    }
    return null;
  }

  // Add (or reuse) a Fill effect on the layer and set its color.
  function colorViaFillEffect(layer, rgb) {
    var fx = layer.property(EFFECT_PARADE);
    if (!fx) return false;
    var existing = R.rig.findByName(layer, 'Rebound Fill');
    var fill = existing || fx.addProperty(FILL_EFFECT);
    if (!existing) fill.name = 'Rebound Fill';
    var colorProp = fillColorParam(fill);
    if (!colorProp) return false;
    return setColorProp(colorProp, rgb);
  }

  // target: 'fill' (default), 'stroke', or 'both'. Strokes only exist on shape
  // layers; solids and the Fill-effect path are fill-only, so a stroke-only
  // target leaves them untouched (reported as skipped).
  function colorLayer(layer, rgb, target) {
    var wantFill = target === 'fill' || target === 'both';
    var wantStroke = target === 'stroke' || target === 'both';
    var root = layer.property(ROOT);
    if (root) {
      var hit = 0;
      if (wantFill) hit += recolorFills(root, rgb);
      if (wantStroke) hit += recolorStrokes(root, rgb);
      return hit > 0;
    }
    if (!wantFill) return false;
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
    var target = (args && (args.target === 'stroke' || args.target === 'both')) ? args.target : 'fill';

    var colored = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (colorLayer(layer, rgb, target)) colored++;
      else skipped.push(layer.name + ' (cannot be colored)');
    }

    return { colored: colored, skipped: skipped };
  }

  // ---- Read the current colour off the selected layer -----------------------

  // First operator colour (Fill or Stroke) found in a vectors tree, as [r,g,b].
  function firstOpColor(group, opMatch, colorMatch) {
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === opMatch) {
        var cp = child.property(colorMatch);
        if (cp && cp.value) return [cp.value[0], cp.value[1], cp.value[2]];
      } else if (child.matchName === GROUP_CONTENTS) {
        var r = firstOpColor(child, opMatch, colorMatch);
        if (r) return r;
      } else if (child.matchName === VGROUP) {
        var contents = child.property(GROUP_CONTENTS);
        if (contents) {
          var rg = firstOpColor(contents, opMatch, colorMatch);
          if (rg) return rg;
        }
      }
    }
    return null;
  }

  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) return { found: false };
    var layer = layers[0];
    var root = layer.property(ROOT);
    if (root) {
      var f = firstOpColor(root, FILL, FILL_COLOR);
      if (f) return { found: true, layerName: layer.name, rgb: f, target: 'fill' };
      var s = firstOpColor(root, STROKE, STROKE_COLOR);
      if (s) return { found: true, layerName: layer.name, rgb: s, target: 'stroke' };
      return { found: false };
    }
    if (isSolid(layer)) {
      var c = layer.source.mainSource.color;
      return { found: true, layerName: layer.name, rgb: [c[0], c[1], c[2]], target: 'fill' };
    }
    var fx = layer.property(EFFECT_PARADE);
    if (fx) {
      var fill = R.rig.findByName(layer, 'Rebound Fill');
      if (!fill) {
        for (var i = 1; i <= fx.numProperties; i++) { if (fx.property(i).matchName === FILL_EFFECT) { fill = fx.property(i); break; } }
      }
      if (fill) {
        var cp = fillColorParam(fill);
        if (cp && cp.value) return { found: true, layerName: layer.name, rgb: [cp.value[0], cp.value[1], cp.value[2]], target: 'fill' };
      }
    }
    return { found: false };
  }

  R.register('color.apply', apply, 'Rebound: Color');
  R.register('color.read', read); // read-only, no undo group
})();