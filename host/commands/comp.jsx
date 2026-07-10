/*
 * Rebound host, Composition (edit the active comp's settings in place).
 *
 * Reads the active composition's frame rate, duration, width, and height
 * (comp.info), and writes any of them back (comp.apply) when provided and
 * greater than zero. comp.info is read-only and carries no undo label.
 *
 * Resolution changes optionally keep existing content centered: AE stores layer
 * positions in absolute pixels, so growing or shrinking the frame would shift
 * everything toward a corner. When recenter is on we offset each top-level
 * layer's Position by half the size delta so the framing is preserved.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var XFORM = 'ADBE Transform Group';
  var POSITION = 'ADBE Position';

  function num(v) {
    return (v == null || isNaN(v)) ? 0 : v;
  }

  // Axis-aligned bounding box of a layer in composition space, via the shared
  // parent-chain, rotation-aware matrix helpers in host/lib/util.jsx (the same
  // math align/arrange/flip use). Returns null for layers without bounds.
  function layerBox(layer, time) {
    if (layer instanceof CameraLayer || layer instanceof LightLayer) return null;
    return util.bboxOf(layer, time);
  }

  function clampSize(v) {
    v = Math.round(v);
    if (v < 4) return 4;
    if (v > 30000) return 30000;
    return v;
  }

  // Offset every top-level layer's Position by (dx, dy) so comp content stays
  // centered after a resolution change. Parented layers move with their parent;
  // expression-driven and separated positions are left alone (cannot be offset
  // safely). Keyframed positions are shifted across every key.
  function recenterLayers(comp, dx, dy) {
    if (dx === 0 && dy === 0) return;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (layer.parent) continue;
      var pos = null;
      try { pos = layer.property(XFORM).property(POSITION); } catch (e) { continue; }
      if (!pos) continue;
      if (pos.dimensionsSeparated) continue;
      if (pos.expressionEnabled && pos.expression && pos.expression !== '') continue;
      if (pos.numKeys > 0) {
        for (var k = 1; k <= pos.numKeys; k++) {
          var kv = pos.keyValue(k);
          kv[0] += dx; kv[1] += dy;
          pos.setValueAtKey(k, kv);
        }
      } else {
        var v = pos.value;
        v[0] += dx; v[1] += dy;
        pos.setValue(v);
      }
    }
  }

  // Read-only: report the active comp's current settings for pre-fill.
  function info() {
    var comp = util.activeComp();
    return {
      name: comp.name,
      frameRate: comp.frameRate,
      duration: comp.duration,
      width: comp.width,
      height: comp.height
    };
  }

  // Write back any provided setting greater than zero.
  function apply(args) {
    var comp = util.activeComp();

    var frameRate = num(args.frameRate);
    var duration = num(args.duration);
    var width = num(args.width);
    var height = num(args.height);
    var recenter = args.recenter !== false;

    if (frameRate > 0) comp.frameRate = frameRate;
    if (duration > 0) comp.duration = duration;

    var oldW = comp.width;
    var oldH = comp.height;
    var newW = width > 0 ? Math.round(width) : oldW;
    var newH = height > 0 ? Math.round(height) : oldH;

    if (newW !== oldW) comp.width = newW;
    if (newH !== oldH) comp.height = newH;

    if (recenter) {
      recenterLayers(comp, (newW - oldW) / 2, (newH - oldH) / 2);
    }

    return { ok: true, recentered: recenter && (newW !== oldW || newH !== oldH) };
  }

  // Resize the comp to fit the selected layers (or all layers when none are
  // selected), with an optional pixel margin, shifting every layer so the
  // content lands at the margin. Mirrors how Crop Comp is used day to day.
  function cropToContent(args) {
    var comp = util.activeComp();
    var pad = num(args && args.padding);
    if (pad < 0) pad = 0;

    var sel = comp.selectedLayers;
    var useSelected = args && args.scope === 'all' ? false : (sel && sel.length > 0);

    var boxes = [];
    var b, i;
    if (useSelected) {
      for (i = 0; i < sel.length; i++) { b = layerBox(sel[i], comp.time); if (b) boxes.push(b); }
    } else {
      for (i = 1; i <= comp.numLayers; i++) { b = layerBox(comp.layer(i), comp.time); if (b) boxes.push(b); }
    }
    if (!boxes.length) throw new Error('No layers with bounds to crop to.');

    var u = { minX: boxes[0].minX, minY: boxes[0].minY, maxX: boxes[0].maxX, maxY: boxes[0].maxY };
    for (i = 1; i < boxes.length; i++) {
      if (boxes[i].minX < u.minX) u.minX = boxes[i].minX;
      if (boxes[i].minY < u.minY) u.minY = boxes[i].minY;
      if (boxes[i].maxX > u.maxX) u.maxX = boxes[i].maxX;
      if (boxes[i].maxY > u.maxY) u.maxY = boxes[i].maxY;
    }

    var newW = clampSize(u.maxX - u.minX + 2 * pad);
    var newH = clampSize(u.maxY - u.minY + 2 * pad);

    // Shift all layers so the content's top-left lands at (pad, pad).
    recenterLayers(comp, pad - u.minX, pad - u.minY);

    comp.width = newW;
    comp.height = newH;

    return { width: newW, height: newH };
  }

  R.register('comp.info', info);
  R.register('comp.apply', apply, 'Rebound: Composition Settings');
  R.register('comp.cropToContent', cropToContent, 'Rebound: Crop Comp to Content');
})();
