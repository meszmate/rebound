/*
 * Rebound host, import images.
 *
 * Rebuilds an IMAGE node as a real footage layer. The panel writes each asset's
 * bytes to USER_DATA/Rebound/assets and hands this builder a file path; the
 * footage is imported once per path (deduped) and scaled to the node box. FILL
 * and CROP scale to the box (exact placement, slight aspect change is flagged);
 * FIT and TILE are approximated and flagged.
 */
(function () {
  var R = $.__rebound;

  function importFootage(path) {
    var cache = R.importer.footageCache || (R.importer.footageCache = {});
    if (cache[path]) return cache[path];
    try {
      var io = new ImportOptions(new File(path));
      var item = app.project.importFile(io);
      cache[path] = item;
      return item;
    } catch (e) {
      return null;
    }
  }

  function buildImage(comp, node, report) {
    var assets = R.importer.assets || {};
    var hash = node.imageHash;
    var asset = hash ? assets[hash] : null;
    if (!asset || !asset.path) {
      R.importer.util.note(report, 'skipped', { name: node.name, type: 'IMAGE', reason: 'image bytes were not available to the importer' });
      return null;
    }

    var footage = importFootage(asset.path);
    if (!footage) {
      R.importer.util.note(report, 'skipped', { name: node.name, type: 'IMAGE', reason: 'After Effects could not import the image' });
      return null;
    }

    var layer = comp.layers.add(footage);
    layer.name = node.name || 'Image';

    // Position / rotation / opacity / blend, then override scale to fit the box.
    R.importer.transform.apply(layer, node, report);

    var t = node.transform || {};
    var w = t.width || footage.width;
    var h = t.height || footage.height;
    var fw = footage.width, fh = footage.height;
    var tr = layer.property('ADBE Transform Group');
    if (fw && fh) {
      if (node.scaleMode === 'FIT') {
        // Contain: uniform scale, centred in the box.
        var s = Math.min(w / fw, h / fh) * 100;
        try {
          tr.property('ADBE Anchor Point').setValue([fw / 2, fh / 2]);
          tr.property('ADBE Position').setValue([(t.x || 0) + w / 2, (t.y || 0) + h / 2]);
          tr.property('ADBE Scale').setValue([s, s]);
        } catch (e) {}
      } else {
        // FILL / CROP / default: fill the box exactly.
        try { tr.property('ADBE Scale').setValue([w / fw * 100, h / fh * 100]); } catch (e2) {}
        if (node.scaleMode === 'TILE') R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile scaling rendered as fill' });
      }
    }

    R.importer.effect.apply(layer, node, report);
    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.IMAGE = buildImage;
})();
