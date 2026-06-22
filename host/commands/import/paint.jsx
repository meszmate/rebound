/*
 * Rebound host, import paints.
 *
 * Turns IR paints into After Effects shape operators: solid + gradient fills and
 * solid + gradient strokes, with cap / join / miter / dashes. Fill rule follows
 * the geometry's winding (even-odd for compound holes). Angular and diamond
 * gradients have no native AE shape type, so they are approximated as radial and
 * flagged in the report.
 *
 * Caller contract: add geometry first, then call applyStroke, then applyFills, so
 * the stroke sits above the fill in the contents list (it paints on top), exactly
 * like the source.
 */
(function () {
  var R = $.__rebound;
  var N = R.ir.N;

  function sizeOf(node) {
    var t = node.transform || {};
    return [t.width || 100, t.height || 100];
  }

  // Even-odd (2) when any sub-path asks for it, otherwise non-zero (1).
  function windingRule(node) {
    var paths = node.paths;
    if (paths) {
      for (var i = 0; i < paths.length; i++) {
        if (paths[i] && paths[i].windingRule === 'EVENODD') return 2;
      }
    }
    return 1;
  }

  function gradStops(paint) {
    var stops = paint.stops || [];
    var out = [];
    for (var i = 0; i < stops.length; i++) {
      var c = N.normalizeColor(stops[i].color);
      out.push({ pos: stops[i].position, color: [c.r, c.g, c.b], alpha: c.a });
    }
    if (out.length < 2) out = [{ pos: 0, color: [0, 0, 0], alpha: 1 }, { pos: 1, color: [1, 1, 1], alpha: 1 }];
    return out;
  }

  // Gradient endpoints in the node's local coordinate space (px). IR handles are
  // already in that space; fall back to a horizontal ramp across the box.
  function gradPoints(paint, node) {
    var h = paint.gradientHandles;
    if (h && h.length >= 2) return { start: [h[0][0], h[0][1]], end: [h[1][0], h[1][1]] };
    var sz = sizeOf(node);
    return { start: [0, sz[1] / 2], end: [sz[0], sz[1] / 2] };
  }

  function isGradient(type) {
    return type === 'GRADIENT_LINEAR' || type === 'GRADIENT_RADIAL' ||
      type === 'GRADIENT_ANGULAR' || type === 'GRADIENT_DIAMOND';
  }
  function gradTypeNum(type) {
    return (type === 'GRADIENT_LINEAR') ? 1 : 2; // radial covers angular/diamond approximation
  }

  function setSafe(prop, name, value) {
    try { prop.property(name).setValue(value); } catch (e) { /* version / build differences */ }
  }

  function addFillPaint(contents, paint, node, report) {
    var type = paint.type;
    if (type === 'SOLID') {
      var f = contents.addProperty('ADBE Vector Graphic - Fill');
      var c = N.normalizeColor(paint.color);
      f.property('ADBE Vector Fill Color').setValue([c.r, c.g, c.b]);
      setSafe(f, 'ADBE Vector Fill Rule', windingRule(node));
      var opacity = (paint.opacity != null ? paint.opacity : 1) * (c.a != null ? c.a : 1);
      setSafe(f, 'ADBE Vector Fill Opacity', opacity * 100);
      return f;
    }
    if (isGradient(type)) {
      var gf = contents.addProperty('ADBE Vector Graphic - G-Fill');
      var pts = gradPoints(paint, node);
      R.grad.applyGradient(gf, { type: gradTypeNum(type), start: pts.start, end: pts.end, stops: gradStops(paint) });
      setSafe(gf, 'ADBE Vector Fill Rule', windingRule(node));
      if (paint.opacity != null) setSafe(gf, 'ADBE Vector Fill Opacity', paint.opacity * 100);
      if (type === 'GRADIENT_ANGULAR' || type === 'GRADIENT_DIAMOND') {
        R.importer.util.note(report, 'approximated', { name: node.name, detail: type.replace('GRADIENT_', '').toLowerCase() + ' gradient rendered as radial' });
      }
      return gf;
    }
    if (type === 'IMAGE') {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image fill rebuilt in the image phase; placeholder colour for now' });
      var fb = contents.addProperty('ADBE Vector Graphic - Fill');
      fb.property('ADBE Vector Fill Color').setValue([0.5, 0.5, 0.5]);
      return fb;
    }
    return null;
  }

  // Add fills so the topmost source fill ends up on top in AE (each addProperty
  // appends to the bottom of the list, which renders first / behind).
  function applyFills(contents, node, report) {
    var fills = node.fills || [];
    var any = false;
    for (var i = fills.length - 1; i >= 0; i--) {
      var p = fills[i];
      if (!p || p.visible === false) continue;
      addFillPaint(contents, p, node, report);
      any = true;
    }
    return any;
  }

  function capOf(cap) {
    if (cap === 'ROUND') return 2;
    if (cap === 'SQUARE') return 3;
    return 1; // NONE / butt
  }
  function joinOf(join) {
    if (join === 'ROUND') return 2;
    if (join === 'BEVEL') return 3;
    return 1; // miter
  }

  function addDashes(stroke, pattern, offset) {
    var dashes = stroke.property('ADBE Vector Stroke Dashes');
    if (!dashes) return;
    var dash = dashes.addProperty('ADBE Vector Stroke Dash 1');
    if (dash) dash.setValue(pattern[0]);
    if (pattern.length > 1) {
      var gap = dashes.addProperty('ADBE Vector Stroke Gap 1');
      if (gap) gap.setValue(pattern[1]);
    }
    if (offset) {
      var off = dashes.addProperty('ADBE Vector Stroke Offset');
      if (off) off.setValue(offset);
    }
  }

  function firstVisiblePaint(paints) {
    if (!paints) return null;
    for (var i = 0; i < paints.length; i++) {
      if (paints[i] && paints[i].visible !== false) return paints[i];
    }
    return null;
  }

  function applyStroke(contents, node, report) {
    var st = node.stroke;
    if (!st || !st.weight) return null;
    var paint = firstVisiblePaint(st.paints);
    if (!paint) return null;

    var stroke;
    if (paint.type === 'SOLID') {
      stroke = contents.addProperty('ADBE Vector Graphic - Stroke');
      var c = N.normalizeColor(paint.color);
      stroke.property('ADBE Vector Stroke Color').setValue([c.r, c.g, c.b]);
      var op = (paint.opacity != null ? paint.opacity : 1) * (c.a != null ? c.a : 1);
      setSafe(stroke, 'ADBE Vector Stroke Opacity', op * 100);
    } else if (isGradient(paint.type)) {
      stroke = contents.addProperty('ADBE Vector Graphic - G-Stroke');
      var pts = gradPoints(paint, node);
      R.grad.applyGradient(stroke, { type: gradTypeNum(paint.type), start: pts.start, end: pts.end, stops: gradStops(paint) });
    } else {
      return null;
    }

    stroke.property('ADBE Vector Stroke Width').setValue(st.weight);
    setSafe(stroke, 'ADBE Vector Stroke Line Cap', capOf(st.cap));
    setSafe(stroke, 'ADBE Vector Stroke Line Join', joinOf(st.join));
    if (st.miterLimit) setSafe(stroke, 'ADBE Vector Stroke Miter Limit', st.miterLimit);
    if (st.dashPattern && st.dashPattern.length) {
      try { addDashes(stroke, st.dashPattern, st.dashOffset); } catch (e) { /* dashes vary by build */ }
    }
    if (st.align && st.align !== 'CENTER') {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'stroke aligned ' + st.align.toLowerCase() + ' rendered centred' });
    }
    return stroke;
  }

  R.importer.paint = {
    applyFills: applyFills,
    applyStroke: applyStroke,
    windingRule: windingRule,
    gradStops: gradStops,
    gradPoints: gradPoints
  };
})();
