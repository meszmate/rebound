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

  function clampPos(v) {
    if (v == null || isNaN(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // Encode N opaque color stops into the flat array the Grad Colors property
  // expects: 4 numbers per color stop (position, r, g, b), then 2 numbers per
  // alpha stop (position, alpha). Stops are sorted by position.
  function nStopData(stops) {
    var s = stops.slice().sort(function (a, b) { return a.pos - b.pos; });
    var arr = [];
    var i;
    for (i = 0; i < s.length; i++) {
      arr.push(s[i].pos, s[i].color[0], s[i].color[1], s[i].color[2]);
    }
    for (i = 0; i < s.length; i++) {
      arr.push(s[i].pos, 1);
    }
    return arr;
  }

  // Add a gradient fill to a shape group's contents collection: ramp type,
  // point spread, and the two chosen color stops. Some builds name the points
  // differently and the colors array can be version-sensitive, so guard each.
  // Returns the number of gradient fills added.
  function addGradientFill(contents, gradType, colorsData, sp, ep) {
    var gfill = contents.addProperty(GFILL);
    gfill.property(GRAD_TYPE).setValue(gradType);
    try {
      gfill.property(GRAD_START).setValue(sp);
      gfill.property(GRAD_END).setValue(ep);
    } catch (e) {}
    try {
      gfill.property(GRAD_COLORS).setValue(colorsData);
    } catch (e2) {}
    return 1;
  }

  // Walk a vectors group. Every nested shape group's contents collection
  // ('ADBE Vectors Group') receives a gradient fill; nested groups recurse.
  // Returns the number of gradient fills added in this subtree.
  function fillGroups(group, gradType, colorsData, sp, ep) {
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
      added += addGradientFill(nested[k], gradType, colorsData, sp, ep);
      added += fillGroups(nested[k], gradType, colorsData, sp, ep);
    }
    return added;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more shape layers to fill.');

    var gradType = (args && args.type === 'radial') ? 2 : 1;

    // Multi-stop: args.stops = [{ pos, color:[r,g,b] }]. Fall back to a two-stop
    // gradient from startColor/endColor for older callers.
    var stops = [];
    if (args && args.stops && args.stops.length >= 2) {
      for (var si = 0; si < args.stops.length; si++) {
        var st = args.stops[si];
        stops.push({ pos: clampPos(st.pos), color: readColor(st.color, [0, 0, 0]) });
      }
    } else {
      stops.push({ pos: 0, color: readColor(args && args.startColor, [0, 0, 0]) });
      stops.push({ pos: 1, color: readColor(args && args.endColor, [1, 1, 1]) });
    }
    var colorsData = nStopData(stops);

    // Ramp endpoints. Prefer the explicit line (normalized 0..1, mapped to a
    // +/-100 box so a line dragged outside the shape extends past it); fall back
    // to rotating a centered line by the angle for older callers.
    var sp, ep;
    if (args && args.start && args.end) {
      sp = [(args.start.x - 0.5) * 200, (args.start.y - 0.5) * 200];
      ep = [(args.end.x - 0.5) * 200, (args.end.y - 0.5) * 200];
    } else {
      var ang = (args && args.angle != null) ? args.angle : 0;
      var t = ang * Math.PI / 180;
      sp = [Math.cos(t) * -100, Math.sin(t) * -100];
      ep = [Math.cos(t) * 100, Math.sin(t) * 100];
    }

    var applied = 0;
    var skipped = 0;

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = layer.property(ROOT);
      if (!root) {
        skipped++;
        continue;
      }
      fillGroups(root, gradType, colorsData, sp, ep);
      applied++;
    }

    return { applied: applied, skipped: skipped };
  }

  R.register('gradient.apply', apply, 'Rebound: Gradient');
})();
