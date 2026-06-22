/*
 * Rebound host, import font helpers.
 *
 * Powers the missing-font resolver: list the fonts installed on this machine,
 * and remap a missing family to an installed one across the text layers the
 * importer tagged. The importer tags a text layer's comment with
 * "rb-font:<family>" whenever it could not resolve that family, so a remap can
 * find exactly those layers later.
 */
(function () {
  var R = $.__rebound;

  function fontsApi() {
    return (app.fonts && app.fonts.allFonts) ? app.fonts : null;
  }

  // Unique installed family names, sorted, for the resolver dropdowns.
  function fontFamilies() {
    var api = fontsApi();
    if (!api) return { families: [] };
    var seen = {};
    var families = [];
    var all = api.allFonts;
    for (var i = 0; i < all.length; i++) {
      var fam;
      try { fam = all[i].familyName; } catch (e) { continue; }
      if (fam && !seen[fam]) { seen[fam] = true; families.push(fam); }
    }
    families.sort();
    return { families: families };
  }

  function resolvePostScript(family) {
    var api = fontsApi();
    if (!api || !api.getFontsByFamilyNameAndStyleName) return null;
    var styles = ['Regular', 'Medium', 'Book', ''];
    for (var i = 0; i < styles.length; i++) {
      try {
        var fonts = api.getFontsByFamilyNameAndStyleName(family, styles[i]);
        if (fonts && fonts.length) return fonts[0].postScriptName;
      } catch (e) { /* try next */ }
    }
    return null;
  }

  function isTextLayer(layer) {
    try { return !!layer.property('ADBE Text Properties'); } catch (e) { return false; }
  }

  // Set the whole-layer font on every tagged text layer using the missing family.
  function remapFont(args) {
    var from = args && args.from;
    var to = args && args.to;
    if (!from || !to) throw new Error('Choose a font to use instead.');
    var toPS = resolvePostScript(to);
    if (!toPS) throw new Error('Could not find the font "' + to + '" on this machine.');

    var tag = 'rb-font:' + from;
    var count = 0;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (!(item instanceof CompItem)) continue;
      for (var l = 1; l <= item.numLayers; l++) {
        var layer = item.layer(l);
        var comment = '';
        try { comment = layer.comment || ''; } catch (e) { comment = ''; }
        if (comment.indexOf(tag) === -1 || !isTextLayer(layer)) continue;
        try {
          var prop = layer.property('ADBE Text Properties').property('ADBE Text Document');
          var td = prop.value;
          td.font = toPS;
          prop.setValue(td);
          layer.comment = comment.replace(tag, 'rb-font-fixed:' + from);
          count++;
        } catch (e2) { /* skip layers that reject it */ }
      }
    }
    return { remapped: count, font: to };
  }

  R.register('import.fontFamilies', fontFamilies);
  R.register('import.remapFont', remapFont, 'Rebound: Replace Font');
})();
