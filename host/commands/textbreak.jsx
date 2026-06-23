/*
 * Rebound host, Text Break (split a text layer into per-piece text layers).
 *
 * For every selected TextLayer we read its source string and split it into
 * pieces by mode (lines, words, characters, or a custom set of pieces the panel
 * sends). Each piece becomes a duplicate whose text is overwritten.
 *
 * Crucially, when `position` is on (default) each piece keeps its EXACT original
 * place: we measure where the piece sits inside the source with sourceRectAtTime
 * (prefix widths, a sentinel char so trailing spaces still count, the line's
 * justification offset, and a measured leading for line stacking), then shift the
 * duplicate's ANCHOR POINT by the layout offset. Because the duplicate inherits
 * the source's position/scale/rotation/parenting, shifting only the anchor makes
 * the piece composite identically to the original for ANY transform (the mapping
 * is an exact vector identity), so the broken-apart text looks the same as before
 * and every piece is an independent, animatable layer.
 *
 * Mixed per-character styling in one layer is flattened when the text is
 * overwritten (a scripting-API limit); single-style layers are exact.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var TEXT_PROPS = 'ADBE Text Properties';
  var TEXT_DOCUMENT = 'ADBE Text Document';
  var XFORM = 'ADBE Transform Group';
  var ANCHOR = 'ADBE Anchor Point';
  var SENTINEL = '.'; // a stable, descender-free char so trailing spaces measure

  function documentOf(layer) {
    return layer.property(TEXT_PROPS).property(TEXT_DOCUMENT);
  }

  // Overwrite a text layer's string, preserving all other formatting.
  function setTextStr(layer, s) {
    var d = documentOf(layer);
    var td = d.value;
    td.text = s;
    d.setValue(td);
  }

  // Lines of a string with their original [start, end) indices, handling \r, \n
  // and \r\n. AE stores returns as \r; we accept all three.
  function splitLines(text) {
    var lines = [];
    var s = 0, i = 0, n = text.length;
    while (i <= n) {
      var c = i < n ? text.charAt(i) : '';
      if (i === n || c === '\r' || c === '\n') {
        lines.push({ start: s, end: i, text: text.substring(s, i) });
        if (c === '\r' && i + 1 < n && text.charAt(i + 1) === '\n') i++;
        s = i + 1;
      }
      i++;
    }
    return lines;
  }

  function isSpace(c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n'; }

  // Resolve a mode into [start, end) index ranges over the full text.
  function rangesFor(text, lines, mode, pieces) {
    var out = [], i;
    if (mode === 'lines') {
      for (i = 0; i < lines.length; i++) out.push({ s: lines[i].start, e: lines[i].end });
      return out;
    }
    if (mode === 'characters') {
      for (i = 0; i < text.length; i++) {
        if (isSpace(text.charAt(i))) continue;
        out.push({ s: i, e: i + 1 });
      }
      return out;
    }
    if (mode === 'custom' && pieces && pieces.length) {
      // Map each user piece to its next occurrence in the source so positions
      // stay exact; unmatched pieces are skipped.
      var cursor = 0;
      for (i = 0; i < pieces.length; i++) {
        var P = pieces[i];
        if (P === '') continue;
        var idx = text.indexOf(P, cursor);
        if (idx < 0) continue;
        out.push({ s: idx, e: idx + P.length });
        cursor = idx + P.length;
      }
      return out;
    }
    // words: runs of non-space.
    i = 0;
    while (i < text.length) {
      if (isSpace(text.charAt(i))) { i++; continue; }
      var st = i;
      while (i < text.length && !isSpace(text.charAt(i))) i++;
      out.push({ s: st, e: i });
    }
    return out;
  }

  function lineInfoAt(lines, idx) {
    for (var i = 0; i < lines.length; i++) {
      if (idx >= lines[i].start && idx <= lines[i].end) {
        return { index: i, start: lines[i].start, text: lines[i].text };
      }
    }
    var last = lines[lines.length - 1];
    return { index: lines.length - 1, start: last.start, text: last.text };
  }

  function rectAt(layer, t) { return layer.sourceRectAtTime(t, false); }

  // Width of a string measured on `meas`, with a sentinel so trailing/leading
  // spaces are counted (sourceRectAtTime otherwise clamps to ink).
  function safeWidth(meas, s, t) {
    setTextStr(meas, s + SENTINEL);
    var w1 = rectAt(meas, t).width;
    setTextStr(meas, SENTINEL);
    var w0 = rectAt(meas, t).width;
    return w1 - w0;
  }

  // How a line is offset within the text block: 0 = left, 0.5 = center, 1 =
  // right. Full-justify is treated as left. Used so shorter lines in centered or
  // right-aligned text are placed correctly, not measured in isolation.
  function justificationFactor(doc) {
    try {
      var j = doc.justification;
      if (j === ParagraphJustification.CENTER_JUSTIFY) return 0.5;
      if (j === ParagraphJustification.RIGHT_JUSTIFY) return 1;
    } catch (e) {}
    return 0;
  }

  // Line-to-line distance, measured (honors the doc's leading / auto leading).
  function measureLeading(meas, fontSize, t) {
    setTextStr(meas, 'X');
    var h1 = rectAt(meas, t).height;
    setTextStr(meas, 'X\rX');
    var h2 = rectAt(meas, t).height;
    var lead = h2 - h1;
    if (!(lead > 0)) lead = fontSize * 1.2;
    return lead;
  }

  function nameFor(piece) {
    var name = piece.replace(/[\r\n\t]+/g, ' ');
    if (name === '') name = ' ';
    return name;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) {
      throw new Error('Select one or more text layers to break.');
    }

    var mode = (args && args.mode) ? args.mode : 'lines';
    var deleteOriginal = !!(args && args.deleteOriginal);
    var doPosition = !args || args.position !== false; // default true
    var customPieces = (args && args.pieces) || null;
    var t = comp.time;
    var created = 0;
    var skipped = [];

    for (var li = 0; li < layers.length; li++) {
      var source = layers[li];
      if (!(source instanceof TextLayer)) {
        skipped.push(source.name + ' (not a text layer)');
        continue;
      }

      var text;
      try {
        text = documentOf(source).value.text;
      } catch (e) {
        skipped.push(source.name + ' (no text)');
        continue;
      }

      var lines = splitLines(text);
      var rangesAll = rangesFor(text, lines, mode, customPieces);
      var ranges = [];
      for (var r = 0; r < rangesAll.length; r++) if (rangesAll[r].e > rangesAll[r].s) ranges.push(rangesAll[r]);
      if (!ranges.length) {
        skipped.push(source.name + ' (empty)');
        continue;
      }

      // Capture transform + layout from the un-mutated source.
      var anchorVal = source.property(XFORM).property(ANCHOR).value;
      var doc0 = documentOf(source).value;
      var fullRect = rectAt(source, t);

      var meas = null, leading = 0, blockWidth = 0, justFactor = 0;
      var lineWidths = [];
      if (doPosition) {
        meas = source.duplicate();
        leading = measureLeading(meas, doc0.fontSize, t);
        justFactor = justificationFactor(doc0);
        // Each line's width (and the widest = the block width) so center/right
        // justified lines can be offset correctly.
        for (var lw = 0; lw < lines.length; lw++) {
          var w = lines[lw].text.length ? safeWidth(meas, lines[lw].text, t) : 0;
          lineWidths.push(w);
          if (w > blockWidth) blockWidth = w;
        }
      }

      try {
        for (var k = 0; k < ranges.length; k++) {
          var rg = ranges[k];
          var pieceText = text.substring(rg.s, rg.e);
          var dup = source.duplicate();
          setTextStr(dup, pieceText);
          dup.name = nameFor(pieceText);
          created++;

          if (doPosition && meas) {
            var info = lineInfoAt(lines, rg.s);
            var prefix = info.text.substring(0, rg.s - info.start);
            // Horizontal: the line's justified left, plus the prefix advance.
            var lineLeft = fullRect.left + (blockWidth - lineWidths[info.index]) * justFactor;
            var pieceLeft = lineLeft + safeWidth(meas, prefix, t);
            var dupRect = rectAt(dup, t);
            // Vertical: pure baseline stacking. The glyph's offset from its
            // baseline is identical in the piece and the source, so it cancels;
            // only the line index * leading remains. (Using fullRect.top here
            // would add a glyph-dependent error.)
            var na = [anchorVal[0] + (dupRect.left - pieceLeft), anchorVal[1] - info.index * leading];
            if (anchorVal.length > 2) na.push(anchorVal[2]);
            try { dup.property(XFORM).property(ANCHOR).setValue(na); } catch (e3) {}
          }
        }
      } finally {
        if (meas) meas.remove();
      }
      if (deleteOriginal) source.remove();
    }

    return { created: created, skipped: skipped };
  }

  // Return the source string of each selected text layer, so the panel can
  // prefill the custom-split editor.
  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    var texts = [];
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      if (L instanceof TextLayer) {
        try { texts.push({ name: L.name, text: documentOf(L).value.text }); } catch (e) {}
      }
    }
    return { texts: texts };
  }

  R.register('textbreak.apply', apply, 'Rebound: Text Break');
  R.register('textbreak.read', read, 'Rebound: Read Text');
})();
