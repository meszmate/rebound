/*
 * Rebound host, Grids (composition guide-overlay shape layer).
 *
 * Creates a non-rendering shape layer named "Guides" filled with thin rectangles
 * standing in for guide lines. Thirds draws lines at 1/3 and 2/3 of each axis,
 * Golden at the 0.382 / 0.618 divisions, Columns draws a real design column grid
 * (margin + gutter + computed column width) as edge lines, and Safe draws the
 * broadcast action-safe and title-safe rectangles. The line color is settable so
 * the guides stay visible on any background. Every property is addressed by
 * matchName; the layer is flagged guideLayer so it never renders.
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

  // A full-height vertical line at comp-x, clamped inside the frame so a 1px
  // line at the very edge is not half-clipped.
  function addVertical(contents, comp, x, w, color) {
    var cx = x;
    if (cx < w / 2) cx = w / 2;
    if (cx > comp.width - w / 2) cx = comp.width - w / 2;
    addLine(contents, comp, cx, comp.height / 2, w, comp.height, color);
  }

  function addHorizontal(contents, comp, y, h, color) {
    var cy = y;
    if (cy < h / 2) cy = h / 2;
    if (cy > comp.height - h / 2) cy = comp.height - h / 2;
    addLine(contents, comp, comp.width / 2, cy, comp.width, h, color);
  }

  // Per-platform safe insets for vertical social video, as fractions of the
  // comp edges {left, top, right, bottom}. The central rectangle is the area
  // clear of each platform's UI (caption, side icons, nav bar).
  var SOCIAL = {
    tiktok: { l: 0.04, t: 0.06, r: 0.12, b: 0.20 },
    reels: { l: 0.04, t: 0.07, r: 0.14, b: 0.22 },
    shorts: { l: 0.04, t: 0.06, r: 0.12, b: 0.15 }
  };

  // A rectangle outline with independent edge insets (fractions of the comp).
  function addRectOutlineAsym(contents, comp, l, t, r, b, lw, color) {
    var left = comp.width * l;
    var right = comp.width * (1 - r);
    var top = comp.height * t;
    var bottom = comp.height * (1 - b);
    var innerW = right - left;
    var innerH = bottom - top;
    var cx = (left + right) / 2;
    var cy = (top + bottom) / 2;
    addLine(contents, comp, left + lw / 2, cy, lw, innerH, color);
    addLine(contents, comp, right - lw / 2, cy, lw, innerH, color);
    addLine(contents, comp, cx, top + lw / 2, innerW, lw, color);
    addLine(contents, comp, cx, bottom - lw / 2, innerW, lw, color);
  }

  // A rectangle outline inset by (mx, my) from the comp edges, drawn as four
  // thin lines of width lw. Used for the safe-area guides.
  function addRectOutline(contents, comp, mx, my, lw, color) {
    var innerW = comp.width - 2 * mx;
    var innerH = comp.height - 2 * my;
    // Left and right edges (full inner height).
    addLine(contents, comp, mx + lw / 2, comp.height / 2, lw, innerH, color);
    addLine(contents, comp, comp.width - mx - lw / 2, comp.height / 2, lw, innerH, color);
    // Top and bottom edges (full inner width).
    addLine(contents, comp, comp.width / 2, my + lw / 2, innerW, lw, color);
    addLine(contents, comp, comp.width / 2, comp.height - my - lw / 2, innerW, lw, color);
  }

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function clamp01(v) {
    if (v == null || isNaN(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // Resolve the guide color: caller-supplied RGB triplet, else a visible cyan
  // that reads against both light and dark comps.
  function readColor(rgb) {
    if (rgb && rgb.length >= 3) return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
    return [0, 0.85, 1];
  }

  function apply(args) {
    var comp = util.activeComp();
    var preset = args.preset || 'thirds';
    var color = readColor(args && args.color);
    var lw = num(args && args.lineWidth, 1);
    if (lw < 1) lw = 1;

    // Replace any earlier Guides layer instead of stacking a new one.
    if (args.replace !== false) util.removeLayersNamed(comp, 'Guides');

    var layer = comp.layers.addShape();
    layer.name = 'Guides';
    layer.guideLayer = true;

    var contents = layer.property(CONTENTS);

    if (preset === 'columns') {
      var count = Math.round(num(args.count, 12));
      if (count < 1) count = 1;
      if (count > 100) count = 100;
      var gutter = num(args.gutter, 20);
      if (gutter < 0) gutter = 0;
      var margin = num(args.margin, 0);
      if (margin < 0) margin = 0;

      // Real column model: column width = (W - 2*margin - (n-1)*gutter) / n.
      // Draw a thin line at each column's left and right edge.
      var usable = comp.width - 2 * margin - (count - 1) * gutter;
      var colW = usable / count;
      if (colW < 1) colW = 1;
      for (var i = 0; i < count; i++) {
        var left = margin + i * (colW + gutter);
        addVertical(contents, comp, left, lw, color);
        addVertical(contents, comp, left + colW, lw, color);
      }
      // Optional rows for a modular grid: same margin + gutter on the Y axis.
      var rows = Math.round(num(args.rows, 0));
      if (rows > 100) rows = 100;
      if (rows >= 1) {
        var usableH = comp.height - 2 * margin - (rows - 1) * gutter;
        var rowH = usableH / rows;
        if (rowH < 1) rowH = 1;
        for (var r = 0; r < rows; r++) {
          var top = margin + r * (rowH + gutter);
          addHorizontal(contents, comp, top, lw, color);
          addHorizontal(contents, comp, top + rowH, lw, color);
        }
      }
    } else if (preset === 'safe') {
      // Broadcast safe areas: action-safe inset 5%, title-safe inset 10%.
      addRectOutline(contents, comp, comp.width * 0.05, comp.height * 0.05, lw, color);
      addRectOutline(contents, comp, comp.width * 0.10, comp.height * 0.10, lw, color);
    } else if (preset === 'social') {
      // Vertical social-video safe area, clear of the platform UI overlays.
      var plat = SOCIAL[args.platform] || SOCIAL.tiktok;
      addRectOutlineAsym(contents, comp, plat.l, plat.t, plat.r, plat.b, lw, color);
    } else {
      var fractions = preset === 'golden' ? [0.382, 0.618] : [1 / 3, 2 / 3];
      for (var f = 0; f < fractions.length; f++) {
        addVertical(contents, comp, fractions[f] * comp.width, lw, color);
        addHorizontal(contents, comp, fractions[f] * comp.height, lw, color);
      }
    }

    // Optional centre crosshair on any preset.
    if (args && args.crosshair) {
      addVertical(contents, comp, comp.width / 2, lw, color);
      addHorizontal(contents, comp, comp.height / 2, lw, color);
    }

    return { created: 1 };
  }

  R.register('grids.apply', apply, 'Rebound: Grids');
})();
