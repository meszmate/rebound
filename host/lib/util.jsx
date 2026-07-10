/*
 * Rebound host shared utilities.
 *
 * Locale safety: properties are always addressed by matchName (stable across
 * localized After Effects installs), never by display name.
 */
$.__rebound = $.__rebound || {};
$.__rebound.util = (function () {
  // Stable matchNames for the Transform group and common animatable properties.
  var MATCH = {
    transform: 'ADBE Transform Group',
    anchor: 'ADBE Anchor Point',
    position: 'ADBE Position',
    positionX: 'ADBE Position_0',
    positionY: 'ADBE Position_1',
    positionZ: 'ADBE Position_2',
    scale: 'ADBE Scale',
    rotation: 'ADBE Rotate Z',
    rotationX: 'ADBE Rotate X',
    rotationY: 'ADBE Rotate Y',
    orientation: 'ADBE Orientation',
    opacity: 'ADBE Opacity'
  };

  function isComp(item) {
    return item && item instanceof CompItem;
  }

  // Returns the active CompItem or throws a friendly error for the panel.
  function activeComp() {
    var item = app.project ? app.project.activeItem : null;
    if (!item) {
      throw new Error('Open a composition to use this tool.');
    }
    if (!isComp(item)) {
      throw new Error('The active item is not a composition.');
    }
    return item;
  }

  // The Layer that owns a Property (walk to the top of the property tree).
  function layerOfProperty(prop) {
    return prop.propertyGroup(prop.propertyDepth);
  }

  // Number of value components for a property (1/2/3 for scalars/vectors, 4 for color).
  function dimensionsOf(prop) {
    switch (prop.propertyValueType) {
      case PropertyValueType.ThreeD:
      case PropertyValueType.ThreeD_SPATIAL:
        return 3;
      case PropertyValueType.TwoD:
      case PropertyValueType.TwoD_SPATIAL:
        return 2;
      case PropertyValueType.COLOR:
        return 4;
      case PropertyValueType.OneD:
        return 1;
      default:
        return 0;
    }
  }

  // Number of KeyframeEase objects setTemporalEaseAtKey expects. NOT the value
  // dimensionality: COLOR (4 components) and CUSTOM_VALUE/NO_VALUE/SHAPE take
  // exactly ONE ease, spatial properties too; only plain TwoD/ThreeD take 2/3.
  function temporalDims(prop) {
    if (isSpatial(prop)) return 1;
    switch (prop.propertyValueType) {
      case PropertyValueType.ThreeD: return 3;
      case PropertyValueType.TwoD: return 2;
      default: return 1;
    }
  }

  function isSpatial(prop) {
    return prop.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
      prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
  }

  function dist(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) { var d = (b[i] || 0) - (a[i] || 0); s += d * d; }
    return Math.sqrt(s);
  }

  // The distance a spatial property actually travels between two times (the
  // motion-path arc length), sampled uniformly in time. A straight path returns
  // ~the chord; a curved (auto-bezier) or there-and-back path returns the true
  // travel — the correct `dv` for a single along-the-path temporal ease, shared
  // by ease apply/read and the live readout so all three agree.
  function spatialArcLength(prop, ta, tb) {
    var n = 24;
    var len = 0;
    var pv = prop.valueAtTime(ta, true);
    var prev = pv instanceof Array ? pv : [pv];
    for (var i = 1; i <= n; i++) {
      var cv = prop.valueAtTime(ta + (tb - ta) * (i / n), true);
      var cur = cv instanceof Array ? cv : [cv];
      len += dist(prev, cur);
      prev = cur;
    }
    return len;
  }

  // The spatial dv to ease with: the arc length when the path is curved or
  // returns near its start (chord tiny), else the plain straight-line chord.
  function spatialDelta(prop, ta, tb, aVals, bVals) {
    var chord = dist(aVals, bVals);
    var arc = spatialArcLength(prop, ta, tb);
    return (arc > chord * 1.01 || chord < 1e-6) ? arc : chord;
  }

  // Resolve a property on a layer from an array of matchNames, e.g.
  // ['ADBE Transform Group','ADBE Position'].
  function resolveProperty(layer, path) {
    var prop = layer;
    for (var i = 0; i < path.length; i++) {
      prop = prop.property(path[i]);
      if (!prop) {
        throw new Error('Property not found: ' + path.join(' > '));
      }
    }
    return prop;
  }

  // Find a layer in a comp by its index (1-based, matching AE).
  function layerByIndex(comp, index) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).index === index) {
        return comp.layer(i);
      }
    }
    throw new Error('Layer ' + index + ' not found.');
  }

  // Convert an RGB color from AE's 0..1 floats to a 0..255 triplet.
  function color255(c) {
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
  }

  // Make a keyframe a smooth, hand-editable CONTINUOUS bezier with LONG tangent
  // handles (the buttery feel): bezier interpolation (not auto, so the two
  // handles stay where set and are draggable in the Graph Editor), continuous
  // tangents through the point so the curve flows without a kink, then the
  // handles are lengthened by raising temporal-ease influence on both sides.
  // Keeps AE's continuous-computed speed and only stretches the influence.
  function smoothTemporalKey(prop, ki, influence) {
    influence = influence > 0 ? influence : 45;
    if (influence > 90) influence = 90; // leave headroom so beziers stay valid
    try { prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) {}
    try { prop.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
    try { prop.setTemporalContinuousAtKey(ki, true); } catch (e2) {}
    try {
      var inE = prop.keyInTemporalEase(ki);
      var outE = prop.keyOutTemporalEase(ki);
      var nin = [];
      var nout = [];
      for (var d = 0; d < inE.length; d++) {
        nin.push(new KeyframeEase(inE[d].speed, influence));
        nout.push(new KeyframeEase(outE[d].speed, influence));
      }
      prop.setTemporalEaseAtKey(ki, nin, nout);
    } catch (e3) {}
  }

  // Remove every layer in the comp whose name matches, so a tool that drops a
  // named helper layer can replace it instead of piling up duplicates. Returns
  // the number removed. Highest index first so indices stay valid.
  function removeLayersNamed(comp, name) {
    var removed = 0;
    for (var i = comp.numLayers; i >= 1; i--) {
      var layer = comp.layer(i);
      if (layer.name === name) {
        layer.remove();
        removed++;
      }
    }
    return removed;
  }

  // --- Parent-aware comp-space geometry (hoisted from align.jsx) -------------
  // A layer's Position lives in its PARENT's coordinate space (comp space only
  // when it has no parent), so geometry based on raw Position is wrong for
  // parented layers — e.g. anything imported into a group/frame. These helpers
  // map layer content through the full parent chain into true COMP space and
  // convert comp-space moves back into a layer's own Position space. Shared by
  // align / arrange / flip / comp / pins / nullify / reset so they all agree.

  // Position read that also works when X/Y dimensions are separated.
  function posOf(tr, time) {
    var p = tr.property(MATCH.position);
    var sep = false; try { sep = p.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) {
      var px = tr.property(MATCH.positionX), py = tr.property(MATCH.positionY);
      return [px ? px.valueAtTime(time, false) : 0, py ? py.valueAtTime(time, false) : 0];
    }
    return p.valueAtTime(time, false);
  }

  // This layer's own space -> its parent's space as a 2x3 affine [a,b,c,d,tx,ty]
  // mapping (x,y) -> (a*x+c*y+tx, b*x+d*y+ty). AE: P_parent = pos + Rot*Scale*(P-anc),
  // rotation is Z (clockwise-positive, Y down) — matches the importer's convention.
  function localMatrix(layer, time) {
    var tr = layer.property(MATCH.transform);
    var pos = posOf(tr, time);
    var anc = [0, 0]; try { anc = tr.property(MATCH.anchor).valueAtTime(time, false); } catch (e1) {}
    var scale = [100, 100]; try { scale = tr.property(MATCH.scale).valueAtTime(time, false); } catch (e2) {}
    var rot = 0; try { rot = tr.property(MATCH.rotation).valueAtTime(time, false); } catch (e3) {}
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

  // Convert a COMP-space POINT into the layer's parent space — the space its
  // Position is written in (inverse of the parent's world matrix). No parent ->
  // already comp space.
  function compPointToParent(layer, x, y, time) {
    var p = layer.parent;
    if (!p) return [x, y];
    var pm = compMatrix(p, time);
    return compDeltaToParent(layer, x - pm[4], y - pm[5], time);
  }

  // Axis-aligned COMP-space bounding box of a layer's content: sourceRectAtTime
  // mapped through the full parent-chain matrix (rotation and parents included).
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

  function unionBoxes(boxes) {
    var u = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (var i = 0; i < boxes.length; i++) {
      u.minX = Math.min(u.minX, boxes[i].minX);
      u.minY = Math.min(u.minY, boxes[i].minY);
      u.maxX = Math.max(u.maxX, boxes[i].maxX);
      u.maxY = Math.max(u.maxY, boxes[i].maxY);
    }
    return u;
  }

  // Offset a 1D follower (a separated X/Y Position) by d, keys included.
  function offsetScalar(p, d) {
    if (!p) return;
    if (p.numKeys > 0) { for (var k = 1; k <= p.numKeys; k++) p.setValueAtTime(p.keyTime(k), p.keyValue(k) + d); }
    else p.setValue(p.value + d);
  }

  // Offset a layer's Position by (dx, dy) in its OWN Position space, keys
  // included; drives the X/Y followers when dimensions are separated. Returns
  // false (untouched) when Position is expression-driven.
  function offsetLayerPosition(layer, dx, dy) {
    var tr = layer.property(MATCH.transform);
    var pos = tr.property(MATCH.position);
    if (pos.expressionEnabled && pos.expression !== '') return false;
    // Separate Dimensions hides the unified Position; drive the X/Y followers.
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) { offsetScalar(tr.property(MATCH.positionX), dx); offsetScalar(tr.property(MATCH.positionY), dy); return true; }
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

  // Move a layer by (dx, dy) in COMP space, converting through the parent chain.
  function moveLayer(layer, dx, dy, time) {
    var dd = compDeltaToParent(layer, dx, dy, time);
    return offsetLayerPosition(layer, dd[0], dd[1]);
  }

  return {
    MATCH: MATCH,
    isComp: isComp,
    activeComp: activeComp,
    layerOfProperty: layerOfProperty,
    dimensionsOf: dimensionsOf,
    temporalDims: temporalDims,
    isSpatial: isSpatial,
    spatialArcLength: spatialArcLength,
    spatialDelta: spatialDelta,
    resolveProperty: resolveProperty,
    layerByIndex: layerByIndex,
    color255: color255,
    smoothTemporalKey: smoothTemporalKey,
    removeLayersNamed: removeLayersNamed,
    posOf: posOf,
    localMatrix: localMatrix,
    mulMat: mulMat,
    applyMat: applyMat,
    compMatrix: compMatrix,
    compDeltaToParent: compDeltaToParent,
    compPointToParent: compPointToParent,
    bboxOf: bboxOf,
    unionBoxes: unionBoxes,
    offsetScalar: offsetScalar,
    offsetLayerPosition: offsetLayerPosition,
    moveLayer: moveLayer
  };
})();
