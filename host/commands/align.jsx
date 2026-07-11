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

  // --- Parent-aware comp-space geometry --------------------------------------
  // A layer's Position lives in its PARENT's coordinate space (comp space only when
  // it has no parent), so aligning by raw Position is wrong for parented layers —
  // e.g. anything imported into a group/frame, whose box would be measured in the
  // container's space while the reference is in comp space. We map each layer's
  // content rect into true COMP space through the full parent chain (util.bboxOf),
  // align there, then convert the resulting move back into the layer's own
  // Position space (util.moveLayer). The math lives in host/lib/util.jsx and is
  // shared with arrange / flip / comp.

  function avBoxes(comp) {
    var layers = comp.selectedLayers;
    var out = [];
    for (var i = 0; i < layers.length; i++) {
      if (!(layers[i] instanceof CameraLayer || layers[i] instanceof LightLayer)) out.push(util.bboxOf(layers[i], comp.time));
    }
    return out;
  }

  function feature(box, g, axis) {
    var lo = axis === 'x' ? box.minX : box.minY;
    var hi = axis === 'x' ? box.maxX : box.maxY;
    return g === 0 ? lo : g === 1 ? hi : (lo + hi) / 2;
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

    // Align to the selection's combined bounds only when there are 2+ layers to
    // line up; a lone layer (or explicit Composition) aligns to the comp frame.
    // 'key' aligns everything to the LAST selected layer (the same convention
    // link.jsx uses for the parent), and that key layer itself stays put.
    var ref;
    var keyBox = null;
    if (args.relativeTo === 'key' && boxes.length > 1) {
      keyBox = boxes[boxes.length - 1];
      ref = keyBox;
    } else if (args.relativeTo === 'selection' && boxes.length > 1) {
      ref = util.unionBoxes(boxes);
    } else {
      ref = { minX: 0, minY: 0, maxX: comp.width, maxY: comp.height };
    }

    var movable = [];
    for (var m = 0; m < boxes.length; m++) {
      if (boxes[m] !== keyBox) movable.push(boxes[m]);
    }

    var moved = 0;
    if (group) {
      var u = util.unionBoxes(movable);
      var dx = doX && gx != null ? feature(ref, gx, 'x') - feature(u, gx, 'x') : 0;
      var dy = doY && gy != null ? feature(ref, gy, 'y') - feature(u, gy, 'y') : 0;
      for (var i = 0; i < movable.length; i++) {
        if (util.moveLayer(movable[i].layer, dx, dy, comp.time)) moved++;
      }
    } else {
      for (var j = 0; j < movable.length; j++) {
        var b = movable[j];
        var ddx = doX && gx != null ? feature(ref, gx, 'x') - feature(b, gx, 'x') : 0;
        var ddy = doY && gy != null ? feature(ref, gy, 'y') - feature(b, gy, 'y') : 0;
        if (util.moveLayer(b.layer, ddx, ddy, comp.time)) moved++;
      }
    }
    return { moved: moved };
  }

  function distribute(args) {
    var comp = util.activeComp();
    var boxes = avBoxes(comp);
    // Auto-distribute needs 3+ (with 2 there is nothing to spread), but a fixed
    // gap is meaningful from 2 layers up: the second snaps to first + gap.
    if (args.mode === 'gap') {
      if (boxes.length < 2) throw new Error('Select two or more layers to distribute.');
    } else if (boxes.length < 3) {
      throw new Error('Select three or more layers to distribute.');
    }
    var axis = args.axis === 'y' ? 'y' : 'x';
    var lo = axis === 'x' ? 'minX' : 'minY';
    var hi = axis === 'x' ? 'maxX' : 'maxY';

    boxes.sort(function (a, b) { return a[lo] - b[lo]; });

    var sizes = [];
    for (var bi = 0; bi < boxes.length; bi++) sizes.push(boxes[bi][hi] - boxes[bi][lo]);
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
        if (util.moveLayer(boxes[i].layer, delta, 0, comp.time)) moved++;
      } else {
        if (util.moveLayer(boxes[i].layer, 0, delta, comp.time)) moved++;
      }
      cursor += sizes[i] + gap;
    }
    return { moved: moved, gap: Math.round(gap) };
  }

  // Read-only: the selected layers' comp-space boxes plus the comp frame, for
  // the panel's live selection minimap (align / flip / arrange previews).
  // Registered without an undo label; plain numbers only (Layer objects do not
  // survive the bridge).
  function readLayout() {
    var item = app.project ? app.project.activeItem : null;
    if (!util.isComp(item)) return { found: false };
    var layers = item.selectedLayers;
    var boxes = [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i] instanceof CameraLayer || layers[i] instanceof LightLayer) continue;
      var b = null;
      try { b = util.bboxOf(layers[i], item.time); } catch (e) { b = null; }
      if (!b) continue;
      boxes.push({
        name: layers[i].name,
        index: layers[i].index,
        x: b.minX,
        y: b.minY,
        w: b.maxX - b.minX,
        h: b.maxY - b.minY
      });
    }
    if (!boxes.length) return { found: false };
    return { found: true, width: item.width, height: item.height, boxes: boxes };
  }

  R.register('align.layers', align, 'Rebound: Align');
  R.register('align.distribute', distribute, 'Rebound: Distribute');
  R.register('layout.read', readLayout);
})();
