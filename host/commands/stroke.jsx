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
  var STROKE_CAP = 'ADBE Vector Stroke Line Cap';
  var STROKE_DASHES = 'ADBE Vector Stroke Dashes';
  var DASH_1 = 'ADBE Vector Stroke Dash 1';
  var GAP_1 = 'ADBE Vector Stroke Gap 1';

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

  // First immediate child of a group with the given matchName, or null. The
  // Dashes group's entries are dynamic, so we must scan instead of property().
  function findChild(group, matchName) {
    for (var i = 1; i <= group.numProperties; i++) {
      if (group.property(i).matchName === matchName) return group.property(i);
    }
    return null;
  }

  // Line cap and dash pattern. style.cap is 'butt'/'round' (AE enum 1/2) or
  // null to leave the cap alone; style.dashed true adds Dash 1 + Gap 1 (with
  // canAddProperty guards), false clears any dash/gap entries, null leaves the
  // pattern untouched (quick actions send no style).
  function applyStrokeStyle(stroke, style) {
    if (!style) return;
    if (style.cap) {
      try { setProp(stroke.property(STROKE_CAP), style.cap === 'round' ? 2 : 1); } catch (eCap) {}
    }
    if (style.dashed == null) return;
    var dashes = null;
    try { dashes = stroke.property(STROKE_DASHES); } catch (eDash) {}
    if (!dashes) return;
    if (style.dashed) {
      var d = findChild(dashes, DASH_1);
      if (!d && dashes.canAddProperty(DASH_1)) d = dashes.addProperty(DASH_1);
      if (d) setProp(d, style.dash);
      var g = findChild(dashes, GAP_1);
      if (!g && dashes.canAddProperty(GAP_1)) g = dashes.addProperty(GAP_1);
      if (g) setProp(g, style.gap);
    } else {
      // Solid again: strip every dash/gap entry (leave Offset etc. alone).
      for (var i = dashes.numProperties; i >= 1; i--) {
        var mn = dashes.property(i).matchName;
        if (mn.indexOf('ADBE Vector Stroke Dash') === 0 || mn.indexOf('ADBE Vector Stroke Gap') === 0) {
          try { dashes.property(i).remove(); } catch (eRm) {}
        }
      }
    }
  }

  // Add (or reuse) a Stroke on a single shape group's contents collection and
  // set its color, width, cap, and dash pattern.
  function strokeContents(contents, rgb, width, style) {
    var stroke = findStroke(contents);
    if (!stroke) stroke = contents.addProperty(STROKE);
    if (!stroke) return 0;
    setProp(stroke.property(STROKE_COLOR), [rgb[0], rgb[1], rgb[2]]);
    setProp(stroke.property(STROKE_WIDTH), width);
    applyStrokeStyle(stroke, style);
    return 1;
  }

  // Recurse a vectors collection (the root group, or a nested group's contents).
  // Each shape group within ('ADBE Vector Group') exposes its own contents
  // collection ('ADBE Vectors Group'); stroke that collection, then descend into
  // any groups nested inside it. The container collection itself is not stroked.
  function strokeTree(contents, rgb, width, style) {
    var hit = 0;
    for (var i = 1; i <= contents.numProperties; i++) {
      var child = contents.property(i);
      if (child.matchName === GROUP) {
        var inner = child.property(GROUP_CONTENTS);
        if (inner) {
          hit += strokeContents(inner, rgb, width, style);
          hit += strokeTree(inner, rgb, width, style);
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
    var style = {
      cap: (args && (args.cap === 'round' || args.cap === 'butt')) ? args.cap : null,
      dashed: (args && args.dashed != null) ? !!args.dashed : null,
      dash: Math.max(0, num(args && args.dash, 10)),
      gap: Math.max(0, num(args && args.gap, 10))
    };

    var stroked = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = layer.property(ROOT);
      if (root && strokeTree(root, rgb, width, style) > 0) {
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

  // ---- Read the current stroke off the selected shape layer -----------------

  // The first Stroke operator anywhere in a vectors tree, or null.
  function findFirstStroke(contents) {
    for (var i = 1; i <= contents.numProperties; i++) {
      var child = contents.property(i);
      if (child.matchName === GROUP) {
        var inner = child.property(GROUP_CONTENTS);
        if (inner) {
          var s = findStroke(inner);
          if (s) return s;
          var deeper = findFirstStroke(inner);
          if (deeper) return deeper;
        }
      }
    }
    return null;
  }

  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) return { found: false };
    for (var i = 0; i < layers.length; i++) {
      var root = layers[i].property(ROOT);
      if (!root) continue;
      var stroke = findFirstStroke(root);
      if (!stroke) continue;
      var col = [0, 0, 0], w = 4;
      try { var c = stroke.property(STROKE_COLOR).value; col = [c[0], c[1], c[2]]; } catch (e) {}
      try { w = stroke.property(STROKE_WIDTH).value; } catch (e2) {}
      var cap = 'butt';
      try { if (stroke.property(STROKE_CAP).value === 2) cap = 'round'; } catch (e3) {}
      var dashed = false, dash = null, gap = null;
      try {
        var dashes = stroke.property(STROKE_DASHES);
        if (dashes) {
          for (var d = 1; d <= dashes.numProperties; d++) {
            var p = dashes.property(d);
            if (p.matchName === DASH_1) { dashed = true; dash = p.value; }
            else if (p.matchName === GAP_1) { gap = p.value; }
          }
        }
      } catch (e4) {}
      return { found: true, layerName: layers[i].name, rgb: col, width: w, cap: cap, dashed: dashed, dash: dash, gap: gap };
    }
    return { found: false };
  }

  R.register('stroke.apply', apply, 'Rebound: Stroke');
  R.register('stroke.remove', remove, 'Rebound: Remove Stroke');
  R.register('stroke.read', read); // read-only, no undo group
})();