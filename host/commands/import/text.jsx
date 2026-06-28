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

  function addMissingFont(report, family) {
    for (var i = 0; i < report.missingFonts.length; i++) {
      if (report.missingFonts[i] === family) return;
    }
    report.missingFonts.push(family);
  }

  // Resolve family + style to a PostScript name AE can set. Prefer an explicit
  // PostScript name from the exporter; otherwise ask the Fonts API (AE 24+).
  function resolveFont(family, style, ps, report) {
    if (ps) return ps;
    if (!family) return null;
    try {
      if (app.fonts && app.fonts.getFontsByFamilyNameAndStyleName) {
        var fonts = app.fonts.getFontsByFamilyNameAndStyleName(family, style || 'Regular');
        if (fonts && fonts.length) return fonts[0].postScriptName;
        fonts = app.fonts.getFontsByFamilyNameAndStyleName(family, 'Regular');
        if (fonts && fonts.length) return fonts[0].postScriptName;
      }
    } catch (e) { /* older AE, or family unavailable */ }
    addMissingFont(report, family);
    noteLayerMissing(family);
    return null;
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
    var ps = resolveFont(run.fontFamily, run.fontStyle, run.postScriptName, report);
    if (ps) { try { target.font = ps; } catch (e2) {} }
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
    if (run.fauxBold) { try { target.fauxBold = true; } catch (e7) {} }
    if (run.fauxItalic) { try { target.fauxItalic = true; } catch (e8) {} }
    if (run.textCase === 'UPPER') { try { target.allCaps = true; } catch (e9) {} }
    if (run.textCase === 'SMALL_CAPS' || run.textCase === 'SMALL_CAPS_FORCED') { try { target.smallCaps = true; } catch (e10) {} }

    // Horizontal/vertical scale (percent). Only present on newer TextDocument /
    // CharacterRange builds, so each is feature-detected.
    if (typeof run.horizontalScale === 'number') { try { target.horizontalScale = run.horizontalScale; } catch (e11) {} }
    if (typeof run.verticalScale === 'number') { try { target.verticalScale = run.verticalScale; } catch (e12) {} }

    // Underline: AE 24.3+ exposes applyUnderline as a boolean attribute. STRIKE-
    // THROUGH is not exposed by AE scripting on any build, so it is flagged once
    // as an approximation rather than written to a property that does not exist.
    var decoUnderline = run.underline === true || run.textDecoration === 'UNDERLINE';
    var decoStrike = run.lineThrough === true || run.textDecoration === 'STRIKETHROUGH';
    if (decoUnderline) {
      try { target.applyUnderline = true; } catch (e13) {}
    }
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
    var before = (typeof data.spaceBefore === 'number') ? data.spaceBefore
      : (typeof data.paragraphSpacing === 'number' ? data.paragraphSpacing : null);
    var after = (typeof data.spaceAfter === 'number') ? data.spaceAfter : null;
    if (before != null) { try { target.spaceBefore = before; } catch (e1) {} }
    if (after != null) { try { target.spaceAfter = after; } catch (e2) {} }
    if (typeof data.firstLineIndent === 'number') { try { target.firstLineIndent = data.firstLineIndent; } catch (e3) {} }
    else if (typeof data.paragraphIndent === 'number') { try { target.firstLineIndent = data.paragraphIndent; } catch (e3b) {} }
    // Left/right indent: AE 24.3+ TextDocument uses startIndent/endIndent;
    // leftMargin/rightMargin is the alternate spelling on some builds. Try both
    // (guarded) so whichever the running AE accepts takes effect, and there is no
    // longer a leftIndent/rightIndent write, which is not a real AE property.
    if (typeof data.indentLeft === 'number') {
      try { target.startIndent = data.indentLeft; } catch (e4) {}
      try { target.leftMargin = data.indentLeft; } catch (e4b) {}
    }
    if (typeof data.indentRight === 'number') {
      try { target.endIndent = data.indentRight; } catch (e5) {}
      try { target.rightMargin = data.indentRight; } catch (e5b) {}
    }
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
    var layer = comp.layers.addText(chars.length ? chars : ' ');
    layer.name = node.name || (chars.substr(0, 16)) || 'Text';

    var textProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var td = textProp.value;

    var runs = (data.runs && data.runs.length) ? data.runs : [{ start: 0, end: chars.length, characters: chars }];
    var base = dominantRun(runs, chars);
    applyStyle(td, base, report, node);
    applyParagraph(td, data);
    applyTextStroke(td, node, report);
    justify(td, data.textAlignHorizontal);

    // Try to make it a box so wrapped paragraphs match the source width.
    var t = node.transform || {};
    var w = Math.max(1, t.width || 100), h = Math.max(1, t.height || 40);
    var wantBox = data.autoResize !== 'WIDTH_AND_HEIGHT';
    if (wantBox) {
      try { td.boxText = true; } catch (e) {}
      try { td.boxTextSize = [w, h]; } catch (e2) {}
    }

    textProp.setValue(td);

    var isBox = false;
    try { isBox = textProp.value.boxText === true; } catch (e3) {}

    if (runs.length > 1) {
      if (supportsRanges()) {
        applyRuns(textProp, runs, report, node);
      } else {
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'mixed text styling needs After Effects 24.3+; used the dominant style' });
      }
    }
    if (!isBox && wantBox && /\n/.test(chars)) {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'paragraph box not available; text placed as point text' });
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
