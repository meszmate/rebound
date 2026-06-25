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
  var VGROUP = 'ADBE Vector Group';      // a group wrapper ("Rectangle 1")
  var GROUP_CONTENTS = 'ADBE Vectors Group'; // its child container
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

  // Encode N color stops into the flat Grad Colors array. The shared encoder
  // (host/lib/grad.jsx) is the single source of truth for this format; here the
  // stops are opaque, so alpha defaults to 1.
  function nStopData(stops) {
    return $.__rebound.grad.encode(stops);
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
      } else if (child.matchName === VGROUP) {
        // A group wrapper ("Rectangle 1"): its contents collection is one level
        // deeper. Tool-drawn shapes always sit inside such a wrapper.
        var contents = child.property(GROUP_CONTENTS);
        if (contents) nested.push(contents);
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
      // Only count layers where at least one gradient fill was actually added;
      // a shape with no paintable group is a no-op, not a success.
      if (fillGroups(root, gradType, colorsData, sp, ep) > 0) applied++;
      else skipped++;
    }

    return { applied: applied, skipped: skipped };
  }

  // ---- Read the current gradient off the selected layer ---------------------

  // Find the first Gradient Fill anywhere in a vectors tree (depth first).
  function findFirstGFill(group) {
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === GFILL) return child;
      if (child.matchName === GROUP_CONTENTS) {
        var found = findFirstGFill(child);
        if (found) return found;
      } else if (child.matchName === VGROUP) {
        var contents = child.property(GROUP_CONTENTS);
        if (contents) {
          var fg = findFirstGFill(contents);
          if (fg) return fg;
        }
      }
    }
    return null;
  }

  // Decode the flat Grad Colors array back to [{ pos, color:[r,g,b] }]. The array
  // is N color stops (4 numbers each: pos,r,g,b) then N alpha stops (2 each), so a
  // well-formed value length is divisible by 6; we take the first 4N as colours.
  function decodeStops(data) {
    if (!data || !data.length || data.length % 6 !== 0) return null;
    var n = data.length / 6, stops = [];
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      stops.push({ pos: clampPos(data[o]), color: [clamp01(data[o + 1]), clamp01(data[o + 2]), clamp01(data[o + 3])] });
    }
    return stops;
  }

  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) return { found: false };
    for (var i = 0; i < layers.length; i++) {
      var root = layers[i].property(ROOT);
      if (!root) continue;
      var gfill = findFirstGFill(root);
      if (!gfill) continue;
      var type = (gfill.property(GRAD_TYPE).value === 2) ? 'radial' : 'linear';
      var sp = [-100, 0], ep = [100, 0], stops = null;
      try { sp = gfill.property(GRAD_START).value; ep = gfill.property(GRAD_END).value; } catch (e) {}
      try { stops = decodeStops(gfill.property(GRAD_COLORS).value); } catch (e2) {}
      if (!stops || stops.length < 2) stops = [{ pos: 0, color: [0, 0, 0] }, { pos: 1, color: [1, 1, 1] }];
      return {
        found: true,
        layerName: layers[i].name,
        type: type,
        angle: Math.atan2(ep[1] - sp[1], ep[0] - sp[0]) * 180 / Math.PI,
        start: { x: sp[0] / 200 + 0.5, y: sp[1] / 200 + 0.5 },
        end: { x: ep[0] / 200 + 0.5, y: ep[1] / 200 + 0.5 },
        stops: stops
      };
    }
    return { found: false };
  }

  R.register('gradient.apply', apply, 'Rebound: Gradient');
  R.register('gradient.read', read); // read-only, no undo group
})();
