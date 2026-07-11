/*
 * Rebound host, rig read-back (read-only).
 *
 * The expression rigs (drift, lean, motion, follow, kinetic, squash) tag their
 * expressions "// Rebound:<tag>" (see lib/rig.jsx) and store their settings in
 * named Slider/Checkbox controls. rig.read reports, for the selected layers,
 * which ones carry a given tool's tag and echoes that tool's control values, so
 * the panel can load a selected rig back into its sliders and flip Apply into
 * Update instead of pretending the layer is blank.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  // Does any property on the layer carry this tool's marker? Breadth-first walk
  // of the property tree with a hard budget, so a huge shape layer can never
  // make the selection-driven read crawl. Expressions live only on leaves.
  function hasTag(layer, marker) {
    var queue = [];
    var budget = 400;
    var i;
    try {
      for (i = 1; i <= layer.numProperties; i++) queue.push(layer.property(i));
    } catch (e) {
      return false;
    }
    while (queue.length && budget > 0) {
      var p = queue.shift();
      budget--;
      if (!p) continue;
      try {
        if (p.propertyType === PropertyType.PROPERTY) {
          if (p.canSetExpression && p.expression && p.expression.indexOf(marker) !== -1) return true;
        } else {
          for (i = 1; i <= p.numProperties; i++) queue.push(p.property(i));
        }
      } catch (e2) {}
    }
    return false;
  }

  // Echo the values of the tool's named controls that exist on the layer
  // (Sliders and Checkboxes both live behind property(1).value).
  function readValues(layer, names) {
    var out = {};
    var found = false;
    for (var i = 0; i < names.length; i++) {
      var ctrl = rig.findByName(layer, names[i]);
      if (!ctrl) continue;
      try {
        var v = ctrl.property(1).value;
        if (typeof v === 'number') { out[names[i]] = v; found = true; }
      } catch (e) {}
    }
    return found ? out : null;
  }

  function read(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    var tag = args && args.tag ? String(args.tag) : '';
    var names = (args && args.sliders && args.sliders.length) ? args.sliders : [];
    if (!tag) throw new Error('rig.read needs a tool tag.');
    var marker = rig.MARKER + ':' + tag + '\n';

    var perLayer = [];
    var rigged = 0;
    var values = null; // the first rigged layer's control values
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
      var has = hasTag(layer, marker);
      var entry = { name: layer.name, rigged: has, values: null };
      if (has) {
        rigged++;
        entry.values = readValues(layer, names);
        if (!values && entry.values) values = entry.values;
      }
      perLayer.push(entry);
    }
    return { rigged: rigged, total: layers.length, values: values, layers: perLayer };
  }

  R.register('rig.read', read); // read-only: no undo label
})();
