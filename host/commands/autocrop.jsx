/*
 * Rebound host, AutoCrop (mask a layer to its visible content).
 *
 * For each selected AV layer, reads its content bounds (sourceRectAtTime) at the
 * current time and adds a rectangular mask named "Rebound Crop" at those bounds,
 * grown by an optional pixel margin, so the transparent border around the
 * content is clipped away. Replaces an earlier Rebound Crop mask instead of
 * stacking. Non-destructive: removing the mask restores the full layer.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var MASK_PARADE = 'ADBE Mask Parade';
  var MASK_ATOM = 'ADBE Mask Atom';
  var MASK_SHAPE = 'ADBE Mask Shape';
  var CROP_NAME = 'Rebound Crop';

  function removeCropMask(parade) {
    for (var i = parade.numProperties; i >= 1; i--) {
      if (parade.property(i).name === CROP_NAME) parade.property(i).remove();
    }
  }

  function rectShape(l, t, r, b) {
    var s = new Shape();
    s.vertices = [[l, t], [r, t], [r, b], [l, b]];
    s.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    s.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    s.closed = true;
    return s;
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to crop.');

    var pad = (args && !isNaN(args.padding)) ? args.padding : 0;
    var extents = !!(args && args.extents);
    var time = comp.time;

    var cropped = 0, skipped = [];
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (no content)'); continue; }
      var parade = layer.property(MASK_PARADE);
      if (!parade) { skipped.push(layer.name + ' (cannot mask)'); continue; }

      var rect = layer.sourceRectAtTime(time, extents);
      if (rect.width <= 0 || rect.height <= 0) { skipped.push(layer.name + ' (empty)'); continue; }

      var l = rect.left - pad;
      var t = rect.top - pad;
      var r = rect.left + rect.width + pad;
      var b = rect.top + rect.height + pad;

      removeCropMask(parade);
      var mask = parade.addProperty(MASK_ATOM);
      mask.name = CROP_NAME;
      mask.property(MASK_SHAPE).setValue(rectShape(l, t, r, b));
      cropped++;
    }

    if (!cropped) throw new Error('No layers with content bounds to crop.');
    return { cropped: cropped, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) continue;
      var parade = layer.property(MASK_PARADE);
      if (!parade) continue;
      var before = parade.numProperties;
      removeCropMask(parade);
      if (parade.numProperties < before) cleared++;
    }
    if (!cleared) throw new Error('No Rebound Crop mask on the selected layers.');
    return { cleared: cleared };
  }

  R.register('autocrop.apply', apply, 'Rebound: Auto Crop');
  R.register('autocrop.remove', remove, 'Rebound: Remove Auto Crop');
})();
