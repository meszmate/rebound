/*
 * Rebound Relay (Photoshop), exporter.
 *
 * Walks the active document and writes a Rebound IR (.rbir) file the Rebound
 * After Effects panel imports as native layers. Photoshop leans on type layers
 * and layer styles, so:
 *   - type layers come across as EDITABLE text (with the real PostScript font),
 *   - layer effects (drop/inner shadow, glows, colour overlay, stroke) come
 *     across as real, editable After Effects layer styles,
 *   - everything else (raster, shape, smart object, fill, adjustment) is
 *     flattened to a PNG and placed exactly where it was.
 * Image bytes are inlined as base64 so the same file-import path as Figma works.
 *
 * Run from File > Scripts. Keep json2.js beside this file.
 */
//@include "json2.js"
(function () {
  if (!app.documents || !app.documents.length) {
    alert('Rebound Relay: open a document first.');
    return;
  }

  var sID = stringIDToTypeID;
  var cID = charIDToTypeID;
  var doc = app.activeDocument;
  var IR_VERSION = '1.1.0';
  var skipped = [];
  var assets = {};
  var idCounter = 0;
  var hashCounter = 0;

  var savedUnits = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;
  var docWpx = doc.width.as ? doc.width.as('px') : doc.width;
  var docHpx = doc.height.as ? doc.height.as('px') : doc.height;

  function clamp01(v) { if (v == null || isNaN(v)) return 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function round(v) { return Math.round(v * 1000) / 1000; }
  function nextId(p) { idCounter++; return (p || 'l') + idCounter; }
  function note(name, detail) { if (skipped.length < 200) skipped.push((name ? name + ': ' : '') + detail); }

  // ---- base64 (read a saved PNG back as bytes) -----------------------------

  function readBinary(file) {
    file.encoding = 'BINARY';
    file.open('r');
    var s = file.read();
    file.close();
    return s;
  }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function base64FromBinary(data) {
    var out = '', i = 0, len = data.length;
    while (i < len) {
      var c1 = data.charCodeAt(i++) & 0xff;
      var has2 = i < len, c2 = has2 ? data.charCodeAt(i++) & 0xff : 0;
      var has3 = i < len, c3 = has3 ? data.charCodeAt(i++) & 0xff : 0;
      var e1 = c1 >> 2;
      var e2 = ((c1 & 3) << 4) | (c2 >> 4);
      var e3 = has2 ? (((c2 & 15) << 2) | (c3 >> 6)) : 64;
      var e4 = has3 ? (c3 & 63) : 64;
      out += B64.charAt(e1) + B64.charAt(e2) + (e3 === 64 ? '=' : B64.charAt(e3)) + (e4 === 64 ? '=' : B64.charAt(e4));
    }
    return out;
  }

  // ---- blend modes ---------------------------------------------------------

  function blendToIR(bm) {
    try {
      if (bm === BlendMode.MULTIPLY) return 'MULTIPLY';
      if (bm === BlendMode.SCREEN) return 'SCREEN';
      if (bm === BlendMode.OVERLAY) return 'OVERLAY';
      if (bm === BlendMode.DARKEN) return 'DARKEN';
      if (bm === BlendMode.LIGHTEN) return 'LIGHTEN';
      if (bm === BlendMode.COLORDODGE) return 'COLOR_DODGE';
      if (bm === BlendMode.COLORBURN) return 'COLOR_BURN';
      if (bm === BlendMode.HARDLIGHT) return 'HARD_LIGHT';
      if (bm === BlendMode.SOFTLIGHT) return 'SOFT_LIGHT';
      if (bm === BlendMode.DIFFERENCE) return 'DIFFERENCE';
      if (bm === BlendMode.EXCLUSION) return 'EXCLUSION';
      if (bm === BlendMode.HUE) return 'HUE';
      if (bm === BlendMode.SATURATION) return 'SATURATION';
      if (bm === BlendMode.COLORBLEND) return 'COLOR';
      if (bm === BlendMode.LUMINOSITY) return 'LUMINOSITY';
      if (bm === BlendMode.PASSTHROUGH) return 'PASS_THROUGH';
    } catch (e) {}
    return 'NORMAL';
  }

  function psBlendIdToIR(id) {
    switch (id) {
      case 'multiply': return 'MULTIPLY';
      case 'screen': return 'SCREEN';
      case 'overlay': return 'OVERLAY';
      case 'darken': return 'DARKEN';
      case 'lighten': return 'LIGHTEN';
      case 'colorDodge': return 'COLOR_DODGE';
      case 'colorBurn': return 'COLOR_BURN';
      case 'hardLight': return 'HARD_LIGHT';
      case 'softLight': return 'SOFT_LIGHT';
      case 'difference': return 'DIFFERENCE';
      case 'exclusion': return 'EXCLUSION';
      case 'hue': return 'HUE';
      case 'saturation': return 'SATURATION';
      case 'color': return 'COLOR';
      case 'luminosity': return 'LUMINOSITY';
      default: return 'NORMAL';
    }
  }

  // ---- layer effects (ActionManager) ---------------------------------------

  function activeLayerDescriptor() {
    var ref = new ActionReference();
    ref.putEnumerated(cID('Lyr '), cID('Ordn'), cID('Trgt'));
    return executeActionGet(ref);
  }

  function readColorDesc(d) {
    // RGBC channels are reliably addressed by charID (note the trailing spaces).
    try {
      return { r: clamp01(d.getDouble(cID('Rd  ')) / 255), g: clamp01(d.getDouble(cID('Grn ')) / 255), b: clamp01(d.getDouble(cID('Bl  ')) / 255), a: 1 };
    } catch (e) {
      try {
        var g; try { g = d.getDouble(sID('green')); } catch (e2) { g = d.getDouble(sID('grain')); }
        return { r: clamp01(d.getDouble(sID('red')) / 255), g: clamp01(g / 255), b: clamp01(d.getDouble(sID('blue')) / 255), a: 1 };
      } catch (e3) { return null; }
    }
  }

  function readMode(d) {
    try { return psBlendIdToIR(typeIDToStringID(d.getEnumerationValue(sID('mode')))); } catch (e) { return undefined; }
  }
  function readOpacity(d) { try { return clamp01(d.getUnitDoubleValue(sID('opacity')) / 100); } catch (e) { return undefined; } }
  function readUnit(d, key) { try { return d.getUnitDoubleValue(sID(key)); } catch (e) { try { return d.getDouble(sID(key)); } catch (e2) { return undefined; } } }
  function isEnabled(d) { try { return d.getBoolean(sID('enabled')); } catch (e) { return true; } }

  function readShadow(d, type, globalAngle) {
    var ls = { type: type };
    var c = null; try { c = readColorDesc(d.getObjectValue(sID('color'))); } catch (e) {}
    if (c) ls.color = c;
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    var size = readUnit(d, 'blur'); if (size != null) ls.size = size;
    var dist = readUnit(d, 'distance'); if (dist != null) ls.distance = dist;
    // Use Global Light is the Photoshop default; the local angle is stale then.
    var useGlobal = false; try { useGlobal = d.getBoolean(sID('useGlobalAngle')); } catch (e2) {}
    var ang = (useGlobal && globalAngle != null) ? globalAngle : readUnit(d, 'localLightingAngle');
    if (ang != null) ls.angle = ang;
    var ck = readUnit(d, 'chokeMatte');
    if (ck != null) { if (type === 'DROP_SHADOW') ls.spread = ck; else ls.choke = ck; }
    return ls;
  }
  function readGlow(d, type) {
    var ls = { type: type };
    var c = null; try { c = readColorDesc(d.getObjectValue(sID('color'))); } catch (e) {}
    if (c) ls.color = c;
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    var size = readUnit(d, 'blur'); if (size != null) ls.size = size;
    var choke = readUnit(d, 'chokeMatte'); if (choke != null) ls.choke = choke;
    return ls;
  }
  function readColorOverlay(d) {
    var ls = { type: 'COLOR_OVERLAY' };
    var c = null; try { c = readColorDesc(d.getObjectValue(sID('color'))); } catch (e) {}
    if (c) ls.color = c;
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    return ls;
  }
  function readStrokeFx(d) {
    var ls = { type: 'STROKE' };
    var size = readUnit(d, 'size'); if (size != null) ls.size = size;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    try {
      var pos = typeIDToStringID(d.getEnumerationValue(sID('style')));
      ls.position = pos === 'insetFrame' ? 'INSIDE' : pos === 'outsetFrame' ? 'OUTSIDE' : 'CENTER';
    } catch (e) {}
    try { var c = readColorDesc(d.getObjectValue(sID('color'))); if (c) ls.color = c; } catch (e2) {}
    return ls;
  }

  function readEnumId(d, key) {
    try { return typeIDToStringID(d.getEnumerationValue(sID(key))); } catch (e) { return undefined; }
  }
  function bevelStyleToIR(s) {
    switch (s) {
      case 'outerBevel': return 'OUTER';
      case 'innerBevel': return 'INNER';
      case 'emboss': return 'EMBOSS';
      case 'pillowEmboss': return 'PILLOW';
      case 'strokeEmboss': return 'STROKE';
      default: return undefined;
    }
  }
  function bevelTechToIR(t) {
    switch (t) {
      case 'softMatte': return 'SMOOTH';
      case 'hardChisel': return 'CHISEL_HARD';
      case 'softChisel': return 'CHISEL_SOFT';
      default: return undefined;
    }
  }
  function bevelDirToIR(x) {
    if (x === 'stampOut') return 'UP';
    if (x === 'stampIn') return 'DOWN';
    return undefined;
  }
  function readModeKey(d, key) {
    try { return psBlendIdToIR(typeIDToStringID(d.getEnumerationValue(sID(key)))); } catch (e) { return undefined; }
  }

  // Bevel & Emboss: the importer's setBevel consumes ls.size/angle/altitude plus
  // a bevel{} sub-object (depth, soften, style, technique, direction, and the
  // highlight/shadow colour+mode+opacity). Opacities are stored 0..1.
  function readBevel(d, globalAngle) {
    var ls = { type: 'BEVEL_EMBOSS' };
    var size = readUnit(d, 'blur'); if (size != null) ls.size = size;
    var useGlobal = false; try { useGlobal = d.getBoolean(sID('useGlobalAngle')); } catch (e) {}
    var ang = (useGlobal && globalAngle != null) ? globalAngle : readUnit(d, 'localLightingAngle');
    if (ang != null) ls.angle = ang;
    var alt = readUnit(d, 'localLightingAltitude'); if (alt != null) ls.altitude = alt;
    var b = {};
    var depth = readUnit(d, 'strengthRatio'); if (depth != null) b.depth = depth;
    var soft = readUnit(d, 'softness'); if (soft != null) b.soften = soft;
    var style = bevelStyleToIR(readEnumId(d, 'bevelStyle')); if (style) b.style = style;
    var tech = bevelTechToIR(readEnumId(d, 'bevelTechnique')); if (tech) b.technique = tech;
    var dir = bevelDirToIR(readEnumId(d, 'bevelDirection')); if (dir) b.direction = dir;
    var hm = readModeKey(d, 'highlightMode'); if (hm) b.highlightMode = hm;
    try { var hc = readColorDesc(d.getObjectValue(sID('highlightColor'))); if (hc) b.highlightColor = hc; } catch (e1) {}
    var ho = readUnit(d, 'highlightOpacity'); if (ho != null) b.highlightOpacity = clamp01(ho / 100);
    var sm = readModeKey(d, 'shadowMode'); if (sm) b.shadowMode = sm;
    try { var sc = readColorDesc(d.getObjectValue(sID('shadowColor'))); if (sc) b.shadowColor = sc; } catch (e2) {}
    var so = readUnit(d, 'shadowOpacity'); if (so != null) b.shadowOpacity = clamp01(so / 100);
    ls.bevel = b;
    return ls;
  }

  // Satin (chromeFX): colour, blend mode, opacity, angle, distance, size, invert.
  function readSatin(d) {
    var ls = { type: 'SATIN' };
    var c = null; try { c = readColorDesc(d.getObjectValue(sID('color'))); } catch (e) {}
    if (c) ls.color = c;
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    var ang = readUnit(d, 'localLightingAngle'); if (ang != null) ls.angle = ang;
    var dist = readUnit(d, 'distance'); if (dist != null) ls.distance = dist;
    var size = readUnit(d, 'blur'); if (size != null) ls.size = size;
    try { ls.invert = d.getBoolean(sID('invert')); } catch (e2) {}
    return ls;
  }

  // Gradient Overlay (gradientFill): the importer can script blend mode, opacity,
  // angle, and reverse (the gradient stops are not scriptable on AE layer styles).
  function readGradientOverlay(d) {
    var ls = { type: 'GRADIENT_OVERLAY', fillType: 'GRADIENT' };
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    var ang = readUnit(d, 'angle'); if (ang != null) ls.angle = ang;
    try { ls.reverse = d.getBoolean(sID('reverse')); } catch (e) {}
    return ls;
  }

  function readLayerStyles(name) {
    var out = [];
    var desc;
    try { desc = activeLayerDescriptor(); } catch (e) { return out; }
    if (!desc.hasKey(sID('layerEffects'))) return out;
    var fx;
    try { fx = desc.getObjectValue(sID('layerEffects')); } catch (e2) { return out; }

    var globalAngle = null;
    try { globalAngle = fx.getUnitDoubleValue(sID('globalLightingAngle')); } catch (e3) {}

    function one(key, reader) {
      try {
        if (!fx.hasKey(sID(key))) return;
        var d = fx.getObjectValue(sID(key));
        if (!isEnabled(d)) return;
        var ls = reader(d);
        if (ls) out.push(ls);
      } catch (e) { note(name, 'a ' + key + ' effect could not be read'); }
    }
    one('dropShadow', function (d) { return readShadow(d, 'DROP_SHADOW', globalAngle); });
    one('innerShadow', function (d) { return readShadow(d, 'INNER_SHADOW', globalAngle); });
    one('outerGlow', function (d) { return readGlow(d, 'OUTER_GLOW'); });
    one('innerGlow', function (d) { return readGlow(d, 'INNER_GLOW'); });
    one('bevelEmboss', function (d) { return readBevel(d, globalAngle); });
    one('chromeFX', readSatin);
    one('solidFill', readColorOverlay);
    one('gradientFill', readGradientOverlay);
    one('frameFX', readStrokeFx);
    if (fx.hasKey(sID('patternFill'))) note(name, 'pattern overlay not transferred (rasterise the layer to keep it)');
    return out;
  }

  // ---- rasterise a layer to a PNG asset ------------------------------------

  function selectLayer(layer) {
    app.activeDocument.activeLayer = layer;
  }

  function asPx(v) { return (v != null && v.as) ? v.as('px') : v; }

  // Duplicate the layer into a fresh transparent canvas-sized doc, trim to its
  // pixels, save a PNG, and read it back as base64. The trimmed top-left equals
  // the layer's bounds top-left, so placement is exact.
  function rasterizeToAsset(layer, name) {
    var hash = 'ps' + (++hashCounter);
    var b = layer.bounds;
    var left = asPx(b[0]), top = asPx(b[1]);
    var tmp = null;
    try {
      tmp = app.documents.add(docWpx, docHpx, doc.resolution, 'rb_tmp', NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
      app.activeDocument = doc;
      selectLayer(layer);
      layer.duplicate(tmp, ElementPlacement.PLACEATBEGINNING);
      app.activeDocument = tmp;
      tmp.trim(TrimType.TRANSPARENT);
      var w = Math.max(1, Math.round(asPx(tmp.width)));
      var h = Math.max(1, Math.round(asPx(tmp.height)));
      var f = new File(Folder.temp + '/' + hash + '.png');
      tmp.saveAs(f, new PNGSaveOptions(), true, Extension.LOWERCASE);
      tmp.close(SaveOptions.DONOTSAVECHANGES);
      tmp = null;
      app.activeDocument = doc;
      assets[hash] = { hash: hash, mime: 'image/png', width: w, height: h, bytesBase64: base64FromBinary(readBinary(f)) };
      try { f.remove(); } catch (e) {}
      return { hash: hash, left: left, top: top, width: w, height: h };
    } catch (e) {
      note(name, 'could not rasterise this layer');
      try { if (tmp) tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
      try { app.activeDocument = doc; } catch (e3) {}
      return null;
    }
  }

  // ---- nodes ---------------------------------------------------------------

  function baseNode(layer) {
    var op = 1; try { op = layer.opacity != null ? layer.opacity / 100 : 1; } catch (e) {}
    var bm = 'NORMAL'; try { bm = blendToIR(layer.blendMode); } catch (e2) {}
    var vis = true; try { vis = layer.visible; } catch (e3) {}
    var node = {
      id: nextId(),
      name: layer.name || 'Layer',
      type: 'GROUP',
      visible: vis,
      opacity: clamp01(op),
      blendMode: bm
    };
    try { if (layer.grouped) node.clipBelow = true; } catch (e4) {}
    return node;
  }

  // Enumerate per-character style runs from the live textKey descriptor, so a
  // type layer with mixed fonts / sizes / colours / tracking comes across as real
  // per-run After Effects text (24.3+). Type size is in points; convert to px by
  // the document resolution. Fully guarded: any failure returns null and the
  // caller falls back to the single dominant run.
  function readTextStyleRuns(layer, contents) {
    try {
      var ref = new ActionReference();
      ref.putProperty(cID('Prpr'), sID('textKey'));
      ref.putIdentifier(cID('Lyr '), layer.id);
      var d = executeActionGet(ref);
      if (!d.hasKey(sID('textKey'))) return null;
      var tk = d.getObjectValue(sID('textKey'));
      if (!tk.hasKey(sID('textStyleRange'))) return null;
      var list = tk.getList(sID('textStyleRange'));
      if (!list || !list.count) return null;
      var resFactor = 1;
      try { resFactor = doc.resolution / 72; } catch (eR) {}
      var runs = [];
      for (var i = 0; i < list.count; i++) {
        var rng = list.getObjectValue(i);
        var from = 0, to = 0;
        try { from = rng.getInteger(sID('from')); } catch (eF) {}
        try { to = rng.getInteger(sID('to')); } catch (eT) {}
        if (to <= from) continue;
        var ts = rng.getObjectValue(sID('textStyle'));
        var run = { start: from, end: to, characters: String(contents).substring(from, to) };
        try { run.postScriptName = ts.getString(sID('fontPostScriptName')); } catch (e1) {}
        if (!run.postScriptName) { try { run.fontFamily = ts.getString(sID('fontName')); } catch (e2) {} }
        try { run.fontSize = ts.getUnitDoubleValue(sID('size')) * resFactor; } catch (e3) {}
        try { run.tracking = ts.getInteger(sID('tracking')); } catch (e4) {}
        try {
          if (ts.getBoolean(sID('autoLeading'))) run.lineHeight = { unit: 'AUTO' };
          else run.lineHeight = { unit: 'PIXELS', value: ts.getUnitDoubleValue(sID('leading')) * resFactor };
        } catch (e5) {}
        try { var bs = ts.getUnitDoubleValue(sID('baselineShift')); if (bs) run.baselineShift = bs * resFactor; } catch (e6) {}
        try { if (ts.getBoolean(sID('syntheticBold'))) run.fauxBold = true; } catch (e7) {}
        try { if (ts.getBoolean(sID('syntheticItalic'))) run.fauxItalic = true; } catch (e8) {}
        try {
          var fc = typeIDToStringID(ts.getEnumerationValue(sID('fontCaps')));
          if (fc === 'allCaps') run.textCase = 'UPPER';
          else if (fc === 'smallCaps') run.textCase = 'SMALL_CAPS';
        } catch (e9) {}
        try {
          var col = readColorDesc(ts.getObjectValue(sID('color')));
          if (col) run.fills = [{ type: 'SOLID', color: col, opacity: 1, visible: true }];
        } catch (e10) {}
        runs.push(run);
      }
      return runs.length ? runs : null;
    } catch (e) { return null; }
  }

  function textToIR(layer) {
    var node = baseNode(layer);
    node.type = 'TEXT';
    var ti = layer.textItem;
    var contents = String(ti.contents);
    var runs = [{
      start: 0,
      end: contents.length,
      characters: ti.contents
    }];
    try { runs[0].postScriptName = ti.font; } catch (e) {}
    try { runs[0].fontSize = ti.size.as ? ti.size.as('px') : ti.size; } catch (e2) {}
    try { var c = ti.color.rgb; runs[0].fills = [{ type: 'SOLID', color: { r: clamp01(c.red / 255), g: clamp01(c.green / 255), b: clamp01(c.blue / 255), a: 1 }, opacity: 1, visible: true }]; } catch (e3) {}
    try { runs[0].tracking = ti.tracking; } catch (e4) {}

    // Prefer real per-character runs; fall back to the single dominant run.
    var rich = readTextStyleRuns(layer, contents);
    if (rich && rich.length) runs = rich;

    var b = layer.bounds;
    var left = b[0].as ? b[0].as('px') : b[0];
    var top = b[1].as ? b[1].as('px') : b[1];
    node.transform = { x: round(left), y: round(top), width: round((b[2].as ? b[2].as('px') : b[2]) - left), height: round((b[3].as ? b[3].as('px') : b[3]) - top) };
    // Point type auto-sizes; paragraph type keeps its box.
    var autoResize = 'NONE';
    try { if (ti.kind === TextType.POINTTEXT) autoResize = 'WIDTH_AND_HEIGHT'; } catch (eK) {}
    node.text = { characters: ti.contents, runs: runs, textAlignHorizontal: justifyToIR(ti), autoResize: autoResize, boxSize: [node.transform.width, node.transform.height] };
    node.fills = [];
    node.layerStyles = readLayerStyles(layer.name);
    if (!rich && contents.indexOf('\r') !== -1) note(layer.name, 'paragraph text imported with one style (per-run styling unavailable)');
    return node;
  }

  function justifyToIR(ti) {
    try {
      if (ti.justification === Justification.CENTER) return 'CENTER';
      if (ti.justification === Justification.RIGHT) return 'RIGHT';
      if (ti.justification === Justification.FULLY || ti.justification === Justification.FULLLEFT) return 'JUSTIFIED';
    } catch (e) {}
    return 'LEFT';
  }

  function rasterToIR(layer) {
    var node = baseNode(layer);
    var img = rasterizeToAsset(layer, layer.name);
    if (!img) { note(layer.name, 'skipped (no pixels)'); return null; }
    node.type = 'IMAGE';
    node.imageHash = img.hash;
    node.scaleMode = 'FILL';
    node.transform = { x: round(img.left), y: round(img.top), width: img.width, height: img.height };
    // Layer effects (and any mask / pattern overlay) are already baked into the
    // rasterised PNG, and the trim bounds above already include the shadow spread.
    // Re-applying them as AE layer styles would double them, so do not attach any.
    return node;
  }

  // ---- vector shape layers (100% vector via layerSVGdata) ------------------

  function getLayerSVG(layer) {
    try {
      var ref = new ActionReference();
      ref.putProperty(cID('Prpr'), sID('layerSVGdata'));
      ref.putIdentifier(cID('Lyr '), layer.id);
      var d = executeActionGet(ref);
      if (d.hasKey(sID('layerSVGdata'))) return d.getString(sID('layerSVGdata'));
    } catch (e) {}
    return null;
  }

  function svgToPathD(s) {
    if (s.indexOf('d="') === -1) return s; // already a raw 'd' string
    var ds = [], re = /d="([^"]*)"/g, m;
    while ((m = re.exec(s)) !== null) ds.push(m[1]);
    return ds.join(' ');
  }

  function readShapeFill(layer) {
    try {
      var ref = new ActionReference();
      ref.putIdentifier(cID('Lyr '), layer.id);
      var d = executeActionGet(ref);
      if (d.hasKey(sID('adjustment'))) {
        var adj = d.getList(sID('adjustment'));
        if (adj.count) {
          var a0 = adj.getObjectValue(0);
          if (a0.hasKey(sID('color'))) {
            var c = readColorDesc(a0.getObjectValue(sID('color')));
            if (c) return { type: 'SOLID', color: c, opacity: 1, visible: true };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // A shape layer's stroke (AGMStrokeStyleInfo): solid colour, weight, alignment,
  // cap/join, and dashes. Gradient/pattern strokes are left for the rasteriser.
  // Fully guarded: any failure returns null (no stroke), matching today.
  function readShapeStroke(layer) {
    try {
      var ref = new ActionReference();
      ref.putIdentifier(cID('Lyr '), layer.id);
      var d = executeActionGet(ref);
      if (!d.hasKey(sID('AGMStrokeStyleInfo'))) return null;
      var ss = d.getObjectValue(sID('AGMStrokeStyleInfo'));
      var enabled = true; try { enabled = ss.getBoolean(sID('strokeEnabled')); } catch (e0) {}
      if (!enabled) return null;
      var weight = 1; try { weight = ss.getUnitDoubleValue(sID('strokeStyleLineWidth')); } catch (e1) {}
      var paint = null;
      try {
        var content = ss.getObjectValue(sID('strokeStyleContent'));
        if (content.hasKey(sID('color'))) {
          var col = readColorDesc(content.getObjectValue(sID('color')));
          if (col) paint = { type: 'SOLID', color: col, opacity: 1, visible: true };
        }
      } catch (e2) {}
      if (!paint) return null;
      var align = 'CENTER';
      try {
        var a = typeIDToStringID(ss.getEnumerationValue(sID('strokeStyleLineAlignment')));
        align = a === 'strokeStyleAlignInside' ? 'INSIDE' : a === 'strokeStyleAlignOutside' ? 'OUTSIDE' : 'CENTER';
      } catch (e3) {}
      var cap = 'NONE';
      try {
        var cp = typeIDToStringID(ss.getEnumerationValue(sID('strokeStyleLineCapType')));
        cap = cp === 'strokeStyleRoundCap' ? 'ROUND' : cp === 'strokeStyleSquareCap' ? 'SQUARE' : 'NONE';
      } catch (e4) {}
      var join = 'MITER';
      try {
        var jn = typeIDToStringID(ss.getEnumerationValue(sID('strokeStyleLineJoinType')));
        join = jn === 'strokeStyleRoundJoin' ? 'ROUND' : jn === 'strokeStyleBevelJoin' ? 'BEVEL' : 'MITER';
      } catch (e5) {}
      var stroke = { paints: [paint], weight: weight, align: align, cap: cap, join: join };
      try {
        var ds = ss.getList(sID('strokeStyleLineDashSet'));
        if (ds && ds.count) {
          var dash = [];
          for (var i = 0; i < ds.count; i++) dash.push(ds.getUnitDoubleValue(i) * weight); // PS dashes are multiples of width
          if (dash.length) stroke.dashPattern = dash;
        }
      } catch (e6) {}
      return stroke;
    } catch (e) { return null; }
  }

  // Returns an editable VECTOR node, or null to let the layer rasterise.
  function shapeVectorToIR(layer) {
    var svg = getLayerSVG(layer);
    if (!svg) return null;
    var d = svgToPathD(svg);
    if (!d || !/[Mm]/.test(d)) return null;
    var fill = readShapeFill(layer);
    if (!fill) return null; // cannot reconstruct the fill, so rasterise instead
    var node = baseNode(layer);
    node.type = 'VECTOR';
    node.svgPath = d; // absolute document coords
    var b = layer.bounds;
    node.transform = { x: 0, y: 0, width: Math.max(1, Math.round(asPx(b[2]) - asPx(b[0]))), height: Math.max(1, Math.round(asPx(b[3]) - asPx(b[1]))) };
    node.fills = [fill];
    var stroke = readShapeStroke(layer);
    if (stroke) node.stroke = stroke;
    var styles = readLayerStyles(layer.name);
    if (styles.length) node.layerStyles = styles;
    return node;
  }

  // Read a specific layer's descriptor by id (does not depend on the active layer).
  function layerDescById(layer) {
    var ref = new ActionReference();
    ref.putIdentifier(cID('Lyr '), layer.id);
    return executeActionGet(ref);
  }

  // A pixel (raster) layer mask that is present and enabled. Bakes a fade / clip
  // that an editable text or shape layer would otherwise import fully opaque.
  function layerHasPixelMask(layer) {
    try {
      var d = layerDescById(layer);
      if (!(d.hasKey(sID('hasUserMask')) && d.getBoolean(sID('hasUserMask')))) return false;
      if (d.hasKey(sID('userMaskEnabled')) && !d.getBoolean(sID('userMaskEnabled'))) return false;
      return true;
    } catch (e) { return false; }
  }

  // A vector mask on a TEXT layer (text has none intrinsically; a shape's own path
  // IS a vector mask, so never call this for shapes).
  function textHasVectorMask(layer) {
    try {
      var d = layerDescById(layer);
      return d.hasKey(sID('hasVectorMask')) && d.getBoolean(sID('hasVectorMask'));
    } catch (e) { return false; }
  }

  // An enabled Pattern Overlay layer effect (AE has no scriptable pattern overlay,
  // so the only exact path is to bake the layer).
  function layerHasPatternOverlay(layer) {
    try {
      var d = layerDescById(layer);
      if (!d.hasKey(sID('layerEffects'))) return false;
      var fx = d.getObjectValue(sID('layerEffects'));
      if (!fx.hasKey(sID('patternFill'))) return false;
      return isEnabled(fx.getObjectValue(sID('patternFill')));
    } catch (e) { return false; }
  }

  function layerHasEffects(layer) {
    try { return layerDescById(layer).hasKey(sID('layerEffects')); } catch (e) { return false; }
  }

  // Fill Opacity (0..1), distinct from layer Opacity: it dims a layer's own pixels
  // but not its effects.
  function readFillOpacity(layer) {
    try { if (typeof layer.fillOpacity === 'number') return clamp01(layer.fillOpacity / 100); } catch (e) {}
    return 1;
  }

  // Adjustment layers (Curves / Levels / Hue-Sat / ...) have no pixels of their own;
  // their effect on the layers below cannot be reconstructed natively. Build the kind
  // list defensively because some members are undefined in older Photoshop.
  function isAdjustmentLayer(layer) {
    var names = ['LEVELS', 'CURVES', 'BRIGHTNESSCONTRAST', 'COLORBALANCE', 'HUESATURATION', 'SELECTIVECOLOR', 'CHANNELMIXER', 'GRADIENTMAP', 'PHOTOFILTER', 'INVERSION', 'THRESHOLD', 'POSTERIZE', 'BLACKANDWHITE', 'EXPOSURE', 'VIBRANCE'];
    var k;
    try { k = layer.kind; } catch (e) { return false; }
    for (var i = 0; i < names.length; i++) {
      try { var v = LayerKind[names[i]]; if (v !== undefined && k === v) return true; } catch (e2) {}
    }
    return false;
  }

  function layerToIR(layer) {
    var tn;
    try { tn = layer.typename; } catch (e) { return null; }
    if (tn === 'LayerSet') {
      var node = baseNode(layer);
      node.type = 'GROUP';
      node.children = [];
      for (var i = layer.layers.length - 1; i >= 0; i--) {
        var c = layerToIR(layer.layers[i]);
        if (c) node.children.push(c);
      }
      return node;
    }
    // ArtLayer
    var kind = null;
    try { kind = layer.kind; } catch (e2) {}

    if (isAdjustmentLayer(layer)) {
      note(layer.name, 'adjustment layer not reconstructed (its effect on the layers below is lost)');
      return null;
    }

    var fillOp = readFillOpacity(layer);
    // A pixel/vector mask or pattern overlay, or fill opacity combined with effects
    // (the fill dims but the effects do not), can only be reproduced by baking.
    var forceRaster = layerHasPixelMask(layer) || layerHasPatternOverlay(layer) || (fillOp < 0.999 && layerHasEffects(layer));

    if (kind === LayerKind.TEXT) {
      if (forceRaster || textHasVectorMask(layer)) return rasterToIR(layer);
      var tnode = textToIR(layer);
      if (tnode && fillOp < 0.999) tnode.opacity = clamp01((tnode.opacity == null ? 1 : tnode.opacity) * fillOp);
      return tnode;
    }
    if (!forceRaster) {
      var vec = shapeVectorToIR(layer);
      if (vec) {
        if (fillOp < 0.999) vec.opacity = clamp01((vec.opacity == null ? 1 : vec.opacity) * fillOp);
        return vec;
      }
    }
    return rasterToIR(layer);
  }

  // ---- run -----------------------------------------------------------------

  var children = [];
  // Photoshop layers[0] is the top; emit bottom-to-top for the IR.
  for (var i = doc.layers.length - 1; i >= 0; i--) {
    var n = layerToIR(doc.layers[i]);
    if (n) children.push(n);
  }

  var frame = {
    id: 'ps-frame',
    name: String(doc.name).replace(/\.psd$/i, ''),
    width: Math.max(1, Math.round(docWpx)),
    height: Math.max(1, Math.round(docHpx)),
    background: [],
    clipsContent: true,
    buildMode: 'PRECOMP',
    children: children
  };

  var ir = {
    irVersion: IR_VERSION,
    source: { app: 'photoshop', exporterVersion: '0.1.0', fileName: String(doc.name), selectionCount: children.length },
    document: { name: String(doc.name), colorSpace: 'srgb', unit: 'px', yAxis: 'down', assets: assets, frames: [frame] }
  };

  app.preferences.rulerUnits = savedUnits;

  // One-click send over a loopback socket to the Rebound receiver in After
  // Effects (Content-Length is the UTF-8 byte length); falls back to a file.
  function rbUtf8(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 128) out += String.fromCharCode(c);
      else if (c < 2048) out += String.fromCharCode(192 | (c >> 6), 128 | (c & 63));
      else out += String.fromCharCode(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    return out;
  }
  function rbPing(port) {
    var conn = new Socket();
    try {
      if (conn.open('127.0.0.1:' + port, 'BINARY')) {
        conn.write('GET /rebound/ping HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
        var resp = conn.read(8192);
        conn.close();
        return resp && resp.indexOf('"app":"rebound"') !== -1;
      }
    } catch (e) { try { conn.close(); } catch (e2) {} }
    return false;
  }
  function rbSend(jsonStr) {
    var ports = [7890, 7891, 7892, 7893];
    var body = rbUtf8(jsonStr);
    for (var i = 0; i < ports.length; i++) {
      if (!rbPing(ports[i])) continue;
      var conn = new Socket();
      try {
        if (conn.open('127.0.0.1:' + ports[i], 'BINARY')) {
          conn.write('POST /rebound/ir HTTP/1.0\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ' + body.length + '\r\nConnection: close\r\n\r\n' + body);
          var resp = conn.read(65536);
          conn.close();
          if (resp && resp.indexOf('"ok":true') !== -1) return true;
        }
      } catch (e) { try { conn.close(); } catch (e2) {} }
    }
    return false;
  }

  var json = JSON.stringify(ir);
  var notes = skipped.length ? ('\n\nNotes (' + skipped.length + '):\n- ' + skipped.slice(0, 8).join('\n- ')) : '';

  // Hold Shift while running to skip the one-click send and always save a .rbir
  // file (e.g. to hand off or import later), even when After Effects is open.
  var forceFile = false;
  try { forceFile = !!ScriptUI.environment.keyboardState.shiftKey; } catch (e) {}

  if (!forceFile && rbSend(json)) {
    alert('Rebound: sent to After Effects.\n\nTip: hold Shift while running to save a .rbir file instead.' + notes);
    return;
  }

  var prompt = forceFile ? 'Save a Rebound (.rbir) file' : 'After Effects not detected. Save a Rebound (.rbir) file instead';
  var file = File.saveDialog(prompt, 'Rebound IR:*.rbir');
  if (!file) return;
  if (!/\.rbir$/i.test(file.fsName)) file = new File(file.fsName + '.rbir');
  file.encoding = 'UTF-8';
  file.open('w');
  file.write(json);
  file.close();
  alert('Rebound: saved\n' + file.fsName + '\n\nIn After Effects, open the Rebound panel and use Import from file.' + notes);
})();
