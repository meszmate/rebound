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
        R.importer.util.note(report, 'approximated', { name: node.name, detail: 'gradient text fill uses the first stop colour' });
        return N.normalizeColor(p.stops[0].color);
      }
    }
    return null;
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
    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.TEXT = buildText;
})();
