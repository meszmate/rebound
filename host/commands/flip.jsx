/*
 * Rebound host, Flip (mirror selected layers).
 *
 * Mirrors by negating the layer's scale on the chosen axis — every keyframe
 * when scale is animated (setValueAtTime keeps each key's time and ease). For
 * pivot 'selection', also reflects each layer's position across the selection's
 * combined bounding box (same bbox math as align), so layers swap sides as a
 * group; a keyed Position is shifted key-by-key with the constant reflection
 * delta (reflection about a fixed centre is a constant comp-space delta, so the
 * motion path translates intact). Expression-driven scale/position is skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function hasExpr(prop) {
    return !!(prop && prop.expressionEnabled && prop.expression !== '');
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

      // An expression keeps winning over anything we set, so it still skips;
      // KEYFRAMED scale is fine now — each key is mirrored in place below.
      if (hasExpr(scale)) { skipped.push(layer.name + ' (scale expression)'); continue; }

      // Separate Dimensions hides the unified Position (setting it throws), so
      // detect it and drive the X/Y followers; an expression on a follower
      // counts exactly like on the unified property.
      var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
      var px = sep ? tr.property(M.positionX) : null;
      var py = sep ? tr.property(M.positionY) : null;

      // Do ALL reads and guards, and compute the reflection delta, BEFORE any
      // write: a refusal mid-layer used to leave the scale negated but the
      // position untouched (a half-flipped layer).
      var posDelta = null; // [dx, dy] in the layer's own Position space
      if (bySelection) {
        if (hasExpr(pos) || (sep && (hasExpr(px) || hasExpr(py)))) {
          skipped.push(layer.name + ' (position expression)');
          continue;
        }
        // Position is parent-space for parented layers; reflect its COMP-space
        // point (read at comp.time — util.posOf handles separated dimensions and
        // keys) across the selection centre, then convert the comp-space move
        // back into the layer's own Position space. Reflection about a fixed
        // centre is a CONSTANT delta, so a keyed Position is safe: every key
        // shifts by it and the motion path translates intact.
        var pv = util.posOf(tr, time);
        var wp = [pv[0], pv[1]];
        if (layer.parent) wp = util.applyMat(util.compMatrix(layer.parent, time), pv[0], pv[1]);
        var dx = doX ? 2 * (cx - wp[0]) : 0;
        var dy = doY ? 2 * (cy - wp[1]) : 0;
        posDelta = util.compDeltaToParent(layer, dx, dy, time);
      }

      // Mirror scale: every keyframe when animated (setValueAtTime keeps the
      // key's time and temporal ease), else the static value.
      if (scale.numKeys > 0) {
        for (var k = 1; k <= scale.numKeys; k++) {
          var kv = scale.keyValue(k);
          var nk = [doX ? -kv[0] : kv[0], doY ? -kv[1] : kv[1]];
          if (kv.length > 2) nk.push(kv[2]);
          scale.setValueAtTime(scale.keyTime(k), nk);
        }
      } else {
        var sv = scale.value;
        var nsv = [doX ? -sv[0] : sv[0], doY ? -sv[1] : sv[1]];
        if (sv.length > 2) nsv.push(sv[2]);
        scale.setValue(nsv);
      }

      // Keys included; separated followers driven when needed (util helper).
      if (posDelta) util.offsetLayerPosition(layer, posDelta[0], posDelta[1]);

      flipped++;
    }

    if (!flipped && !skipped.length) {
      throw new Error('Select one or more layers.');
    }
    return { flipped: flipped, skipped: skipped };
  }

  R.register('flip.apply', flip, 'Rebound: Flip');
})();
