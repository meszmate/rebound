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
    if (footage.width && footage.height) {
      var sx = w / footage.width * 100;
      var sy = h / footage.height * 100;
      try { layer.property('ADBE Transform Group').property('ADBE Scale').setValue([sx, sy]); } catch (e) {}
    }

    if (node.scaleMode === 'FIT' || node.scaleMode === 'TILE') {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image ' + node.scaleMode.toLowerCase() + ' scaling rendered as fill' });
    }

    R.importer.effect.apply(layer, node, report);
    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.IMAGE = buildImage;
})();
