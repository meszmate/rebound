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

  // After Effects supports up to three dash/gap pairs; emit each pair the
  // pattern carries instead of collapsing to one.
  function addDashes(stroke, pattern, offset) {
    var dashes = stroke.property('ADBE Vector Stroke Dashes');
    if (!dashes) return;
    var pairs = Math.min(3, Math.ceil(pattern.length / 2));
    for (var p = 0; p < pairs; p++) {
      var dn = p + 1;
      try {
        var dash = dashes.addProperty('ADBE Vector Stroke Dash ' + dn);
        if (dash) dash.setValue(pattern[p * 2] || 0);
        var gap = dashes.addProperty('ADBE Vector Stroke Gap ' + dn);
        if (gap) gap.setValue(pattern[p * 2 + 1] != null ? pattern[p * 2 + 1] : (pattern[p * 2] || 0));
      } catch (e) { /* dashes vary by build */ }
    }
    if (offset) {
      try { var off = dashes.addProperty('ADBE Vector Stroke Offset'); if (off) off.setValue(offset); } catch (e2) {}
    }
  }

  // Build one shape stroke operator for a single paint, sharing the node's
  // weight / cap / join / miter / dashes.
  function addStrokePaint(contents, node, st, paint, report) {
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
    return stroke;
  }

  // A node can carry several stacked stroke paints (Figma maps every stroke into
  // node.stroke.paints). Build one stroke operator per visible paint, in reverse
  // so the first (topmost) source paint ends up on top. An inside/outside SOLID
  // stroke is reproduced as a Stroke layer style (layerstyle.jsx), so it is
  // skipped here to avoid a doubled centred stroke.
  function applyStroke(contents, node, report) {
    var st = node.stroke;
    if (!st || !st.weight || !st.paints || !st.paints.length) return null;
    var offCenter = st.align && st.align !== 'CENTER';
    var made = null;
    for (var i = st.paints.length - 1; i >= 0; i--) {
      var paint = st.paints[i];
      if (!paint || paint.visible === false) continue;
      if (offCenter && paint.type === 'SOLID') continue;
      var s = addStrokePaint(contents, node, st, paint, report);
      if (s) made = s;
    }
    if (offCenter) {
      var solidCount = 0;
      for (var k = 0; k < st.paints.length; k++) { if (st.paints[k] && st.paints[k].visible !== false && st.paints[k].type === 'SOLID') solidCount++; }
      if (solidCount > 1) {
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'only the first ' + st.align.toLowerCase() + ' solid stroke is reproduced as a layer style' });
      }
    }
    return made;
  }

  R.importer.paint = {
    applyFills: applyFills,
    applyStroke: applyStroke,
    windingRule: windingRule,
    gradStops: gradStops,
    gradPoints: gradPoints
  };
})();
