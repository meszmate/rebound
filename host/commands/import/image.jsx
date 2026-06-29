/*
 * Rebound host, import images.
 *
 * Rebuilds an IMAGE node as a real footage layer. The panel writes each asset's
 * bytes to USER_DATA/Rebound/assets and hands this builder a file path; the
 * footage is imported once per path (deduped) and scaled to the node box. FILL
 * and CROP are COVER: the image is scaled uniformly to fully cover the box and
 * the overflow is centre-cropped with a layer mask (no aspect distortion). FIT
 * is CONTAIN (uniform min scale, centred). TILE repeats a single tile natively
 * with the "ADBE Tile" (Motion Tile) effect instead of stretching one image.
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

  // Build a closed 4-vertex rectangle as an AE Shape() in LAYER space. Mirrors
  // build.jsx's shapeFromSubpath, reusing R.importer.geometry.roundedRect (a
  // straight-cornered rect = a 0-radius rounded rect) when available so the
  // vertex/tangent convention matches the rest of the importer; falls back to a
  // hand-built rect if the geometry helper is missing. x/y is the top-left of
  // the rect, mw/mh its size.
  function rectShape(x, y, mw, mh) {
    var verts;
    var geo = R.importer.geometry;
    if (geo && typeof geo.roundedRect === 'function') {
      try {
        var sp = geo.roundedRect(mw, mh, { tl: 0, tr: 0, br: 0, bl: 0 });
        verts = sp.vertices || [];
      } catch (eGeo) { verts = null; }
    }
    if (!verts || !verts.length) {
      // Plain clockwise rectangle in [0..mw] x [0..mh], no tangents.
      verts = [
        { x: 0, y: 0, inTangent: [0, 0], outTangent: [0, 0] },
        { x: mw, y: 0, inTangent: [0, 0], outTangent: [0, 0] },
        { x: mw, y: mh, inTangent: [0, 0], outTangent: [0, 0] },
        { x: 0, y: mh, inTangent: [0, 0], outTangent: [0, 0] }
      ];
    }
    var shape = new Shape();
    var vv = [], it = [], ot = [];
    for (var j = 0; j < verts.length; j++) {
      var v = verts[j];
      vv.push([v.x + x, v.y + y]);
      it.push(v.inTangent || [0, 0]);
      ot.push(v.outTangent || [0, 0]);
    }
    shape.vertices = vv;
    shape.inTangents = it;
    shape.outTangents = ot;
    shape.closed = true;
    return shape;
  }

  // Crop a footage layer to the node box [w,h] for a COVER (FILL/CROP) placement.
  // Cover scales the footage uniformly by `s` (>= the box on both axes) and shifts
  // it by (offx,offy) <= 0 to centre the overflow, so the box's top-left in screen
  // space is the layer's ORIGINAL position `pos` and its bottom-right is pos+[w,h].
  //
  // The mask lives in LAYER space (pre-transform: anchor [0,0] = footage top-left,
  // no scale, no position applied). A layer-space point lx maps to screen
  // pos+offx + lx*s, so the box edges pos and pos+w map back to layer x
  // -offx/s and (-offx+w)/s. The rect is therefore [-offx/s, -offy/s] sized
  // [w/s, h/s] in layer space (centred on the footage, since -offx/s = fw/2 - w/(2s)).
  // `s` is the positive scale magnitude; the sgnX/sgnY flip on the Scale property
  // does not move the pre-transform mask. Returns true if the mask was added.
  function cropToBox(layer, s, offx, offy, w, h) {
    if (!(s > 0) || !(w > 0) || !(h > 0)) return false;
    var parade;
    try { parade = layer.property('ADBE Mask Parade'); } catch (eP) { parade = null; }
    if (!parade) return false;
    var atom;
    try { atom = parade.addProperty('ADBE Mask Atom'); } catch (eA) { return false; }
    if (!atom) return false;
    try {
      var shape = rectShape(-offx / s, -offy / s, w / s, h / s);
      atom.property('ADBE Mask Shape').setValue(shape);
      return true;
    } catch (eS) { return false; }
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

    // transform.apply may have set a mirrored (negative-axis) scale from the
    // node's affine matrix. The box-fit values below would otherwise overwrite
    // that with a positive scale, dropping the flip. Recover the per-axis signs
    // here and fold them into every scale we set so flips/mirrors survive.
    var sgnX = 1, sgnY = 1;
    if (t.matrix && t.matrix.length === 6) {
      try {
        var dM = R.ir.N.decomposeMatrix(t.matrix);
        if (isFinite(dM.scaleX) && dM.scaleX < 0) sgnX = -1;
        if (isFinite(dM.scaleY) && dM.scaleY < 0) sgnY = -1;
      } catch (eM) { sgnX = 1; sgnY = 1; }
    }

    // Without the footage's natural size we cannot compute a fit scale; leaving
    // the layer at 100% would render a 2x asset at 200%. Flag it and bail out of
    // scaling rather than place it wrong.
    if (!fw || !fh) {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image natural size unavailable; left at 100% (placement may be off scale)' });
    }
    if (fw && fh) {
      if (node.scaleMode === 'FIT') {
        // Contain: uniform scale, centred in the box by a position offset so the
        // anchor stays at the content origin (rotation pivot stays consistent).
        var s = Math.min(w / fw, h / fh);
        var offx = (w - fw * s) / 2, offy = (h - fh * s) / 2;
        try {
          var pos = tr.property('ADBE Position').value;
          tr.property('ADBE Position').setValue([pos[0] + offx, pos[1] + offy]);
          tr.property('ADBE Scale').setValue([sgnX * s * 100, sgnY * s * 100]);
        } catch (e) {}
      } else if (node.scaleMode === 'TILE') {
        // TILE: keep the layer at 1:1 (no box stretch) and repeat the footage
        // across it with the native Motion Tile effect, which sizes each tile in
        // layer pixels. If the effect is unavailable, fall back to the old fill
        // behaviour so nothing breaks.
        try { tr.property('ADBE Scale').setValue([sgnX * 100, sgnY * 100]); } catch (eTs) {}
        var tiled = false;
        try { tiled = tileLayer(layer, node, fw, fh, w, h); } catch (eT) { tiled = false; }
        if (!tiled) {
          try { tr.property('ADBE Scale').setValue([sgnX * w / fw * 100, sgnY * h / fh * 100]); } catch (eF) {}
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile rendered as fill (Motion Tile unavailable)' });
        } else {
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile reproduced natively via the Motion Tile effect (single repeating tile, not a stretched image)' });
        }
      } else {
        // FILL / CROP / default: COVER. Figma FILL scales the image uniformly so
        // it fully covers the box (not a per-axis stretch, which distorts an
        // image whose aspect != the box) and centre-crops the overflow. Uniform
        // scale = max(w/fw, h/fh); centre via a position offset (anchor stays at
        // the content origin so rotation pivots consistently). KEEP the sgnX/sgnY
        // flip recovery on the Scale value.
        var sc = Math.max(w / fw, h / fh);
        var coffx = (w - fw * sc) / 2, coffy = (h - fh * sc) / 2;
        try {
          var cpos = tr.property('ADBE Position').value;
          tr.property('ADBE Position').setValue([cpos[0] + coffx, cpos[1] + coffy]);
          tr.property('ADBE Scale').setValue([sgnX * sc * 100, sgnY * sc * 100]);
        } catch (e2) {}
        // The cover centering + crop assume a positive scale; a mirrored image
        // (negative axis from a flipped affine) reflects around the anchor, so the
        // crop window can mis-align. Rare for fills -- flag once rather than fake it.
        if ((sgnX < 0 || sgnY < 0) && report && !report.__imgFlipCoverNoted) {
          report.__imgFlipCoverNoted = true;
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'mirrored image fill: cover-crop alignment is approximate for a flipped image' });
        }
        // Crop the cover overflow to the box with a layer mask. A clipping-frame
        // precomp around this node would also clip, so the mask is at worst
        // redundant (it matches the same box); for a non-clipped placement it is
        // what stops the overflow showing. If it cannot be added, flag once so
        // the visible overflow is diagnosable.
        var cropped = false;
        try { cropped = cropToBox(layer, sc, coffx, coffy, w, h); } catch (eCrop) { cropped = false; }
        if (!cropped && (coffx < -0.5 || coffy < -0.5)) {
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image fill could not be cropped to its box; the covered overflow may be visible' });
        }
      }
    }

    R.importer.effect.apply(layer, node, report);
    R.importer.layerStyle.collect(layer, node, report);
    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.IMAGE = buildImage;
})();
