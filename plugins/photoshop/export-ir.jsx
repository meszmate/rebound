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
    try {
      var r = d.getDouble(sID('red'));
      var g;
      try { g = d.getDouble(sID('green')); } catch (e) { g = d.getDouble(sID('grain')); }
      var b = d.getDouble(sID('blue'));
      return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), a: 1 };
    } catch (e2) { return null; }
  }

  function readMode(d) {
    try { return psBlendIdToIR(typeIDToStringID(d.getEnumerationValue(sID('mode')))); } catch (e) { return undefined; }
  }
  function readOpacity(d) { try { return clamp01(d.getUnitDoubleValue(sID('opacity')) / 100); } catch (e) { return undefined; } }
  function readUnit(d, key) { try { return d.getUnitDoubleValue(sID(key)); } catch (e) { try { return d.getDouble(sID(key)); } catch (e2) { return undefined; } } }
  function isEnabled(d) { try { return d.getBoolean(sID('enabled')); } catch (e) { return true; } }

  function readShadow(d, type) {
    var ls = { type: type };
    var c = null; try { c = readColorDesc(d.getObjectValue(sID('color'))); } catch (e) {}
    if (c) ls.color = c;
    var bm = readMode(d); if (bm) ls.blendMode = bm;
    var op = readOpacity(d); if (op != null) ls.opacity = op;
    var size = readUnit(d, 'blur'); if (size != null) ls.size = size;
    var dist = readUnit(d, 'distance'); if (dist != null) ls.distance = dist;
    var ang = readUnit(d, 'localLightingAngle'); if (ang != null) ls.angle = ang;
    var choke = readUnit(d, 'chokeMatte'); if (choke != null) ls.choke = choke;
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

  function readLayerStyles(name) {
    var out = [];
    var desc;
    try { desc = activeLayerDescriptor(); } catch (e) { return out; }
    if (!desc.hasKey(sID('layerEffects'))) return out;
    var fx;
    try { fx = desc.getObjectValue(sID('layerEffects')); } catch (e2) { return out; }

    function one(key, reader) {
      try {
        if (!fx.hasKey(sID(key))) return;
        var d = fx.getObjectValue(sID(key));
        if (!isEnabled(d)) return;
        var ls = reader(d);
        if (ls) out.push(ls);
      } catch (e) { note(name, 'a ' + key + ' effect could not be read'); }
    }
    one('dropShadow', function (d) { return readShadow(d, 'DROP_SHADOW'); });
    one('innerShadow', function (d) { return readShadow(d, 'INNER_SHADOW'); });
    one('outerGlow', function (d) { return readGlow(d, 'OUTER_GLOW'); });
    one('innerGlow', function (d) { return readGlow(d, 'INNER_GLOW'); });
    one('solidFill', readColorOverlay);
    one('frameFX', readStrokeFx);
    if (fx.hasKey(sID('bevelEmboss'))) note(name, 'bevel & emboss not yet read');
    if (fx.hasKey(sID('chromeFX'))) note(name, 'satin not yet read');
    if (fx.hasKey(sID('gradientFill'))) note(name, 'gradient overlay not yet read');
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

  function textToIR(layer) {
    var node = baseNode(layer);
    node.type = 'TEXT';
    var ti = layer.textItem;
    var runs = [{
      start: 0,
      end: String(ti.contents).length,
      characters: ti.contents
    }];
    try { runs[0].postScriptName = ti.font; } catch (e) {}
    try { runs[0].fontSize = ti.size.as ? ti.size.as('px') : ti.size; } catch (e2) {}
    try { var c = ti.color.rgb; runs[0].fills = [{ type: 'SOLID', color: { r: clamp01(c.red / 255), g: clamp01(c.green / 255), b: clamp01(c.blue / 255), a: 1 }, opacity: 1, visible: true }]; } catch (e3) {}
    try { runs[0].tracking = ti.tracking; } catch (e4) {}
    var b = layer.bounds;
    var left = b[0].as ? b[0].as('px') : b[0];
    var top = b[1].as ? b[1].as('px') : b[1];
    node.transform = { x: round(left), y: round(top), width: round((b[2].as ? b[2].as('px') : b[2]) - left), height: round((b[3].as ? b[3].as('px') : b[3]) - top) };
    node.text = { characters: ti.contents, runs: runs, textAlignHorizontal: justifyToIR(ti), autoResize: 'NONE', boxSize: [node.transform.width, node.transform.height] };
    node.fills = [];
    node.layerStyles = readLayerStyles(layer.name);
    if (runs.length === 1 && String(ti.contents).indexOf('\r') === -1) { /* whole-layer style is fine */ }
    else note(layer.name, 'rich text styling reduced to the dominant style');
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
    var styles = readLayerStyles(layer.name);
    var img = rasterizeToAsset(layer, layer.name);
    if (!img) { note(layer.name, 'skipped (no pixels)'); return null; }
    node.type = 'IMAGE';
    node.imageHash = img.hash;
    node.scaleMode = 'FILL';
    node.transform = { x: round(img.left), y: round(img.top), width: img.width, height: img.height };
    if (styles.length) node.layerStyles = styles;
    return node;
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
    if (kind === LayerKind.TEXT) return textToIR(layer);
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

  if (rbSend(json)) {
    alert('Rebound Relay: sent to After Effects.' + notes);
    return;
  }

  var file = File.saveDialog('After Effects not detected. Save a Rebound file instead', 'Rebound IR:*.rbir');
  if (!file) return;
  if (!/\.rbir$/i.test(file.fsName)) file = new File(file.fsName + '.rbir');
  file.encoding = 'UTF-8';
  file.open('w');
  file.write(json);
  file.close();
  alert('Rebound Relay: saved\n' + file.fsName + '\n\nIn After Effects, open the Rebound panel and use Import from file.' + notes);
})();
