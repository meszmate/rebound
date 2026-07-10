/*
 * Rebound host, Arrange (pack selected layers into a grid).
 *
 * Bounds-based, like align.jsx: each layer's sourceRectAtTime is transformed to
 * composition space through the shared parent-chain, rotation-aware matrix
 * helpers in host/lib/util.jsx (util.bboxOf), so parented and rotated layers
 * measure correctly. Cells are sized by the largest box plus the gaps; layers
 * fill the grid in reading order and each is moved (util.moveLayer, comp-space
 * delta converted back to the layer's own Position space) so its box top-left
 * meets its cell top-left.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function avBoxes(comp) {
    var layers = comp.selectedLayers;
    var out = [];
    for (var i = 0; i < layers.length; i++) {
      if (!(layers[i] instanceof CameraLayer || layers[i] instanceof LightLayer)) out.push(util.bboxOf(layers[i], comp.time));
    }
    return out;
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

    var u = util.unionBoxes(boxes);
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
      if (util.moveLayer(b.layer, dx, dy, comp.time)) arranged++;
    }

    return { arranged: arranged };
  }

  R.register('arrange.apply', arrange, 'Rebound: Arrange');
})();
