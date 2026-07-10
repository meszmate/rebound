/*
 * Rebound host, Reset (restore transform properties to defaults).
 *
 * For each selected AVLayer and each enabled axis, restores the matching
 * transform property to its default, but only when that property is neither
 * keyframed nor expression-driven (those are left untouched). Position goes to
 * the composition center (z preserved for 3D layers); scale to 100% across all
 * its dimensions; rotation to 0; opacity to 100; anchor to the bounding-box
 * center via sourceRectAtTime. The anchor reset is deliberate and does NOT
 * compensate Position, the layer is expected to move.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  // True when a property can be safely overwritten with a static value.
  function isStatic(prop) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    return true;
  }

  function resetPosition(layer, comp, time) {
    var tr = layer.property(M.transform);
    var pos = tr.property(M.position);
    if (!isStatic(pos)) return false;
    // Position is written in the layer's PARENT space; convert the comp centre
    // through the inverse of the parent's world matrix so parented layers land
    // at the visual comp centre too (unparented layers pass through unchanged).
    var target = util.compPointToParent(layer, comp.width / 2, comp.height / 2, time);
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) {
      var px = tr.property(M.positionX), py = tr.property(M.positionY);
      var wrote = false;
      if (px && isStatic(px)) { px.setValue(target[0]); wrote = true; }
      if (py && isStatic(py)) { py.setValue(target[1]); wrote = true; }
      // Count a reset only when a follower was actually written; both keyed
      // means nothing changed.
      return wrote;
    }
    var v = pos.value;
    var nv = [target[0], target[1]];
    if (v.length > 2) nv.push(v[2]);
    pos.setValue(nv);
    return true;
  }

  function resetScale(layer) {
    var sc = layer.property(M.transform).property(M.scale);
    if (!isStatic(sc)) return false;
    var nv = [];
    for (var i = 0; i < sc.value.length; i++) nv.push(100);
    sc.setValue(nv);
    return true;
  }

  function resetRotation(layer) {
    var rot = layer.property(M.transform).property(M.rotation);
    if (!isStatic(rot)) return false;
    rot.setValue(0);
    return true;
  }

  function resetOpacity(layer) {
    var op = layer.property(M.transform).property(M.opacity);
    if (!isStatic(op)) return false;
    op.setValue(100);
    return true;
  }

  function resetAnchor(layer, time, skipped) {
    var anchorProp = layer.property(M.transform).property(M.anchor);
    if (!isStatic(anchorProp)) return false;
    // Audio-only layers have no source rect (the read throws — cameras/lights
    // are filtered upstream but audio is not) and empty layers can report a 0x0
    // rect; either used to abort the whole loop or send the anchor to a
    // degenerate point. Skip with a reason instead.
    var rect = null;
    try { rect = layer.sourceRectAtTime(time, false); } catch (e) { rect = null; }
    if (!rect || !(rect.width > 0 || rect.height > 0)) {
      skipped.push(layer.name + ' (no visible bounds)');
      return false;
    }
    var v = anchorProp.value;
    var nv = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    if (v.length > 2) nv.push(v[2]);
    anchorProp.setValue(nv);
    return true;
  }

  function reset(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to reset.');

    var time = comp.time;
    var resetCount = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;

      var touched = false;
      if (args.position && resetPosition(layer, comp, time)) touched = true;
      if (args.scale && resetScale(layer)) touched = true;
      if (args.rotation && resetRotation(layer)) touched = true;
      if (args.opacity && resetOpacity(layer)) touched = true;
      if (args.anchor && resetAnchor(layer, time, skipped)) touched = true;

      if (touched) resetCount++;
    }

    return { reset: resetCount, skipped: skipped };
  }

  R.register('reset.apply', reset, 'Rebound: Reset');
})();