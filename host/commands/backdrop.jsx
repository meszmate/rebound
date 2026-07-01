/*
 * Rebound host, Backdrop (background textures + stylize effects).
 *
 * make: builds a procedural pattern as one editable shape layer at comp size
 * (capped so huge comps stay light), sent to the bottom, with an optional solid
 * behind it. effects: stamps Echo / Radial Blur / Chromatic Aberration onto the
 * selected layers (CA is an RGB tint-and-offset split, best-effort). Generated
 * layers are tagged [Backdrop] in the comment. All guarded; review-only (no AE
 * here to runtime-test).
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var TAG = '[Backdrop]';

  function hexToRgb01(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec('' + hex);
    if (!m) return [0.22, 0.76, 1];
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function grp(root) { return root.addProperty('ADBE Vector Group').property('ADBE Vectors Group'); }
  function paint(c, fillRGB, strokeRGB, strokeW, op) {
    if (fillRGB) { var f = c.addProperty('ADBE Vector Graphic - Fill'); try { f.property('ADBE Vector Fill Color').setValue(fillRGB.concat([1])); } catch (e) {} try { f.property('ADBE Vector Fill Opacity').setValue(op); } catch (e1) {} }
    if (strokeRGB) { var s = c.addProperty('ADBE Vector Graphic - Stroke'); try { s.property('ADBE Vector Stroke Color').setValue(strokeRGB.concat([1])); } catch (e2) {} try { s.property('ADBE Vector Stroke Width').setValue(strokeW); } catch (e3) {} try { s.property('ADBE Vector Stroke Opacity').setValue(op); } catch (e4) {} }
  }
  function ellipse(root, cx, cy, r, fillRGB, strokeRGB, strokeW, op) { var c = grp(root); var e = c.addProperty('ADBE Vector Shape - Ellipse'); e.property('ADBE Vector Ellipse Size').setValue([r * 2, r * 2]); e.property('ADBE Vector Ellipse Position').setValue([cx, cy]); paint(c, fillRGB, strokeRGB, strokeW, op); }
  function rect(root, x, y, w, h, fillRGB, op) { var c = grp(root); var rc = c.addProperty('ADBE Vector Shape - Rect'); rc.property('ADBE Vector Rect Size').setValue([w, h]); rc.property('ADBE Vector Rect Position').setValue([x + w / 2, y + h / 2]); paint(c, fillRGB, null, 0, op); }
  function line(root, p0, p1, strokeRGB, strokeW, op) { var c = grp(root); var sg = c.addProperty('ADBE Vector Shape - Group'); var sh = new Shape(); sh.vertices = [p0, p1]; sh.inTangents = [[0, 0], [0, 0]]; sh.outTangents = [[0, 0], [0, 0]]; sh.closed = false; sg.property('ADBE Vector Shape').setValue(sh); paint(c, null, strokeRGB, strokeW, op); }

  function make(args) {
    var comp = util.activeComp();
    var color = hexToRgb01(args.color);
    var op = (args.opacity != null ? args.opacity : 60) / 100;
    var sz = args.size != null ? args.size : 6;
    var sp = Math.max(6, args.spacing || 18);

    R.beginUndo('Rebound: Backdrop');
    try {
      if (!args.transparent) {
        var solid = comp.layers.addSolid(hexToRgb01(args.bg), 'Backdrop BG', comp.width, comp.height, comp.pixelAspect);
        solid.comment = TAG; solid.moveToEnd();
      }
      var lay = comp.layers.addShape();
      lay.name = 'Backdrop ' + (args.pattern || 'dots'); lay.comment = TAG;
      var tg = lay.property(M.transform);
      tg.property(M.anchor).setValue([comp.width / 2, comp.height / 2]);
      tg.property(M.position).setValue([comp.width / 2, comp.height / 2]);
      var root = lay.property('ADBE Root Vectors Group');

      // Build over an extended area so rotation still covers the frame; cap count.
      var x0 = -comp.width * 0.4, x1 = comp.width * 1.4, y0 = -comp.height * 0.4, y1 = comp.height * 1.4;
      var cols = Math.ceil((x1 - x0) / sp), rows = Math.ceil((y1 - y0) / sp);
      while (cols * rows > 3000) { sp *= 1.3; cols = Math.ceil((x1 - x0) / sp); rows = Math.ceil((y1 - y0) / sp); }

      var p = args.pattern || 'dots', x, y;
      if (p === 'grid') {
        for (x = x0; x <= x1; x += sp) line(root, [x, y0], [x, y1], color, sz * 0.3, op);
        for (y = y0; y <= y1; y += sp) line(root, [x0, y], [x1, y], color, sz * 0.3, op);
      } else if (p === 'lines') {
        for (x = x0; x <= x1; x += sp) line(root, [x, y0], [x, y1], color, sz * 0.45, op);
      } else if (p === 'checker') {
        var i = 0;
        for (y = y0; y < y1; y += sp) { var j = 0; for (x = x0; x < x1; x += sp) { if ((i + j) % 2 === 0) rect(root, x, y, sp, sp, color, op); j++; } i++; }
      } else if (p === 'rings') {
        for (y = y0; y < y1; y += sp * 1.4) for (x = x0; x < x1; x += sp * 1.4) ellipse(root, x, y, sz * 0.6, null, color, sz * 0.2, op);
      } else if (p === 'cross') {
        for (y = y0; y < y1; y += sp) for (x = x0; x < x1; x += sp) { line(root, [x - sz * 0.5, y], [x + sz * 0.5, y], color, sz * 0.25, op); line(root, [x, y - sz * 0.5], [x, y + sz * 0.5], color, sz * 0.25, op); }
      } else {
        for (y = y0; y < y1; y += sp) for (x = x0; x < x1; x += sp) ellipse(root, x, y, sz * 0.5, color, null, 0, op);
      }
      try { tg.property(M.rotation).setValue(args.angle || 0); } catch (e) {}
      lay.moveToEnd();
    } finally { R.endUndo(); }
    return { ok: true };
  }

  function applyCA(layer, amount) {
    function channel(mapWhite, dx) {
      var dup = layer.duplicate();
      dup.comment = TAG;
      try { var t = dup.property('ADBE Effect Parade').addProperty('ADBE Tint'); t.property('ADBE Tint-0001').setValue([0, 0, 0]); t.property('ADBE Tint-0002').setValue(mapWhite); t.property('ADBE Tint-0003').setValue(100); } catch (e) {}
      try { dup.blendingMode = BlendingMode.ADD; } catch (e2) {}
      try { var pp = dup.property(M.transform).property(M.position); var v = pp.value; pp.setValue([v[0] + dx, v[1]]); } catch (e3) {}
    }
    channel([1, 0, 0], amount);
    channel([0, 0, 1], -amount);
  }

  function effects(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to add effects to.');
    var applied = 0;
    R.beginUndo('Rebound: Backdrop Effects');
    try {
      for (var i = 0; i < layers.length; i++) {
        var lay = layers[i];
        var fx = lay.property('ADBE Effect Parade');
        if (!fx) continue;
        if (args.echo) { try { var e = fx.addProperty('ADBE Echo'); e.property('ADBE Echo-0001').setValue(args.echoTime != null ? args.echoTime : -0.03); e.property('ADBE Echo-0002').setValue(Math.round(args.echoes || 6)); e.property('ADBE Echo-0004').setValue(args.echoDecay != null ? args.echoDecay : 0.7); } catch (e1) {} }
        if (args.rblur) { try { var rb = fx.addProperty('ADBE Radial Blur'); rb.property('ADBE Radial Blur-0001').setValue(args.rblurAmount || 12); try { rb.property('ADBE Radial Blur-0003').setValue(args.rblurType === 'zoom' ? 2 : 1); } catch (e2) {} try { rb.property('ADBE Radial Blur-0002').setValue([comp.width / 2, comp.height / 2]); } catch (e3) {} } catch (e4) {} }
        if (args.ca) { try { applyCA(lay, args.caAmount || 6); } catch (e5) {} }
        applied++;
      }
    } finally { R.endUndo(); }
    return { applied: applied };
  }

  R.register('backdrop.make', make, 'Rebound: Backdrop');
  R.register('backdrop.effects', effects, 'Rebound: Backdrop Effects');
})();
