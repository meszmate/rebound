/*
 * Rebound host, Arrange (pack selected layers into a grid).
 *
 * Bounds-based, like align.jsx: each layer's sourceRectAtTime is transformed to
 * composition space (pos + scale * (rect - anchor)) to get an axis-aligned box.
 * Cells are sized by the largest box plus the gaps; layers fill the grid in
 * reading order and each is offset so its box top-left meets its cell top-left.
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

  // Offset a 1D follower (a separated X/Y Position) by d, keys included.
  function offsetScalar(p, d) {
    if (!p) return;
    if (p.numKeys > 0) { for (var k = 1; k <= p.numKeys; k++) p.setValueAtTime(p.keyTime(k), p.keyValue(k) + d); }
    else p.setValue(p.value + d);
  }
  function offsetPosition(layer, dx, dy) {
    var tr = layer.property(M.transform);
    var pos = tr.property(M.position);
    if (pos.expressionEnabled && pos.expression !== '') return false;
    // Separate Dimensions hides the unified Position; drive the X/Y followers.
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) { offsetScalar(tr.property(M.positionX), dx); offsetScalar(tr.property(M.positionY), dy); return true; }
    if (pos.numKeys > 0) {
      for (var k = 1; k <= pos.numKeys; k++) {
        var v = pos.keyValue(k);
        var nv = [v[0] + dx, v[1] + dy];
        if (v.length > 2) nv.push(v[2]);
        pos.setValueAtTime(pos.keyTime(k), nv);
      }
    } else {
      var pv = pos.value;
      var np = [pv[0] + dx, pv[1] + dy];
      if (pv.length > 2) np.push(pv[2]);
      pos.setValue(np);
    }
    return true;
  }

  function avBoxes(comp) {
    var layers = comp.selectedLayers;
    var out = [];
    for (var i = 0; i < layers.length; i++) {
      if (!(layers[i] instanceof CameraLayer || layers[i] instanceof LightLayer)) out.push(bboxOf(layers[i], comp.time));
    }
    return out;
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

  function arrange(args) {
    var comp = util.activeComp();
    var boxes = avBoxes(comp);
    if (!boxes.length) throw new Error('Select one or more layers to arrange.');

    var n = boxes.length;
    var columns = args.columns != null ? Math.round(args.columns) : 0;
    if (!(columns > 0)) columns = Math.ceil(Math.sqrt(n));
    if (columns > n) columns = n;

    var gapX = args.gapX || 0;
    var gapY = args.gapY || 0;

    var maxW = 0;
    var maxH = 0;
    for (var i = 0; i < boxes.length; i++) {
      maxW = Math.max(maxW, boxes[i].maxX - boxes[i].minX);
      maxH = Math.max(maxH, boxes[i].maxY - boxes[i].minY);
    }

    var cellW = maxW + gapX;
    var cellH = maxH + gapY;

    var u = union(boxes);
    var originX = u.minX;
    var originY = u.minY;

    var arranged = 0;
    for (var j = 0; j < boxes.length; j++) {
      var b = boxes[j];
      var col = j % columns;
      var row = Math.floor(j / columns);
      var targetX = originX + col * cellW;
      var targetY = originY + row * cellH;
      var dx = targetX - b.minX;
      var dy = targetY - b.minY;
      if (offsetPosition(b.layer, dx, dy)) arranged++;
    }

    return { arranged: arranged };
  }

  R.register('arrange.apply', arrange, 'Rebound: Arrange');
})();
