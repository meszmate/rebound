/*
 * Rebound host, export eases as standalone scripts.
 *
 * Writes one self-contained .jsx per saved ease into a chosen folder. Each file
 * applies that exact cubic-bezier to the selected keyframes WITHOUT needing
 * Rebound loaded, so it can be wired to a KBar button ("Run Script File"), a
 * Tool Launcher, or dropped in After Effects' Scripts menu. This is the Flow
 * "single-button ease" delivery, but launcher-agnostic.
 */
(function () {
  var R = $.__rebound;

  function num(v) {
    // Compact, locale-safe number literal for the generated source.
    var n = Math.round((v || 0) * 1e6) / 1e6;
    return String(n);
  }

  function sanitize(name) {
    var s = String(name == null ? 'ease' : name).replace(/[^A-Za-z0-9 _-]/g, '_');
    s = s.replace(/^\s+|\s+$/g, '');
    return s.length ? s : 'ease';
  }

  function esc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  // The self-contained script body for one curve. Mirrors the apply math in
  // ease.jsx (clampInfluence + per-dimension dv/dt), but with the curve baked in
  // and the scope fixed to In & Out (the standard one-click ease).
  function genScript(name, c) {
    var lines = [
      "// Rebound ease: " + sanitize(name),
      "// cubic-bezier(" + num(c.x1) + ", " + num(c.y1) + ", " + num(c.x2) + ", " + num(c.y2) + ")",
      "// Self-contained: select 2+ keyframes on one or more properties and run.",
      "(function () {",
      "  var C = { x1: " + num(c.x1) + ", y1: " + num(c.y1) + ", x2: " + num(c.x2) + ", y2: " + num(c.y2) + " };",
      "  var comp = app.project ? app.project.activeItem : null;",
      "  if (!(comp && comp instanceof CompItem)) { alert('Rebound ease: open a composition and select keyframes.'); return; }",
      "  function clampInfl(v) { return v < 0.1 ? 0.1 : v > 100 ? 100 : v; }",
      "  function isSpatial(p) {",
      "    try { return p.propertyValueType === PropertyValueType.ThreeD_SPATIAL || p.propertyValueType === PropertyValueType.TwoD_SPATIAL; }",
      "    catch (e) { return false; }",
      "  }",
      "  function vals(p, i) { var v = p.keyValue(i); return v instanceof Array ? v : [v]; }",
      "  function mag(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = (b[i] || 0) - (a[i] || 0); s += d * d; } return Math.sqrt(s); }",
      "  app.beginUndoGroup('Rebound Ease: " + esc(sanitize(name)) + "');",
      "  var props = comp.selectedProperties, touched = 0;",
      "  for (var t = 0; t < props.length; t++) {",
      "    var p = props[t];",
      "    if (!(p instanceof Property)) continue;",
      "    if (!p.canVaryOverTime || p.numKeys < 2) continue;",
      "    var idx = p.selectedKeys; if (idx.length < 2) continue;",
      "    var spatial = isSpatial(p);",
      "    var dims = 1;",
      "    if (!spatial) { try { var pv = p.value; dims = (pv instanceof Array) ? pv.length : 1; } catch (e0) { dims = 1; } }",
      "    for (var s = 0; s < idx.length - 1; s++) {",
      "      var a = idx[s], b = idx[s + 1];",
      "      var dt = p.keyTime(b) - p.keyTime(a); if (dt <= 0) continue;",
      "      var av = vals(p, a), bv = vals(p, b), outArr = [], inArr = [];",
      "      if (spatial && mag(av, bv) < 1e-6) continue;",
      "      for (var d = 0; d < dims; d++) {",
      "        var dv = spatial ? mag(av, bv) : ((bv[d] || 0) - (av[d] || 0));",
      "        var avg = dv / dt;",
      "        var oInf = clampInfl(C.x1 * 100), oSpd = C.x1 === 0 ? 0 : (C.y1 / C.x1) * avg;",
      "        var den = 1 - C.x2, iInf = clampInfl(den * 100), iSpd = den === 0 ? 0 : ((1 - C.y2) / den) * avg;",
      "        outArr.push(new KeyframeEase(oSpd, oInf)); inArr.push(new KeyframeEase(iSpd, iInf));",
      "      }",
      "      p.setInterpolationTypeAtKey(a, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);",
      "      p.setTemporalEaseAtKey(a, p.keyInTemporalEase(a), outArr);",
      "      p.setInterpolationTypeAtKey(b, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);",
      "      p.setTemporalEaseAtKey(b, inArr, p.keyOutTemporalEase(b));",
      "      touched++;",
      "    }",
      "  }",
      "  app.endUndoGroup();",
      "  if (!touched) alert('Rebound ease: select at least two keyframes on an animated property.');",
      "})();",
      ""
    ];
    return lines.join('\n');
  }

  function writeFile(folder, fileName, text) {
    var f = new File(folder.fsName + '/' + fileName);
    f.encoding = 'UTF-8';
    if (!f.open('w')) throw new Error('Could not write ' + fileName);
    f.write(text);
    f.close();
    return f.fsName;
  }

  // args: { presets: [{ name, curve:{x1,y1,x2,y2} }], folder?: <fsPath> }
  function exportScripts(args) {
    var presets = (args && args.presets) || [];
    if (!presets.length) throw new Error('No eases to export.');

    var folder;
    if (args && args.folder) {
      folder = new Folder(args.folder);
      if (!folder.exists) folder.create();
    } else {
      folder = Folder.selectDialog('Choose a folder for the ease scripts');
      if (!folder) return { written: 0, cancelled: true };
    }

    var written = 0, names = [], used = {};
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      var c = p && p.curve;
      if (!c || c.x1 == null) continue;
      var base = sanitize(p.name);
      var fileName = 'Rebound Ease - ' + base;
      // De-dupe identical sanitized names.
      var stem = fileName, n = 2;
      while (used[fileName + '.jsx']) { fileName = stem + ' ' + n; n++; }
      used[fileName + '.jsx'] = true;
      writeFile(folder, fileName + '.jsx', genScript(p.name, c));
      written++;
      names.push(fileName + '.jsx');
    }
    return { written: written, folder: folder.fsName, files: names };
  }

  R.register('ease.exportScripts', exportScripts, 'Rebound: Export Ease Scripts');
})();
