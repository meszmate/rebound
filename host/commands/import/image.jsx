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
    // Output Width/Height are a percentage of the layer's source size, expanded
    // SYMMETRICALLY about the layer's CENTRE (fw/2), while the node box spans
    // [0..w] from the layer ORIGIN. Cover the farther of the two half-spans
    // (plus one tile of margin) so the pattern reaches the box's far edge; a
    // box-sized mask below crops the symmetric spill on the near side.
    var lw = w || fw, lh = h || fh;
    var halfW = Math.max(lw - fw / 2, fw / 2);
    var halfH = Math.max(lh - fh / 2, fh / 2);
    setParam(tile, 'ADBE Tile-0004', fw ? ((2 * halfW + tw) / fw) * 100 : 200); // Output Width
    setParam(tile, 'ADBE Tile-0005', fh ? ((2 * halfH + th) / fh) * 100 : 200); // Output Height
    setParam(tile, 'ADBE Tile-0006', 0);           // Mirror Edges (off)
    setParam(tile, 'ADBE Tile-0007', 0);           // Phase
    // Crop the expanded output to the node box (layer space = local space at 1:1).
    try {
      var atomT = layer.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
      atomT.property('ADBE Mask Shape').setValue(rectShape(0, 0, lw, lh));
    } catch (eMk) { /* older builds: the spill shows, as before */ }
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

  // Crop a footage layer to the node box for a COVER (FILL/CROP) placement.
  // The mask lives in LAYER space (pre-transform), where the placement model is
  // simply local = s * layerPoint + (cx, cy): the box's layer-space preimage is
  // therefore [(0-cx)/s .. (w-cx)/s] x [(0-cy)/s .. (h-cy)/s], rotation- and
  // flip-invariant (the layer's own transform carries those). No comp-space
  // round trip — the old comp-space inverse silently assumed rotation 0, so a
  // flipped image (decomposed as rotation 180 + negative Y scale) landed its
  // crop a full box away. Returns true if the mask was added.
  function cropToBox(layer, s, cx, cy, w, h) {
    if (!(w > 0) || !(h > 0) || !(s > 0) || !isFinite(s)) return false;
    var parade;
    try { parade = layer.property('ADBE Mask Parade'); } catch (eP) { parade = null; }
    if (!parade) return false;
    var atom;
    try { atom = parade.addProperty('ADBE Mask Atom'); } catch (eA) { return false; }
    if (!atom) return false;
    try {
      var shape = rectShape((0 - cx) / s, (0 - cy) / s, w / s, h / s);
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

    // ALL box-fitting below happens in NODE-LOCAL space, where the content
    // always covers the box un-mirrored and un-rotated (Figma mirrors/rotates
    // the whole node, fill included, via its matrix): local = s*layerPoint + c.
    // The layer's own transform (set by transform.apply from the matrix, which
    // may express a flip as rotation 180 + negative Y scale) then carries that
    // local placement into the comp. Consequences:
    //   - the centering offset c must be mapped through the matrix's LINEAR
    //     part before being added to Position (it rotates/flips with the node);
    //   - the fit scale composes onto the decomposed signed scale, not onto a
    //     hand-managed sign (which broke whenever the flip lived in rotation);
    //   - the crop mask is computed directly in layer space (rotation-invariant).
    var L = (t.matrix && t.matrix.length === 6) ? t.matrix : [1, 0, 0, 1, 0, 0];
    function mapVec(vx, vy) { return [L[0] * vx + L[2] * vy, L[1] * vx + L[3] * vy]; }
    var dScaleX = 1, dScaleY = 1;
    try {
      var dM = R.ir.N.decomposeMatrix(L);
      if (isFinite(dM.scaleX) && dM.scaleX) dScaleX = dM.scaleX;
      if (isFinite(dM.scaleY) && dM.scaleY) dScaleY = dM.scaleY;
    } catch (eM) { dScaleX = 1; dScaleY = 1; }
    function placeLocal(s, cx, cy) {
      var pos = tr.property('ADBE Position').value;
      var off = mapVec(cx, cy);
      tr.property('ADBE Position').setValue([pos[0] + off[0], pos[1] + off[1]]);
      tr.property('ADBE Scale').setValue([dScaleX * s * 100, dScaleY * s * 100]);
    }

    // Without the footage's natural size we cannot compute a fit scale; leaving
    // the layer at 100% would render a 2x asset at 200%. Flag it and bail out of
    // scaling rather than place it wrong.
    if (!fw || !fh) {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image natural size unavailable; left at 100% (placement may be off scale)' });
    }
    if (fw && fh) {
      var rInk = node.rasterInk;
      if (rInk && num(rInk.width) && rInk.width > 0 && num(rInk.height) && rInk.height > 0) {
        // An exporter-rasterised node: the PNG bakes the node's own effects, so
        // its render box (rasterInk, local px) is LARGER than the node box.
        // Place that box exactly and do not cover/crop — cropping would cut the
        // baked shadow off at the node edge and cover-scaling would shrink the
        // content by the shadow's extent.
        try { placeLocal(rInk.width / fw, rInk.x || 0, rInk.y || 0); } catch (eR) {}
      } else if (node.scaleMode === 'FIT') {
        // Contain: uniform scale, centred in the box.
        var s = Math.min(w / fw, h / fh);
        try { placeLocal(s, (w - fw * s) / 2, (h - fh * s) / 2); } catch (e) {}
      } else if (node.scaleMode === 'TILE') {
        // TILE: keep the layer at 1:1 (no box stretch) and repeat the footage
        // across it with the native Motion Tile effect, which sizes each tile in
        // layer pixels. If the effect is unavailable, fall back to the old fill
        // behaviour so nothing breaks.
        try { placeLocal(1, 0, 0); } catch (eTs) {}
        var tiled = false;
        try { tiled = tileLayer(layer, node, fw, fh, w, h); } catch (eT) { tiled = false; }
        if (!tiled) {
          try { tr.property('ADBE Scale').setValue([dScaleX * w / fw * 100, dScaleY * h / fh * 100]); } catch (eF) {}
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile rendered as fill (Motion Tile unavailable)' });
        } else {
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'image tile reproduced natively via the Motion Tile effect (single repeating tile, not a stretched image)' });
        }
      } else {
        // FILL / CROP / default: COVER. Figma FILL scales the image uniformly so
        // it fully covers the box (not a per-axis stretch, which distorts an
        // image whose aspect != the box) and centre-crops the overflow with a
        // layer-space mask.
        var sc = Math.max(w / fw, h / fh);
        var ccx = (w - fw * sc) / 2, ccy = (h - fh * sc) / 2;
        var cropped = false;
        try {
          placeLocal(sc, ccx, ccy);
          cropped = cropToBox(layer, sc, ccx, ccy, w, h);
        } catch (e2) { cropped = false; }
        // If the mask could not be added, flag once so the visible overflow is
        // diagnosable.
        if (!cropped && (fw * sc - w > 0.5 || fh * sc - h > 0.5)) {
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
