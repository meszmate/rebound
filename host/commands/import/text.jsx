/*
 * Rebound host, import text.
 *
 * Rebuilds a TEXT node as a real, editable After Effects text layer with every
 * parameter copied: font (resolved family + style -> PostScript name), size,
 * fill, tracking, leading, baseline shift, faux bold/italic, and case. On AE
 * 24.3+ each style run is applied to its character range, so mixed styling is
 * preserved; on older AE the dominant style is used whole-layer and the mixed
 * styling is flagged. Fonts that are not installed are collected for the import
 * report's substitution dialog rather than failing the build.
 */
(function () {
  var R = $.__rebound;
  var N = R.ir.N;

  // Families that could not be resolved while building the current text layer,
  // so the layer can be tagged for the missing-font resolver.
  var layerMissing = [];
  function noteLayerMissing(family) {
    for (var i = 0; i < layerMissing.length; i++) { if (layerMissing[i] === family) return; }
    layerMissing.push(family);
  }

  function supportsRanges() {
    // CharacterRange per-run styling landed in After Effects 24.3.
    var v = parseFloat(app.version);
    return !isNaN(v) && v >= 24.3;
  }

  // The Fonts API (app.fonts, FontObject, getFontsBy*) landed in AE 24.0 -- gate
  // font resolution on that, NOT on supportsRanges (24.3), so single-style text
  // resolves fonts correctly on 24.0-24.2 too.
  function hasFontsApi() {
    return !!(app.fonts && app.fonts.getFontsByFamilyNameAndStyleName);
  }

  function addMissingFont(report, family) {
    for (var i = 0; i < report.missingFonts.length; i++) {
      if (report.missingFonts[i] === family) return;
    }
    report.missingFonts.push(family);
  }

  // Normalize a font/style name for loose comparison: strip spaces/dashes/
  // underscores, lowercase. So "Semi Bold" == "SemiBold" == "semibold".
  function normName(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\s\-_]+/g, '');
  }

  // Strip spaces only, preserving case, for constructing PostScript probes like
  // "Inter-SemiBold" from family "Inter" + style "Semi Bold".
  function collapse(s) {
    return s ? String(s).replace(/[\s]+/g, '') : '';
  }

  // Figma style spelling -> the alternate spellings AE may use for the same face.
  // Tried in order; '' lets getFontsByFamilyNameAndStyleName fall back to the
  // family default (some single-style families report an empty style name).
  var STYLE_SYNONYMS = {
    'regular': ['Regular', 'Book', 'Roman', ''],
    'bold': ['Bold', 'Heavy'],
    'semibold': ['SemiBold', 'Semibold', 'Semi Bold', 'Demi Bold', 'Demi'],
    'extrabold': ['ExtraBold', 'Extrabold', 'Extra Bold', 'Ultra'],
    'medium': ['Medium'],
    'light': ['Light'],
    'thin': ['Thin', 'Hairline'],
    'italic': ['Italic', 'Oblique'],
    'bolditalic': ['Bold Italic', 'BoldItalic']
  };

  // A numeric CSS weight maps to a Figma-style label so a run that only carries
  // fontWeight (no fontStyle) can still be resolved.
  function weightToStyle(w) {
    if (typeof w !== 'number') return null;
    if (w >= 850) return 'Heavy';
    if (w >= 750) return 'Extra Bold';
    if (w >= 650) return 'Bold';
    if (w >= 550) return 'Semi Bold';
    if (w >= 450) return 'Medium';
    if (w >= 350) return 'Regular';
    if (w >= 250) return 'Light';
    return 'Thin';
  }

  // Whether AE handed us a real installed face or a substitute. The substitution
  // FontObject exposes .isSubstitute === true on 24.0+; older results lack it, so
  // we treat "has a postScriptName" as the loose success signal.
  function isRealFont(fo) {
    if (!fo) return false;
    try { if (fo.isSubstitute === true) return false; } catch (e) {}
    try { return !!fo.postScriptName; } catch (e2) { return false; }
  }

  // Return the FontObject from a getFontsBy* result that is a real (non-
  // substitute) font, or null.
  function firstReal(fonts) {
    if (!fonts || !fonts.length) return null;
    for (var i = 0; i < fonts.length; i++) {
      if (isRealFont(fonts[i])) return fonts[i];
    }
    return null;
  }

  // A PostScript-name lookup can hand back a same-named substitute or a variable-
  // font instance from a DIFFERENT family, which the read-back check won't catch
  // (we set the name we asked for). Require the family to match (loosely) before
  // trusting a getFontsByPostScriptName result. No family to check -> allow.
  function foFamilyOk(fo, family) {
    if (!family) return true;
    var famN = normName(family);
    var fam = '', nfam = '';
    try { fam = fo.familyName || ''; } catch (e) {}
    try { nfam = fo.nativeFamilyName || ''; } catch (e2) {}
    return normName(fam) === famN || normName(nfam) === famN;
  }

  // Build the ordered list of style spellings to try for a requested style /
  // weight: the literal style, its synonyms, the weight-derived label + ITS
  // synonyms, then a bare 'Regular' as a final family-default attempt.
  function styleCandidates(style, weight) {
    var out = [];
    function push(s) {
      if (s == null) return;
      for (var j = 0; j < out.length; j++) { if (normName(out[j]) === normName(s)) return; }
      out.push(s);
    }
    if (style) push(style);
    var syn = style ? STYLE_SYNONYMS[normName(style)] : null;
    if (syn) { for (var i = 0; i < syn.length; i++) push(syn[i]); }
    var wLabel = weightToStyle(weight);
    if (wLabel) {
      push(wLabel);
      var wSyn = STYLE_SYNONYMS[normName(wLabel)];
      if (wSyn) { for (var k = 0; k < wSyn.length; k++) push(wSyn[k]); }
    }
    push('Regular');
    return out;
  }

  // Iterate every FontObject in app.fonts.allFonts regardless of its shape. The
  // AE Fonts API has been documented both as a FLAT array of FontObjects and as
  // an array of family-group sub-arrays; handle BOTH so the scan never silently
  // goes dead. cb may return a truthy value to stop early (returned to the caller).
  function eachFont(allFonts, cb) {
    if (!allFonts || !allFonts.length) return null;
    for (var i = 0; i < allFonts.length; i++) {
      var e = allFonts[i];
      if (!e) continue;
      if (e.familyName != null || e.postScriptName != null) {
        var r = cb(e); if (r) return r;
      } else if (typeof e.length === 'number') {
        for (var j = 0; j < e.length; j++) {
          if (!e[j]) continue;
          var r2 = cb(e[j]); if (r2) return r2;
        }
      }
    }
    return null;
  }

  // Scan app.fonts.allFonts (flat faces OR family-group sub-arrays; eachFont
  // handles both) for a face whose family AND style match (loosely, via normName)
  // the request. Returns a FontObject or null.
  function scanAllFonts(family, style, weight) {
    var groups;
    try { groups = app.fonts.allFonts; } catch (e0) { return null; }
    var famN = normName(family);
    var wantStyles = styleCandidates(style, weight);
    var sameFamily = null; // first matching-family face of ANY style (fallback)
    var hit = eachFont(groups, function (fo) {
      var fam = '', nfam = '', sty = '', nsty = '';
      try { fam = fo.familyName || ''; } catch (eF) {}
      try { nfam = fo.nativeFamilyName || ''; } catch (eNF) {}
      try { sty = fo.styleName || ''; } catch (eS) {}
      try { nsty = fo.nativeStyleName || ''; } catch (eNS) {}
      if (normName(fam) !== famN && normName(nfam) !== famN) return null;
      if (!sameFamily) sameFamily = fo;
      for (var w = 0; w < wantStyles.length; w++) {
        var wsN = normName(wantStyles[w]);
        if (wsN && (normName(sty) === wsN || normName(nsty) === wsN)) return fo;
      }
      return null;
    });
    return hit || sameFamily;
  }

  // Resolve family + style to an installed FontObject AE can set. NEVER returns a
  // substitute -- a true miss returns null so the caller can fall to faux styling
  // or the missing-font report rather than silently landing AE's default face.
  // Strategy (each step guarded; AE Fonts API is 24.0+):
  //   (a) explicit PostScript name from the exporter
  //   (b) exact family + style
  //   (c) style synonyms + numeric-weight-derived style
  //   (d) constructed "Family-Style" PostScript probe
  //   (e) scan allFonts (nested family-group arrays) on family+style
  //   (f) same family, any style (keeps the typeface; notes an approximation)
  // Returns { font: FontObject|null, postScriptName: String|null, approx: String|null }.
  function resolveFont(family, style, ps, weight, report) {
    var miss = { font: null, postScriptName: null, approx: null };
    if (!hasFontsApi()) {
      // Pre-24.0 AE: no Fonts API. Fall back to the exporter's PostScript name as
      // a best-effort string set; nothing to verify against.
      if (ps) return { font: null, postScriptName: ps, approx: null };
      if (family) { addMissingFont(report, family); noteLayerMissing(family); }
      return miss;
    }
    if (!family && !ps) return miss;

    var fo;
    // (a) explicit PostScript name.
    if (ps) {
      try {
        fo = firstReal(app.fonts.getFontsByPostScriptName(ps));
        if (fo && foFamilyOk(fo, family)) return { font: fo, postScriptName: fo.postScriptName, approx: null };
      } catch (eA) {}
    }

    if (family) {
      var cands = styleCandidates(style, weight);
      // (b)+(c) exact family+style, then every synonym / weight-derived spelling.
      for (var i = 0; i < cands.length; i++) {
        try {
          fo = firstReal(app.fonts.getFontsByFamilyNameAndStyleName(family, cands[i]));
          if (fo && foFamilyOk(fo, family)) return { font: fo, postScriptName: fo.postScriptName, approx: null };
        } catch (eB) {}
      }
      // (d) constructed "Family-Style" PostScript probe.
      try {
        var probe = collapse(family) + '-' + collapse(style || 'Regular');
        fo = firstReal(app.fonts.getFontsByPostScriptName(probe));
        if (fo && foFamilyOk(fo, family)) return { font: fo, postScriptName: fo.postScriptName, approx: null };
      } catch (eD) {}
      // (e)+(f) scan every installed face; may return the same family in a
      // different style as a typeface-preserving fallback.
      try {
        fo = scanAllFonts(family, style, weight);
        if (fo) {
          var foStyle = '';
          try { foStyle = fo.styleName || ''; } catch (eFS) {}
          var wantedN = normName(style || weightToStyle(weight) || 'Regular');
          var approx = null;
          if (wantedN && normName(foStyle) !== wantedN) {
            approx = 'weight/style "' + (style || weightToStyle(weight) || 'Regular') +
              '" of "' + family + '" not installed; used "' + (foStyle || 'default') + '"';
          }
          return { font: fo, postScriptName: fo.postScriptName, approx: approx };
        }
      } catch (eE) {}
    }

    // (g) total miss.
    if (family) { addMissingFont(report, family); noteLayerMissing(family); }
    return miss;
  }

  function firstSolidColor(fills, report, node) {
    if (!fills) return null;
    for (var i = 0; i < fills.length; i++) {
      var p = fills[i];
      if (!p || p.visible === false) continue;
      if (p.type === 'SOLID') return N.normalizeColor(p.color);
      if (p.type && p.type.indexOf('GRADIENT') === 0 && p.stops && p.stops.length) {
        // The first stop is kept as a solid fallback; a gradient text fill is
        // reproduced as a Gradient Overlay layer style (see applyGradientFill).
        return N.normalizeColor(p.stops[0].color);
      }
    }
    return null;
  }

  // Find the gradient paint that fills a text node, if any: the explicit
  // textData.gradientFill, a GRADIENT_* paint in the node text fills, or one on a
  // run's fills (mixed runs can carry the gradient on the dominant run).
  function findTextGradient(data) {
    var grad = data.gradientFill;
    if (!grad && data.fills) {
      for (var i = 0; i < data.fills.length; i++) {
        var p = data.fills[i];
        if (p && p.visible !== false && p.type && p.type.indexOf('GRADIENT') === 0) { grad = p; break; }
      }
    }
    if (!grad) {
      var runs = data.runs || [];
      for (var r = 0; r < runs.length; r++) {
        var fl = runs[r].fills;
        if (!fl) continue;
        for (var k = 0; k < fl.length; k++) {
          if (fl[k] && fl[k].visible !== false && fl[k].type && fl[k].type.indexOf('GRADIENT') === 0) { grad = fl[k]; break; }
        }
        if (grad) break;
      }
    }
    return grad || null;
  }

  // The text layer's content bounds in its own coordinate space (anchor at the
  // layer origin). Prefer sourceRectAtTime for the true glyph extent (multi-line /
  // box text included); fall back to the node transform size.
  function textBounds(layer, node) {
    var t = node.transform || {};
    var w = Math.max(1, t.width || 100), h = Math.max(1, t.height || 40);
    try {
      var comp = layer.containingComp;
      var rect = layer.sourceRectAtTime(comp ? comp.time : 0, false);
      if (rect && rect.width > 0 && rect.height > 0) {
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
    } catch (e) { /* older builds / empty text */ }
    return { left: 0, top: 0, width: w, height: h };
  }

  // Copy the text layer's placement (anchor + position + rotation) onto the
  // gradient shape so its pixels land directly over the glyphs in comp space.
  function matchPlacement(shape, textLayer) {
    try {
      var stf = shape.property('ADBE Transform Group');
      var ttf = textLayer.property('ADBE Transform Group');
      stf.property('ADBE Anchor Point').setValue([0, 0]);
      stf.property('ADBE Position').setValue(ttf.property('ADBE Position').value);
      try { stf.property('ADBE Rotate Z').setValue(ttf.property('ADBE Rotate Z').value); } catch (eR) {}
    } catch (e) { /* leave at default placement */ }
  }

  // ---- underline ------------------------------------------------------------
  // AE has no underline TextDocument property, so an underlined run is reproduced
  // as a sibling shape layer: one open, stroked horizontal segment under each
  // visual baseline (read from td.baselineLocs, AE 13.6+), placed to match the
  // text layer exactly so the layer-local baseline coords land over the glyphs.

  function runUnderlined(run) {
    return !!(run && (run.underline === true || run.textDecoration === 'UNDERLINE'));
  }

  // True when EVERY run is underlined (or there is a single run that is), so the
  // whole text is underlined and every line can be drawn full-width.
  function allRunsUnderlined(runs) {
    if (!runs || !runs.length) return false;
    for (var i = 0; i < runs.length; i++) { if (!runUnderlined(runs[i])) return false; }
    return true;
  }

  function anyRunUnderlined(runs) {
    if (!runs) return false;
    for (var i = 0; i < runs.length; i++) { if (runUnderlined(runs[i])) return true; }
    return false;
  }

  // baselineLocs is a flat float array, 4 floats per VISUAL line, in the text
  // layer's OWN coords: [l0.sx,l0.sy,l0.ex,l0.ey, l1.sx,...]. Empty lines carry a
  // max-float sentinel; skip any quad with |value| > 1e37.
  function baselineLineQuads(td) {
    var out = [];
    var L = null;
    try { L = td.baselineLocs; } catch (e) { return out; }
    if (!L || typeof L.length !== 'number' || L.length < 4) return out;
    for (var i = 0; i + 3 < L.length; i += 4) {
      var sx = L[i], sy = L[i + 1], ex = L[i + 2], ey = L[i + 3];
      if (Math.abs(sx) > 1e37 || Math.abs(sy) > 1e37 ||
          Math.abs(ex) > 1e37 || Math.abs(ey) > 1e37) continue;
      out.push({ sx: sx, sy: sy, ex: ex, ey: ey });
    }
    return out;
  }

  // Add one open, stroked, square-capped segment from (sx,y) to (ex,y) to the
  // shape's vectors group, coloured with [r,g,b] and "width" thick.
  function addUnderlineSegment(vectors, sx, ex, y, rgb, width) {
    var grp = vectors.addProperty('ADBE Vector Group');
    var contents = grp.property('ADBE Vectors Group');
    var shape = new Shape();
    shape.vertices = [[sx, y], [ex, y]];
    shape.inTangents = [[0, 0], [0, 0]];
    shape.outTangents = [[0, 0], [0, 0]];
    shape.closed = false;
    contents.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape').setValue(shape);
    var stroke = contents.addProperty('ADBE Vector Graphic - Stroke');
    try { stroke.property('ADBE Vector Stroke Color').setValue(rgb); } catch (eC) {}
    try { stroke.property('ADBE Vector Stroke Width').setValue(width); } catch (eW) {}
    // Square (projecting) cap so the line covers the full glyph extent. The AE
    // ordinal is 1=butt, 2=round, 3=projecting/square (see paint.jsx capOf).
    try { stroke.property('ADBE Vector Stroke Line Cap').setValue(3); } catch (eL) {}
  }

  // Build the underline sibling. textProp.value is read AFTER all run styling +
  // box sizing + setValue, because baselineLocs shifts with leading / box width /
  // justification. Whole-text underline draws every line full-width; partial /
  // per-run underline draws lines full-width too but flags the x-extent as
  // approximate (the exact per-run sub-range is not measured here). Guarded so a
  // failure degrades to a one-time approximated note.
  function applyUnderline(layer, node, runs, report) {
    if (!anyRunUnderlined(runs)) return false;

    var noteApprox = function (detail) {
      if (report && !report.__underlineNoted) {
        report.__underlineNoted = true;
        R.importer.util.note(report, 'approximated', { name: node.name, detail: detail });
      }
    };

    var comp;
    try { comp = layer.containingComp; } catch (e0) { comp = null; }
    if (!comp) { noteApprox('underline could not be drawn (no containing comp); left without the underline'); return false; }

    var textProp, td;
    try {
      textProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
      td = textProp.value;
    } catch (eTD) { td = null; }
    if (!td) { noteApprox('underline needs the text document (unavailable); left without the underline'); return false; }

    var quads = baselineLineQuads(td);
    if (!quads.length) {
      noteApprox('underline needs baselineLocs (After Effects 13.6+) and a non-empty layout; left without the underline');
      return false;
    }

    // Colour from the first underlined run's fill (fall back to the dominant
    // run / black). fontSize drives the stroke weight + below-baseline offset.
    var colourRun = null, fontSize = 0;
    for (var ri = 0; ri < runs.length; ri++) {
      if (runUnderlined(runs[ri])) { colourRun = runs[ri]; if (runs[ri].fontSize) fontSize = runs[ri].fontSize; break; }
    }
    if (!fontSize) {
      for (var rj = 0; rj < runs.length; rj++) { if (runs[rj].fontSize) { fontSize = runs[rj].fontSize; break; } }
    }
    if (!fontSize) { try { fontSize = td.fontSize || 16; } catch (eFS) { fontSize = 16; } }
    var c = colourRun ? firstSolidColor(colourRun.fills, report, node) : null;
    var rgb = c ? [c.r, c.g, c.b] : [0, 0, 0];
    var width = Math.max(1, fontSize * 0.06);
    // baselineLocs y is the baseline; descenders hang below it, so push the line
    // down by ~0.12*fontSize so it sits clear of the glyphs rather than crossing
    // them. AE comp Y grows downward, so "below" is +.
    var off = fontSize * 0.12;

    var sl;
    try { sl = comp.layers.addShape(); } catch (eAdd) {
      noteApprox('underline shape layer could not be created; left without the underline');
      return false;
    }
    try {
      sl.name = (node.name || 'Text') + ' Underline';
      var vectors = sl.property('ADBE Root Vectors Group');
      for (var q = 0; q < quads.length; q++) {
        var ln = quads[q];
        // Underline a horizontal segment along the line's start..end. The
        // baseline endpoints can carry a tiny slope; use the start y for both so
        // the rule is level (matchPlacement also reproduces any layer rotation).
        addUnderlineSegment(vectors, ln.sx, ln.ex, ln.sy + off, rgb, width);
      }
      matchPlacement(sl, layer);
      // Move with the text if it is re-timed / nudged later.
      try { sl.parent = layer; } catch (eP) {}
    } catch (eBuild) {
      try { sl.remove(); } catch (eRm) {}
      noteApprox('underline could not be drawn; left without the underline');
      return false;
    }

    // Whole-text underline is faithful (full line widths). Partial / per-run
    // underline is approximated: we underline the full line, not the exact run
    // sub-range, so flag the x-extent as approximate. Never silently dropped.
    if (!allRunsUnderlined(runs) && !(node.text && node.text.textDecoration === 'UNDERLINE')) {
      noteApprox('partial underline rebuilt as a generated stroke per visual line; the underlined characters\' exact horizontal extent is approximated to the full line width');
    }
    return true;
  }

  // Gradient text fill: AE has no native gradient TEXT fill. The high-fidelity
  // result is the standard AE technique -- a native, fully editable gradient SHAPE
  // matted by the text -- so the gradient shows only through the glyphs while the
  // text layer stays editable (editing it reshapes the matte). The gradient uses
  // the SAME proven path as shapes (paint.applyFills + the .ffx stop trick), so
  // the stops are real and editable, unlike a Gradient Overlay layer style whose
  // stops are not scriptable. The first stop stays on the text as a solid fallback;
  // if any step fails we fall back to the layer-style overlay so the import never
  // breaks.
  function applyGradientFill(layer, node, report) {
    var data = node.text || {};
    var grad = findTextGradient(data);
    if (!grad) return false;
    if (R.importer.mask && R.importer.mask.wireMatte && R.importer.paint && R.importer.paint.applyFills) {
      try {
        if (buildGradientMatte(layer, node, grad, report)) return true;
      } catch (e) { /* fall through to the layer-style overlay */ }
    }
    return overlayGradientFill(node, grad, report);
  }

  // Build a native gradient shape sized to the text bounds and wire the text layer
  // as its ALPHA track matte. Returns true on success.
  function buildGradientMatte(layer, node, grad, report) {
    var comp;
    try { comp = layer.containingComp; } catch (e0) { return false; }
    if (!comp) return false;

    var b = textBounds(layer, node);
    var shape = comp.layers.addShape();
    shape.name = (node.name || 'Text') + ' Gradient';
    try {
      var contents = shape.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').property('ADBE Vectors Group');
      var rect = contents.addProperty('ADBE Vector Shape - Rect');
      rect.property('ADBE Vector Rect Size').setValue([b.width, b.height]);
      rect.property('ADBE Vector Rect Position').setValue([b.left + b.width / 2, b.top + b.height / 2]);

      // Synthetic node so the proven fill path treats the gradient exactly like a
      // shape fill: real native stops via the .ffx trick, Ramp/4-colour fallback
      // otherwise. The IR gradient handles are in node-local space (origin at the
      // text node top-left); the rect sits at the sourceRect origin (b.left,b.top),
      // which is non-zero for point/centered/right text. Shift the handles by
      // (b.left,b.top) so the ramp axis lines up with the glyph box, not contents-
      // origin -- otherwise the gradient is translated off the text along its axis.
      var gradFill = grad;
      if (grad.gradientHandles && grad.gradientHandles.length) {
        var shifted = [];
        for (var hi = 0; hi < grad.gradientHandles.length; hi++) {
          var gh = grad.gradientHandles[hi];
          shifted.push([gh[0] + b.left, gh[1] + b.top]);
        }
        gradFill = {};
        for (var key in grad) { if (grad.hasOwnProperty(key)) gradFill[key] = grad[key]; }
        gradFill.gradientHandles = shifted;
      }
      var gradNode = { name: shape.name, transform: { width: b.width, height: b.height }, fills: [gradFill] };
      R.importer.paint.applyFills(contents, gradNode, report);
      if (R.importer.paint.gradientEffect) R.importer.paint.gradientEffect(shape, gradNode, report);

      matchPlacement(shape, layer);

      var alpha;
      try { alpha = TrackMatteType.ALPHA; } catch (eA) { alpha = null; }
      if (!R.importer.mask.wireMatte(layer, shape, alpha)) {
        try { shape.remove(); } catch (eRm) {}
        return false;
      }
    } catch (e) {
      try { shape.remove(); } catch (eRm2) {}
      return false;
    }
    if (!report.__gradTextMatteNoted) {
      report.__gradTextMatteNoted = true;
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'gradient text rebuilt as a native editable gradient shape matted by the (now hidden, still editable) text layer -- the standard After Effects technique; editing the text reshapes the matte' });
    }
    return true;
  }

  // Last-resort fallback: a Gradient Overlay layer style. Layer-style gradient
  // STOPS are not scriptable, so the overlay lands geometry/blend/angle natively
  // while colours fall back to AE's default ramp -- a deliberately partial
  // reconstruction, used only when the matte path could not be built.
  function overlayGradientFill(node, grad, report) {
    if (!R.importer.layerStyle || !R.importer.layerStyle.gradientPaintToOverlay) return false;
    var ls = R.importer.layerStyle.gradientPaintToOverlay(grad);
    if (!ls) return false;
    var existing = node.layerStyles || [];
    for (var e = 0; e < existing.length; e++) { if (existing[e] && existing[e].type === 'GRADIENT_OVERLAY') return true; }
    node.layerStyles = existing.concat([ls]);
    R.importer.util.note(report, 'approximated', { name: node.name, detail: 'gradient text fill applied as a Gradient Overlay layer style; stops are not scriptable so colours use AE\'s default ramp (first stop kept as a solid fallback)' });
    return true;
  }

  // Apply a run's style to a target that is either the whole-layer TextDocument
  // or a CharacterRange. Every set is guarded because the two share most, but not
  // all, properties across AE versions.
  function applyStyle(target, run, report, node) {
    if (run.fontSize) { try { target.fontSize = run.fontSize; } catch (e) {} }

    // Resolve to an installed face. resolveFont never hands back a substitute,
    // so a null postScriptName means the typeface is genuinely missing -> we keep
    // AE's current font and rely on faux bold/italic + the missing-font report.
    var res = resolveFont(run.fontFamily, run.fontStyle, run.postScriptName, run.fontWeight, report);
    var wantBoldFace = (typeof run.fontWeight === 'number' && run.fontWeight >= 600) ||
      (run.fontStyle && /bold/i.test(run.fontStyle));
    var wantItalicFace = run.fontStyle && /(italic|oblique)/i.test(run.fontStyle);
    if (res.postScriptName) {
      // Prefer FontObject (AE 24.0+, substitution-safe) where available; else set
      // the PostScript-name string. Then READ BACK target.font -- if AE did not
      // honour what we asked, treat the family as missing so the report flags it.
      try {
        if (res.font && ('fontObject' in target)) { target.fontObject = res.font; }
        else { target.font = res.postScriptName; }
      } catch (e2) {
        try { target.font = res.postScriptName; } catch (e2b) {}
      }
      var got = null;
      try { got = target.font; } catch (eR) { got = null; }
      if (got && got !== res.postScriptName) {
        if (run.fontFamily) { addMissingFont(report, run.fontFamily); noteLayerMissing(run.fontFamily); }
      } else if (res.approx && report && !report.__fontApproxNoted) {
        report.__fontApproxNoted = true;
        R.importer.util.note(report, 'approximated', { name: node.name, detail: res.approx });
      }
    }
    // Faux fallback: if the exact bold/italic face was NOT found (no real
    // PostScript name) but a base family did resolve elsewhere, slant/embolden so
    // the run still reads as bold/italic instead of plain. Also applied when the
    // run carries explicit faux flags from the exporter.
    var resolvedExact = !!res.postScriptName && !res.approx;
    if (run.fauxBold || (wantBoldFace && !resolvedExact)) { try { target.fauxBold = true; } catch (e7) {} }
    if (run.fauxItalic || (wantItalicFace && !resolvedExact)) { try { target.fauxItalic = true; } catch (e8) {} }

    var c = firstSolidColor(run.fills, report, node);
    if (c) { try { target.applyFill = true; target.fillColor = [c.r, c.g, c.b]; } catch (e3) {} }
    if (typeof run.tracking === 'number') { try { target.tracking = run.tracking; } catch (e4) {} }
    if (run.lineHeight) {
      var lh = N.leadingFromLineHeight(run.lineHeight, run.fontSize || 12);
      try {
        if (lh.auto) { target.autoLeading = true; }
        else { target.autoLeading = false; target.leading = lh.leading; }
      } catch (e5) {}
    }
    if (typeof run.baselineShift === 'number') { try { target.baselineShift = run.baselineShift; } catch (e6) {} }
    // CAPS: allCaps/smallCaps are READ-ONLY in AE scripting and silently no-op.
    // fontCapsOption (FontCapsOption enum, AE 24.0+) is the writable equivalent.
    // Feature-detect the enum; on older AE flag the approximation once.
    if (run.textCase === 'UPPER' || run.textCase === 'SMALL_CAPS' || run.textCase === 'SMALL_CAPS_FORCED') {
      var capsSet = false;
      try {
        if (typeof FontCapsOption !== 'undefined') {
          target.fontCapsOption = (run.textCase === 'UPPER')
            ? FontCapsOption.FONT_ALL_CAPS : FontCapsOption.FONT_SMALL_CAPS;
          capsSet = true;
        }
      } catch (e9) {}
      if (!capsSet && report && !report.__capsNoted) {
        report.__capsNoted = true;
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'all-caps/small-caps needs After Effects 24.0+ (FontCapsOption); left as authored' });
      }
    }

    // Horizontal/vertical scale (percent). Only present on newer TextDocument /
    // CharacterRange builds, so each is feature-detected.
    if (typeof run.horizontalScale === 'number') { try { target.horizontalScale = run.horizontalScale; } catch (e11) {} }
    if (typeof run.verticalScale === 'number') { try { target.verticalScale = run.verticalScale; } catch (e12) {} }

    // Underline is reproduced as a generated stroked shape sibling layer (AE has
    // no underline TextDocument property); see applyUnderline, called from
    // buildText after placeText so the layout / transform is final. Strikethrough
    // has no AE scripting equivalent either, so it is still flagged once.
    var decoStrike = run.lineThrough === true || run.textDecoration === 'STRIKETHROUGH';
    if (decoStrike && report && !report.__strikeNoted) {
      report.__strikeNoted = true;
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'strikethrough text has no After Effects scripting equivalent; left without the strike line' });
    }
    // textCase LOWER/TITLE have no AE TextDocument equivalent; flag once so the
    // approximation is visible rather than silently dropped.
    if ((run.textCase === 'LOWER' || run.textCase === 'TITLE') && report && !report.__textCaseNoted) {
      report.__textCaseNoted = true;
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'lowercase/title-case text case has no After Effects equivalent; left as authored' });
    }
  }

  // Paragraph-level styling (spacing + indents). These live on the whole-layer
  // TextDocument and, on AE 24.3+, on CharacterRange/ParagraphRange. Every set is
  // feature-detected so older builds that lack the property never throw.
  function applyParagraph(target, data) {
    if (!data) return;
    // Figma paragraphSpacing is space AFTER each paragraph, so it routes to the
    // 'after' slot; 'before' comes only from an explicit spaceBefore.
    var before = (typeof data.spaceBefore === 'number') ? data.spaceBefore : null;
    var after = (data.spaceAfter != null) ? data.spaceAfter
      : (typeof data.paragraphSpacing === 'number' ? data.paragraphSpacing : null);
    if (before != null) { try { target.spaceBefore = before; } catch (e1) {} }
    if (after != null) { try { target.spaceAfter = after; } catch (e2) {} }
    if (typeof data.firstLineIndent === 'number') { try { target.firstLineIndent = data.firstLineIndent; } catch (e3) {} }
    else if (typeof data.paragraphIndent === 'number') { try { target.firstLineIndent = data.paragraphIndent; } catch (e3b) {} }
    // Left/right indent: AE TextDocument uses startIndent/endIndent. leftMargin/
    // rightMargin are NOT real AE properties, so they are not written.
    if (typeof data.indentLeft === 'number') { try { target.startIndent = data.indentLeft; } catch (e4) {} }
    if (typeof data.indentRight === 'number') { try { target.endIndent = data.indentRight; } catch (e5) {} }
  }

  // Text stroke comes from the node-level stroke (Figma/Illustrator both carry
  // a stroke on text). AE text strokes are whole-layer.
  function applyTextStroke(td, node, report) {
    var st = node.stroke;
    if (!st || !st.weight || !st.paints || !st.paints.length) return;
    var c = firstSolidColor(st.paints, report, node);
    if (!c) return;
    try {
      td.applyStroke = true;
      td.strokeColor = [c.r, c.g, c.b];
      td.strokeWidth = st.weight;
      td.strokeOverFill = (st.align !== 'OUTSIDE');
    } catch (e) { /* older builds */ }
  }

  function justify(td, align) {
    try {
      if (align === 'CENTER') td.justification = ParagraphJustification.CENTER_JUSTIFY;
      else if (align === 'RIGHT') td.justification = ParagraphJustification.RIGHT_JUSTIFY;
      else if (align === 'JUSTIFIED') td.justification = ParagraphJustification.FULL_JUSTIFY_LASTLINE_LEFT;
      else td.justification = ParagraphJustification.LEFT_JUSTIFY;
    } catch (e) {}
  }

  function dominantRun(runs, chars) {
    var best = null, bestLen = -1;
    for (var i = 0; i < runs.length; i++) {
      var len = (runs[i].end || 0) - (runs[i].start || 0);
      if (len > bestLen) { bestLen = len; best = runs[i]; }
    }
    return best || { start: 0, end: chars.length, characters: chars };
  }

  function applyRuns(textProp, runs, report, node) {
    var applied = 0;
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      try {
        var cr = textProp.value.characterRange(r.start, r.end);
        applyStyle(cr, r, report, node);
        applied++;
      } catch (e) { /* range unsupported on this build */ }
    }
    return applied;
  }

  function placeText(layer, node, isBox, fontSize) {
    var t = node.transform || {};
    var tr = layer.property('ADBE Transform Group');
    tr.property('ADBE Anchor Point').setValue([0, 0]);
    var x = t.x || 0, y = t.y || 0;
    // Box text starts at the box top-left; point text is anchored on the first
    // baseline, so drop it by roughly the ascent.
    if (!isBox) y = y + (fontSize || 16) * 0.8;
    tr.property('ADBE Position').setValue([x, y]);
    if (t.matrix && t.matrix.length === 6) {
      var d = N.decomposeMatrix(t.matrix);
      if (Math.abs(d.rotationDeg) > 0.001) { try { tr.property('ADBE Rotate Z').setValue(d.rotationDeg); } catch (e) {} }
    } else if (t.rotation) {
      try { tr.property('ADBE Rotate Z').setValue(t.rotation); } catch (e2) {}
    }
    if (typeof node.opacity === 'number' && node.opacity < 1) tr.property('ADBE Opacity').setValue(node.opacity * 100);
    var be = R.importer.transform.blendEnum(node.blendMode);
    if (be != null) { try { layer.blendingMode = be; } catch (e3) {} }
  }

  function buildText(comp, node, report) {
    var data = node.text;
    if (!data || typeof data.characters !== 'string') {
      R.importer.util.note(report, 'skipped', { name: node.name, type: 'TEXT', reason: 'no text content' });
      return null;
    }
    var chars = data.characters;
    layerMissing = [];
    var content = chars.length ? chars : ' ';

    // Decide box vs point BEFORE creating the layer: TextDocument.boxText is
    // READ-ONLY, so the box-ness must come from how the layer is created
    // (addBoxText vs addText), not a property write. Prefer the source box size;
    // fall back to the node transform. WIDTH_AND_HEIGHT auto-resize is point text.
    var t = node.transform || {};
    var w, h;
    if (data.boxSize && data.boxSize.length === 2) {
      w = Math.max(1, data.boxSize[0]); h = Math.max(1, data.boxSize[1]);
    } else {
      w = Math.max(1, t.width || 100); h = Math.max(1, t.height || 40);
    }
    var wantBox = data.autoResize !== 'WIDTH_AND_HEIGHT';

    var layer = null;
    if (wantBox) {
      // addBoxText is AE 13.6+, but guard anyway and fall back to point text on
      // older/odd builds so the import never fails.
      try { layer = comp.layers.addBoxText([w, h], content); } catch (eBox) { layer = null; }
    }
    if (!layer) {
      layer = comp.layers.addText(content);
      if (wantBox && /\n/.test(chars)) {
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'paragraph box not available; text placed as point text' });
      }
    }
    layer.name = node.name || (chars.substr(0, 16)) || 'Text';

    var textProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var td = textProp.value;

    var runs = (data.runs && data.runs.length) ? data.runs : [{ start: 0, end: chars.length, characters: chars }];
    var base = dominantRun(runs, chars);
    applyStyle(td, base, report, node);
    applyParagraph(td, data);
    applyTextStroke(td, node, report);
    justify(td, data.textAlignHorizontal);

    // Read back box-ness from the actual TextDocument (read-only, but readable).
    var isBox = false;
    try { isBox = textProp.value.boxText === true; } catch (e3) {}

    // Vertical alignment for box text: boxVerticalAlignment / BoxVerticalAlignment
    // is AE 24.6+ and box-text only. Feature-detect; flag once if unavailable and
    // a non-default (non-TOP) alignment was requested.
    if (isBox && data.textAlignVertical && data.textAlignVertical !== 'TOP') {
      var vaSet = false;
      try {
        if (typeof BoxVerticalAlignment !== 'undefined') {
          td.boxVerticalAlignment = (data.textAlignVertical === 'BOTTOM')
            ? BoxVerticalAlignment.BOTTOM : BoxVerticalAlignment.CENTER;
          vaSet = true;
        }
      } catch (eVA) {}
      if (!vaSet && report && !report.__vAlignNoted) {
        report.__vAlignNoted = true;
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'vertical text alignment needs After Effects 24.6+ (BoxVerticalAlignment); left top-aligned' });
      }
    }

    textProp.setValue(td);

    if (runs.length > 1) {
      if (supportsRanges()) {
        applyRuns(textProp, runs, report, node);
      } else {
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'mixed text styling needs After Effects 24.3+; used the dominant style' });
      }
    }

    placeText(layer, node, isBox, base.fontSize);
    // Tag the layer with any unresolved family so the resolver can find it.
    if (layerMissing.length) {
      var tags = '';
      for (var mi = 0; mi < layerMissing.length; mi++) tags += '\nrb-font:' + layerMissing[mi];
      try { layer.comment = (layer.comment || '') + tags; } catch (e) {}
    }
    R.importer.effect.apply(layer, node, report);
    R.importer.layerStyle.collect(layer, node, report);
    // Underline (no native AE underline): rebuild as a generated stroked shape
    // sibling, one segment per visual baseline. Done after placeText so the
    // transform (and thus baselineLocs, which we read back) is final.
    try { applyUnderline(layer, node, runs, report); } catch (eUnd) { /* underline is best-effort */ }
    // Gradient text fill (no native AE gradient TEXT fill): rebuild as a native
    // editable gradient shape matted by the text layer. Done after effects/styles
    // so the layer's transform is final before its placement is mirrored, and the
    // first-stop solid stays on the text as a safe fallback.
    applyGradientFill(layer, node, report);
    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.TEXT = buildText;
})();
