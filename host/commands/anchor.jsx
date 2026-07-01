/*
 * Rebound host, anchor point commands.
 *
 * Moves a layer's anchor to a point on its bounding box WITHOUT moving the
 * layer, by compensating Position. The exact relationship is:
 *   newPosition = oldPosition + R*S*(newAnchor - oldAnchor)
 * where S is the layer's scale and R its rotation at the evaluated time. When
 * Position is keyframed, every key is offset by the same delta.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function transformOf(layer) {
    return layer.property(M.transform);
  }

  // The 2D source bounds of a layer at a time, or null if it has none.
  //
  // We do NOT pre-test capability with `instanceof AVLayer` or
  // `typeof layer.sourceRectAtTime === 'function'` -- both are unreliable for
  // shape and text layers in ExtendScript, which is why the anchor tool used to
  // skip them as "(no bounds)". Instead we ATTEMPT the call and trust the result:
  // if it yields a non-empty rect the layer has bounds; if it throws (camera /
  // light / audio-only) it does not. Shape / text layers often return an EMPTY
  // path-only rect for extents=false, so we retry once WITH extents (which grows
  // the box to include strokes & effects) before giving up -- otherwise the anchor
  // would be sent to a degenerate (0x0) point and appear to "do nothing".
  function boundsOf(layer, time, extents) {
    try { if (layer instanceof CameraLayer || layer instanceof LightLayer) return null; } catch (eInst) { /* enums vary by build */ }
    var want = !!extents;
    for (var pass = 0; pass < 2; pass++) {
      try {
        var r = layer.sourceRectAtTime(time, want);
        if (r && (r.width > 0 || r.height > 0)) return r;
      } catch (e) {
        return null; // no source rect at all (camera / light / audio)
      }
      want = true; // second pass: include extents to catch stroke-only / empty paths
    }
    return null;
  }

  function rotate2d(v, deg) {
    var r = (deg * Math.PI) / 180;
    var c = Math.cos(r);
    var s = Math.sin(r);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  }

  // Compensation delta in parent space for an anchor change dA (layer space).
  function compensate(tr, dA, time) {
    var scale = tr.property(M.scale).valueAtTime(time, false);
    var sx = scale[0] / 100;
    var sy = scale[1] / 100;
    var scaled = [dA[0] * sx, dA[1] * sy];
    var rotProp = tr.property(M.rotation);
    var deg = rotProp ? rotProp.valueAtTime(time, false) : 0;
    var rot = rotate2d(scaled, deg);
    return [rot[0], rot[1], dA.length > 2 ? dA[2] * (scale[2] ? scale[2] / 100 : 1) : 0];
  }

  // Short, readable form of an AE/JS error for a skipped-layer note. Avoids regex
  // literals (some ExtendScript builds mis-tokenize them and abort the file).
  function brief(err) {
    var s = (err && err.message) ? err.message : String(err);
    var prefixes = ['Error: ', 'After Effects error: ', 'After Effects warning: '];
    for (var i = 0; i < prefixes.length; i++) {
      if (s.substring(0, prefixes[i].length) === prefixes[i]) { s = s.substring(prefixes[i].length); break; }
    }
    return s.length > 90 ? s.substring(0, 90) : s;
  }

  // Offset a 1D property (a separated X/Y/Z Position) by d, keys included.
  function offsetScalar(prop, d) {
    if (prop.numKeys > 0) {
      for (var k = 1; k <= prop.numKeys; k++) prop.setValueAtTime(prop.keyTime(k), prop.keyValue(k) + d);
    } else {
      prop.setValue(prop.value + d);
    }
  }

  // Offset a 2D/3D vector property by delta, keys included.
  function offsetVector(prop, delta) {
    if (prop.numKeys > 0) {
      for (var k = 1; k <= prop.numKeys; k++) {
        var v = prop.keyValue(k);
        var nv = [v[0] + delta[0], v[1] + delta[1]];
        if (v.length > 2) nv.push(v[2] + (delta[2] || 0));
        prop.setValueAtTime(prop.keyTime(k), nv);
      }
    } else {
      var pv = prop.value;
      var np = [pv[0] + delta[0], pv[1] + delta[1]];
      if (pv.length > 2) np.push(pv[2] + (delta[2] || 0));
      prop.setValue(np);
    }
  }

  // Apply the compensation delta to Position. When Separate Dimensions is on the
  // unified Position is HIDDEN (setting it throws "a parent property is hidden"),
  // so we drive the X / Y / Z properties (ADBE Position_0/_1/_2) individually,
  // the same way throw / pathfollow do. We try the unified property first and
  // fall back to the separated trio on any failure, so it works even if
  // dimensionsSeparated reports unreliably.
  function offsetSeparated(tr, delta) {
    var fx = tr.property(M.positionX);
    var fy = tr.property(M.positionY);
    var fz = tr.property(M.positionZ);
    if (fx) offsetScalar(fx, delta[0] || 0);
    if (fy) offsetScalar(fy, delta[1] || 0);
    if (fz && (delta[2] || 0) !== 0) offsetScalar(fz, delta[2] || 0);
  }
  function offsetPosition(tr, posProp, delta) {
    var sep = false;
    try { sep = posProp.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) { offsetSeparated(tr, delta); return; }
    try {
      offsetVector(posProp, delta);
    } catch (e2) {
      // The unified Position refused (hidden / separated leader). If separated
      // followers exist, drive those; otherwise surface the real error.
      if (tr.property(M.positionX)) { offsetSeparated(tr, delta); return; }
      throw e2;
    }
  }

  function moveAnchor(args) {
    var gx = args.gx;
    var gy = args.gy;
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) {
      throw new Error('Select one or more layers.');
    }

    var time = comp.time;
    var moved = 0;
    var skipped = [];

    R.beginUndo('Rebound: Move Anchor');
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var tr = transformOf(layer);
        var anchorProp = tr.property(M.anchor);
        var posProp = tr.property(M.position);

        if (anchorProp.numKeys > 0) {
          skipped.push(layer.name + ' (animated anchor)');
          continue;
        }
        if (posProp.expressionEnabled && posProp.expression !== '') {
          skipped.push(layer.name + ' (position expression)');
          continue;
        }

        // extents=true grows the box to include masks, strokes, and effects, for
        // a result closer to the visible content bounds than raw geometry.
        var rect = boundsOf(layer, time, !!args.extents);
        if (!rect) {
          skipped.push(layer.name + ' (no visible bounds)');
          continue;
        }
        var is3d = anchorProp.value.length > 2;
        var a0 = anchorProp.value;
        var a1 = [rect.left + gx * rect.width, rect.top + gy * rect.height];
        if (is3d) a1.push(a0[2]);

        var dA = [a1[0] - a0[0], a1[1] - a0[1], is3d ? 0 : 0];
        var delta = compensate(tr, dA, time);

        // Atomic: move the anchor, then compensate Position. If either step
        // fails, restore the anchor so the layer never ends up half-moved, and
        // report exactly which property AE refused (and why).
        try {
          anchorProp.setValue(a1);
        } catch (ea) {
          skipped.push(layer.name + ' (anchor: ' + brief(ea) + ')');
          continue;
        }
        try {
          offsetPosition(tr, posProp, delta);
        } catch (ep) {
          try { anchorProp.setValue(a0); } catch (er) {}
          skipped.push(layer.name + ' (position: ' + brief(ep) + ')');
          continue;
        }
        moved++;
      }
    } finally {
      R.endUndo();
    }

    return { moved: moved, skipped: skipped };
  }

  // Center the layer(s) at the composition centre (this DOES move the layer).
  function centerInComp(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');
    var cx = comp.width / 2;
    var cy = comp.height / 2;
    var axisX = args.x !== false;
    var axisY = args.y !== false;
    var moved = 0;

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var tr = layer.property(M.transform);
      var pos = tr.property(M.position);
      if (pos.numKeys > 0 || (pos.expressionEnabled && pos.expression !== '')) continue;
      var sep = false; try { sep = pos.dimensionsSeparated; } catch (eSep) { sep = false; }
      if (sep) {
        var px = tr.property(M.positionX), py = tr.property(M.positionY);
        if (axisX && px) px.setValue(cx);
        if (axisY && py) py.setValue(cy);
        moved++;
        continue;
      }
      var v = pos.value;
      var nv = [axisX ? cx : v[0], axisY ? cy : v[1]];
      if (v.length > 2) nv.push(v[2]);
      pos.setValue(nv);
      moved++;
    }
    return { moved: moved };
  }

  // Read the first selected bounded layer's current anchor, normalized to a
  // [gx,gy] within its source bounds, so the panel can show where the anchor is.
  // Read-only (registered without an undo label).
  function readAnchor() {
    var comp = util.activeComp();
    if (!comp) return { found: false };
    var layers = comp.selectedLayers;
    if (!layers.length) return { found: false };
    var time = comp.time;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var rect = boundsOf(layer, time, false);
      if (!rect) continue;
      var tr = transformOf(layer);
      var anchorProp = tr.property(M.anchor);
      var a = anchorProp.value;
      var gx = rect.width ? (a[0] - rect.left) / rect.width : 0.5;
      var gy = rect.height ? (a[1] - rect.top) / rect.height : 0.5;
      var expr = false;
      try { expr = anchorProp.canSetExpression && anchorProp.expressionEnabled && anchorProp.expression !== ''; } catch (e2) { expr = false; }
      return { found: true, layerName: layer.name, gx: gx, gy: gy, animated: anchorProp.numKeys > 0, hasExpression: !!expr };
    }
    return { found: false };
  }

  R.register('anchor.move', moveAnchor, 'Rebound: Move Anchor');
  R.register('anchor.centerInComp', centerInComp, 'Rebound: Center in Comp');
  R.register('anchor.read', readAnchor);
})();
