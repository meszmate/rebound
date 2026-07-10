/*
 * Rebound host, Flip (mirror selected layers).
 *
 * Mirrors by negating the layer's scale on the chosen axis. For pivot
 * 'selection', also reflects each layer's position across the selection's
 * combined bounding box (same bbox math as align), so layers swap sides as a
 * group. Keyframed or expression-driven scale/position layers are skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function isLocked(prop) {
    return (prop.expressionEnabled && prop.expression !== '') || prop.numKeys > 0;
  }

  // Whether a layer has 2D bounds we can mirror. `instanceof AVLayer` is
  // unreliable for shape / text layers in ExtendScript even though they are
  // AVLayer subclasses, so test the sourceRectAtTime capability instead.
  function hasBounds(layer) {
    if (layer instanceof CameraLayer || layer instanceof LightLayer) return false;
    return typeof layer.sourceRectAtTime === 'function';
  }

  function flip(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');

    var axis = args.axis || 'horizontal';
    var doX = axis === 'horizontal' || axis === 'both';
    var doY = axis === 'vertical' || axis === 'both';
    var bySelection = args.pivot === 'selection';

    var time = comp.time;
    var boxes = [];
    var i;
    for (i = 0; i < layers.length; i++) {
      if (hasBounds(layers[i])) boxes.push(util.bboxOf(layers[i], time));
    }
    if (!boxes.length) throw new Error('Select one or more layers.');

    var ref = bySelection ? util.unionBoxes(boxes) : null;
    var cx = ref ? (ref.minX + ref.maxX) / 2 : 0;
    var cy = ref ? (ref.minY + ref.maxY) / 2 : 0;

    var flipped = 0;
    var skipped = [];

    for (i = 0; i < boxes.length; i++) {
      var layer = boxes[i].layer;
      var tr = layer.property(M.transform);
      var scale = tr.property(M.scale);
      var pos = tr.property(M.position);

      if (isLocked(scale)) { skipped.push(layer.name + ' (scale animated)'); continue; }

      // Separate Dimensions hides the unified Position (setting it throws), so
      // detect it and drive the X/Y followers; keys or expressions on a follower
      // count as locked exactly like on the unified property.
      var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
      var px = sep ? tr.property(M.positionX) : null;
      var py = sep ? tr.property(M.positionY) : null;

      // Do ALL reads and guards, and compute the mirrored position, BEFORE any
      // write: a refusal mid-layer used to leave the scale negated but the
      // position untouched (a half-flipped layer).
      var newPos = null;
      if (bySelection) {
        if (isLocked(pos) || (sep && ((px && isLocked(px)) || (py && isLocked(py))))) {
          skipped.push(layer.name + ' (position animated)');
          continue;
        }
        var pv = sep ? [px ? px.value : 0, py ? py.value : 0] : pos.value;
        // Position is parent-space for parented layers; reflect its COMP-space
        // point across the selection centre, then convert the comp-space move
        // back into the layer's own Position space.
        var wp = [pv[0], pv[1]];
        if (layer.parent) wp = util.applyMat(util.compMatrix(layer.parent, time), pv[0], pv[1]);
        var dx = doX ? 2 * (cx - wp[0]) : 0;
        var dy = doY ? 2 * (cy - wp[1]) : 0;
        var dd = util.compDeltaToParent(layer, dx, dy, time);
        newPos = [pv[0] + dd[0], pv[1] + dd[1]];
        if (!sep && pv.length > 2) newPos.push(pv[2]);
      }

      var sv = scale.value;
      var nsv = [sv[0], sv[1]];
      if (sv.length > 2) nsv.push(sv[2]);
      if (doX) nsv[0] = -nsv[0];
      if (doY) nsv[1] = -nsv[1];
      scale.setValue(nsv);

      if (newPos) {
        if (sep) {
          if (px) px.setValue(newPos[0]);
          if (py) py.setValue(newPos[1]);
        } else {
          pos.setValue(newPos);
        }
      }

      flipped++;
    }

    if (!flipped && !skipped.length) {
      throw new Error('Select one or more layers.');
    }
    return { flipped: flipped, skipped: skipped };
  }

  R.register('flip.apply', flip, 'Rebound: Flip');
})();
