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

  function bboxOf(layer, time) {
    var rect = layer.sourceRectAtTime(time, false);
    var tr = layer.property(M.transform);
    var pos = tr.property(M.position).valueAtTime(time, false);
    var anc = tr.property(M.anchor).valueAtTime(time, false);
    var scale = tr.property(M.scale).valueAtTime(time, false);
    var sx = scale[0] / 100;
    var sy = scale[1] / 100;
    var x1 = pos[0] + (rect.left - anc[0]) * sx;
    var x2 = pos[0] + (rect.left + rect.width - anc[0]) * sx;
    var y1 = pos[1] + (rect.top - anc[1]) * sy;
    var y2 = pos[1] + (rect.top + rect.height - anc[1]) * sy;
    return {
      layer: layer,
      minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
      minY: Math.min(y1, y2), maxY: Math.max(y1, y2)
    };
  }

  function union(boxes) {
    var u = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (var i = 0; i < boxes.length; i++) {
      u.minX = Math.min(u.minX, boxes[i].minX);
      u.minY = Math.min(u.minY, boxes[i].minY);
      u.maxX = Math.max(u.maxX, boxes[i].maxX);
      u.maxY = Math.max(u.maxY, boxes[i].maxY);
    }
    return u;
  }

  function isLocked(prop) {
    return (prop.expressionEnabled && prop.expression !== '') || prop.numKeys > 0;
  }

  function flip(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');

    var axis = args.axis || 'horizontal';
    var doX = axis === 'horizontal' || axis === 'both';
    var doY = axis === 'vertical' || axis === 'both';
    var bySelection = args.pivot === 'selection';

    var boxes = [];
    var i;
    for (i = 0; i < layers.length; i++) {
      if (layers[i] instanceof AVLayer) boxes.push(bboxOf(layers[i], comp.time));
    }
    if (!boxes.length) throw new Error('Select one or more layers.');

    var ref = bySelection ? union(boxes) : null;
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
      if (bySelection && isLocked(pos)) { skipped.push(layer.name + ' (position animated)'); continue; }

      var sv = scale.value;
      var nsv = [sv[0], sv[1]];
      if (sv.length > 2) nsv.push(sv[2]);
      if (doX) nsv[0] = -nsv[0];
      if (doY) nsv[1] = -nsv[1];
      scale.setValue(nsv);

      if (bySelection) {
        var pv = pos.value;
        var npv = [pv[0], pv[1]];
        if (pv.length > 2) npv.push(pv[2]);
        if (doX) npv[0] = 2 * cx - pv[0];
        if (doY) npv[1] = 2 * cy - pv[1];
        pos.setValue(npv);
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
