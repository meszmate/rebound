/*
 * Rebound host, Stroke (add, update, or remove a stroke on shape layers).
 *
 * Apply: for each selected shape layer (one carrying a Root Vectors Group),
 * recurse its vector groups to reach every shape group, then add (or reuse) a
 * Stroke operator and set its color and width. Remove: recurse the same tree
 * and .remove() every Stroke operator. Non-shape layers are collected by name
 * and reported as skipped. Colors arrive as a 0..1 RGB triplet.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var ROOT = 'ADBE Root Vectors Group';
  var GROUP = 'ADBE Vector Group';
  var GROUP_CONTENTS = 'ADBE Vectors Group';
  var STROKE = 'ADBE Vector Graphic - Stroke';
  var STROKE_COLOR = 'ADBE Vector Stroke Color';
  var STROKE_WIDTH = 'ADBE Vector Stroke Width';

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

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  // Write [r, g, b] / width to a property unless keyframed or expression-driven.
  function setProp(prop, value) {
    if (!prop) return;
    if (prop.numKeys > 0) return;
    if (prop.expressionEnabled && prop.expression !== '') return;
    prop.setValue(value);
  }

  // Find the first immediate child Stroke operator of a contents group, or null.
  function findStroke(contents) {
    for (var i = 1; i <= contents.numProperties; i++) {
      if (contents.property(i).matchName === STROKE) return contents.property(i);
    }
    return null;
  }

  // Add (or reuse) a Stroke on a single shape group's contents collection and
  // set its color and width.
  function strokeContents(contents, rgb, width) {
    var stroke = findStroke(contents);
    if (!stroke) stroke = contents.addProperty(STROKE);
    if (!stroke) return 0;
    setProp(stroke.property(STROKE_COLOR), [rgb[0], rgb[1], rgb[2]]);
    setProp(stroke.property(STROKE_WIDTH), width);
    return 1;
  }

  // Recurse a vectors collection (the root group, or a nested group's contents).
  // Each shape group within ('ADBE Vector Group') exposes its own contents
  // collection ('ADBE Vectors Group'); stroke that collection, then descend into
  // any groups nested inside it. The container collection itself is not stroked.
  function strokeTree(contents, rgb, width) {
    var hit = 0;
    for (var i = 1; i <= contents.numProperties; i++) {
      var child = contents.property(i);
      if (child.matchName === GROUP) {
        var inner = child.property(GROUP_CONTENTS);
        if (inner) {
          hit += strokeContents(inner, rgb, width);
          hit += strokeTree(inner, rgb, width);
        }
      }
    }
    return hit;
  }

  // Recurse a vectors collection, removing every Stroke operator found within.
  // Walk high-to-low so removing a property does not shift indices we still need.
  function removeStrokes(contents) {
    var removed = 0;
    for (var i = contents.numProperties; i >= 1; i--) {
      var child = contents.property(i);
      if (child.matchName === STROKE) {
        try { child.remove(); removed++; } catch (e) {}
      } else if (child.matchName === GROUP) {
        var inner = child.property(GROUP_CONTENTS);
        if (inner) removed += removeStrokes(inner);
      }
    }
    return removed;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more shape layers to stroke.');

    var rgb = readColor(args && args.rgb);
    var width = num(args && args.width, 4);
    if (width < 0) width = 0;

    var stroked = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = layer.property(ROOT);
      if (root && strokeTree(root, rgb, width) > 0) {
        stroked++;
      } else {
        skipped.push(layer.name + ' (not a shape layer)');
      }
    }

    return { stroked: stroked, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more shape layers.');

    var removed = 0;
    for (var i = 0; i < layers.length; i++) {
      var root = layers[i].property(ROOT);
      if (root) removed += removeStrokes(root);
    }

    return { removed: removed };
  }

  R.register('stroke.apply', apply, 'Rebound: Stroke');
  R.register('stroke.remove', remove, 'Rebound: Remove Stroke');
})();