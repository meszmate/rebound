/*
 * Rebound host, align + distribute commands.
 *
 * Bounds-based (like the comp viewer), using each layer's sourceRectAtTime
 * transformed to composition space. Rotation is not factored into the bounding
 * box (axis-aligned bounds), which matches how alignment is normally used.
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
      pos: pos,
      minX: Math.min(x1, x2), maxX: Math.max(x1, x2),
      minY: Math.min(y1, y2), maxY: Math.max(y1, y2)
    };
  }

  function offsetPosition(layer, dx, dy) {
    var pos = layer.property(M.transform).property(M.position);
    if (pos.expressionEnabled && pos.expression !== '') return false;
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
      if (layers[i] instanceof AVLayer) out.push(bboxOf(layers[i], comp.time));
    }
    return out;
  }

  function feature(box, g, axis) {
    var lo = axis === 'x' ? box.minX : box.minY;
    var hi = axis === 'x' ? box.maxX : box.maxY;
    return g === 0 ? lo : g === 1 ? hi : (lo + hi) / 2;
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

  function align(args) {
    var comp = util.activeComp();
    var boxes = avBoxes(comp);
    if (!boxes.length) throw new Error('Select one or more layers.');

    var gx = args.gx;
    var gy = args.gy;
    var axes = args.axes || 'both';
    var doX = axes === 'both' || axes === 'x';
    var doY = axes === 'both' || axes === 'y';
    var group = args.mode === 'group';

    var ref;
    if (args.relativeTo === 'selection') {
      ref = union(boxes);
    } else {
      ref = { minX: 0, minY: 0, maxX: comp.width, maxY: comp.height };
    }

    var moved = 0;
    if (group) {
      var u = union(boxes);
      var dx = doX && gx != null ? feature(ref, gx, 'x') - feature(u, gx, 'x') : 0;
      var dy = doY && gy != null ? feature(ref, gy, 'y') - feature(u, gy, 'y') : 0;
      for (var i = 0; i < boxes.length; i++) {
        if (offsetPosition(boxes[i].layer, dx, dy)) moved++;
      }
    } else {
      for (var j = 0; j < boxes.length; j++) {
        var b = boxes[j];
        var ddx = doX && gx != null ? feature(ref, gx, 'x') - feature(b, gx, 'x') : 0;
        var ddy = doY && gy != null ? feature(ref, gy, 'y') - feature(b, gy, 'y') : 0;
        if (offsetPosition(b.layer, ddx, ddy)) moved++;
      }
    }
    return { moved: moved };
  }

  function distribute(args) {
    var comp = util.activeComp();
    var boxes = avBoxes(comp);
    if (boxes.length < 3) throw new Error('Select three or more layers to distribute.');
    var axis = args.axis === 'y' ? 'y' : 'x';
    var lo = axis === 'x' ? 'minX' : 'minY';
    var hi = axis === 'x' ? 'maxX' : 'maxY';

    boxes.sort(function (a, b) { return a[lo] - b[lo]; });

    var sizes = boxes.map(function (b) { return b[hi] - b[lo]; });
    var first = boxes[0][lo];
    var last = boxes[boxes.length - 1][hi];

    var gap;
    if (args.mode === 'gap') {
      gap = args.gap || 0;
    } else {
      var sumSizes = 0;
      for (var s = 0; s < sizes.length; s++) sumSizes += sizes[s];
      gap = (last - first - sumSizes) / (boxes.length - 1);
    }

    var cursor = first;
    var moved = 0;
    for (var i = 0; i < boxes.length; i++) {
      var target = cursor;
      var delta = target - boxes[i][lo];
      if (axis === 'x') {
        if (offsetPosition(boxes[i].layer, delta, 0)) moved++;
      } else {
        if (offsetPosition(boxes[i].layer, 0, delta)) moved++;
      }
      cursor += sizes[i] + gap;
    }
    return { moved: moved, gap: Math.round(gap) };
  }

  R.register('align.layers', align, 'Rebound: Align');
  R.register('align.distribute', distribute, 'Rebound: Distribute');
})();
