/*
 * Rebound host, anchor point commands.
 *
 * Moves a layer's anchor to a point on its bounding box WITHOUT moving the
 * layer, by compensating Position. The exact relationship is:
 *   newPosition = oldPosition + R*S*(newAnchor - oldAnchor)
 * where S is the layer's scale and R its rotation at the evaluated time. When
 * Position is keyframed, each key is offset by the delta evaluated AT that
 * key's time — with animated rotation/scale one constant delta would silently
 * mis-compensate every key sampled away from comp.time. A STATIC Position
 * under animated rotation/scale is skipped (it would drift between times).
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

  // Right-handed rotations in AE's axes (x right, y DOWN, z away from viewer).
  // rotZ matches the long-validated 2D rotate: positive Z turns x toward y
  // (clockwise on screen, exactly what AE's Rotation does).
  function rotX(v, deg) {
    var r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  }
  function rotY(v, deg) {
    var r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    return [v[2] * s + v[0] * c, v[1], v[2] * c - v[0] * s];
  }
  function rotZ(v, deg) {
    var r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  }

  // Guarded property reads: a channel that is missing (or refuses to evaluate)
  // counts as zero, so a 2D layer's absent 3D channels never throw.
  function val1(tr, name, time) {
    try { var p = tr.property(name); return p ? p.valueAtTime(time, false) : 0; } catch (e) { return 0; }
  }
  function valV(tr, name, time) {
    try { var p = tr.property(name); var v = p ? p.valueAtTime(time, false) : null; return v || [0, 0, 0]; } catch (e) { return [0, 0, 0]; }
  }

  // Compensation delta in parent space for an anchor change dA (layer space):
  // delta = R * S * dA using the layer's own transform at `time`. A 2D layer
  // uses the Z rotation alone (the long-standing behaviour). A 3D layer applies
  // the FULL chain in AE's transform order (SDK: anchor, scale, rotation Z, Y,
  // X, then orientation, then position), with orientation's Euler angles
  // applied X, Y, Z — otherwise a rotated/oriented 3D layer visibly jumps when
  // the anchor moves, because the XY delta was compensated in the wrong plane.
  function compensate(layer, tr, dA, time) {
    var scale = tr.property(M.scale).valueAtTime(time, false);
    var sz = (scale.length > 2 && typeof scale[2] === 'number') ? scale[2] : 100;
    var v = [dA[0] * scale[0] / 100, dA[1] * scale[1] / 100, (dA[2] || 0) * sz / 100];
    var zdeg = val1(tr, M.rotation, time);
    var is3d = false;
    try { is3d = layer.threeDLayer === true; } catch (e3d) { is3d = false; }
    if (!is3d) return rotZ(v, zdeg);
    v = rotZ(v, zdeg);
    v = rotY(v, val1(tr, M.rotationY, time));
    v = rotX(v, val1(tr, M.rotationX, time));
    var o = valV(tr, M.orientation, time);
    v = rotX(v, o[0]);
    v = rotY(v, o[1]);
    v = rotZ(v, o[2]);
    return v;
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

  // True when any rotation/scale channel that feeds compensate() is keyframed.
  // A single delta sampled at comp.time is then only right at that instant, so
  // callers must either compensate per key time or skip.
  function rotScaleAnimated(layer, tr) {
    var names = [M.scale, M.rotation];
    var is3d = false;
    try { is3d = layer.threeDLayer === true; } catch (e3d) { is3d = false; }
    if (is3d) {
      names.push(M.rotationX);
      names.push(M.rotationY);
      names.push(M.orientation);
    }
    for (var i = 0; i < names.length; i++) {
      var p = null;
      try { p = tr.property(names[i]); } catch (e1) { p = null; }
      if (p && p.numKeys > 0) return true;
    }
    return false;
  }

  // True when Position carries keys (the unified property, or any separated
  // X/Y/Z follower when dimensions are separated).
  function positionHasKeys(tr, posProp) {
    if (posProp.numKeys > 0) return true;
    var sep = false;
    try { sep = posProp.dimensionsSeparated; } catch (e) { sep = false; }
    if (!sep) return false;
    var names = [M.positionX, M.positionY, M.positionZ];
    for (var i = 0; i < names.length; i++) {
      var p = null;
      try { p = tr.property(names[i]); } catch (e1) { p = null; }
      if (p && p.numKeys > 0) return true;
    }
    return false;
  }

  // The offset helpers take deltaAt(t) — the compensation delta AT a time —
  // instead of one constant vector, so a keyed Position under ANIMATED
  // rotation/scale gets each key offset by the delta valid at that key's own
  // time (one delta sampled at comp.time silently mis-compensated every other
  // key). Static channels still evaluate deltaAt once, at `time`.

  // Offset a 1D property (a separated X/Y/Z Position follower, component
  // `dim` of the delta), keys included.
  function offsetScalar(prop, deltaAt, dim, time) {
    if (prop.numKeys > 0) {
      for (var k = 1; k <= prop.numKeys; k++) {
        var t = prop.keyTime(k);
        prop.setValueAtTime(t, prop.keyValue(k) + (deltaAt(t)[dim] || 0));
      }
    } else {
      prop.setValue(prop.value + (deltaAt(time)[dim] || 0));
    }
  }

  // Offset a 2D/3D vector property, keys included, delta sampled per key time.
  function offsetVector(prop, deltaAt, time) {
    if (prop.numKeys > 0) {
      for (var k = 1; k <= prop.numKeys; k++) {
        var t = prop.keyTime(k);
        var delta = deltaAt(t);
        var v = prop.keyValue(k);
        var nv = [v[0] + delta[0], v[1] + delta[1]];
        if (v.length > 2) nv.push(v[2] + (delta[2] || 0));
        prop.setValueAtTime(t, nv);
      }
    } else {
      var d0 = deltaAt(time);
      var pv = prop.value;
      var np = [pv[0] + d0[0], pv[1] + d0[1]];
      if (pv.length > 2) np.push(pv[2] + (d0[2] || 0));
      prop.setValue(np);
    }
  }

  // Apply the compensation delta to Position. When Separate Dimensions is on the
  // unified Position is HIDDEN (setting it throws "a parent property is hidden"),
  // so we drive the X / Y / Z properties (ADBE Position_0/_1/_2) individually,
  // the same way throw / pathfollow do. We try the unified property first and
  // fall back to the separated trio on any failure, so it works even if
  // dimensionsSeparated reports unreliably.
  function offsetSeparated(tr, deltaAt, time) {
    var fx = tr.property(M.positionX);
    var fy = tr.property(M.positionY);
    var fz = tr.property(M.positionZ);
    if (fx) offsetScalar(fx, deltaAt, 0, time);
    if (fy) offsetScalar(fy, deltaAt, 1, time);
    if (fz && (deltaAt(time)[2] || 0) !== 0) offsetScalar(fz, deltaAt, 2, time);
  }
  // True when Position is separated and any X/Y/Z follower is expression-driven.
  // Writing those would fight the expression (the layer jumps while the toast
  // says it stayed put), so callers skip — the unified-Position expression guard
  // alone is bypassed when dimensions are separated.
  function sepPosExpression(tr, posProp) {
    var sep = false;
    try { sep = posProp.dimensionsSeparated; } catch (e) { sep = false; }
    if (!sep) return false;
    var names = [M.positionX, M.positionY, M.positionZ];
    for (var i = 0; i < names.length; i++) {
      var p = null;
      try { p = tr.property(names[i]); } catch (e1) { p = null; }
      if (p) {
        var ex = false;
        try { ex = p.expressionEnabled && p.expression !== ''; } catch (e2) { ex = false; }
        if (ex) return true;
      }
    }
    return false;
  }

  function offsetPosition(tr, posProp, deltaAt, time) {
    var sep = false;
    try { sep = posProp.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) { offsetSeparated(tr, deltaAt, time); return; }
    try {
      offsetVector(posProp, deltaAt, time);
    } catch (e2) {
      // The unified Position refused (hidden / separated leader). If separated
      // followers exist, drive those; otherwise surface the real error.
      if (tr.property(M.positionX)) { offsetSeparated(tr, deltaAt, time); return; }
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
    var already = [];   // layers whose anchor was ALREADY at the target point
    var details = [];   // per-layer ground truth, so "succeeded but nothing changed" is diagnosable

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
        // An expression-driven anchor would silently swallow setValue (the
        // expression keeps winning) while Position still gets offset — the layer
        // would shift with no visible anchor change. Skip it with a reason.
        var aExpr = false;
        try { aExpr = anchorProp.expressionEnabled && anchorProp.expression !== ''; } catch (eAX) { aExpr = false; }
        if (aExpr) {
          skipped.push(layer.name + ' (anchor expression)');
          continue;
        }
        if (posProp.expressionEnabled && posProp.expression !== '') {
          skipped.push(layer.name + ' (position expression)');
          continue;
        }
        if (sepPosExpression(tr, posProp)) {
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

        var dA = [a1[0] - a0[0], a1[1] - a0[1], 0];
        var dist = Math.sqrt(dA[0] * dA[0] + dA[1] * dA[1]);
        // Already at the target (a repeated click): a truthful no-op, reported
        // as such instead of a "success" that visibly does nothing.
        if (dist < 0.01) {
          already.push(layer.name);
          details.push({ layer: layer.name, from: a0, to: a1, distance: 0, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
          continue;
        }

        // compensate() samples rotation/scale at ONE time. With rotation/scale
        // keyframed, a STATIC Position can only be right at that instant — the
        // layer would drift everywhere else — so skip with the reason. A KEYED
        // Position is safe: each key gets the delta valid at its own time.
        var rsAnim = rotScaleAnimated(layer, tr);
        if (rsAnim && !positionHasKeys(tr, posProp)) {
          skipped.push(layer.name + ' (rotation/scale animated, would drift)');
          continue;
        }
        var deltaAt;
        if (rsAnim) {
          deltaAt = (function (ly, trr, d) {
            return function (t) { return compensate(ly, trr, d, t); };
          })(layer, tr, dA);
        } else {
          deltaAt = (function (d) {
            return function () { return d; };
          })(compensate(layer, tr, dA, time));
        }
        var negDeltaAt = (function (fn) {
          return function (t) {
            var d = fn(t);
            return [-d[0], -d[1], -(d[2] || 0)];
          };
        })(deltaAt);

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
          offsetPosition(tr, posProp, deltaAt, time);
        } catch (ep) {
          try { anchorProp.setValue(a0); } catch (er) {}
          skipped.push(layer.name + ' (position: ' + brief(ep) + ')');
          continue;
        }
        // Read the anchor BACK: if AE quietly kept a different value (an
        // override this code did not predict), report it instead of "success".
        var aNow = null;
        try { aNow = anchorProp.value; } catch (eRb) { aNow = null; }
        if (aNow && (Math.abs(aNow[0] - a1[0]) > 0.01 || Math.abs(aNow[1] - a1[1]) > 0.01)) {
          skipped.push(layer.name + ' (anchor did not hold: set ' + Math.round(a1[0]) + ',' + Math.round(a1[1]) + ' but reads ' + Math.round(aNow[0]) + ',' + Math.round(aNow[1]) + ')');
          try { if (!sepPosExpression(tr, posProp)) offsetPosition(tr, posProp, negDeltaAt, time); } catch (eU) {}
          continue;
        }
        details.push({ layer: layer.name, from: a0, to: a1, distance: dist, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
        moved++;
      }
    } finally {
      R.endUndo();
    }

    return { moved: moved, skipped: skipped, already: already, details: details };
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
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var tr = layer.property(M.transform);
      var pos = tr.property(M.position);
      // Skip WITH a reason (a silent continue left the panel toasting a green
      // "Centered 0 layers" with no explanation).
      if (pos.numKeys > 0) { skipped.push(layer.name + ' (position animated)'); continue; }
      if (pos.expressionEnabled && pos.expression !== '') { skipped.push(layer.name + ' (position expression)'); continue; }
      var sep = false; try { sep = pos.dimensionsSeparated; } catch (eSep) { sep = false; }
      if (sep) {
        var px = tr.property(M.positionX), py = tr.property(M.positionY);
        if ((axisX && px && px.numKeys > 0) || (axisY && py && py.numKeys > 0)) { skipped.push(layer.name + ' (position animated)'); continue; }
        if (sepPosExpression(tr, pos)) { skipped.push(layer.name + ' (position expression)'); continue; }
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
    return { moved: moved, skipped: skipped };
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
