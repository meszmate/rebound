/*
 * Rebound host, import effects.
 *
 * Maps IR effects onto After Effects effects on the built layer:
 *   DROP_SHADOW    -> ADBE Drop Shadow
 *   LAYER_BLUR     -> ADBE Gaussian Blur 2
 *   INNER_SHADOW   -> approximated with a drop shadow (flagged)
 *   BACKGROUND_BLUR-> an adjustment layer carrying a Gaussian blur, masked to the
 *                     node footprint and placed directly BELOW the target so it
 *                     blurs only the layers behind it (the target stays sharp).
 *
 * Shadow direction/distance are derived from the IR offset, and shadow opacity
 * comes from the shadow colour's alpha. Effect properties are addressed by their
 * indexed matchNames and every set is guarded, since effect builds vary.
 */
(function () {
  var R = $.__rebound;
  var N = R.ir.N;

  function setSafe(group, name, value) {
    try { group.property(name).setValue(value); } catch (e) { /* build differences */ }
  }

  function addBlur(parade, e) {
    var gb = parade.addProperty('ADBE Gaussian Blur 2');
    if (!gb) return;
    setSafe(gb, 'ADBE Gaussian Blur 2-0001', e.radius || 0); // Blurriness
    setSafe(gb, 'ADBE Gaussian Blur 2-0003', true);          // Repeat Edge Pixels
  }

  // Add a Gaussian blur to an effect parade, preferring the modern effect and
  // falling back to the legacy one. Returns true if either was added.
  function addBackdropGaussian(parade, radius) {
    var gb = null;
    try { if (parade.canAddProperty('ADBE Gaussian Blur 2')) gb = parade.addProperty('ADBE Gaussian Blur 2'); } catch (e) { gb = null; }
    if (gb) {
      setSafe(gb, 'ADBE Gaussian Blur 2-0001', radius || 0); // Blurriness (px-ish; set directly)
      setSafe(gb, 'ADBE Gaussian Blur 2-0003', 1);           // Repeat Edge Pixels (keep the rim from darkening)
      return true;
    }
    var lg = null;
    try { if (parade.canAddProperty('ADBE Gaussian Blur')) lg = parade.addProperty('ADBE Gaussian Blur'); } catch (e2) { lg = null; }
    if (lg) {
      setSafe(lg, 'ADBE Gaussian Blur-0001', radius || 0); // legacy Blurriness
      setSafe(lg, 'ADBE Gaussian Blur-0002', 1);           // legacy Repeat Edge Pixels (if present)
      return true;
    }
    return false;
  }

  // Build an AE Shape from an IR subpath (relative tangents), like build.jsx.
  function shapeFromSubpath(sp) {
    var verts = (sp && sp.vertices) || [];
    var shape = new Shape();
    var vv = [], it = [], ot = [];
    for (var j = 0; j < verts.length; j++) {
      var v = verts[j];
      vv.push([v.x, v.y]);
      it.push(v.inTangent || [0, 0]);
      ot.push(v.outTangent || [0, 0]);
    }
    shape.vertices = vv;
    shape.inTangents = it;
    shape.outTangents = ot;
    shape.closed = (sp && sp.closed === false) ? false : true;
    return shape;
  }

  // A plain (possibly rounded) rectangle subpath whose origin is offset to (ox, oy)
  // in the adjustment layer's space. The adjustment layer is comp-sized at its
  // default placement (anchor [0,0] -> comp top-left maps to layer-space [0,0]),
  // so comp coordinates can be used directly as layer-space coordinates.
  function rectSubpathAt(w, h, radii, ox, oy) {
    var sp;
    try {
      if (R.importer.geometry && R.importer.geometry.roundedRect) {
        sp = R.importer.geometry.roundedRect(w, h, radii || { tl: 0, tr: 0, br: 0, bl: 0 });
      }
    } catch (e) { sp = null; }
    if (!sp) {
      // Plain 4-vertex rectangle fallback (clockwise), no rounding.
      sp = { vertices: [
        { x: 0, y: 0, inTangent: [0, 0], outTangent: [0, 0] },
        { x: w, y: 0, inTangent: [0, 0], outTangent: [0, 0] },
        { x: w, y: h, inTangent: [0, 0], outTangent: [0, 0] },
        { x: 0, y: h, inTangent: [0, 0], outTangent: [0, 0] }
      ], closed: true };
    }
    // Translate every vertex to the target's comp rect.
    for (var i = 0; i < sp.vertices.length; i++) {
      sp.vertices[i].x = sp.vertices[i].x + ox;
      sp.vertices[i].y = sp.vertices[i].y + oy;
    }
    return sp;
  }

  // Reproduce a Figma backdrop blur as an editable adjustment layer: a comp-sized
  // adjustment layer carrying a Gaussian blur, clipped with a mask to the node's
  // footprint and slotted directly below the target so it blurs only the layers
  // behind it. Degrades to the old "not reconstructed" flag on any failure (and
  // removes the half-built adjustment layer).
  function addBackgroundBlur(layer, e, node, report) {
    var comp = null;
    try { comp = layer.containingComp; } catch (eC) { comp = null; }
    if (!comp) {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'background blur not reconstructed (needs an adjustment layer + matte)' });
      return;
    }

    var adj = null;
    try {
      // Footprint: node-local width/height (geometry has anchor [0,0]).
      var t = node.transform || {};
      var w = Math.max(1, Math.round(t.width || node.width || 1));
      var h = Math.max(1, Math.round(t.height || node.height || 1));

      // Target's top-left in comp space (anchor is [0,0], so Position is top-left).
      var ox = 0, oy = 0;
      try {
        var pos = layer.property(R.util.MATCH.transform).property(R.util.MATCH.position).value;
        if (pos && pos.length >= 2) { ox = pos[0]; oy = pos[1]; }
      } catch (eP) { ox = 0; oy = 0; }

      // Comp-sized solid promoted to an adjustment layer (affects layers below).
      adj = comp.layers.addSolid([0, 0, 0], (node.name || 'Layer') + ' Backdrop Blur', comp.width, comp.height, comp.pixelAspect);
      adj.adjustmentLayer = true;

      var parade = adj.property('ADBE Effect Parade');
      if (!parade) throw new Error('no effect parade');
      if (!addBackdropGaussian(parade, e.radius || 0)) throw new Error('no gaussian blur available');

      // Clip to the footprint with a mask (rounded rect when corners are present).
      var cr = node.cornerRadii;
      var radii = cr
        ? { tl: cr.topLeft || 0, tr: cr.topRight || 0, br: cr.bottomRight || 0, bl: cr.bottomLeft || 0 }
        : { tl: 0, tr: 0, br: 0, bl: 0 };
      var sp = rectSubpathAt(w, h, radii, ox, oy);
      var masks = adj.property('ADBE Mask Parade');
      if (!masks) throw new Error('no mask parade');
      var mask = masks.addProperty('ADBE Mask Atom');
      mask.property('ADBE Mask Shape').setValue(shapeFromSubpath(sp));

      // Sit directly below the sharp target so only the layers beneath are blurred.
      try { adj.moveAfter(layer); } catch (eM) { /* index already adjacent or move unsupported */ }

      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'background blur reproduced as an adjustment layer (Gaussian blur, masked to the node footprint) placed below the layer; it blurs the layers behind it rather than a live backdrop filter' });
    } catch (eErr) {
      // Tear down the partial adjustment layer and fall back to the prior flag.
      if (adj) { try { adj.remove(); } catch (eR) { /* already gone */ } }
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'background blur not reconstructed (needs an adjustment layer + matte)' });
    }
  }

  // Shadows, glows, satin, and overlays are applied as real layer styles
  // (layerstyle.jsx); only blurs live in the Effect Parade.
  function addEffect(parade, layer, e, node, report) {
    if (e.type === 'LAYER_BLUR') { addBlur(parade, e); return; }
    if (e.type === 'BACKGROUND_BLUR') { addBackgroundBlur(layer, e, node, report); return; }
  }

  function apply(layer, node, report) {
    var fx = node.effects;
    if (!fx || !fx.length) return;
    var parade = layer.property('ADBE Effect Parade');
    if (!parade) return;
    for (var i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (!e || e.visible === false) continue;
      addEffect(parade, layer, e, node, report);
    }
  }

  R.importer.effect = { apply: apply };
})();
