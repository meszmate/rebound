/*
 * Rebound host, align + distribute commands.
 *
 * Bounds-based (like the comp viewer), using each layer's sourceRectAtTime
 * transformed to composition space. Rotation is not factored into the bounding
 * box (axis-aligned bounds), which matches how alignment is normally used.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  // --- Parent-aware comp-space geometry --------------------------------------
  // A layer's Position lives in its PARENT's coordinate space (comp space only when
  // it has no parent), so aligning by raw Position is wrong for parented layers —
  // e.g. anything imported into a group/frame, whose box would be measured in the
  // container's space while the reference is in comp space. We map each layer's
  // content rect into true COMP space through the full parent chain, align there,
  // then convert the resulting move back into the layer's own Position space.

  // Position read that also works when X/Y dimensions are separated.
  function posOf(tr, time) {
    var p = tr.property(M.position);
    var sep = false; try { sep = p.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) {
      var px = tr.property(M.positionX), py = tr.property(M.positionY);
      return [px ? px.valueAtTime(time, false) : 0, py ? py.valueAtTime(time, false) : 0];
    }
    return p.valueAtTime(time, false);
  }

  // This layer's own space -> its parent's space as a 2x3 affine [a,b,c,d,tx,ty]
  // mapping (x,y) -> (a*x+c*y+tx, b*x+d*y+ty). AE: P_parent = pos + Rot*Scale*(P-anc),
  // rotation is Z (clockwise-positive, Y down) — matches the importer's convention.
  function localMatrix(layer, time) {
    var tr = layer.property(M.transform);
    var pos = posOf(tr, time);
    var anc = [0, 0]; try { anc = tr.property(M.anchor).valueAtTime(time, false); } catch (e1) {}
    var scale = [100, 100]; try { scale = tr.property(M.scale).valueAtTime(time, false); } catch (e2) {}
    var rot = 0; try { rot = tr.property(M.rotation).valueAtTime(time, false); } catch (e3) {}
    var sx = scale[0] / 100, sy = scale[1] / 100;
    var rad = rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    var a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
    var tx = pos[0] - (a * anc[0] + c * anc[1]);
    var ty = pos[1] - (b * anc[0] + d * anc[1]);
    return [a, b, c, d, tx, ty];
  }

  // Compose A∘B (apply B first, then A).
  function mulMat(A, B) {
    return [
      A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
    ];
  }
  function applyMat(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  // Full layer-space -> comp-space affine, walking the parent chain (guarded).
  function compMatrix(layer, time) {
    var m = localMatrix(layer, time);
    var p = layer.parent, guard = 0;
    while (p && guard < 64) { m = mulMat(localMatrix(p, time), m); p = p.parent; guard++; }
    return m;
  }

  // Convert a COMP-space translation into the layer's own Position space (its
  // parent's linear frame), so offsetting Position by it moves the layer (dx,dy)
  // in the composition. No parent -> Position is already comp space.
  function compDeltaToParent(layer, dx, dy, time) {
    var p = layer.parent;
    if (!p) return [dx, dy];
    var pm = compMatrix(p, time);
    var a = pm[0], b = pm[1], c = pm[2], d = pm[3];
    var det = a * d - b * c;
    if (!det) return [dx, dy];
    return [(d * dx - c * dy) / det, (-b * dx + a * dy) / det];
  }

  function moveLayer(layer, dx, dy, time) {
    var dd = compDeltaToParent(layer, dx, dy, time);
    return offsetPosition(layer, dd[0], dd[1]);
  }

  function bboxOf(layer, time) {
    var rect = layer.sourceRectAtTime(time, false);
    var m = compMatrix(layer, time);
    var c0 = applyMat(m, rect.left, rect.top);
    var c1 = applyMat(m, rect.left + rect.width, rect.top);
    var c2 = applyMat(m, rect.left + rect.width, rect.top + rect.height);
    var c3 = applyMat(m, rect.left, rect.top + rect.height);
    return {
      layer: layer,
      minX: Math.min(c0[0], c1[0], c2[0], c3[0]),
      maxX: Math.max(c0[0], c1[0], c2[0], c3[0]),
      minY: Math.min(c0[1], c1[1], c2[1], c3[1]),
      maxY: Math.max(c0[1], c1[1], c2[1], c3[1])
    };
  }

  // Offset a 1D follower (a separated X/Y Position) by d, keys included.
  function offsetScalar(p, d) {
    if (!p) return;
    if (p.numKeys > 0) { for (var k = 1; k <= p.numKeys; k++) p.setValueAtTime(p.keyTime(k), p.keyValue(k) + d); }
    else p.setValue(p.value + d);
  }
  function offsetPosition(layer, dx, dy) {
    var tr = layer.property(M.transform);
    var pos = tr.property(M.position);
    if (pos.expressionEnabled && pos.expression !== '') return false;
    // Separate Dimensions hides the unified Position; drive the X/Y followers.
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) { offsetScalar(tr.property(M.positionX), dx); offsetScalar(tr.property(M.positionY), dy); return true; }
    if (pos.numKeys > 0) {
      for (var k = 1; k <= pos.numKeys; k++) {
        var v = pos.keyValue(k);
        var nv = [v[0] + dx, v[1] + dy];
        if (v.length > 2) nv.push(v[2]);
        pos.setValueAtTime(pos.keyTime(k), nv);
      }
    } else {
      var pv = pos.value;
      var np = [pv[0] + dx, pv[1] + dy];
      if (pv.length > 2) np.push(pv[2]);
      pos.setValue(np);
    }
    return true;
  }

  function avBoxes(comp) {
    var layers = comp.selectedLayers;
    var out = [];
    for (var i = 0; i < layers.length; i++) {
      if (!(layers[i] instanceof CameraLayer || layers[i] instanceof LightLayer)) out.push(bboxOf(layers[i], comp.time));
    }
    return out;
  }

  function feature(box, g, axis) {
    var lo = axis === 'x' ? box.minX : box.minY;
    var hi = axis === 'x' ? box.maxX : box.maxY;
    return g === 0 ? lo : g === 1 ? hi : (lo + hi) / 2;
  }

  function union(boxes) {
    var u = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (var i = 0; i < boxes.length; i++) {
      u.minX = Math.min(u.minX, boxes[i].minX);
      u.minY = Math.min(u.minY, boxes[i].minY);
      u.maxX = Math.max(u.maxX, boxes[i].maxX);
      u.maxY = Math.max(u.maxY, boxes[i].maxY);
    }
    return u;
  }

  function align(args) {
    var comp = util.activeComp();
    var boxes = avBoxes(comp);
    if (!boxes.length) throw new Error('Select one or more layers.');

    var gx = args.gx;
    var gy = args.gy;
    var axes = args.axes || 'both';
    var doX = axes === 'both' || axes === 'x';
    var doY = axes === 'both' || axes === 'y';
    var group = args.mode === 'group';

    // Align to the selection's combined bounds only when there are 2+ layers to
    // line up; a lone layer (or explicit Composition) aligns to the comp frame.
    var ref;
    if (args.relativeTo === 'selection' && boxes.length > 1) {
      ref = union(boxes);
    } else {
      ref = { minX: 0, minY: 0, maxX: comp.width, maxY: comp.height };
    }

    var moved = 0;
    if (group) {
      var u = union(boxes);
      var dx = doX && gx != null ? feature(ref, gx, 'x') - feature(u, gx, 'x') : 0;
      var dy = doY && gy != null ? feature(ref, gy, 'y') - feature(u, gy, 'y') : 0;
      for (var i = 0; i < boxes.length; i++) {
        if (moveLayer(boxes[i].layer, dx, dy, comp.time)) moved++;
      }
    } else {
      for (var j = 0; j < boxes.length; j++) {
        var b = boxes[j];
        var ddx = doX && gx != null ? feature(ref, gx, 'x') - feature(b, gx, 'x') : 0;
        var ddy = doY && gy != null ? feature(ref, gy, 'y') - feature(b, gy, 'y') : 0;
        if (moveLayer(b.layer, ddx, ddy, comp.time)) moved++;
      }
    }
    return { moved: moved };
  }

  function distribute(args) {
    var comp = util.activeComp();
    var boxes = avBoxes(comp);
    if (boxes.length < 3) throw new Error('Select three or more layers to distribute.');
    var axis = args.axis === 'y' ? 'y' : 'x';
    var lo = axis === 'x' ? 'minX' : 'minY';
    var hi = axis === 'x' ? 'maxX' : 'maxY';

    boxes.sort(function (a, b) { return a[lo] - b[lo]; });

    var sizes = [];
    for (var bi = 0; bi < boxes.length; bi++) sizes.push(boxes[bi][hi] - boxes[bi][lo]);
    var first = boxes[0][lo];
    var last = boxes[boxes.length - 1][hi];

    var gap;
    if (args.mode === 'gap') {
      gap = args.gap || 0;
    } else {
      var sumSizes = 0;
      for (var s = 0; s < sizes.length; s++) sumSizes += sizes[s];
      gap = (last - first - sumSizes) / (boxes.length - 1);
    }

    var cursor = first;
    var moved = 0;
    for (var i = 0; i < boxes.length; i++) {
      var target = cursor;
      var delta = target - boxes[i][lo];
      if (axis === 'x') {
        if (moveLayer(boxes[i].layer, delta, 0, comp.time)) moved++;
      } else {
        if (moveLayer(boxes[i].layer, 0, delta, comp.time)) moved++;
      }
      cursor += sizes[i] + gap;
    }
    return { moved: moved, gap: Math.round(gap) };
  }

  R.register('align.layers', align, 'Rebound: Align');
  R.register('align.distribute', distribute, 'Rebound: Distribute');
})();
