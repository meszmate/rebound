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
  var GFILL = 'ADBE Vector Graphic - G-Fill';   // gradient fill operator
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

  // Does this shape tree already carry ANY fill paint (solid or gradient)? Used
  // to decide how to colour a shape that has no recolorable SOLID fill: if it is
  // truly unfilled we can add a clean native Fill operator; if a gradient fill is
  // present we must tint on top (an added operator would render behind it).
  function hasAnyFill(group) {
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === FILL || child.matchName === GFILL) return true;
      if (child.matchName === GROUP_CONTENTS) {
        if (hasAnyFill(child)) return true;
      } else if (child.matchName === VGROUP) {
        var contents = child.property(GROUP_CONTENTS);
        if (contents && hasAnyFill(contents)) return true;
      }
    }
    return false;
  }

  // Append a real, editable solid Fill operator to a shape's root vectors group
  // and colour it. Used when a shape has no solid fill yet, so colouring it adds
  // a native shape fill instead of silently skipping the layer. Returns true on
  // success. (Appended operators render behind existing paint, so the caller only
  // uses this for shapes with NO existing fill.)
  function addShapeFill(root, rgb) {
    try {
      var fill = root.addProperty(FILL);
      if (!fill) return false;
      try { fill.name = 'Rebound Fill'; } catch (eName) { /* name is optional */ }
      return setColorProp(fill.property(FILL_COLOR), rgb);
    } catch (e) {
      return false;
    }
  }

  function isSolid(layer) {
    return layer.source && layer.source.mainSource &&
      layer.source.mainSource instanceof SolidSource;
  }

  // How many layers (across every comp that uses it) draw from this source.
  // Recoloring a shared SolidSource would recolor every duplicate at once.
  function solidUseCount(item) {
    var count = 0;
    try {
      var comps = item.usedIn;
      for (var i = 0; i < comps.length; i++) {
        var c = comps[i];
        for (var j = 1; j <= c.numLayers; j++) {
          if (c.layer(j).source === item) count++;
        }
      }
    } catch (e) { return 1; }
    return count;
  }

  // Recolor a solid layer without touching its siblings: when the SolidSource
  // is shared by more than one layer, mint a fresh source (FootageItem has no
  // duplicate(), so a throwaway addSolid supplies one), swap it in with
  // replaceSource, and name it after the layer. Only then set the color.
  function recolorSolid(comp, layer, rgb) {
    var src = layer.source;
    if (solidUseCount(src) > 1) {
      try {
        var tmp = comp.layers.addSolid([rgb[0], rgb[1], rgb[2]], layer.name, src.width, src.height, src.pixelAspect);
        var dup = tmp.source;
        tmp.remove();
        layer.replaceSource(dup, false);
        try { dup.name = layer.name; } catch (eName) { /* name is cosmetic */ }
        dup.mainSource.color = [rgb[0], rgb[1], rgb[2]];
        return true;
      } catch (eDup) { /* fall through: recolor the shared source */ }
    }
    src.mainSource.color = [rgb[0], rgb[1], rgb[2]];
    return true;
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
  function colorLayer(comp, layer, rgb, target) {
    var wantFill = target === 'fill' || target === 'both';
    var wantStroke = target === 'stroke' || target === 'both';
    var root = layer.property(ROOT);
    if (root) {
      var hit = 0;
      if (wantFill) hit += recolorFills(root, rgb);
      if (wantStroke) hit += recolorStrokes(root, rgb);
      if (hit > 0) return true;
      // The shape has no SOLID operator we could recolour -- it is gradient-
      // filled, stroke-only, has a keyframed/expression fill, or carries no paint
      // yet (common on imported artwork). Don't skip it. For a truly unfilled
      // shape, add a clean native Fill operator; otherwise tint the whole layer
      // with a reversible "Rebound Fill" effect, which always renders on top of
      // an existing gradient. Either way the chosen colour lands.
      if (wantFill) {
        if (!hasAnyFill(root) && addShapeFill(root, rgb)) return true;
        return colorViaFillEffect(layer, rgb);
      }
      return false;
    }
    if (!wantFill) return false;
    if (isSolid(layer)) {
      return recolorSolid(comp, layer, rgb);
    }
    return colorViaFillEffect(layer, rgb);
  }

  // args.rgb: one [r,g,b] for every layer (unchanged path). args.rgbs: a list
  // of [r,g,b] cycled per layer in top-to-bottom index order, so a palette
  // spreads predictably across the selection no matter how it was clicked.
  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more layers to color.');

    var rgbs = null;
    if (args && args.rgbs && args.rgbs.length) {
      rgbs = [];
      for (var c = 0; c < args.rgbs.length; c++) rgbs.push(readColor(args.rgbs[c]));
    }
    var rgb = rgbs ? null : readColor(args && args.rgb);
    var target = (args && (args.target === 'stroke' || args.target === 'both')) ? args.target : 'fill';

    var ordered = [];
    for (var i = 0; i < layers.length; i++) ordered.push(layers[i]);
    if (rgbs) ordered.sort(function (a, b) { return a.index - b.index; });

    var colored = 0;
    var skipped = [];

    for (var j = 0; j < ordered.length; j++) {
      var layer = ordered[j];
      var col = rgbs ? rgbs[j % rgbs.length] : rgb;
      if (colorLayer(comp, layer, col, target)) colored++;
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

  // ---- Collect a palette from the selection ---------------------------------

  function hex2(n) {
    var v = Math.round(clamp01(n) * 255);
    var s = v.toString(16);
    return s.length < 2 ? '0' + s : s;
  }
  function toHex(rgb) {
    return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]);
  }

  // Every operator colour (Fill or Stroke) in a vectors tree, pushed in order.
  function collectOpColors(group, opMatch, colorMatch, push) {
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      if (child.matchName === opMatch) {
        var cp = child.property(colorMatch);
        if (cp && cp.value) push([cp.value[0], cp.value[1], cp.value[2]]);
      } else if (child.matchName === GROUP_CONTENTS) {
        collectOpColors(child, opMatch, colorMatch, push);
      } else if (child.matchName === VGROUP) {
        var contents = child.property(GROUP_CONTENTS);
        if (contents) collectOpColors(contents, opMatch, colorMatch, push);
      }
    }
  }

  // palette.collect: distinct fill/stroke/solid colours from the selected
  // layers (or every comp layer when nothing is selected), deduped on rounded
  // hex and capped at 10. Returned as '#rrggbb' strings for the panel.
  function collect() {
    var comp = util.activeComp();
    var layers = [];
    var sel = comp.selectedLayers;
    if (sel && sel.length) {
      for (var s = 0; s < sel.length; s++) layers.push(sel[s]);
    } else {
      for (var a = 1; a <= comp.numLayers; a++) layers.push(comp.layer(a));
    }

    var colors = [];
    var seen = {};
    function push(rgb) {
      if (colors.length >= 10) return;
      var h = toHex(rgb);
      if (seen[h]) return;
      seen[h] = true;
      colors.push(h);
    }

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = null;
      try { root = layer.property(ROOT); } catch (eRoot) { root = null; }
      if (root) {
        collectOpColors(root, FILL, FILL_COLOR, push);
        collectOpColors(root, STROKE, STROKE_COLOR, push);
      } else if (isSolid(layer)) {
        var c = layer.source.mainSource.color;
        push([c[0], c[1], c[2]]);
      }
    }
    return { colors: colors };
  }

  R.register('color.apply', apply, 'Rebound: Color');
  R.register('color.read', read); // read-only, no undo group
  R.register('palette.collect', collect); // read-only, no undo group
})();