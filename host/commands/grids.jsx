/*
 * Rebound host — Grids (composition guide-overlay shape layer).
 *
 * Creates a non-rendering shape layer named "Guides" filled with thin rectangles
 * standing in for grid lines. Thirds draws lines at 1/3 and 2/3 of each axis,
 * Golden at the 0.382 / 0.618 divisions, and Columns draws "count" even vertical
 * bands inset by a gutter. Every property is addressed by matchName; the layer is
 * flagged guideLayer so it never renders.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var CONTENTS = 'ADBE Root Vectors Group';
  var V_GROUP = 'ADBE Vector Group';
  var V_VECTORS = 'ADBE Vectors Group';
  var V_RECT = 'ADBE Vector Shape - Rect';
  var V_RECT_SIZE = 'ADBE Vector Rect Size';
  var V_RECT_POS = 'ADBE Vector Rect Position';
  var V_FILL = 'ADBE Vector Graphic - Fill';
  var V_FILL_COLOR = 'ADBE Vector Fill Color';
  var V_GROUP_XFORM = 'ADBE Vector Transform Group';
  var V_GROUP_POS = 'ADBE Vector Position';

  // A thin rectangle centred at comp-pixel (cx, cy) with the given pixel size.
  // Shape space is centred on the comp, so we offset by half the comp extent.
  function addLine(contents, comp, cx, cy, w, h, color) {
    var group = contents.addProperty(V_GROUP);
    var shapes = group.property(V_VECTORS);

    var rect = shapes.addProperty(V_RECT);
    rect.property(V_RECT_SIZE).setValue([w, h]);
    rect.property(V_RECT_POS).setValue([0, 0]);

    var fill = shapes.addProperty(V_FILL);
    fill.property(V_FILL_COLOR).setValue(color);

    var xform = group.property(V_GROUP_XFORM);
    xform.property(V_GROUP_POS).setValue([cx - comp.width / 2, cy - comp.height / 2]);
  }

  function addVertical(contents, comp, x, w, color) {
    addLine(contents, comp, x, comp.height / 2, w, comp.height, color);
  }

  function addHorizontal(contents, comp, y, h, color) {
    addLine(contents, comp, comp.width / 2, y, comp.width, h, color);
  }

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function apply(args) {
    var comp = util.activeComp();
    var preset = args.preset || 'thirds';

    var layer = comp.layers.addShape();
    layer.name = 'Guides';
    layer.guideLayer = true;

    var contents = layer.property(CONTENTS);
    var color = [1, 1, 1];

    if (preset === 'columns') {
      var count = Math.round(num(args.count, 12));
      if (count < 1) count = 1;
      if (count > 100) count = 100;
      var gutter = num(args.gutter, 20);
      if (gutter < 0) gutter = 0;

      // Even bands across the width; the gutter is the visible band thickness.
      var bandW = gutter > 0 ? gutter : 1;
      for (var i = 0; i < count; i++) {
        var cx = (i + 0.5) * (comp.width / count);
        addVertical(contents, comp, cx, bandW, color);
      }
    } else {
      var fractions = preset === 'golden' ? [0.382, 0.618] : [1 / 3, 2 / 3];
      for (var f = 0; f < fractions.length; f++) {
        addVertical(contents, comp, fractions[f] * comp.width, 1, color);
        addHorizontal(contents, comp, fractions[f] * comp.height, 1, color);
      }
    }

    return { created: 1 };
  }

  R.register('grids.apply', apply, 'Rebound: Grids');
})();
