/*
 * Rebound host, Trim (fit layer in/out points to its keyframe span).
 *
 * For each selected AVLayer, finds the earliest first keyframe and latest last
 * keyframe across all of its keyed properties — transform, effects, time
 * remap, masks, and shape contents — plus any of its selected properties, then
 * sets inPoint/outPoint to that span padded by paddingFrames. Keyframes are
 * never moved. Layers with no keyframes are reported as skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  // Recursively collect animatable leaf properties that carry keyframes.
  function collectKeyed(group, out) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      if (p.propertyType === PropertyType.PROPERTY) {
        if (p.canVaryOverTime && p.numKeys > 0) out.push(p);
      } else {
        collectKeyed(p, out);
      }
    }
  }

  // Selected properties (across the comp) that belong to this layer and are keyed.
  function selectedKeyedOnLayer(comp, layer, out) {
    var sel = comp.selectedProperties;
    for (var i = 0; i < sel.length; i++) {
      var p = sel[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 1) continue;
      if (util.layerOfProperty(p) === layer) out.push(p);
    }
  }

  // Earliest first keyframe time and latest last keyframe time, or null.
  function keySpan(props) {
    var earliest = null;
    var latest = null;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.numKeys < 1) continue;
      var first = p.keyTime(1);
      var last = p.keyTime(p.numKeys);
      if (earliest === null || first < earliest) earliest = first;
      if (latest === null || last > latest) latest = last;
    }
    if (earliest === null) return null;
    return { earliest: earliest, latest: latest };
  }

  function trim(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to trim.');

    var trimIn = args.trimIn !== false;
    var trimOut = args.trimOut !== false;
    if (!trimIn && !trimOut) throw new Error('Enable trimming the in or out point.');

    var pad = (args.paddingFrames || 0) / comp.frameRate;

    var trimmed = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(layer.name); continue; }

      // Scan every place a layer can carry keyframes, not just Transform:
      // effects, time remap, shape contents, and masks all count.
      var roots = [M.transform, 'ADBE Effect Parade', 'ADBE Time Remapping', 'ADBE Root Vectors Group', 'ADBE Mask Parade'];
      var props = [];
      for (var r = 0; r < roots.length; r++) {
        var root = null;
        try { root = layer.property(roots[r]); } catch (eRoot) { root = null; }
        if (!root) continue;
        if (root.propertyType === PropertyType.PROPERTY) {
          if (root.canVaryOverTime && root.numKeys > 0) props.push(root);
        } else {
          collectKeyed(root, props);
        }
      }
      selectedKeyedOnLayer(comp, layer, props);

      var span = keySpan(props);
      if (!span) { skipped.push(layer.name); continue; }

      if (trimIn) layer.inPoint = span.earliest - pad;
      if (trimOut) layer.outPoint = span.latest + pad;
      trimmed++;
    }

    return { trimmed: trimmed, skipped: skipped };
  }

  R.register('trim.apply', trim, 'Rebound: Trim');
})();
