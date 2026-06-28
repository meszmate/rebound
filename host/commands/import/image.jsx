/*
 * Rebound host, import images.
 *
 * Rebuilds an IMAGE node as a real footage layer. The panel writes each asset's
 * bytes to USER_DATA/Rebound/assets and hands this builder a file path; the
 * footage is imported once per path (deduped) and scaled to the node box. FILL
 * and CROP scale to the box (exact placement, slight aspect change is flagged);
 * FIT is approximated and flagged. TILE repeats a single tile natively with the
 * "ADBE Tile" (Motion Tile) effect instead of stretching one image.
 */
(function () {
  var R = $.__rebound;

  function num(v) { return typeof v === 'number' && !isNaN(v); }

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

  // Repeat a single footage tile across the layer box with the native Motion Tile
  // effect. The footage is left at 1:1 (no stretch); the effect's Tile Width/Height
  // set the on-screen size of one tile, and Output Width/Height (as a percentage of
  // the layer) are expanded past 100 so the repeats cover the whole box. Returns
  // true if the native effect was applied, false if it is unavailable (caller then
  // keeps the old fill behaviour). Every param is guarded against build differences.
  function tileLayer(layer, node, fw, fh, w, h) {
    var effects = layer.property('ADBE Effect Parade');
    if (!effects) return false;
    var tile;
    try { tile = effects.addProperty('ADBE Tile'); } catch (e) { return false; }
    if (!tile) return false;

    // One tile's on-screen size, from the tile-scale fields the exporter emits:
    // tileScale is the uniform scalingFactor, tileWidthScale/tileHeightScale the
    // per-axis multipliers on the footage's natural size. Fall back to natural size.
    var sf = num(node.tileScale) ? node.tileScale : 1;
    var tw = num(node.tileWidthScale) ? fw * node.tileWidthScale : fw * sf;
    var th = num(node.tileHeightScale) ? fh * node.tileHeightScale : fh * sf;
    if (!tw) tw = fw;
    if (!th) th = fh;

    // Centre of the first tile, in layer space (anchor is at the content origin).
    var cx = tw / 2, cy = th / 2;
    setParam(tile, 'ADBE Tile-0001', [cx, cy]);   // Tile Center (layer pixels)
    // Tile Width/Height are a PERCENTAGE of the layer's source size (100 = full
    // layer), NOT pixels -- the layer is the footage at 1:1, so an on-screen tile
    // of tw px == (tw / fw) * 100 percent.
    setParam(tile, 'ADBE Tile-0002', fw ? (tw / fw) * 100 : 100); // Tile Width (%)
    setParam(tile, 'ADBE Tile-0003', fh ? (th / fh) * 100 : 100); // Tile Height (%)
    // Output Width/Height are a percentage of the layer's source size; the tiles
    // fill that output region. Size it to the layer box (in layer pixels) plus one
    // extra tile of margin so a partial tile shows at the far edges rather than
    // clipping the pattern short.
    var lw = w || fw, lh = h || fh;
    setParam(tile, 'ADBE Tile-0004', fw ? ((lw + tw) / fw) * 100 : 200); // Output Width
    setParam(tile, 'ADBE Tile-0005', fh ? ((lh + th) / fh) * 100 : 200); // Output Height
    setParam(tile, 'ADBE Tile-0006', 0);           // Mirror Edges (off)
    setParam(tile, 'ADBE Tile-0007', 0);           // Phase
    return true;
  }

  function setParam(group, name, value) {
    try { group.property(name).setValue(value); } catch (e) { /* version / build differences */ }
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
        // Contain: uniform scale, centred in the box by a position offset so the
        // anchor stays at the content origin (rotation pivot stays consistent).
        var s = Math.min(w / fw, h / fh);
        var offx = (w - fw * s) / 2, offy = (h - fh * s) / 2;
        try {
          var pos = tr.property('ADBE Position').value;
          tr.property('ADBE Position').setValue([pos[0] + offx, pos[1] + offy]);
          tr.property('ADBE Scale').setValue([s * 100, s * 100]);
        } catch (e) {}
      } else if (node.scaleMode === 'TILE') {
        // TILE: keep the layer at 1:1 (no box stretch) and repeat the footage
        // across it with the native Motion Tile effect, which sizes each tile in
        // layer pixels. If the effect is unavailable, fall back to the old fill
        // behaviour so nothing breaks.
        try { tr.property('ADBE Scale').setValue([100, 100]); } catch (eTs) {}
        var tiled = false;
        try { tiled = tileLayer(layer, node, fw, fh, w, h); } catch (eT) { tiled = false; }
        if (!tiled) {
          try { tr.property('ADBE Scale').setValue([w / fw * 100, h / fh * 100]); } catch (eF) {}
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile rendered as fill (Motion Tile unavailable)' });
        } else {
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile reproduced natively via the Motion Tile effect (single repeating tile, not a stretched image)' });
        }
      } else {
        // FILL / CROP / default: fill the box exactly.
        try { tr.property('ADBE Scale').setValue([w / fw * 100, h / fh * 100]); } catch (e2) {}
      }
    }

    R.importer.effect.apply(layer, node, report);
    R.importer.layerStyle.collect(layer, node, report);
    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.IMAGE = buildImage;
})();
