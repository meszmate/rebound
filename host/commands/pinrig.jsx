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
  var TAG = '[PinRig]';

  function hexToRgb01(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec('' + hex);
    if (!m) return [0.22, 0.76, 1];
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function readPos(tg, t0) {
    var pos = tg.property(M.position);
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) return [tg.property(M.positionX).valueAtTime(t0, false), tg.property(M.positionY).valueAtTime(t0, false)];
    var v = pos.valueAtTime(t0, false);
    return (v instanceof Array) ? v : [v, 0];
  }
  function layerToComp(pt, ref, t0) {
    var tg = ref.property(M.transform);
    var anchor = tg.property(M.anchor).valueAtTime(t0, false);
    var pos = readPos(tg, t0);
    var scale = tg.property(M.scale).valueAtTime(t0, false);
    var rot = tg.property(M.rotation).valueAtTime(t0, false);
    var lx = (pt[0] - anchor[0]) * (scale[0] / 100), ly = (pt[1] - anchor[1]) * (scale[1] / 100);
    var r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [pos[0] + (lx * c - ly * s), pos[1] + (lx * s + ly * c)];
  }

  // Collect comp-space vertices from a shape layer's paths, else bbox corners.
  function readGeometry(layer, t0) {
    var verts = [], kind = 'bounds';
    try {
      var root = layer.property('ADBE Root Vectors Group');
      if (root) {
        collectShapeVerts(root, layer, t0, verts);
        if (verts.length) kind = 'shape';
      }
    } catch (e) {}
    if (!verts.length) {
      var rect = null;
      try { rect = layer.sourceRectAtTime(t0, false); } catch (e2) { rect = null; }
      if (!rect) rect = { left: -50, top: -50, width: 100, height: 100 };
      var cs = [[rect.left, rect.top], [rect.left + rect.width, rect.top], [rect.left + rect.width, rect.top + rect.height], [rect.left, rect.top + rect.height]];
      for (var i = 0; i < cs.length; i++) verts.push(layerToComp(cs[i], layer, t0));
    }
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (var v = 0; v < verts.length; v++) { var p = verts[v]; if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    return { verts: verts, kind: kind, bbox: { minx: minx, miny: miny, maxx: maxx, maxy: maxy, w: maxx - minx, h: maxy - miny, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 } };
  }
  function collectShapeVerts(group, layer, t0, out) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      var shapeProp = null;
      try { shapeProp = p.property('ADBE Vector Shape'); } catch (e) { shapeProp = null; }
      if (shapeProp) {
        var sh = shapeProp.value;
        if (sh && sh.vertices) for (var k = 0; k < sh.vertices.length; k++) out.push(layerToComp(sh.vertices[k], layer, t0));
        continue;
      }
      var n = 0; try { n = p.numProperties; } catch (e2) { n = 0; }
      if (n > 0) collectShapeVerts(p, layer, t0, out);
    }
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

  function build(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select artwork to rig.');
    var t0 = comp.time;
    var accent = args.accentRgb || hexToRgb01(args.accent || '#39C2FF');
    var label = args.labelRgb || hexToRgb01(args.label || '#E6F4FF');
    var sc = args.scale != null ? args.scale : 1;
    var sw = 1 * sc, mr = 3 * sc, fs = 11 * sc;
    var made = 0;

    app.beginUndoGroup('Rebound: Pin Rig');
    try {
      var src = layers[0];
      var geo = readGeometry(src, t0);
      var verts = geo.verts, bb = geo.bbox;

      var master = null;
      if (args.controller === 'master') { master = comp.layers.addNull(); master.name = src.name + ' Rig'; master.comment = TAG; master.property(M.transform).property(M.position).setValue([bb.cx, bb.cy]); made++; }
      function parentTo(lay) { try { if (master) lay.parent = master; } catch (e) {} }

      function gen(fn) { try { var lay = fn(); if (lay) { parentTo(lay); made++; } } catch (e) {} }

      // background dot grid (bottom)
      if (args.dotgrid) gen(function () {
        var lay = newShape(comp, 'Dot Grid'); var root = rootOf(lay);
        var step = Math.max(16, Math.round(Math.min(comp.width, comp.height) / 36));
        var count = 0;
        for (var y = step; y < comp.height && count < 700; y += step) for (var x = step; x < comp.width && count < 700; x += step) { addEllipse(root, x, y, 1 * sc, accent, null, 0, 18); count++; }
        try { lay.moveToEnd(); } catch (e) {}
        return lay;
      });
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
        for (var i = 0; i < verts.length; i++) { var hx = bb.cx + (verts[i][0] - bb.cx) * 1.18, hy = bb.cy + (verts[i][1] - bb.cy) * 1.18; addLine(root, verts[i], [hx, hy], accent, sw * 0.6, 50); addEllipse(root, hx, hy, mr * 0.55, null, accent, sw * 0.6, 80); }
        return lay;
      });
      if (args.pins) gen(function () {
        var lay = newShape(comp, 'Pins'); var root = rootOf(lay);
        var pinFill = args.pinFill ? (args.fillRgb || hexToRgb01(args.fillColor || '#39C2FF')) : null;
        var pinSw = (args.pinStroke != null ? args.pinStroke : 1) * sc;
        var pr = mr * 1.15;
        for (var i = 0; i < verts.length; i++) addPin(root, verts[i][0], verts[i][1], pr, args.pinShape || 'dot', pinFill, accent, pinSw, args.pinRound);
        return lay;
      });

      // measurement text (static snapshots at build time)
      if (args.edges) for (var e = 0; e < verts.length; e++) { var a0 = verts[e], a1 = verts[(e + 1) % verts.length]; var mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2; var len = Math.round(Math.sqrt((a1[0] - a0[0]) * (a1[0] - a0[0]) + (a1[1] - a0[1]) * (a1[1] - a0[1]))); gen(function () { return addText(comp, len + 'px', [mx + (mx - bb.cx) * 0.18, my + (my - bb.cy) * 0.18], label, fs); }); }
      if (args.coords) for (var q = 0; q < verts.length; q++) { var vx = verts[q]; gen(function () { return addText(comp, Math.round(vx[0]) + ', ' + Math.round(vx[1]), [vx[0] + (vx[0] - bb.cx) * 0.16, vx[1] + (vx[1] - bb.cy) * 0.16], label, fs * 0.85); }); }
      if (args.angles) for (var g = 0; g < verts.length; g++) { var pa = verts[(g - 1 + verts.length) % verts.length], pb = verts[g], pcc = verts[(g + 1) % verts.length]; var a1a = Math.atan2(pa[1] - pb[1], pa[0] - pb[0]), a2a = Math.atan2(pcc[1] - pb[1], pcc[0] - pb[0]); var ang = Math.abs(a1a - a2a) * 180 / Math.PI; if (ang > 180) ang = 360 - ang; gen((function (pbx, pby, deg) { return function () { return addText(comp, Math.round(deg) + '°', [bb.cx + (pbx - bb.cx) * 0.7, bb.cy + (pby - bb.cy) * 0.7], label, fs * 0.9); }; })(pb[0], pb[1], ang)); }
    } finally {
      app.endUndoGroup();
    }
    return { layers: made };
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

  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) return { ok: false };
    var src = layers[0];
    var geo = readGeometry(src, comp.time);
    return { ok: true, name: src.name, kind: geo.kind === 'shape' ? 'shape' : 'bounds', vertexCount: geo.verts.length };
  }

  R.register('pinrig.build', build, 'Rebound: Pin Rig');
  R.register('pinrig.remove', remove, 'Rebound: Remove Pin Rig');
  R.register('pinrig.read', read);
})();
