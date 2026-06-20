/*
 * Rebound host, Text Break (split a text layer into per-piece text layers).
 *
 * For every selected TextLayer we read its source string from the Text Document,
 * split it into pieces by mode (lines on carriage returns and newlines, words on
 * spaces keeping non-empty, characters as each non-space character), then for
 * each piece duplicate the source, overwrite the duplicate's text document with
 * that piece, and name the layer after it. Exact per-piece horizontal offset
 * needs font metrics, so duplicates are left stacked at the source position for
 * the user to reposition. With Delete original on, each split source is removed.
 * Non-text layers are skipped and their names returned.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var TEXT_PROPS = 'ADBE Text Properties';
  var TEXT_DOCUMENT = 'ADBE Text Document';

  // The source document property for a text layer (throws if not addressable).
  function documentOf(layer) {
    return layer.property(TEXT_PROPS).property(TEXT_DOCUMENT);
  }

  // Split a source string into pieces by mode.
  function piecesFor(text, mode) {
    var out = [];
    var i;
    if (mode === 'lines') {
      // Split on both carriage returns and newlines; keep every line, even blanks.
      var raw = text.split(/\r\n|\r|\n/);
      for (i = 0; i < raw.length; i++) out.push(raw[i]);
      return out;
    }
    if (mode === 'characters') {
      for (i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ch !== ' ' && ch !== '\r' && ch !== '\n' && ch !== '\t') out.push(ch);
      }
      return out;
    }
    // words, split on spaces, keep non-empty pieces.
    var parts = text.split(' ');
    for (i = 0; i < parts.length; i++) {
      if (parts[i] !== '') out.push(parts[i]);
    }
    return out;
  }

  // Overwrite a duplicated text layer's string while preserving its formatting.
  function setText(layer, piece) {
    var doc = documentOf(layer);
    var td = doc.value;
    td.text = piece;
    doc.setValue(td);
  }

  // A safe layer name for a piece (collapse newlines, never empty).
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
    var created = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var source = layers[i];
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

      var pieces = piecesFor(text, mode);
      if (!pieces.length) {
        skipped.push(source.name + ' (empty)');
        continue;
      }

      for (var p = 0; p < pieces.length; p++) {
        var dup = source.duplicate();
        setText(dup, pieces[p]);
        dup.name = nameFor(pieces[p]);
        created++;
      }

      if (deleteOriginal) {
        source.remove();
      }
    }

    return { created: created, skipped: skipped };
  }

  R.register('textbreak.apply', apply, 'Rebound: Text Break');
})();