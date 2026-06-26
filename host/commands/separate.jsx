/*
 * Rebound host, Separate (toggle Separate Dimensions on Position).
 *
 * For each selected AVLayer, sets dimensionsSeparated on its Position property to
 * the requested state. Some properties expose dimensionsSeparated as a read-only
 * value, so the assignment is wrapped in try/catch and a layer is counted only
 * when its state actually changes.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function apply(args) {
    var separate = !!args.separate;
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');

    var changed = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;

      var pos = layer.property(M.transform).property(M.position);
      if (!pos) continue;

      var current = pos.dimensionsSeparated;
      if (typeof current !== 'boolean') continue;
      if (current === separate) continue;

      try {
        pos.dimensionsSeparated = separate;
        if (pos.dimensionsSeparated === separate) changed++;
      } catch (e) {}
    }

    return { changed: changed };
  }

  R.register('separate.apply', apply, 'Rebound: Separate Dimensions');
})();