/*
 * Rebound host, Pin Rig (design / construction overlay generator).
 *
 * Reads the selected artwork's geometry (shape path vertices, or the layer's
 * bounding box) and generates real, editable AE layers that draw a construction
 * overlay: pins, bounding box, selection bounds, bezier handles, measurement
 * labels, grid / circle / margin guides, and a background dot field, themed by
 * one accent + label color and an overlay scale, optionally parented to a master
 * null. Every generated layer is tagged in its comment with [PinRig] so Remove
 * can clean them up. All scriptable; the only PinRig features that are not are
 * true variable-font weight morph and exact corner-radius auto-detect.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var rig = R.rig;
  var TAG = '[PinRig]';
  // We stamp the full build settings (as JSON) into one rig layer's comment, so
  // selecting a rigged object can read back EXACTLY what it was built with and
  // show it in the panel. The comment still starts with TAG, so every existing
  // indexOf(TAG) check keeps working. The host has a JSON polyfill (lib/json).
  var STASH_SEP = '::';
  var SETTINGS_KEYS = ['accent', 'label', 'scale', 'infographic', 'pins', 'bbox', 'selbounds', 'bezier',
    'edges', 'coords', 'angles', 'bezierCoords', 'cornerRadius', 'grid', 'circles', 'margin', 'dotgrid',
    'controller', 'pinShape', 'pinStroke', 'pinFill', 'fillColor', 'strokeColor', 'pinRound',
    'pinPlacement', 'pinGrid', 'pinSource', 'pinLayerName', 'pinLayerScale',
    'ctrlShape', 'ctrlSize', 'ctrlColor', 'ctrlLabel',
    'typography', 'typeBaseline', 'typeX', 'typeCap', 'typeAscender', 'typeDescender', 'typeLabels'];

  function encodeSettings(args) {
    var o = {};
    for (var i = 0; i < SETTINGS_KEYS.length; i++) { var k = SETTINGS_KEYS[i]; if (args[k] !== undefined && args[k] !== null) o[k] = args[k]; }
    var json = ''; try { json = JSON.stringify(o); } catch (e) { json = ''; }
    return TAG + (json ? ' ' + STASH_SEP + json : '');
  }
  function stampSettings(layer, args) { if (layer) { try { layer.comment = encodeSettings(args); } catch (e) {} } }
  function parseSettings(comment) {
    if (!comment) return null;
    var idx = comment.indexOf(STASH_SEP);
    if (idx < 0) return null;
    try { return JSON.parse(comment.substring(idx + STASH_SEP.length)); } catch (e) { return null; }
  }
  function sameLayer(a, b) { return !!(a && b && a.index === b.index); }

  function hexToRgb01(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec('' + hex);
    if (!m) return [0.22, 0.76, 1];
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // ---- geometry, collected in the source layer's OWN space ------------------
  // The overlay is built in the source's coordinate space and then parented to
  // the source, so AE applies the layer's live transform (and its parent chain)
  // to the whole rig every frame. THAT is what makes it track the artwork as it
  // moves / scales / rotates, instead of being frozen at the comp-space
  // positions it happened to have when it was built.

  // 2x3 affine [a,b,c,d,e,f] mapping (x,y) -> (a*x + c*y + e, b*x + d*y + f).
  function matIdent() { return [1, 0, 0, 1, 0, 0]; }
  function matLin(M, v) { return [M[0] * v[0] + M[2] * v[1], M[1] * v[0] + M[3] * v[1]]; }
  function matApply(M, v) { return [M[0] * v[0] + M[2] * v[1] + M[4], M[1] * v[0] + M[3] * v[1] + M[5]]; }
  function matMul(A, B) {
    return [
      A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
    ];
  }
  // A shape group's own transform: v -> pos + R*S*(v - anchor).
  function groupMat(anchor, pos, scale, rotDeg) {
    var sx = (scale && scale.length ? scale[0] : 100) / 100;
    var sy = (scale && scale.length > 1 ? scale[1] : 100) / 100;
    var r = (rotDeg || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    var rs = [c * sx, s * sx, -s * sy, c * sy, 0, 0];
    var ax = anchor && anchor.length ? anchor[0] : 0, ay = anchor && anchor.length > 1 ? anchor[1] : 0;
    var ra = matLin(rs, [ax, ay]);
    var px = pos && pos.length ? pos[0] : 0, py = pos && pos.length > 1 ? pos[1] : 0;
    return [rs[0], rs[1], rs[2], rs[3], px - ra[0], py - ra[1]];
  }

  // Collect explicit path vertices in LAYER space, composing each shape group's
  // transform on the way down so grouped / offset paths land correctly.
  // Parametric shapes (rect / ellipse / star) expose no vertices and fall back
  // to the layer's bounding box, which is enough to rig their corners.
  function collectShapeVerts(group, t0, out, mat) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      var mn = ''; try { mn = p.matchName; } catch (em) { mn = ''; }
      var shapeProp = null;
      try { shapeProp = p.property('ADBE Vector Shape'); } catch (e) { shapeProp = null; }
      if (shapeProp) {
        var sh = shapeProp.value;
        if (sh && sh.vertices) for (var k = 0; k < sh.vertices.length; k++) out.push(matApply(mat, sh.vertices[k]));
        continue;
      }
      if (mn === 'ADBE Vector Group') {
        var gm = mat, tr = null;
        try { tr = p.property('ADBE Vector Transform - Group'); } catch (et) { tr = null; }
        if (tr) {
          var ga = null, gp = null, gs = null, gr = 0;
          try { ga = tr.property('ADBE Vector Anchor').valueAtTime(t0, false); } catch (e1) {}
          try { gp = tr.property('ADBE Vector Position').valueAtTime(t0, false); } catch (e2) {}
          try { gs = tr.property('ADBE Vector Scale').valueAtTime(t0, false); } catch (e3) {}
          try { gr = tr.property('ADBE Vector Rotation').valueAtTime(t0, false); } catch (e4) {}
          gm = matMul(mat, groupMat(ga || [0, 0], gp || [0, 0], gs || [100, 100], gr || 0));
        }
        var contents = null; try { contents = p.property('ADBE Vectors Group'); } catch (ec) { contents = null; }
        if (contents) collectShapeVerts(contents, t0, out, gm);
        continue;
      }
      var n = 0; try { n = p.numProperties; } catch (e5) { n = 0; }
      if (n > 0) collectShapeVerts(p, t0, out, mat);
    }
  }

  // Average scale factor of an affine, for converting layer-unit values (e.g. a
  // rect's corner radius) that were defined inside a scaled group.
  function matAvgScale(M) {
    var sx = Math.sqrt(M[0] * M[0] + M[1] * M[1]);
    var sy = Math.sqrt(M[2] * M[2] + M[3] * M[3]);
    return (sx + sy) / 2;
  }

  // Collect the REAL bezier handles for each path vertex (its in / out tangents,
  // as absolute layer-space points), and the first non-zero corner radius found
  // on a parametric rectangle. This is what lets the Bezier Handles overlay draw
  // the actual control handles instead of a decorative approximation, the way
  // PinRig does. info.radius is filled in if a rounded rect is present.
  function collectHandles(group, t0, out, mat, info) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      var mn = ''; try { mn = p.matchName; } catch (em) { mn = ''; }
      var shapeProp = null;
      try { shapeProp = p.property('ADBE Vector Shape'); } catch (e) { shapeProp = null; }
      if (shapeProp) {
        var sh = shapeProp.value;
        if (sh && sh.vertices) {
          var inT = sh.inTangents || [], outT = sh.outTangents || [];
          for (var k = 0; k < sh.vertices.length; k++) {
            var vtx = sh.vertices[k], it = inT[k] || [0, 0], ot = outT[k] || [0, 0];
            out.push({
              v: matApply(mat, vtx),
              cin: matApply(mat, [vtx[0] + it[0], vtx[1] + it[1]]),
              cout: matApply(mat, [vtx[0] + ot[0], vtx[1] + ot[1]]),
              hasIn: (it[0] !== 0 || it[1] !== 0),
              hasOut: (ot[0] !== 0 || ot[1] !== 0)
            });
          }
        }
        continue;
      }
      if (mn === 'ADBE Vector Shape - Rect' && info.radius == null) {
        try { var rp = p.property('ADBE Vector Rect Roundness'); if (rp) { var rv = rp.valueAtTime(t0, false); if (rv > 0) info.radius = rv * matAvgScale(mat); } } catch (er) {}
        continue;
      }
      if (mn === 'ADBE Vector Group') {
        var gm = mat, tr = null;
        try { tr = p.property('ADBE Vector Transform - Group'); } catch (et) { tr = null; }
        if (tr) {
          var ga = null, gp = null, gs = null, gr = 0;
          try { ga = tr.property('ADBE Vector Anchor').valueAtTime(t0, false); } catch (e1) {}
          try { gp = tr.property('ADBE Vector Position').valueAtTime(t0, false); } catch (e2) {}
          try { gs = tr.property('ADBE Vector Scale').valueAtTime(t0, false); } catch (e3) {}
          try { gr = tr.property('ADBE Vector Rotation').valueAtTime(t0, false); } catch (e4) {}
          gm = matMul(mat, groupMat(ga || [0, 0], gp || [0, 0], gs || [100, 100], gr || 0));
        }
        var contents = null; try { contents = p.property('ADBE Vectors Group'); } catch (ec) { contents = null; }
        if (contents) collectHandles(contents, t0, out, gm, info);
        continue;
      }
      var n2 = 0; try { n2 = p.numProperties; } catch (e6) { n2 = 0; }
      if (n2 > 0) collectHandles(p, t0, out, mat, info);
    }
  }

  // Read the source artwork as LAYER-space vertices (shape paths) or the four
  // corners of its bounding box, plus the layer-space bbox of whatever we found,
  // the real bezier handles, and any detected corner radius.
  function readGeometry(layer, t0) {
    var verts = [], kind = 'bounds', handles = [], info = { radius: null };
    try {
      var root = layer.property('ADBE Root Vectors Group');
      if (root) {
        collectShapeVerts(root, t0, verts, matIdent());
        try { collectHandles(root, t0, handles, matIdent(), info); } catch (eh) {}
        if (verts.length) kind = 'shape';
      }
    } catch (e) {}
    if (!verts.length) {
      var rect = null;
      try { rect = layer.sourceRectAtTime(t0, false); } catch (e2) { rect = null; }
      if (!rect) rect = { left: -50, top: -50, width: 100, height: 100 };
      verts.push([rect.left, rect.top]);
      verts.push([rect.left + rect.width, rect.top]);
      verts.push([rect.left + rect.width, rect.top + rect.height]);
      verts.push([rect.left, rect.top + rect.height]);
    }
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (var v = 0; v < verts.length; v++) { var pt = verts[v]; if (pt[0] < minx) minx = pt[0]; if (pt[0] > maxx) maxx = pt[0]; if (pt[1] < miny) miny = pt[1]; if (pt[1] > maxy) maxy = pt[1]; }
    return { verts: verts, kind: kind, handles: handles, cornerRadius: info.radius, bbox: { minx: minx, miny: miny, maxx: maxx, maxy: maxy, w: maxx - minx, h: maxy - miny, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 } };
  }

  // Where pins go, independent of the rest of the overlay. 'auto' uses the real
  // geometry (shape vertices, or bbox corners for an image / footage layer);
  // the others lay pins out on the bounding box so even a flat image can carry a
  // useful set of pins.
  function placePins(geo, args) {
    var mode = (args && args.pinPlacement) || 'auto';
    var bb = geo.bbox;
    if (mode === 'corners') return [[bb.minx, bb.miny], [bb.maxx, bb.miny], [bb.maxx, bb.maxy], [bb.minx, bb.maxy]];
    if (mode === 'midpoints') return [
      [bb.minx, bb.miny], [bb.cx, bb.miny], [bb.maxx, bb.miny], [bb.maxx, bb.cy],
      [bb.maxx, bb.maxy], [bb.cx, bb.maxy], [bb.minx, bb.maxy], [bb.minx, bb.cy]
    ];
    if (mode === 'center') return [[bb.cx, bb.cy]];
    if (mode === 'grid') {
      var n = Math.round((args && args.pinGrid) || 3);
      if (n < 2) n = 2; if (n > 8) n = 8;
      var pts = [];
      for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) {
        pts.push([bb.minx + bb.w * col / (n - 1), bb.miny + bb.h * r / (n - 1)]);
      }
      return pts;
    }
    return geo.verts;
  }

  // ---- generated-layer helpers --------------------------------------------

  function newShape(comp, name) {
    var lay = comp.layers.addShape();
    lay.name = name; lay.comment = TAG;
    lay.property(M.transform).property(M.position).setValue([0, 0]);
    lay.property(M.transform).property(M.anchor).setValue([0, 0]);
    return lay;
  }
  function rootOf(lay) { return lay.property('ADBE Root Vectors Group'); }
  function fillStroke(c, fillRGB, strokeRGB, strokeW, dash, op) {
    if (fillRGB) { var f = c.addProperty('ADBE Vector Graphic - Fill'); try { f.property('ADBE Vector Fill Color').setValue(fillRGB.concat([1])); } catch (e) {} if (op != null) try { f.property('ADBE Vector Fill Opacity').setValue(op); } catch (e1) {} }
    if (strokeRGB) {
      var s = c.addProperty('ADBE Vector Graphic - Stroke');
      try { s.property('ADBE Vector Stroke Color').setValue(strokeRGB.concat([1])); } catch (e2) {}
      try { s.property('ADBE Vector Stroke Width').setValue(strokeW); } catch (e3) {}
      if (op != null) try { s.property('ADBE Vector Stroke Opacity').setValue(op); } catch (e4) {}
      if (dash) { try { var dl = s.addProperty('ADBE Vector Stroke Dashes'); dl.addProperty('ADBE Vector Stroke Dash 1').setValue(dash); } catch (e5) {} }
    }
  }
  function grp(root) { return root.addProperty('ADBE Vector Group').property('ADBE Vectors Group'); }
  function addEllipse(root, cx, cy, r, fillRGB, strokeRGB, strokeW, op) {
    var c = grp(root);
    var e = c.addProperty('ADBE Vector Shape - Ellipse');
    e.property('ADBE Vector Ellipse Size').setValue([r * 2, r * 2]);
    e.property('ADBE Vector Ellipse Position').setValue([cx, cy]);
    fillStroke(c, fillRGB, strokeRGB, strokeW, null, op);
  }
  function addRect(root, x, y, w, h, fillRGB, strokeRGB, strokeW, dash, op) {
    var c = grp(root);
    var rc = c.addProperty('ADBE Vector Shape - Rect');
    rc.property('ADBE Vector Rect Size').setValue([w, h]);
    rc.property('ADBE Vector Rect Position').setValue([x + w / 2, y + h / 2]);
    fillStroke(c, fillRGB, strokeRGB, strokeW, dash, op);
  }
  function addPoly(root, pts, fillRGB, strokeRGB, strokeW, op) {
    var c = grp(root);
    var sg = c.addProperty('ADBE Vector Shape - Group');
    var shape = new Shape();
    var inT = [], outT = [];
    for (var i = 0; i < pts.length; i++) { inT.push([0, 0]); outT.push([0, 0]); }
    shape.vertices = pts; shape.inTangents = inT; shape.outTangents = outT; shape.closed = true;
    sg.property('ADBE Vector Shape').setValue(shape);
    fillStroke(c, fillRGB, strokeRGB, strokeW, null, op);
  }
  // One pin in the configured style.
  function addPin(root, cx, cy, r, shapeName, fillRGB, strokeRGB, strokeW, round) {
    if (shapeName === 'ring') { addEllipse(root, cx, cy, r, null, strokeRGB, strokeW, 100); return; }
    if (shapeName === 'square') {
      var c = grp(root);
      var rc = c.addProperty('ADBE Vector Shape - Rect');
      rc.property('ADBE Vector Rect Size').setValue([r * 2, r * 2]);
      rc.property('ADBE Vector Rect Position').setValue([cx, cy]);
      try { rc.property('ADBE Vector Rect Roundness').setValue((round || 0) / 100 * r); } catch (e) {}
      fillStroke(c, fillRGB, strokeRGB, strokeW, null, 100);
      return;
    }
    if (shapeName === 'cross') { addLine(root, [cx - r, cy], [cx + r, cy], strokeRGB, strokeW, 100); addLine(root, [cx, cy - r], [cx, cy + r], strokeRGB, strokeW, 100); return; }
    if (shapeName === 'diamond') { addPoly(root, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], fillRGB, strokeRGB, strokeW, 100); return; }
    addEllipse(root, cx, cy, r, fillRGB, strokeRGB, strokeW, 100);
  }
  function addLine(root, p0, p1, strokeRGB, strokeW, op) {
    var c = grp(root);
    var sg = c.addProperty('ADBE Vector Shape - Group');
    var shape = new Shape();
    shape.vertices = [p0, p1]; shape.inTangents = [[0, 0], [0, 0]]; shape.outTangents = [[0, 0], [0, 0]]; shape.closed = false;
    sg.property('ADBE Vector Shape').setValue(shape);
    fillStroke(c, null, strokeRGB, strokeW, null, op);
  }
  // Add a named Color Control and set its value.
  function ensureColor(layer, name, rgb) {
    var fx = layer.property('ADBE Effect Parade');
    var ctrl = fx.addProperty('ADBE Color Control');
    ctrl.name = name;
    try { ctrl.property(1).setValue(rgb.concat([1])); } catch (e) { try { ctrl.property(1).setValue(rgb); } catch (e2) {} }
    return ctrl;
  }
  // Bare path shapes (no own paint) so a single group fill/stroke styles them all.
  function pathEllipse(c, cx, cy) { var e = c.addProperty('ADBE Vector Shape - Ellipse'); e.property('ADBE Vector Ellipse Position').setValue([cx, cy]); return e; }
  function pathRect(c, cx, cy) { var rc = c.addProperty('ADBE Vector Shape - Rect'); rc.property('ADBE Vector Rect Position').setValue([cx, cy]); return rc; }
  function pathPoly(c, pts) { var sg = c.addProperty('ADBE Vector Shape - Group'); var sh = new Shape(); var t = []; for (var i = 0; i < pts.length; i++) t.push([0, 0]); sh.vertices = pts; sh.inTangents = t; sh.outTangents = t; sh.closed = true; sg.property('ADBE Vector Shape').setValue(sh); return sg; }
  function pathLine(c, p0, p1) { var sg = c.addProperty('ADBE Vector Shape - Group'); var sh = new Shape(); sh.vertices = [p0, p1]; sh.inTangents = [[0, 0], [0, 0]]; sh.outTangents = [[0, 0], [0, 0]]; sh.closed = false; sg.property('ADBE Vector Shape').setValue(sh); return sg; }

  // Vertices for a closed polygon pin of radius r centered at (cx, cy).
  function polyPoints(shape, cx, cy, r) {
    var pts = [], i, a, rr;
    if (shape === 'triangle') return [[cx, cy - r], [cx + r * 0.866, cy + r * 0.5], [cx - r * 0.866, cy + r * 0.5]];
    if (shape === 'hexagon') { for (i = 0; i < 6; i++) { a = Math.PI / 180 * (60 * i - 90); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return pts; }
    if (shape === 'star') { for (i = 0; i < 10; i++) { rr = (i % 2 === 0) ? r : r * 0.45; a = Math.PI / 180 * (36 * i - 90); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return pts; }
    return [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]; // diamond
  }

  // Build the Pins layer so its appearance is driven by Effect Controls on the
  // layer (Pin Size, Stroke Width/Color, Fill Color/Opacity, Roundness). Select
  // the layer in AE and edit those controls to restyle every pin live.
  function buildPinsLayer(comp, verts, args, sc, baseR) {
    var lay = newShape(comp, 'Pins'); var root = rootOf(lay);
    var shape = args.pinShape || 'dot';
    var FILLABLE = { dot: 1, square: 1, diamond: 1, triangle: 1, hexagon: 1, star: 1 };
    var hasFill = FILLABLE[shape] && args.pinFill;
    var fillRgb = args.fillRgb || hexToRgb01(args.fillColor || '#39C2FF');
    var strokeRgb = args.strokeRgb || hexToRgb01(args.strokeColor || '#0E1116');

    rig.ensureSlider(lay, 'Pin Size', baseR);
    rig.ensureSlider(lay, 'Stroke Width', (args.pinStroke != null ? args.pinStroke : 1) * sc);
    ensureColor(lay, 'Stroke Color', strokeRgb);
    if (hasFill) { rig.ensureSlider(lay, 'Fill Opacity', 100); ensureColor(lay, 'Fill Color', fillRgb); }
    if (shape === 'square') rig.ensureSlider(lay, 'Roundness', args.pinRound != null ? args.pinRound : 40);

    var c = grp(root);
    for (var i = 0; i < verts.length; i++) {
      var cx = verts[i][0], cy = verts[i][1];
      if (shape === 'ring' || shape === 'dot') {
        var e = pathEllipse(c, cx, cy);
        rig.setExpression(e.property('ADBE Vector Ellipse Size'), 's = effect("Pin Size")("Slider"); [s * 2, s * 2];');
      } else if (shape === 'square') {
        var rc = pathRect(c, cx, cy);
        rig.setExpression(rc.property('ADBE Vector Rect Size'), 's = effect("Pin Size")("Slider"); [s * 2, s * 2];');
        try { rig.setExpression(rc.property('ADBE Vector Rect Roundness'), 'effect("Roundness")("Slider") / 100 * effect("Pin Size")("Slider");'); } catch (e3) {}
      } else if (shape === 'cross') {
        pathLine(c, [cx - baseR, cy], [cx + baseR, cy]); pathLine(c, [cx, cy - baseR], [cx, cy + baseR]);
      } else if (shape === 'target') {
        var ot = pathEllipse(c, cx, cy);
        rig.setExpression(ot.property('ADBE Vector Ellipse Size'), 's = effect("Pin Size")("Slider"); [s * 2, s * 2];');
        pathLine(c, [cx - baseR * 0.5, cy], [cx + baseR * 0.5, cy]); pathLine(c, [cx, cy - baseR * 0.5], [cx, cy + baseR * 0.5]);
      } else {
        pathPoly(c, polyPoints(shape, cx, cy, baseR));
      }
    }
    if (hasFill) {
      var fill = c.addProperty('ADBE Vector Graphic - Fill');
      rig.setExpression(fill.property('ADBE Vector Fill Color'), 'effect("Fill Color")("Color");');
      rig.setExpression(fill.property('ADBE Vector Fill Opacity'), 'effect("Fill Opacity")("Slider");');
    }
    var stroke = c.addProperty('ADBE Vector Graphic - Stroke');
    rig.setExpression(stroke.property('ADBE Vector Stroke Color'), 'effect("Stroke Color")("Color");');
    rig.setExpression(stroke.property('ADBE Vector Stroke Width'), 'effect("Stroke Width")("Slider");');
    return lay;
  }

  function addText(comp, str, pos, rgb, size) {
    var tl = comp.layers.addText('' + str);
    tl.comment = TAG;
    var prop = tl.property('ADBE Text Properties').property('ADBE Text Document');
    var td = prop.value;
    try { td.fontSize = size; } catch (e) {}
    try { td.fillColor = rgb; } catch (e1) {}
    try { td.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e2) {}
    prop.setValue(td);
    tl.property(M.transform).property(M.anchor).setValue([0, 0]);
    tl.property(M.transform).property(M.position).setValue(pos);
    return tl;
  }

  // Null Style: a visible, styled handle for the controller (instead of AE's
  // invisible default null). Drawn at the rig origin on a guide layer (so it
  // shows in the comp but never renders to output). Parented to the rig by gen().
  function buildController(comp, name, args, sc) {
    var shape = args.ctrlShape;
    if (!shape || shape === 'null') return null;
    var size = (args.ctrlSize != null ? args.ctrlSize : 18) * sc;
    var col = args.ctrlColorRgb || hexToRgb01(args.ctrlColor || '#FFD24D');
    var lw = 2 * sc;
    var lay = newShape(comp, name + ' Controller');
    try { lay.guideLayer = true; } catch (eg) {}
    var root = rootOf(lay);
    if (shape === 'dot') addEllipse(root, 0, 0, size, col, null, 0, 100);
    else if (shape === 'ring') addEllipse(root, 0, 0, size, null, col, lw, 100);
    else if (shape === 'square') addRect(root, -size, -size, size * 2, size * 2, null, col, lw, null, 100);
    else if (shape === 'cross') { addLine(root, [-size, 0], [size, 0], col, lw, 100); addLine(root, [0, -size], [0, size], col, lw, 100); }
    else if (shape === 'diamond') addPoly(root, [[0, -size], [size, 0], [0, size], [-size, 0]], null, col, lw, 100);
    else if (shape === 'target') { addEllipse(root, 0, 0, size, null, col, lw, 100); addLine(root, [-size * 0.5, 0], [size * 0.5, 0], col, lw, 100); addLine(root, [0, -size * 0.5], [0, size * 0.5], col, lw, 100); }
    else addEllipse(root, 0, 0, size, col, null, 0, 100);
    return lay;
  }

  // Find a layer by exact name (the user-chosen custom pin marker).
  function findLayerByName(comp, name) {
    var nm = '' + name;
    for (var i = 1; i <= comp.numLayers; i++) { if (comp.layer(i).name === nm) return comp.layer(i); }
    return null;
  }
  // Custom-layer pins: stamp a copy of the marker layer at every pin vertex.
  // The vertices are in the source's layer space, so we parent each copy to the
  // rig FIRST and set its Position afterwards (parenting rewrites Position to
  // keep the old comp location, which would otherwise undo the placement).
  //
  // Position places the copy's ANCHOR POINT at the vertex, but a layer's anchor
  // is usually NOT at the art's centre (a shape layer's defaults to [0,0], its
  // layer-space origin), so the marker would land offset by however far its art
  // sits from that origin. We first move each copy's anchor to the marker's
  // bounding-box centre so the marker is centred on the pin, whatever its art.
  function stampLayerPins(comp, marker, verts, args, rigParent) {
    var made = 0, pct = (args.pinLayerScale != null ? args.pinLayerScale : 100);
    var max = Math.min(verts.length, 80);

    // Marker's visual centre in its own layer space (so the anchor can sit there).
    var ctr = null;
    try {
      var rect = marker.sourceRectAtTime(comp.time, false);
      if (rect) ctr = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    } catch (er) { ctr = null; }

    for (var i = 0; i < max; i++) {
      var dup;
      try { dup = marker.duplicate(); } catch (e) { continue; }
      try { dup.comment = TAG; } catch (e0) {}
      try { dup.name = 'Pin ' + (i + 1); } catch (e1) {}
      var dtg = dup.property(M.transform);
      if (ctr) {
        try {
          var ap = dtg.property(M.anchor), av = ap.value;
          var na = [ctr[0], ctr[1]]; if (av.length > 2) na.push(av[2]);
          ap.setValue(na);
        } catch (ea) {}
      }
      if (pct !== 100) {
        try {
          var sp = dtg.property(M.scale);
          var cur = sp.value, nv = [cur[0] * pct / 100, cur[1] * pct / 100];
          if (cur.length > 2) nv.push(cur[2] * pct / 100);
          sp.setValue(nv);
        } catch (e3) {}
      }
      if (rigParent) { try { dup.parent = rigParent; } catch (e4) {} }
      try {
        var pp = dtg.property(M.position), pv = pp.value;
        var npv = (pv && pv.length > 2) ? [verts[i][0], verts[i][1], 0] : verts[i];
        pp.setValue(npv);
      } catch (e2) {}
      made++;
    }
    return made;
  }

  // Build the full overlay for ONE source layer and return { made, stash }.
  // Factored out of build() so multiple selected layers each get a complete,
  // independently-tracking rig: because every source is handled in its OWN call,
  // the per-source rigParent / geometry never leak across layers (no shared-var
  // closure bug). The global dot-grid backdrop is built once by build(), not here.
  function buildOne(comp, src, args, env) {
    var t0 = env.t0, accent = env.accent, label = env.label, sc = env.sc, sw = env.sw, mr = env.mr, fs = env.fs;
    var made = 0;
    {
      var geo = readGeometry(src, t0);
      var verts = geo.verts, bb = geo.bbox;

      // The rig tracks the source by being parented to it. 'master' hangs
      // everything off one null handle (itself parented to the source, with an
      // identity local transform so its space coincides with the source's layer
      // space); 'individual' parents each overlay straight to the source. Either
      // way AE applies the source's live transform to the whole overlay.
      var master = null;
      if (args.controller !== 'individual') {
        master = comp.layers.addNull();
        master.name = src.name + ' Rig'; master.comment = TAG;
        try { master.parent = src; } catch (em) {}
        var mtg = master.property(M.transform);
        try { mtg.property(M.position).setValue([0, 0]); } catch (em1) {}
        try { mtg.property(M.anchor).setValue([0, 0]); } catch (em2) {}
        try { mtg.property(M.scale).setValue([100, 100]); } catch (em3) {}
        try { mtg.property(M.rotation).setValue(0); } catch (em4) {}
        made++;
      }
      var rigParent = master || src;

      // Parent a generated layer to the rig so it rides the source's transform.
      // Shapes carry their geometry in layer space, so their own Position is
      // zeroed. Text layers ARE placed by their Position, so we preserve the
      // layer-space point and re-apply it after parenting (which would otherwise
      // rewrite the value to keep the old comp-space location).
      function parentTo(lay) {
        if (!rigParent || lay === master) return;
        var isText = false; try { isText = lay instanceof TextLayer; } catch (et) { isText = false; }
        var tg = lay.property(M.transform);
        var keepPos = isText ? tg.property(M.position).value : null;
        try { lay.parent = rigParent; } catch (ep) { return; }
        try { tg.property(M.anchor).setValue([0, 0]); } catch (e5) {}
        try { tg.property(M.scale).setValue([100, 100]); } catch (e6) {}
        try { tg.property(M.rotation).setValue(0); } catch (e7) {}
        try { tg.property(M.position).setValue(isText ? keepPos : [0, 0]); } catch (e8) {}
      }

      // The first rig-parented layer (or the master null) carries the settings
      // stash, so readRig can recover them from any rig.
      var stashLayer = master;
      function gen(fn) { try { var lay = fn(); if (lay) { parentTo(lay); if (!stashLayer) stashLayer = lay; made++; } } catch (e) {} }

      // Styled controller handle (Null Style) + optional name label.
      if (master && args.ctrlShape && args.ctrlShape !== 'null') {
        gen(function () { return buildController(comp, src.name, args, sc); });
        if (args.ctrlLabel) {
          var csz = (args.ctrlSize != null ? args.ctrlSize : 18) * sc;
          var ccol = args.ctrlColorRgb || hexToRgb01(args.ctrlColor || '#FFD24D');
          gen((function (yy, color) { return function () { return addText(comp, src.name, [0, yy], color, 12 * sc); }; })(-csz - 6 * sc, ccol));
        }
      }
      // Typography guides: baseline / x-height / cap / ascender / descender for a
      // TEXT source. Metrics are derived from the font size (point text has its
      // baseline at layer-space y=0); approximate but standard ratios.
      if (args.typography) {
        var tFontSize = 0;
        try { tFontSize = src.property('ADBE Text Properties').property('ADBE Text Document').value.fontSize; } catch (etf) { tFontSize = 0; }
        if (tFontSize > 0) {
          var trect = null; try { trect = src.sourceRectAtTime(t0, false); } catch (etr) { trect = null; }
          var tx0 = trect ? trect.left - 12 * sc : -tFontSize * 2;
          var tx1 = trect ? trect.left + trect.width + 12 * sc : tFontSize * 2;
          var tlines = [];
          if (args.typeAscender) tlines.push([-0.75 * tFontSize, 'ascender']);
          if (args.typeCap !== false) tlines.push([-0.70 * tFontSize, 'cap height']);
          if (args.typeX !== false) tlines.push([-0.50 * tFontSize, 'x-height']);
          if (args.typeBaseline !== false) tlines.push([0, 'baseline']);
          if (args.typeDescender) tlines.push([0.21 * tFontSize, 'descender']);
          gen((function (x0, x1, lines) { return function () {
            var lay = newShape(comp, 'Type Guides'); var root = rootOf(lay);
            for (var i = 0; i < lines.length; i++) addLine(root, [x0, lines[i][0]], [x1, lines[i][0]], accent, sw * 0.7, 60);
            return lay;
          }; })(tx0, tx1, tlines));
          if (args.typeLabels !== false) for (var tl = 0; tl < tlines.length; tl++) {
            gen((function (yy, nm, xx) { return function () { return addText(comp, nm, [xx, yy - 2 * sc], label, fs * 0.8); }; })(tlines[tl][0], tlines[tl][1], tx1 + 6 * sc));
          }
        }
      }
      if (args.circles) gen(function () {
        var lay = newShape(comp, 'Circle Guides'); var root = rootOf(lay);
        var base = Math.max(bb.w, bb.h) / 2;
        for (var i = 0; i < 3; i++) addEllipse(root, bb.cx, bb.cy, base * (0.7 + i * 0.35), null, accent, sw * 0.7, 40);
        return lay;
      });
      if (args.grid) gen(function () {
        var lay = newShape(comp, 'Grid Guides'); var root = rootOf(lay);
        for (var gx = 0; gx <= 4; gx++) addLine(root, [bb.minx + bb.w * gx / 4, bb.miny], [bb.minx + bb.w * gx / 4, bb.maxy], accent, sw * 0.6, 35);
        for (var gy = 0; gy <= 4; gy++) addLine(root, [bb.minx, bb.miny + bb.h * gy / 4], [bb.maxx, bb.miny + bb.h * gy / 4], accent, sw * 0.6, 35);
        return lay;
      });
      if (args.margin) gen(function () {
        var lay = newShape(comp, 'Margin Guide'); var root = rootOf(lay);
        var mg = Math.max(bb.w, bb.h) * 0.12;
        addRect(root, bb.minx - mg, bb.miny - mg, bb.w + 2 * mg, bb.h + 2 * mg, null, accent, sw, [3 * sc, 3 * sc], 60);
        return lay;
      });
      if (args.selbounds) gen(function () { var lay = newShape(comp, 'Selection Bounds'); addRect(rootOf(lay), bb.minx - 2, bb.miny - 2, bb.w + 4, bb.h + 4, null, accent, sw * 0.8, [2 * sc, 2 * sc], 65); return lay; });
      if (args.bbox) gen(function () {
        var lay = newShape(comp, 'Bounding Box'); var root = rootOf(lay);
        addRect(root, bb.minx, bb.miny, bb.w, bb.h, null, accent, sw, null, 60);
        var cs = [[bb.minx, bb.miny], [bb.maxx, bb.miny], [bb.maxx, bb.maxy], [bb.minx, bb.maxy]];
        for (var i = 0; i < 4; i++) addRect(root, cs[i][0] - mr, cs[i][1] - mr, mr * 2, mr * 2, [0, 0, 0], accent, sw);
        return lay;
      });
      if (args.bezier) gen(function () {
        var lay = newShape(comp, 'Bezier Handles'); var root = rootOf(lay);
        var hs = geo.handles;
        if (hs && hs.length) {
          // Real control handles: a line from each vertex to its in / out tangent
          // point, with a small ring at the tangent point (PinRig's bezier handles).
          for (var i = 0; i < hs.length; i++) {
            var h = hs[i];
            if (h.hasIn) { addLine(root, h.v, h.cin, accent, sw * 0.6, 60); addEllipse(root, h.cin[0], h.cin[1], mr * 0.5, null, accent, sw * 0.6, 85); }
            if (h.hasOut) { addLine(root, h.v, h.cout, accent, sw * 0.6, 60); addEllipse(root, h.cout[0], h.cout[1], mr * 0.5, null, accent, sw * 0.6, 85); }
          }
        } else {
          // Bounds-only sources have no path tangents: fall back to a radial stub.
          for (var j = 0; j < verts.length; j++) { var hx = bb.cx + (verts[j][0] - bb.cx) * 1.18, hy = bb.cy + (verts[j][1] - bb.cy) * 1.18; addLine(root, verts[j], [hx, hy], accent, sw * 0.6, 50); addEllipse(root, hx, hy, mr * 0.55, null, accent, sw * 0.6, 80); }
        }
        return lay;
      });
      if (args.pins) {
        var pinVerts = placePins(geo, args);
        if (args.pinSource === 'layer' && args.pinLayerName) {
          var marker = findLayerByName(comp, args.pinLayerName);
          if (marker && marker !== src) { try { made += stampLayerPins(comp, marker, pinVerts, args, rigParent); } catch (e) {} }
          else gen(function () { return buildPinsLayer(comp, pinVerts, args, sc, mr * 1.15); });
        } else {
          gen(function () { return buildPinsLayer(comp, pinVerts, args, sc, mr * 1.15); });
        }
      }

      // measurement text (static snapshots at build time)
      if (args.edges) for (var e = 0; e < verts.length; e++) { var a0 = verts[e], a1 = verts[(e + 1) % verts.length]; var mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2; var len = Math.round(Math.sqrt((a1[0] - a0[0]) * (a1[0] - a0[0]) + (a1[1] - a0[1]) * (a1[1] - a0[1]))); gen(function () { return addText(comp, len + 'px', [mx + (mx - bb.cx) * 0.18, my + (my - bb.cy) * 0.18], label, fs); }); }
      if (args.coords) for (var q = 0; q < verts.length; q++) { var vx = verts[q]; gen(function () { return addText(comp, Math.round(vx[0]) + ', ' + Math.round(vx[1]), [vx[0] + (vx[0] - bb.cx) * 0.16, vx[1] + (vx[1] - bb.cy) * 0.16], label, fs * 0.85); }); }
      if (args.angles) for (var g = 0; g < verts.length; g++) { var pa = verts[(g - 1 + verts.length) % verts.length], pb = verts[g], pcc = verts[(g + 1) % verts.length]; var a1a = Math.atan2(pa[1] - pb[1], pa[0] - pb[0]), a2a = Math.atan2(pcc[1] - pb[1], pcc[0] - pb[0]); var ang = Math.abs(a1a - a2a) * 180 / Math.PI; if (ang > 180) ang = 360 - ang; gen((function (pbx, pby, deg) { return function () { return addText(comp, Math.round(deg) + '°', [bb.cx + (pbx - bb.cx) * 0.7, bb.cy + (pby - bb.cy) * 0.7], label, fs * 0.9); }; })(pb[0], pb[1], ang)); }
      // Bezier coordinates: label each real tangent point (matches PinRig).
      if (args.bezierCoords && geo.handles) for (var bz = 0; bz < geo.handles.length; bz++) {
        var hh = geo.handles[bz];
        if (hh.hasOut) gen((function (cx, cy) { return function () { return addText(comp, Math.round(cx) + ', ' + Math.round(cy), [cx, cy - 6 * sc], label, fs * 0.8); }; })(hh.cout[0], hh.cout[1]));
        if (hh.hasIn) gen((function (cx, cy) { return function () { return addText(comp, Math.round(cx) + ', ' + Math.round(cy), [cx, cy - 6 * sc], label, fs * 0.8); }; })(hh.cin[0], hh.cin[1]));
      }
      // Corner radius: one readout near the top-left corner if a rounded rect
      // was detected on the source (PinRig's Corner Radius).
      if (args.cornerRadius && geo.cornerRadius != null && geo.cornerRadius > 0) {
        gen((function (rad) { return function () { return addText(comp, 'R ' + Math.round(rad) + 'px', [bb.minx + bb.w * 0.18, bb.miny - 8 * sc], label, fs * 0.9); }; })(geo.cornerRadius));
      }

    }
    return { made: made, stash: stashLayer };
  }

  function build(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select artwork to rig.');
    var sc = args.scale != null ? args.scale : 1;
    var env = {
      t0: comp.time,
      accent: args.accentRgb || hexToRgb01(args.accent || '#39C2FF'),
      label: args.labelRgb || hexToRgb01(args.label || '#E6F4FF'),
      sc: sc, sw: 1 * sc, mr: 3 * sc, fs: 11 * sc
    };
    var cap = Math.min(layers.length, 12);
    var total = 0, rigged = 0;

    app.beginUndoGroup('Rebound: Pin Rig');
    try {
      // Background dot grid: a full-comp backdrop, built once (comp space, not
      // parented to any artwork), regardless of how many layers are rigged.
      if (args.dotgrid) {
        try {
          var dlay = newShape(comp, 'Dot Grid'); var droot = rootOf(dlay);
          var step = Math.max(16, Math.round(Math.min(comp.width, comp.height) / 36));
          var count = 0;
          for (var dy = step; dy < comp.height && count < 700; dy += step) for (var dx = step; dx < comp.width && count < 700; dx += step) { addEllipse(droot, dx, dy, 1 * env.sc, env.accent, null, 0, 18); count++; }
          try { dlay.moveToEnd(); } catch (ed) {}
          total++;
        } catch (edg) {}
      }
      // Each selected layer gets its own complete rig that tracks itself, and
      // each carries the settings stash so reselecting ANY of them (or Copy
      // style) restores the panel.
      for (var i = 0; i < cap; i++) {
        var r = buildOne(comp, layers[i], args, env);
        total += r.made;
        stampSettings(r.stash, args);
      }
      rigged = cap;
    } finally {
      app.endUndoGroup();
    }
    return { layers: total, rigged: rigged, capped: layers.length > cap };
  }

  function remove() {
    var comp = util.activeComp();
    var removed = 0;
    app.beginUndoGroup('Rebound: Remove Pin Rig');
    try {
      for (var i = comp.numLayers; i >= 1; i--) {
        var lay = comp.layer(i);
        if (lay.comment && lay.comment.indexOf(TAG) !== -1) { lay.remove(); removed++; }
      }
    } finally { app.endUndoGroup(); }
    return { removed: removed };
  }

  // ---- restyle pins on an already-built rig (no full rebuild) ---------------

  function isPinsLayer(L) { return L.comment && L.comment.indexOf(TAG) !== -1 && L.name === 'Pins'; }

  // Walk up the parent chain to the first ancestor that is NOT part of the rig:
  // that is the rigged artwork (Pins -> master null -> source, or Pins -> source).
  function rigSourceOf(layer) {
    var cur = layer, hops = 0;
    while (cur && cur.parent && hops < 20) {
      var par = cur.parent;
      if (!(par.comment && par.comment.indexOf(TAG) !== -1)) return par;
      cur = par; hops++;
    }
    return null;
  }

  // Pick the Pins layer to restyle: a selected Pins layer, else the rig whose
  // source is selected, else the only Pins layer in the comp.
  function pickPins(comp) {
    var sel = comp.selectedLayers, i, L;
    for (i = 0; i < sel.length; i++) if (isPinsLayer(sel[i])) return sel[i];
    var list = [];
    for (i = 1; i <= comp.numLayers; i++) { L = comp.layer(i); if (isPinsLayer(L)) list.push(L); }
    for (var s = 0; s < sel.length; s++) for (var p = 0; p < list.length; p++) if (rigSourceOf(list[p]) === sel[s]) return list[p];
    if (list.length === 1) return list[0];
    return null;
  }

  // The rig layer that carries the JSON settings stash, scoped to one source.
  function findStash(comp, src) {
    for (var i = 1; i <= comp.numLayers; i++) {
      var L = comp.layer(i);
      if (!(L.comment && L.comment.indexOf(STASH_SEP) !== -1)) continue;
      if (sameLayer(L, src) || sameLayer(rigSourceOf(L), src)) return L;
    }
    return null;
  }

  function restyle(args) {
    if (args && args.pinSource === 'layer') throw new Error('Restyle changes shape pins. Remove and rebuild to swap a custom-layer marker.');
    var comp = util.activeComp();
    var target = pickPins(comp);
    if (!target) throw new Error('No pin rig found here. Build one first, or select its artwork (or the Pins layer).');
    var src = rigSourceOf(target);
    if (!src) { var sel = comp.selectedLayers; src = sel.length ? sel[0] : null; }
    if (!src) throw new Error('Could not find the rigged artwork to re-read.');

    app.beginUndoGroup('Rebound: Restyle Pins');
    try {
      var t0 = comp.time;
      var sc = (args && args.scale != null) ? args.scale : 1;
      var mr = 3 * sc;
      var geo = readGeometry(src, t0);
      var parent = target.parent;
      var nl = buildPinsLayer(comp, placePins(geo, args || {}), args || {}, sc, mr * 1.15);
      try { nl.moveBefore(target); } catch (em) {}
      if (parent) {
        try { nl.parent = parent; } catch (ep) {}
        var tg = nl.property(M.transform);
        try { tg.property(M.anchor).setValue([0, 0]); } catch (e1) {}
        try { tg.property(M.scale).setValue([100, 100]); } catch (e2) {}
        try { tg.property(M.rotation).setValue(0); } catch (e3) {}
        try { tg.property(M.position).setValue([0, 0]); } catch (e4) {}
      }
      try { target.remove(); } catch (er) {}
      // Keep the settings stash in sync with the restyle (args carries full UI state).
      var stash = findStash(comp, src);
      if (stash) stampSettings(stash, args || {});
    } finally {
      app.endUndoGroup();
    }
    return { restyled: true };
  }

  // Read back the settings a rig was built with, given a selected layer (the
  // source artwork, the master null, or any overlay of the rig). Lets the panel
  // show the object's current Pin Rig settings the moment it is selected.
  function readRig() {
    var comp = util.activeComp();
    if (!comp) return { ok: false };
    var sel = comp.selectedLayers;
    if (!sel || !sel.length) return { ok: false };
    var first = sel[0];
    var src = null;
    if (first.comment && first.comment.indexOf(TAG) !== -1) src = rigSourceOf(first);
    if (!src) src = first;
    var settings = null, hasRig = false, i, L;
    for (i = 1; i <= comp.numLayers; i++) {
      L = comp.layer(i);
      if (!(L.comment && L.comment.indexOf(TAG) !== -1)) continue;
      if (!(sameLayer(L, first) || sameLayer(rigSourceOf(L), src))) continue;
      hasRig = true;
      var s = parseSettings(L.comment);
      if (s) { settings = s; break; }
    }
    return { ok: true, hasRig: hasRig, sourceName: src ? src.name : null, settings: settings };
  }

  // Show / hide the whole construction overlay without removing it (toggles the
  // enabled 'eye' on every rig layer), so the comp stays readable.
  function setVisible(args) {
    var comp = util.activeComp();
    var on = !!(args && args.visible);
    var n = 0;
    app.beginUndoGroup('Rebound: Toggle Pin Rig');
    try {
      for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        if (L.comment && L.comment.indexOf(TAG) !== -1) { try { L.enabled = on; n++; } catch (e) {} }
      }
    } finally { app.endUndoGroup(); }
    return { toggled: n, visible: on };
  }

  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) return { ok: false };
    var src = layers[0];
    var geo = readGeometry(src, comp.time);
    return { ok: true, name: src.name, kind: geo.kind === 'shape' ? 'shape' : 'bounds', vertexCount: geo.verts.length, w: Math.round(geo.bbox.w), h: Math.round(geo.bbox.h) };
  }

  // Flatten: replace every Rebound-marked control expression on the rig with its
  // current value, so the rig no longer depends on its Effect Controls. Parenting
  // (the live tracking) is left intact. Only OUR marked expressions are touched,
  // so a custom-layer marker's own expressions are protected.
  function bakeMarked(group, t0, counter) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      var t = null; try { t = p.propertyType; } catch (e) { t = null; }
      if (t === PropertyType.PROPERTY) {
        try {
          if (p.canSetExpression && p.expressionEnabled && p.expression && p.expression.indexOf(rig.MARKER) !== -1) {
            var v = p.valueAtTime(t0, false);
            rig.clearExpression(p);
            p.setValue(v);
            counter.n++;
          }
        } catch (e2) {}
      } else {
        var nn = 0; try { nn = p.numProperties; } catch (e3) { nn = 0; }
        if (nn > 0) bakeMarked(p, t0, counter);
      }
    }
  }
  function flatten() {
    var comp = util.activeComp();
    var t0 = comp.time;
    var layersDone = 0, counter = { n: 0 };
    app.beginUndoGroup('Rebound: Flatten Pin Rig');
    try {
      for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        if (!(L.comment && L.comment.indexOf(TAG) !== -1)) continue;
        var before = counter.n;
        bakeMarked(L, t0, counter);
        if (counter.n > before) layersDone++;
      }
    } finally { app.endUndoGroup(); }
    return { flattened: layersDone, properties: counter.n };
  }

  R.register('pinrig.build', build, 'Rebound: Pin Rig');
  R.register('pinrig.restyle', restyle, 'Rebound: Restyle Pins');
  R.register('pinrig.remove', remove, 'Rebound: Remove Pin Rig');
  R.register('pinrig.read', read);
  R.register('pinrig.readRig', readRig);
  R.register('pinrig.setVisible', setVisible, 'Rebound: Toggle Pin Rig');
  R.register('pinrig.flatten', flatten, 'Rebound: Flatten Pin Rig');
})();
