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

  // Normalize a name for loose comparison: strip spaces/dashes/underscores,
  // lowercase. Mirrors text.jsx so import-time and remap-time agree.
  function normName(s) {
    if (!s) return '';
    return String(s).toLowerCase().replace(/[\s\-_]+/g, '');
  }

  // Figma style spelling -> AE's alternate spellings for the same face. Mirrors
  // text.jsx's STYLE_SYNONYMS so the remap resolver matches the importer.
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

  function isRealFont(fo) {
    if (!fo) return false;
    try { if (fo.isSubstitute === true) return false; } catch (e) {}
    try { return !!fo.postScriptName; } catch (e2) { return false; }
  }

  function firstReal(fonts) {
    if (!fonts || !fonts.length) return null;
    for (var i = 0; i < fonts.length; i++) { if (isRealFont(fonts[i])) return fonts[i]; }
    return null;
  }

  // Iterate every FontObject in allFonts regardless of shape: AE's Fonts API has
  // been documented both as a FLAT array of FontObjects and as family-group sub-
  // arrays. Handle both so the dropdown + scan never silently go empty. cb may
  // return truthy to stop early (that value is returned).
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

  // Unique installed family names, sorted, for the resolver dropdowns. allFonts
  // may be a flat array of faces OR family-group sub-arrays; eachFont handles both.
  function fontFamilies() {
    var api = fontsApi();
    if (!api) return { families: [] };
    var seen = {};
    var families = [];
    eachFont(api.allFonts, function (fo) {
      var fam;
      try { fam = fo.familyName; } catch (e) { return null; }
      if (fam && !seen[fam]) { seen[fam] = true; families.push(fam); }
      return null;
    });
    families.sort();
    return { families: families };
  }

  // Resolve a chosen family to a PostScript name using the same robust strategy
  // as text.jsx (style synonyms + a scan of the nested allFonts arrays), so the
  // missing-font remap lands the same face the importer would have.
  function resolvePostScript(family, style) {
    var api = fontsApi();
    if (!api || !api.getFontsByFamilyNameAndStyleName) return null;
    // Ordered style spellings: requested style + synonyms, then sensible defaults.
    var styles = [];
    function push(s) {
      if (s == null) return;
      for (var j = 0; j < styles.length; j++) { if (normName(styles[j]) === normName(s)) return; }
      styles.push(s);
    }
    if (style) {
      push(style);
      var syn = STYLE_SYNONYMS[normName(style)];
      if (syn) { for (var k = 0; k < syn.length; k++) push(syn[k]); }
    }
    push('Regular'); push('Medium'); push('Book'); push('');

    for (var i = 0; i < styles.length; i++) {
      try {
        var fo = firstReal(api.getFontsByFamilyNameAndStyleName(family, styles[i]));
        if (fo) return fo.postScriptName;
      } catch (e) { /* try next */ }
    }
    // Scan every installed face (flat or grouped) for any face of this family.
    try {
      var famN = normName(family);
      var hit = eachFont(api.allFonts, function (cand) {
        var fam = '', nfam = '';
        try { fam = cand.familyName || ''; } catch (eF) {}
        try { nfam = cand.nativeFamilyName || ''; } catch (eNF) {}
        if ((normName(fam) === famN || normName(nfam) === famN) && isRealFont(cand)) return cand;
        return null;
      });
      if (hit) return hit.postScriptName;
    } catch (eScan) {}
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
    // args.style is optional; when the UI carries the wanted style the resolver
    // can land that exact face, otherwise it falls back to sensible defaults.
    var toPS = resolvePostScript(to, args && args.style);
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
