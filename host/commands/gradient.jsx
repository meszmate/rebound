/*
 * Rebound host — Gradient (add a gradient fill to selected shape layers).
 *
 * For each selected shape layer (one that carries a Root Vectors Group), we
 * recurse the vectors tree and add a Gradient Fill operator to every shape
 * group's contents collection. The ramp type is set to linear (1) or radial
 * (2), and the start/end points are spread horizontally so the ramp is
 * visible. AE's default black-to-white stops are left untouched — setting the
 * gradient color stops via script is unreliable. Non-shape layers are skipped.
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

  // Add a gradient fill to a shape group's contents collection, and the ramp
  // type / point spread. Some builds name the points differently, so guard the
  // point sets. Returns the number of gradient fills added.
  function addGradientFill(contents, gradType) {
    var gfill = contents.addProperty(GFILL);
    gfill.property(GRAD_TYPE).setValue(gradType);
    try {
      gfill.property(GRAD_START).setValue([-100, 0]);
      gfill.property(GRAD_END).setValue([100, 0]);
    } catch (e) {}
    return 1;
  }

  // Walk a vectors group. Every nested shape group's contents collection
  // ('ADBE Vectors Group') receives a gradient fill; nested groups recurse.
  // Returns the number of gradient fills added in this subtree.
  function fillGroups(group, gradType) {
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
      added += addGradientFill(nested[k], gradType);
      added += fillGroups(nested[k], gradType);
    }
    return added;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more shape layers to fill.');

    var gradType = (args && args.type === 'radial') ? 2 : 1;

    var applied = 0;
    var skipped = 0;

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = layer.property(ROOT);
      if (!root) {
        skipped++;
        continue;
      }
      fillGroups(root, gradType);
      applied++;
    }

    return { applied: applied, skipped: skipped };
  }

  R.register('gradient.apply', apply, 'Rebound: Gradient');
})();
