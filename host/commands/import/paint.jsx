/*
 * Rebound host, import paints.
 *
 * Turns IR paints into After Effects shape operators: solid + gradient fills and
 * solid + gradient strokes, with cap / join / miter / dashes. Fill rule follows
 * the geometry's winding (even-odd for compound holes).
 *
 * Angular and diamond gradients have no native AE shape gradient type, so they
 * are reproduced WITHOUT rasterising:
 *   - ANGULAR (conic): a native LINEAR G-Fill whose ramp runs horizontally across
 *     the shape, then an "ADBE Polar Coordinates" effect (Rect->Polar, Interp 100)
 *     warps that horizontal ramp into a conic sweep around the centre. If Polar
 *     Coordinates is unavailable the build falls back to a native radial.
 *   - DIAMOND: a native RADIAL G-Fill along the gradient axis (AE has no diamond
 *     gradient); native + editable + vector, flagged in the report.
 * Both stay editable native gradients; only the colour-stop write can fall back to
 * the Gradient Ramp / 4-colour effect path when the .ffx write is unavailable.
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
    // Per-stop midpoints (Illustrator/Photoshop): gradientMidpoints[i] is the
    // 0..1 skew of the ramp stored ON stop i (blend toward stop i+1). Emitters
    // supply one entry per stop (the last entry unused, matching AE, which keeps a
    // midPoint slot per stop). Thread it on so grad.jsx honours it, not a flat 0.5.
    var mids = paint.gradientMidpoints;
    var out = [];
    for (var i = 0; i < stops.length; i++) {
      var c = N.normalizeColor(stops[i].color);
      var stop = { pos: stops[i].position, color: [c.r, c.g, c.b], alpha: c.a };
      if (mids && typeof mids[i] === 'number') stop.midPoint = mids[i];
      out.push(stop);
    }
    if (out.length < 2) out = [{ pos: 0, color: [0, 0, 0], alpha: 1 }, { pos: 1, color: [1, 1, 1], alpha: 1 }];
    return out;
  }

  // Gradient endpoints in the node's local coordinate space (px). IR handles are
  // already in that space; fall back to a horizontal ramp across the box.
  //
  // A radial ramp can be elliptical/skewed: handles[2] is the perpendicular
  // "width" handle (and gradientTransform can shear it). After Effects' native
  // G-Fill / G-Stroke radial is ALWAYS circular -- it exposes only a Start and an
  // End point, with radius = |end - start|; there is no second axis or angle to
  // set -- so a true ellipse cannot be expressed on the shape operator. We pick
  // the LONGER of the start->end and start->width axes as the end point so the
  // circular radial at least covers the ramp's reach instead of cutting it short;
  // the minor axis is dropped (circular fallback). Linear ramps use start->end.
  function gradPoints(paint, node) {
    var h = paint.gradientHandles;
    if (h && h.length >= 2) {
      var start = [h[0][0], h[0][1]];
      var end = [h[1][0], h[1][1]];
      if ((paint.type === 'GRADIENT_RADIAL' || paint.type === 'GRADIENT_DIAMOND') && h.length >= 3 && h[2]) {
        var dMain = Math.sqrt(Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2));
        var dWide = Math.sqrt(Math.pow(h[2][0] - start[0], 2) + Math.pow(h[2][1] - start[1], 2));
        if (dWide > dMain) end = [h[2][0], h[2][1]];
      }
      return { start: start, end: end };
    }
    var sz = sizeOf(node);
    return { start: [0, sz[1] / 2], end: [sz[0], sz[1] / 2] };
  }

  function isGradient(type) {
    return type === 'GRADIENT_LINEAR' || type === 'GRADIENT_RADIAL' ||
      type === 'GRADIENT_ANGULAR' || type === 'GRADIENT_DIAMOND';
  }
  // Native AE shape gradient type for a paint:
  //   LINEAR  -> 1 (linear).
  //   ANGULAR -> 1 (linear): a horizontal ramp that a Polar Coordinates effect
  //              then bends into a conic sweep (see angularPoints / addPolarConic).
  //   RADIAL  -> 2 (radial).
  //   DIAMOND -> 2 (radial): approximated as a native radial along the axis (AE
  //              has no diamond gradient), never rasterised.
  function gradTypeNum(type) {
    return (type === 'GRADIENT_LINEAR' || type === 'GRADIENT_ANGULAR') ? 1 : 2;
  }

  // Horizontal ramp endpoints across the node box (left-mid -> right-mid). An
  // angular gradient is built as this linear ramp, then warped into a conic by a
  // Polar Coordinates (Rect->Polar) effect, which maps the X axis to the sweep
  // angle around the layer centre.
  function angularPoints(node) {
    var sz = sizeOf(node);
    return { start: [0, sz[1] / 2], end: [sz[0], sz[1] / 2] };
  }

  // Endpoints to feed the native G-Fill / G-Stroke for a gradient paint. Angular
  // overrides to a horizontal ramp (the Polar effect supplies the real direction);
  // everything else uses the IR handles (gradPoints).
  function gradBuildPoints(paint, node) {
    // A horizontal ramp only when this angular gradient is actually being warped
    // into a conic; an unwarped angular (radial approximation) uses its handles.
    return (paint.type === 'GRADIENT_ANGULAR' && node && node.__angularConic) ? angularPoints(node) : gradPoints(paint, node);
  }

  // Add an "ADBE Polar Coordinates" effect that bends a horizontal linear ramp
  // into a conic (angular) sweep: Type = Rect to Polar (1), Interpolation = 100%.
  // The effect warps the WHOLE layer around its centre, so a single-fill angular
  // shape reads as a conic gradient. Returns true only when the effect + both
  // params were applied; false means the caller should keep the radial fallback.
  // Start-angle alignment is approximate -- Rect->Polar starts the sweep at the
  // top and runs clockwise, which need not match the source's start handle.
  function addPolarConic(layer) {
    try {
      var effects = layer.property('ADBE Effect Parade');
      if (!effects) return false;
      var polar = effects.addProperty('ADBE Polar Coordinates');
      if (!polar) return false;
      // Interpolation = 100% (full warp), Type = 1 (Rect to Polar).
      setSafe(polar, 'ADBE Polar Coordinates-0001', 100);
      setSafe(polar, 'ADBE Polar Coordinates-0002', 1);
      return true;
    } catch (e) { return false; }
  }

  function setSafe(prop, name, value) {
    try { prop.property(name).setValue(value); } catch (e) { /* version / build differences */ }
  }

  // The native .ffx gradient writer fell back to the effect approximation. Record
  // WHY, once per import, so a wrong-looking gradient is diagnosable.
  function noteGradFallback(node, report) {
    if (!report || report.__gradReasonNoted) return;
    report.__gradReasonNoted = true;
    var why = (R.grad.reason && R.grad.reason()) || 'unknown';
    R.importer.util.note(report, 'approximated', { name: node.name, detail: 'native gradient unavailable (' + why + ') — showing an approximation' });
  }

  // A diamond gradient has no native AE shape type; we build it as a native
  // radial along the gradient axis (vector + editable, never rasterised). Flag the
  // approximation once per import so the difference is diagnosable.
  function noteDiamondApprox(node, report) {
    if (!report || report.__diamondNoted) return;
    report.__diamondNoted = true;
    R.importer.util.note(report, 'approximated', { name: node.name, detail: 'diamond gradient approximated as a native radial gradient (After Effects has no diamond gradient)' });
  }

  function noteAngularRadial(node, report) {
    if (!report || report.__angularRadialNoted) return;
    report.__angularRadialNoted = true;
    R.importer.util.note(report, 'approximated', { name: node.name, detail: 'angular (conic) gradient approximated as a native radial: the shape also has a stroke or another fill, and the conic warp is layer-wide (it would distort them)' });
  }

  // The angular -> conic Polar Coordinates warp is LAYER-WIDE, so it bends every
  // fill / stroke the shape renders. It is only safe when the angular fill is the
  // sole paint on the layer: no visible stroke and no other visible fill.
  function angularCanWarp(node) {
    var st = node.stroke;
    if (st && st.weight && st.paints) {
      for (var i = 0; i < st.paints.length; i++) { if (st.paints[i] && st.paints[i].visible !== false) return false; }
    }
    var fills = node.fills || [];
    var vis = 0;
    for (var j = 0; j < fills.length; j++) { if (fills[j] && fills[j].visible !== false) vis++; }
    return vis <= 1;
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
      // Build a real native G-Fill. Geometry (type + endpoints) is scriptable;
      // the stop COLOURS go on via the .ffx animation-preset trick
      // (R.grad.applyGradientColors) -- a TRUE editable multi-stop gradient, the
      // same technique Overlord/AEUX use. If that path is unavailable (the
      // "Allow Scripts to Write Files" preference is off, or anything fails), the
      // gradientEffect post-pass paints the colours with a Gradient Ramp /
      // 4-Colour approximation instead so a gradient always shows.
      var gf = contents.addProperty('ADBE Vector Graphic - G-Fill');
      // Angular warps to a conic via a layer-wide Polar effect -- only safe when
      // the angular fill is alone on the layer; otherwise build it as a native
      // radial (like diamond) so a co-resident stroke / fill is never bent.
      var warpAngular = (type === 'GRADIENT_ANGULAR') && angularCanWarp(node);
      var gtype = (type === 'GRADIENT_RADIAL' || type === 'GRADIENT_DIAMOND' ||
                   (type === 'GRADIENT_ANGULAR' && !warpAngular)) ? 2 : 1;
      var pts = warpAngular ? angularPoints(node) : gradPoints(paint, node);
      R.grad.applyGradient(gf, { type: gtype, start: pts.start, end: pts.end });
      setSafe(gf, 'ADBE Vector Fill Rule', windingRule(node));
      if (paint.opacity != null) setSafe(gf, 'ADBE Vector Fill Opacity', paint.opacity * 100);
      if (R.grad.applyGradientColors(gf, gradStops(paint))) node.__nativeGradFill = true;
      else noteGradFallback(node, report);
      // The Polar Coordinates warp is added once, layer-wide, in the gradientEffect
      // post-pass (it needs the layer, not the contents group).
      if (warpAngular) node.__angularConic = true;
      else if (type === 'GRADIENT_ANGULAR') noteAngularRadial(node, report);
      if (type === 'GRADIENT_DIAMOND') noteDiamondApprox(node, report);
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

  function firstGradient(node) {
    var fills = node.fills || [];
    for (var i = 0; i < fills.length; i++) {
      var p = fills[i];
      if (p && p.visible !== false && isGradient(p.type)) return p;
    }
    // Also consider a gradient STROKE, so its colours get the Ramp/4-Colour
    // fallback when the native .ffx write was unavailable (instead of staying the
    // default black->white placeholder ramp).
    var st = node.stroke;
    if (st && st.paints) {
      for (var j = 0; j < st.paints.length; j++) {
        var sp = st.paints[j];
        if (sp && sp.visible !== false && isGradient(sp.type)) return sp;
      }
    }
    return null;
  }

  // A point on the gradient axis at parametric position t (0..1).
  function axisPoint(pts, t) {
    return [pts.start[0] + (pts.end[0] - pts.start[0]) * t, pts.start[1] + (pts.end[1] - pts.start[1]) * t];
  }

  // Up to four representative stops (4-Colour Gradient carries four): all of them
  // when <=4, else first / a third / two thirds / last.
  function pickFour(stops) {
    if (stops.length <= 4) return stops;
    var last = stops.length - 1;
    return [stops[0], stops[Math.round(last / 3)], stops[Math.round(2 * last / 3)], stops[last]];
  }

  // FALLBACK colour path, used only when the native .ffx gradient writer could
  // not run (applyGradientColors returned false -- e.g. the "Allow Scripts to
  // Write Files" preference is off). It paints the gradient with an editable
  // effect on top of the placeholder G-Fill:
  //   - 2 stops  -> Gradient Ramp (exact linear/radial two-colour ramp).
  //   - 3+ stops -> 4-Colour Gradient, its four colours placed along the gradient
  //                 axis at the real stop positions, so the middle colours survive.
  // When the native writer already applied real stop colours, this is a no-op.
  function gradientEffect(layer, node, report) {
    if (!layer || layer.length !== undefined) return false;
    // Angular -> conic: warp the horizontal ramp built for an angular gradient
    // into a sweep with Polar Coordinates (Rect->Polar). Runs whether the stop
    // colours went on natively or via the ramp fallback. If Polar Coordinates is
    // unavailable, the layer keeps the linear ramp (which a radial would not
    // improve), so leave the build as-is and flag it once.
    if (node && node.__angularConic) {
      if (!addPolarConic(layer)) {
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'angular (conic) gradient: Polar Coordinates effect unavailable — showing the underlying linear ramp' });
      }
    }
    if (node && node.__nativeGradFill) return true; // native colours already on
    var paint = firstGradient(node);
    if (!paint) return false;
    var effects = layer.property('ADBE Effect Parade');
    if (!effects) return false;
    var stops = gradStops(paint);
    // For an angular gradient the colour fallback paints a horizontal ramp too,
    // so the Polar Coordinates warp (added above) still bends it into a sweep.
    var pts = gradBuildPoints(paint, node);
    var linear = (paint.type === 'GRADIENT_LINEAR' || (paint.type === 'GRADIENT_ANGULAR' && node.__angularConic));

    if (stops.length <= 2) {
      var ramp;
      try { ramp = effects.addProperty('ADBE Ramp'); } catch (e) { return false; }
      if (!ramp) return false;
      setSafe(ramp, 'ADBE Ramp-0001', pts.start);                     // Start of Ramp
      setSafe(ramp, 'ADBE Ramp-0002', stops[0].color);                // Start Color
      setSafe(ramp, 'ADBE Ramp-0003', pts.end);                       // End of Ramp
      setSafe(ramp, 'ADBE Ramp-0004', stops[stops.length - 1].color); // End Color
      setSafe(ramp, 'ADBE Ramp-0005', linear ? 1 : 2);                // Ramp Shape
      setSafe(ramp, 'ADBE Ramp-0007', 0);                             // Blend With Original
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'gradient rebuilt as an editable Gradient Ramp effect (After Effects can’t script shape-fill gradient colours)' });
      return true;
    }

    var fc;
    try { fc = effects.addProperty('ADBE 4ColorGradient'); } catch (e2) { fc = null; }
    if (!fc) return false;
    var sel = pickFour(stops);
    var POINT = ['ADBE 4ColorGradient-0002', 'ADBE 4ColorGradient-0004', 'ADBE 4ColorGradient-0006', 'ADBE 4ColorGradient-0008'];
    var COLOR = ['ADBE 4ColorGradient-0003', 'ADBE 4ColorGradient-0005', 'ADBE 4ColorGradient-0007', 'ADBE 4ColorGradient-0009'];
    for (var i = 0; i < 4; i++) {
      var s = sel[i < sel.length ? i : sel.length - 1]; // reuse the last stop to fill point 4
      setSafe(fc, POINT[i], axisPoint(pts, s.pos));
      setSafe(fc, COLOR[i], s.color);
    }
    setSafe(fc, 'ADBE 4ColorGradient-0010', 100); // Blend (fully smooth)
    R.importer.util.note(report, 'approximated', { name: node.name, detail: stops.length + '-stop gradient rebuilt as a 4-colour gradient along the axis (After Effects can’t script a true multi-stop gradient)' });
    return true;
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
      // Angular warps to a conic via a layer-wide Polar effect -- only safe when
      // the angular paint is alone on the layer; otherwise build it as a native
      // radial (like diamond) so a co-resident fill / stroke is never bent. Mirror
      // the fill path (addFillPaint) so a stroke never warps the whole layer.
      var warpAngular = (paint.type === 'GRADIENT_ANGULAR') && angularCanWarp(node);
      var gtype = (paint.type === 'GRADIENT_LINEAR' ||
                   (paint.type === 'GRADIENT_ANGULAR' && warpAngular)) ? 1 : 2;
      var pts = warpAngular ? angularPoints(node) : gradPoints(paint, node);
      R.grad.applyGradient(stroke, { type: gtype, start: pts.start, end: pts.end });
      // Mirror the solid stroke opacity (and the fill path): a semi-transparent
      // gradient border must not import fully opaque.
      if (paint.opacity != null) setSafe(stroke, 'ADBE Vector Stroke Opacity', paint.opacity * 100);
      if (R.grad.applyGradientColors(stroke, gradStops(paint))) node.__nativeGradFill = true;
      else noteGradFallback(node, report);
      // The Polar Coordinates warp is added once, layer-wide, in the gradientEffect
      // post-pass (it needs the layer, not the contents group).
      if (warpAngular) node.__angularConic = true;
      else if (paint.type === 'GRADIENT_ANGULAR') noteAngularRadial(node, report);
      if (paint.type === 'GRADIENT_DIAMOND') noteDiamondApprox(node, report);
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
    gradientEffect: gradientEffect,
    windingRule: windingRule,
    gradStops: gradStops,
    gradPoints: gradPoints
  };
})();
