/*
 * Rebound host, Gradient (add a gradient fill to selected shape layers).
 *
 * For each selected shape layer (one that carries a Root Vectors Group), we
 * recurse the vectors tree and add a Gradient Fill operator to every shape
 * group's contents collection. The ramp type is set to linear (1) or radial
 * (2), and the start/end points are spread horizontally so the ramp is visible.
 * The two color stops are written via the encoded "Grad Colors" value (a
 * 2-color, 2-alpha gradient is a stable 12-number array), so the user gets the
 * colors they chose instead of a default black-to-white ramp. Non-shape layers
 * are skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var ROOT = 'ADBE Root Vectors Group';
  var GROUP_CONTENTS = 'ADBE Vectors Group';
  var GFILL = 'ADBE Vector Graphic - G-Fill';
  var GRAD_TYPE = 'ADBE Vector Grad Type';
  var GRAD_START = 'ADBE Vector Grad Start Pt';
  var GRAD_END = 'ADBE Vector Grad End Pt';
  var GRAD_COLORS = 'ADBE Vector Grad Colors';

  function clamp01(v) {
    if (v == null || isNaN(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function readColor(rgb, fallback) {
    if (!rgb || rgb.length < 3) return fallback;
    return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
  }

  // Encode a two-stop gradient (start color at 0, end color at 1, both fully
  // opaque) into the flat array the Grad Colors property expects:
  //   4 numbers per color stop  (position, r, g, b)
  //   2 numbers per alpha stop   (position, alpha)
  function twoStopData(c0, c1) {
    return [
      0, c0[0], c0[1], c0[2],
      1, c1[0], c1[1], c1[2],
      0, 1,
      1, 1
    ];
  }

  // Add a gradient fill to a shape group's contents collection: ramp type,
  // point spread, and the two chosen color stops. Some builds name the points
  // differently and the colors array can be version-sensitive, so guard each.
  // Returns the number of gradient fills added.
  function addGradientFill(contents, gradType, c0, c1) {
    var gfill = contents.addProperty(GFILL);
    gfill.property(GRAD_TYPE).setValue(gradType);
    try {
      gfill.property(GRAD_START).setValue([-100, 0]);
      gfill.property(GRAD_END).setValue([100, 0]);
    } catch (e) {}
    try {
      gfill.property(GRAD_COLORS).setValue(twoStopData(c0, c1));
    } catch (e2) {}
    return 1;
  }

  // Walk a vectors group. Every nested shape group's contents collection
  // ('ADBE Vectors Group') receives a gradient fill; nested groups recurse.
  // Returns the number of gradient fills added in this subtree.
  function fillGroups(group, gradType, c0, c1) {
    // Snapshot the nested contents collections first; adding a G-Fill mutates
    // a collection while we iterate over its siblings.
    var nested = [];
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === GROUP_CONTENTS) {
        nested.push(child);
      }
    }

    var added = 0;
    for (var k = 0; k < nested.length; k++) {
      added += addGradientFill(nested[k], gradType, c0, c1);
      added += fillGroups(nested[k], gradType, c0, c1);
    }
    return added;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more shape layers to fill.');

    var gradType = (args && args.type === 'radial') ? 2 : 1;
    var c0 = readColor(args && args.startColor, [0, 0, 0]);
    var c1 = readColor(args && args.endColor, [1, 1, 1]);

    var applied = 0;
    var skipped = 0;

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = layer.property(ROOT);
      if (!root) {
        skipped++;
        continue;
      }
      fillGroups(root, gradType, c0, c1);
      applied++;
    }

    return { applied: applied, skipped: skipped };
  }

  R.register('gradient.apply', apply, 'Rebound: Gradient');
})();
