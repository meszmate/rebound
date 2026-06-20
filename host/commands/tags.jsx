/*
 * Rebound host, Tags (mark layers with reusable name tags and select by them).
 *
 * Tags live in each layer's .comment as space-separated tokens, so they ride
 * inside the saved project and survive round-trips. Every Rebound tag is
 * namespaced with a "#rb:" prefix (e.g. #rb:hero) so Clear only ever removes
 * our own tokens and never touches a user's own comment notes like "#3 of 5".
 * We match whole tokens (never substrings) so #rb:foo never trips on #rb:foobar.
 * Apply stamps the token (and an optional label color), Select selects every
 * tagged layer in the comp, and Clear strips our tokens out of the selection.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // Namespace for Rebound's own tokens, so Clear can tell them apart from a
  // user's free-form comment text.
  var PREFIX = '#rb:';

  // Reduce a free-form tag string to a bare token (no '#', no ':', no spaces).
  function normalizeTag(raw) {
    var s = raw == null ? '' : ('' + raw);
    // Trim surrounding whitespace.
    s = s.replace(/^\s+/, '').replace(/\s+$/, '');
    // Drop any leading '#', strip our namespace separator, then collapse inner
    // whitespace to single hyphens so a tag stays one whitespace-delimited token.
    s = s.replace(/^#+/, '');
    s = s.replace(/:/g, '-');
    s = s.replace(/\s+/g, '-');
    return s;
  }

  // The stored token for a normalized tag.
  function tokenFor(tag) {
    return PREFIX + tag;
  }

  // Split a comment into its whitespace-delimited tokens.
  function tokensOf(comment) {
    var s = comment == null ? '' : ('' + comment);
    s = s.replace(/^\s+/, '').replace(/\s+$/, '');
    if (s === '') return [];
    return s.split(/\s+/);
  }

  // Does this comment carry the exact #rb:tag token?
  function hasTag(comment, tag) {
    var want = tokenFor(tag);
    var toks = tokensOf(comment);
    for (var i = 0; i < toks.length; i++) {
      if (toks[i] === want) return true;
    }
    return false;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more layers to tag.');

    var tag = normalizeTag(args && args.tag);
    if (tag === '') throw new Error('Enter a tag name.');

    var label = (args && args.label != null) ? Math.round(args.label) : 0;

    var tagged = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var comment = layer.comment;
      if (!hasTag(comment, tag)) {
        var token = tokenFor(tag);
        layer.comment = (comment && ('' + comment).length) ? (comment + ' ' + token) : token;
      }
      if (label >= 1 && label <= 16) {
        layer.label = label;
      }
      tagged++;
    }

    return { tagged: tagged };
  }

  // Read-only: select every layer in the comp whose comment carries the #tag.
  function select(args) {
    var comp = util.activeComp();
    var tag = normalizeTag(args && args.tag);
    if (tag === '') throw new Error('Enter a tag name.');

    var selected = 0;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      var match = hasTag(layer.comment, tag);
      layer.selected = match;
      if (match) selected++;
    }

    return { selected: selected };
  }

  function clear() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more layers to clear.');

    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var toks = tokensOf(layer.comment);
      var kept = [];
      var removed = false;
      for (var t = 0; t < toks.length; t++) {
        // Only strip our own namespaced tokens; leave user comment text intact.
        if (toks[t].indexOf(PREFIX) === 0) { removed = true; continue; }
        kept.push(toks[t]);
      }
      if (removed) {
        layer.comment = kept.join(' ');
        cleared++;
      }
    }

    return { cleared: cleared };
  }

  R.register('tags.apply', apply, 'Rebound: Apply Tag');
  R.register('tags.select', select, 'Rebound: Select Tagged');
  R.register('tags.clear', clear, 'Rebound: Clear Tags');
})();