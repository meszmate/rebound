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

  R.register('comp.info', info);
  R.register('comp.apply', apply, 'Rebound: Composition Settings');
})();
