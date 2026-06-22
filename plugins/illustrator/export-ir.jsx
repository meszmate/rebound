/*
 * Rebound Relay (Illustrator), exporter.
 *
 * Reads the current selection (or all top-level art) and writes a Rebound IR
 * (.rbir) file that the Rebound After Effects panel imports as native, editable
 * layers. Illustrator gives us PostScript font names directly, so TEXT becomes
 * real, editable After Effects text, with every character attribute copied.
 *
 * Run from File > Scripts, or double-click in the ExtendScript Toolkit.
 *
 * Coordinate conversion: Illustrator is Y-up with bounds [left, top, right,
 * bottom] (top > bottom); the IR is top-left origin, Y down. For a point (px,py)
 * inside an item whose top-left is (left, top), the local IR coord is
 * (px - left, top - py), which also flips bezier handle Y signs naturally.
 */
//@include "json2.js"
(function () {
  if (!app.documents || !app.documents.length) {
    alert('Rebound Relay: open a document first.');
    return;
  }

  var doc = app.activeDocument;
  var IR_VERSION = '1.0.0';
  var skipped = [];
  var idCounter = 0;
  var FRAME = { left: 0, top: 0, right: 0, bottom: 0 };

  // ---- helpers -------------------------------------------------------------

  function clamp01(v) { if (v == null || isNaN(v)) return 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function round(v) { return Math.round(v * 1000) / 1000; }
  function nextId(prefix) { idCounter++; return (prefix || 'item') + idCounter; }

  function toArray(coll) {
    var a = [];
    for (var i = 0; i < coll.length; i++) a.push(coll[i]);
    return a;
  }

  function topLevelItems(d) {
    var items = [];
    for (var i = 0; i < d.pageItems.length; i++) {
      var it = d.pageItems[i];
      if (it.parent === d || (it.layer && it.parent === it.layer)) items.push(it);
    }
    return items.length ? items : toArray(d.pageItems);
  }

  function computeFrame(items) {
    var l = Infinity, t = -Infinity, r = -Infinity, b = Infinity;
    for (var i = 0; i < items.length; i++) {
      var gb;
      try { gb = items[i].geometricBounds; } catch (e) { continue; }
      if (gb[0] < l) l = gb[0];
      if (gb[1] > t) t = gb[1];
      if (gb[2] > r) r = gb[2];
      if (gb[3] < b) b = gb[3];
    }
    if (l === Infinity) { l = 0; t = 100; r = 100; b = 0; }
    return { left: l, top: t, right: r, bottom: b };
  }

  // ---- colour --------------------------------------------------------------

  function solid(r, g, b, a) {
    return { type: 'SOLID', color: { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: (a == null ? 1 : clamp01(a)) }, opacity: 1, visible: true };
  }

  function cmykToRgb(c, m, y, k) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
  }

  function colorToPaint(c, item) {
    if (!c) return null;
    var tn = c.typename;
    if (tn === 'RGBColor') return solid(c.red / 255, c.green / 255, c.blue / 255);
    if (tn === 'GrayColor') { var g = 1 - (c.gray / 100); return solid(g, g, g); }
    if (tn === 'CMYKColor') { var rgb = cmykToRgb(c.cyan, c.magenta, c.yellow, c.black); return solid(rgb[0], rgb[1], rgb[2]); }
    if (tn === 'SpotColor') { try { return colorToPaint(c.spot.color, item); } catch (e) { return solid(0.5, 0.5, 0.5); } }
    if (tn === 'GradientColor') return gradientToPaint(c, item);
    if (tn === 'PatternColor') { note(item, 'pattern fill not transferred'); return solid(0.5, 0.5, 0.5); }
    if (tn === 'NoColor') return null;
    return null;
  }

  function gradientToPaint(gc, item) {
    var g = gc.gradient;
    var stops = [];
    for (var i = 0; i < g.gradientStops.length; i++) {
      var s = g.gradientStops[i];
      var p = colorToPaint(s.color, item);
      var rgb = p ? p.color : { r: 0, g: 0, b: 0 };
      var alpha = (s.opacity != null) ? s.opacity / 100 : 1;
      stops.push({ position: clamp01(s.rampPoint / 100), color: { r: rgb.r, g: rgb.g, b: rgb.b, a: clamp01(alpha) } });
    }
    var type = 'GRADIENT_LINEAR';
    try { if (g.type === GradientType.RADIAL) type = 'GRADIENT_RADIAL'; } catch (e) {}
    note(item, 'gradient geometry approximated (colours exact)');
    return { type: type, stops: stops, opacity: 1, visible: true };
  }

  function note(item, detail) {
    if (skipped.length < 200) skipped.push((item && item.name ? item.name + ': ' : '') + detail);
  }

  // ---- geometry ------------------------------------------------------------

  function pathPointsToSubpath(item, left, top, closed) {
    var verts = [];
    var pts = item.pathPoints;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var ax = p.anchor[0], ay = p.anchor[1];
      var lx = p.leftDirection[0], ly = p.leftDirection[1];
      var rx = p.rightDirection[0], ry = p.rightDirection[1];
      verts.push({
        x: round(ax - left),
        y: round(top - ay),
        inTangent: [round(lx - ax), round(ay - ly)],
        outTangent: [round(rx - ax), round(ay - ry)]
      });
    }
    return { vertices: verts, closed: closed !== false, windingRule: 'NONZERO' };
  }

  function capToIR(cap) {
    try {
      if (cap === StrokeCap.ROUNDENDCAP) return 'ROUND';
      if (cap === StrokeCap.PROJECTINGENDCAP) return 'SQUARE';
    } catch (e) {}
    return 'NONE';
  }
  function joinToIR(join) {
    try {
      if (join === StrokeJoin.ROUNDENDJOIN) return 'ROUND';
      if (join === StrokeJoin.BEVELENDJOIN) return 'BEVEL';
    } catch (e) {}
    return 'MITER';
  }

  function strokeToIR(item) {
    if (!item.stroked) return null;
    var paint = colorToPaint(item.strokeColor, item);
    var stroke = {
      paints: paint ? [paint] : [],
      weight: item.strokeWidth,
      align: 'CENTER',
      cap: capToIR(item.strokeCap),
      join: joinToIR(item.strokeJoin)
    };
    try { if (item.strokeMiterLimit) stroke.miterLimit = item.strokeMiterLimit; } catch (e) {}
    try {
      if (item.strokeDashes && item.strokeDashes.length) {
        var d = [];
        for (var i = 0; i < item.strokeDashes.length; i++) d.push(item.strokeDashes[i]);
        stroke.dashPattern = d;
      }
    } catch (e2) {}
    return stroke;
  }

  function blendToIR(mode) {
    try {
      if (mode === BlendModes.MULTIPLY) return 'MULTIPLY';
      if (mode === BlendModes.SCREEN) return 'SCREEN';
      if (mode === BlendModes.OVERLAY) return 'OVERLAY';
      if (mode === BlendModes.DARKEN) return 'DARKEN';
      if (mode === BlendModes.LIGHTEN) return 'LIGHTEN';
      if (mode === BlendModes.COLORDODGE) return 'COLOR_DODGE';
      if (mode === BlendModes.COLORBURN) return 'COLOR_BURN';
      if (mode === BlendModes.HARDLIGHT) return 'HARD_LIGHT';
      if (mode === BlendModes.SOFTLIGHT) return 'SOFT_LIGHT';
      if (mode === BlendModes.DIFFERENCE) return 'DIFFERENCE';
      if (mode === BlendModes.EXCLUSION) return 'EXCLUSION';
      if (mode === BlendModes.HUE) return 'HUE';
      if (mode === BlendModes.SATURATIONBLEND) return 'SATURATION';
      if (mode === BlendModes.COLORBLEND) return 'COLOR';
      if (mode === BlendModes.LUMINOSITY) return 'LUMINOSITY';
    } catch (e) {}
    return 'NORMAL';
  }

  function baseNode(item, left, top, right, bottom) {
    var opacity = 1;
    try { opacity = item.opacity != null ? item.opacity / 100 : 1; } catch (e) {}
    var blend = 'NORMAL';
    try { blend = blendToIR(item.blendingMode); } catch (e2) {}
    return {
      id: nextId(),
      name: (item.name || ''),
      type: 'GROUP',
      visible: !item.hidden,
      opacity: opacity,
      blendMode: blend,
      transform: { x: round(left - FRAME.left), y: round(FRAME.top - top), width: round(right - left), height: round(top - bottom) }
    };
  }

  function pathToIR(item) {
    var gb = item.geometricBounds;
    var node = baseNode(item, gb[0], gb[1], gb[2], gb[3]);
    if (!node.name) node.name = 'Path';
    node.type = 'VECTOR';
    node.paths = [pathPointsToSubpath(item, gb[0], gb[1], item.closed)];
    node.fills = item.filled ? compact([colorToPaint(item.fillColor, item)]) : [];
    node.stroke = strokeToIR(item);
    return node;
  }

  function compoundToIR(item) {
    var gb = item.geometricBounds;
    var node = baseNode(item, gb[0], gb[1], gb[2], gb[3]);
    if (!node.name) node.name = 'Compound Path';
    node.type = 'VECTOR';
    node.paths = [];
    for (var i = 0; i < item.pathItems.length; i++) {
      var sp = pathPointsToSubpath(item.pathItems[i], gb[0], gb[1], item.pathItems[i].closed);
      sp.windingRule = 'EVENODD';
      node.paths.push(sp);
    }
    var fp = item.pathItems.length ? item.pathItems[0] : null;
    node.fills = (fp && fp.filled) ? compact([colorToPaint(fp.fillColor, item)]) : [];
    node.stroke = fp ? strokeToIR(fp) : null;
    return node;
  }

  function groupToIR(item) {
    var gb = item.geometricBounds;
    var node = baseNode(item, gb[0], gb[1], gb[2], gb[3]);
    if (!node.name) node.name = 'Group';
    node.type = 'GROUP';
    node.children = [];
    for (var i = 0; i < item.pageItems.length; i++) {
      var c = itemToIR(item.pageItems[i]);
      if (c) node.children.push(c);
    }
    return node;
  }

  // ---- text ----------------------------------------------------------------

  function justToIR(item) {
    try {
      var j = item.paragraphs[0].justification;
      if (j === Justification.CENTER) return 'CENTER';
      if (j === Justification.RIGHT) return 'RIGHT';
      if (j === Justification.FULLJUSTIFY || j === Justification.FULLJUSTIFYLASTLINELEFT) return 'JUSTIFIED';
    } catch (e) {}
    return 'LEFT';
  }

  function charStyle(ca) {
    var style = { size: 12, ps: null, family: null, fstyle: null, tracking: 0, leading: 0, autoLeading: true, baseline: 0, color: null };
    try { style.size = ca.size; } catch (e) {}
    try { style.ps = ca.textFont.name; style.family = ca.textFont.family; style.fstyle = ca.textFont.style; } catch (e2) {}
    try { style.tracking = ca.tracking; } catch (e3) {}
    try { style.autoLeading = ca.autoLeading; style.leading = ca.leading; } catch (e4) {}
    try { style.baseline = ca.baselineShift; } catch (e5) {}
    try { style.color = colorToPaint(ca.fillColor, null); } catch (e6) {}
    return style;
  }

  function sameStyle(a, b) {
    return a.ps === b.ps && a.size === b.size && a.tracking === b.tracking &&
      a.baseline === b.baseline && colorKey(a.color) === colorKey(b.color);
  }
  function colorKey(p) {
    if (!p || !p.color) return 'none';
    return p.color.r + ',' + p.color.g + ',' + p.color.b;
  }

  function runFromStyle(style, text, start, end) {
    var run = { start: start, end: end, characters: text, fontSize: style.size, tracking: style.tracking, baselineShift: style.baseline };
    if (style.ps) run.postScriptName = style.ps;
    if (style.family) run.fontFamily = style.family;
    if (style.fstyle) run.fontStyle = style.fstyle;
    if (style.color) run.fills = [style.color];
    run.lineHeight = style.autoLeading ? { unit: 'AUTO' } : { unit: 'PIXELS', value: style.leading };
    return run;
  }

  function textToIR(item) {
    var gb = item.geometricBounds;
    var node = baseNode(item, gb[0], gb[1], gb[2], gb[3]);
    if (!node.name) node.name = 'Text';
    node.type = 'TEXT';
    var contents = item.contents;
    var runs = [];
    try {
      var chars = item.textRange.characters;
      var n = chars.length;
      var cur = null, curStyle = null, startIdx = 0;
      for (var i = 0; i < n; i++) {
        var st = charStyle(chars[i].characterAttributes);
        if (cur && sameStyle(curStyle, st)) {
          cur += chars[i].contents;
        } else {
          if (cur !== null) runs.push(runFromStyle(curStyle, cur, startIdx, i));
          cur = chars[i].contents; curStyle = st; startIdx = i;
        }
      }
      if (cur !== null) runs.push(runFromStyle(curStyle, cur, startIdx, n));
    } catch (e) {
      runs.push({ start: 0, end: contents.length, characters: contents });
    }
    node.text = {
      characters: contents,
      runs: runs,
      textAlignHorizontal: justToIR(item),
      textAlignVertical: 'TOP',
      autoResize: 'NONE',
      boxSize: [round(gb[2] - gb[0]), round(gb[1] - gb[3])]
    };
    node.fills = [];
    return node;
  }

  // ---- dispatch ------------------------------------------------------------

  function compact(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) if (arr[i]) out.push(arr[i]);
    return out;
  }

  function itemToIR(item) {
    var tn;
    try { if (item.hidden) return null; tn = item.typename; } catch (e) { return null; }
    if (tn === 'PathItem') return pathToIR(item);
    if (tn === 'CompoundPathItem') return compoundToIR(item);
    if (tn === 'GroupItem') return groupToIR(item);
    if (tn === 'TextFrame') return textToIR(item);
    if (tn === 'PlacedItem' || tn === 'RasterItem') { note(item, 'image not transferred (place it in After Effects)'); return null; }
    if (tn === 'SymbolItem') { note(item, 'symbol not expanded'); return null; }
    if (tn === 'MeshItem' || tn === 'GraphItem') { note(item, tn + ' not supported'); return null; }
    return null;
  }

  // ---- run -----------------------------------------------------------------

  var sel = null;
  try { sel = doc.selection; } catch (e) { sel = null; }
  var items = (sel && sel.length) ? toArray(sel) : topLevelItems(doc);
  if (!items.length) {
    alert('Rebound Relay: select some artwork to send.');
    return;
  }

  FRAME = computeFrame(items);
  var children = [];
  for (var i = 0; i < items.length; i++) {
    var n = itemToIR(items[i]);
    if (n) children.push(n);
  }

  var frame = {
    id: 'ai-' + nextId('frame'),
    name: String(doc.name).replace(/\.ai$/i, ''),
    width: Math.max(1, Math.round(FRAME.right - FRAME.left)),
    height: Math.max(1, Math.round(FRAME.top - FRAME.bottom)),
    background: [],
    clipsContent: false,
    buildMode: 'PRECOMP',
    children: children
  };

  var ir = {
    irVersion: IR_VERSION,
    source: { app: 'illustrator', exporterVersion: '0.1.0', fileName: String(doc.name), selectionCount: items.length },
    document: { name: String(doc.name), colorSpace: 'srgb', unit: 'px', yAxis: 'down', assets: {}, frames: [frame] }
  };

  var json = JSON.stringify(ir);
  var def = String(doc.name).replace(/\.ai$/i, '') + '.rbir';
  var file = File.saveDialog('Save the Rebound file', 'Rebound IR:*.rbir');
  if (!file) return;
  if (!/\.rbir$/i.test(file.fsName)) file = new File(file.fsName + '.rbir');
  file.encoding = 'UTF-8';
  file.open('w');
  file.write(json);
  file.close();

  var msg = 'Rebound Relay: saved\n' + file.fsName + '\n\nIn After Effects, open the Rebound panel and use Import from file.';
  if (skipped.length) msg += '\n\nNot transferred (' + skipped.length + '):\n- ' + skipped.slice(0, 8).join('\n- ');
  alert(msg);
})();
