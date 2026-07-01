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
  var IR_VERSION = '1.1.0';
  var skipped = [];
  var idCounter = 0;
  var hashCounter = 0;
  var assets = {};
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
    if (tn === 'SpotColor') {
      try {
        var sp = colorToPaint(c.spot.color, item);
        // A spot colour applied at < 100% tint is mixed toward white; without this
        // it imported at full strength (too dark).
        if (sp && sp.color) {
          var tint = 100;
          try { if (typeof c.tint === 'number') tint = c.tint; } catch (eT) {}
          if (tint < 100) {
            var f = tint / 100;
            sp.color.r = 1 - (1 - sp.color.r) * f;
            sp.color.g = 1 - (1 - sp.color.g) * f;
            sp.color.b = 1 - (1 - sp.color.b) * f;
          }
        }
        return sp || solid(0.5, 0.5, 0.5);
      } catch (e) { return solid(0.5, 0.5, 0.5); }
    }
    if (tn === 'GradientColor') return gradientToPaint(c, item);
    if (tn === 'LabColor') {
      try {
        var rgb = app.convertSampleColor(ImageColorSpace.LAB, [c.l, c.a, c.b], ImageColorSpace.RGB, ColorConvertPurpose.defaultpurpose);
        return solid(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      } catch (e) { return solid(0.5, 0.5, 0.5); }
    }
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
    var mids = [];
    for (var m = 0; m < g.gradientStops.length; m++) {
      try { mids.push(clamp01(g.gradientStops[m].midPoint / 100)); } catch (e0) {}
    }
    var type = 'GRADIENT_LINEAR';
    try { if (g.type === GradientType.RADIAL) type = 'GRADIENT_RADIAL'; } catch (e) {}
    var paint = { type: type, stops: stops, gradientMidpoints: mids, opacity: 1, visible: true };
    // Gradient ramp geometry: origin + angle + length live in artboard (Y-up)
    // space; convert the start/end to the item's local IR space (Y-down). This
    // lands the gradient at the right angle/origin instead of a default ramp.
    var placed = false;
    try {
      if (item) {
        var gb = item.geometricBounds;
        var left = gb[0], top = gb[1];
        var ox = gc.origin[0], oy = gc.origin[1];
        var ang = gc.angle * Math.PI / 180;
        var len = gc.length;
        if (isFinite(ox) && isFinite(oy) && isFinite(len) && len !== 0) {
          var ex = ox + len * Math.cos(ang);
          var ey = oy + len * Math.sin(ang);
          paint.gradientHandles = [[round(ox - left), round(top - oy)], [round(ex - left), round(top - ey)]];
          placed = true;
        }
      }
    } catch (e1) {}
    if (!placed) note(item, 'gradient geometry approximated (colours exact)');
    return paint;
  }

  function note(item, detail) {
    if (skipped.length < 200) skipped.push((item && item.name ? item.name + ': ' : '') + detail);
  }

  // ---- rasterise an item to a PNG asset ------------------------------------

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

  // Bake a single item to a 2x PNG so anything we cannot rebuild vectorially
  // (placed/raster images, pattern fills, freeform gradients, art with live
  // effects) still comes across pixel-exact. Non-destructive: the item is
  // duplicated into a throwaway document and captured there, the source is never
  // touched. Returns { hash, left, top, width, height } in artboard (Y-up) space,
  // or null on any failure (caller falls back to today's behaviour: drop + note).
  function rasterizeItemToAsset(item, name) {
    var gb;
    try { gb = item.visibleBounds; } catch (e0) { try { gb = item.geometricBounds; } catch (e1) { return null; } }
    var left = gb[0], top = gb[1], right = gb[2], bottom = gb[3];
    var wpt = right - left, hpt = top - bottom;
    if (!(wpt > 0) || !(hpt > 0)) return null;
    var hash = 'ai' + (++hashCounter);
    var tmp = null;
    try {
      tmp = app.documents.add(DocumentColorSpace.RGB, wpt, hpt);
      var dup = item.duplicate(tmp.layers[0], ElementPlacement.PLACEATEND);
      var cap = new File(Folder.temp + '/' + hash + '.png');
      var opts = new ImageCaptureOptions();
      opts.resolution = 144;       // 2x for crispness; node box stays at 1x
      opts.antiAliasing = true;
      opts.transparency = true;
      tmp.imageCapture(cap, dup.visibleBounds, opts);
      tmp.close(SaveOptions.DONOTSAVECHANGES);
      tmp = null;
      app.activeDocument = doc;
      var pxw = Math.max(1, Math.round(wpt * 2));
      var pxh = Math.max(1, Math.round(hpt * 2));
      assets[hash] = { hash: hash, mime: 'image/png', width: pxw, height: pxh, bytesBase64: base64FromBinary(readBinary(cap)) };
      try { cap.remove(); } catch (e2) {}
      return { hash: hash, left: left, top: top, width: wpt, height: hpt };
    } catch (e) {
      note(item, 'could not rasterise this item');
      try { if (tmp) tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e3) {}
      try { app.activeDocument = doc; } catch (e4) {}
      return null;
    }
  }

  function imageItemToIR(item) {
    var img = rasterizeItemToAsset(item, item.name);
    if (!img) return null;
    var node = baseNode(item, img.left, img.top, img.left + img.width, img.top - img.height);
    if (!node.name) node.name = 'Image';
    node.type = 'IMAGE';
    node.imageHash = img.hash;
    node.scaleMode = 'FILL';
    node.fills = [];
    return node;
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
        try { if (item.strokeDashOffset) stroke.dashOffset = item.strokeDashOffset; } catch (e3) {}
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

  // ---- opacity (transparency) masks ----------------------------------------

  // Illustrator opacity masks live inside the item's appearance and are NOT
  // exposed as page items in the scripting DOM, so the mask art cannot be
  // enumerated or rebuilt as editable geometry, and a SEPARATE luma matte node
  // (the host's maskTargetId convention in host/commands/import/mask.jsx) cannot
  // be reconstructed. What IS reproducible is the COMPOSITED result: imageCapture
  // renders the item with its opacity mask already applied. So a detected masked
  // item is baked to a single pixel-exact node (mask already applied in the
  // pixels) with a precise fidelity note, instead of silently exporting the art
  // at full opacity.

  // Best-effort detection. Standard Illustrator builds expose NO boolean for an
  // opacity mask -- item.opacityMask is undefined, so this stays dormant there
  // (undetected masks fall through unchanged, no false positives). A few builds
  // surface a non-null .opacityMask appearance reference, read defensively below;
  // there is no other reliable DOM signal to key on.
  function hasOpacityMask(item) {
    try {
      if (item.opacityMask != null) return true;
    } catch (e) {}
    return false;
  }

  // Bake a detected masked item to a single composited node (the mask is already
  // applied in the captured pixels) plus a fidelity note. Returns the baked node,
  // or null when even the composite could not be captured. No maskType/maskTargetId
  // is set: this is a plain image, not a separable track matte (see above).
  function opacityMaskToIR(item) {
    var art = imageItemToIR(item);
    if (!art) {
      note(item, 'opacity mask present but the masked art could not be baked (place it in After Effects)');
      return null;
    }
    art.meta = art.meta || {};
    art.meta.opacityMaskBaked = true;
    note(item, 'opacity mask baked into the art; an editable luma matte is not separable from Illustrator scripting');
    return art;
  }

  // A member of a clip group is the clipping path; it masks the other members.
  function isClipping(it) {
    try { if (it.clipping === true) return true; } catch (e) {}
    try { if (it.typename === 'CompoundPathItem' && it.pathItems.length && it.pathItems[0].clipping) return true; } catch (e2) {}
    return false;
  }

  function groupToIR(item) {
    var gb = item.geometricBounds;
    var node = baseNode(item, gb[0], gb[1], gb[2], gb[3]);
    if (!node.name) node.name = 'Group';
    node.type = 'GROUP';
    node.children = [];
    var clipped = false;
    try { clipped = item.clipped === true; } catch (eC) {}
    var clipNode = null;
    for (var i = 0; i < item.pageItems.length; i++) {
      var src = item.pageItems[i];
      var c = itemToIR(src);
      if (!c) continue;
      if (clipped && !clipNode && isClipping(src)) {
        c.isMask = true;
        c.maskType = 'ALPHA';
        // A clip path usually has no paint; give the matte a fill so its
        // silhouette carries alpha (an empty alpha matte would hide everything).
        if (!c.fills || !c.fills.length) c.fills = [solid(1, 1, 1)];
        clipNode = c;
      }
      node.children.push(c);
    }
    if (clipNode) {
      var targets = [];
      for (var k = 0; k < node.children.length; k++) {
        if (node.children[k] !== clipNode) targets.push(node.children[k].id);
      }
      if (targets.length) {
        clipNode.maskTargetId = targets[0];
        if (targets.length > 1) clipNode.maskTargetIds = targets;
      }
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

  function capsToIR(c) {
    try {
      if (c === FontCapsOption.ALLCAPS) return 'UPPER';
      if (c === FontCapsOption.SMALLCAPS || c === FontCapsOption.ALLSMALLCAPS) return 'SMALL_CAPS';
    } catch (e) {}
    return undefined;
  }

  function charStyle(ca) {
    var style = { size: 12, ps: null, family: null, fstyle: null, tracking: 0, leading: 0, autoLeading: true, baseline: 0, color: null, caps: undefined };
    try { style.size = ca.size; } catch (e) {}
    try { style.ps = ca.textFont.name; style.family = ca.textFont.family; style.fstyle = ca.textFont.style; } catch (e2) {}
    try { style.tracking = ca.tracking; } catch (e3) {}
    try { style.autoLeading = ca.autoLeading; style.leading = ca.leading; } catch (e4) {}
    try { style.baseline = ca.baselineShift; } catch (e5) {}
    try { style.color = colorToPaint(ca.fillColor, null); } catch (e6) {}
    try { style.caps = capsToIR(ca.capitalization); } catch (e7) {}
    return style;
  }

  function sameStyle(a, b) {
    return a.ps === b.ps && a.size === b.size && a.tracking === b.tracking &&
      a.baseline === b.baseline && a.caps === b.caps && colorKey(a.color) === colorKey(b.color);
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
    if (style.caps) run.textCase = style.caps;
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
      var cur = null, curStyle = null, startPos = 0, pos = 0;
      for (var i = 0; i < n; i++) {
        var st = charStyle(chars[i].characterAttributes);
        var ch = chars[i].contents;
        if (cur !== null && sameStyle(curStyle, st)) {
          cur += ch;
        } else {
          if (cur !== null) runs.push(runFromStyle(curStyle, cur, startPos, pos));
          cur = ch; curStyle = st; startPos = pos;
        }
        pos += ch.length;
      }
      if (cur !== null) runs.push(runFromStyle(curStyle, cur, startPos, pos));
    } catch (e) {
      runs.push({ start: 0, end: contents.length, characters: contents });
    }
    // Point text auto-sizes (no box); area text keeps its frame so wrapping
    // matches. autoResize WIDTH_AND_HEIGHT tells the importer to use point text.
    var autoResize = 'NONE';
    try { if (item.kind === TextType.POINTTEXT) autoResize = 'WIDTH_AND_HEIGHT'; } catch (eKind) {}
    node.text = {
      characters: contents,
      runs: runs,
      textAlignHorizontal: justToIR(item),
      textAlignVertical: 'TOP',
      autoResize: autoResize,
      boxSize: [round(gb[2] - gb[0]), round(gb[1] - gb[3])]
    };
    // Text stroke (per-character in Illustrator; take the range's attributes).
    try {
      var tca = item.textRange.characterAttributes;
      if (tca.strokeWeight && tca.strokeColor && tca.strokeColor.typename !== 'NoColor') {
        var tsp = colorToPaint(tca.strokeColor, item);
        if (tsp) node.stroke = { paints: [tsp], weight: tca.strokeWeight, align: 'CENTER', cap: 'NONE', join: 'MITER' };
      }
    } catch (e) {}
    node.fills = [];
    return node;
  }

  // ---- dispatch ------------------------------------------------------------

  function compact(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) if (arr[i]) out.push(arr[i]);
    return out;
  }

  // A pattern fill has no AE shape equivalent; bake the item to a PNG so it looks
  // exact instead of the flat placeholder colour colorToPaint falls back to.
  function hasUnreproducibleFill(item) {
    try {
      if (item.filled && item.fillColor && item.fillColor.typename === 'PatternColor') return true;
    } catch (e) {}
    return false;
  }

  // A live effect (drop shadow, glow, feather, blur, outer effect) is applied via
  // Illustrator's appearance and is NOT enumerable in the scripting DOM — the
  // vector geometry alone would import WITHOUT the effect. But such effects inflate
  // the item's VISIBLE bounds well past its geometric (path) bounds, so detect that
  // and bake the item to a pixel-exact PNG (imageCapture renders the effect). The
  // margin allows a centred stroke (+ a little mitre slack) so ordinary stroked
  // paths are NOT baked; only a clear visible-bounds overflow trips it.
  function hasLiveEffect(item) {
    try {
      var g = item.geometricBounds, v = item.visibleBounds; // [left, top, right, bottom] Y-up
      if (!g || !v) return false;
      var sw = 0;
      try { if (item.stroked && typeof item.strokeWidth === 'number') sw = item.strokeWidth; } catch (e) {}
      var pad = sw + 4;
      if (v[0] < g[0] - pad || v[1] > g[1] + pad || v[2] > g[2] + pad || v[3] < g[3] - pad) return true;
    } catch (e2) {}
    return false;
  }

  function bakedForEffect(item) {
    if (!hasLiveEffect(item)) return null;
    var img = imageItemToIR(item);
    if (img) note(item, 'live effect (shadow/glow/blur) baked to a pixel-exact image — Illustrator effects have no editable After Effects rebuild');
    return img;
  }

  function itemToIR(item) {
    var tn;
    try { if (item.hidden) return null; tn = item.typename; } catch (e) { return null; }
    // An opacity (transparency) mask cannot be enumerated in the AI DOM; bake
    // the composited appearance so masked art no longer exports at full opacity.
    if (hasOpacityMask(item)) { var om = opacityMaskToIR(item); if (om) return om; }
    if (tn === 'PathItem') {
      if (hasUnreproducibleFill(item)) { var ri = imageItemToIR(item); if (ri) return ri; }
      var pe = bakedForEffect(item); if (pe) return pe;
      return pathToIR(item);
    }
    if (tn === 'CompoundPathItem') {
      var ce = bakedForEffect(item); if (ce) return ce;
      return compoundToIR(item);
    }
    if (tn === 'GroupItem') return groupToIR(item);
    if (tn === 'TextFrame') return textToIR(item);
    // Placed / raster images, meshes, symbol instances, and graphs all bake to a
    // pixel-exact PNG instead of vanishing (each previously returned null).
    if (tn === 'PlacedItem' || tn === 'RasterItem' || tn === 'MeshItem' || tn === 'SymbolItem' || tn === 'GraphItem') {
      var img = imageItemToIR(item);
      if (img) return img;
      note(item, tn + ' could not be transferred (place it in After Effects)');
      return null;
    }
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
    document: { name: String(doc.name), colorSpace: 'srgb', unit: 'px', yAxis: 'down', assets: assets, frames: [frame] }
  };

  // One-click send: POST the IR to the Rebound receiver in After Effects over a
  // loopback socket. Content-Length must be the UTF-8 BYTE length, so the body
  // is UTF-8 encoded first. Falls back to saving a .rbir file.
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
