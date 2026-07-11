/*
 * Rebound host, Precompose (nest the selected layers into a new comp).
 *
 * Collects the 1-based indices of the selected layers and hands them to
 * comp.layers.precompose with the requested name and "move all attributes"
 * flag. With moveAttributes off the layers are wrapped without lifting their
 * transforms (only valid when a single layer is selected, which AE enforces).
 * With trim on, the new comp is cut down to the union span of the moved layers
 * and the nested layer is re-timed so the content plays exactly where it was.
 * When asked, the freshly created comp is brought up in a viewer.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // Trim the new comp to the union [min inPoint, max outPoint] of the layers
  // moved into it: shift every layer so the span starts at 0, size the comp's
  // duration to the span, then re-time the nested layer in the original comp
  // (startTime/in/outPoint) so the content plays exactly where it did before.
  function trimToSpan(comp, newComp) {
    if (!newComp.numLayers) return false;
    var start = null;
    var end = null;
    var i, L;
    for (i = 1; i <= newComp.numLayers; i++) {
      L = newComp.layer(i);
      if (start === null || L.inPoint < start) start = L.inPoint;
      if (end === null || L.outPoint > end) end = L.outPoint;
    }
    if (start === null || !(end > start)) return false;

    for (i = 1; i <= newComp.numLayers; i++) {
      L = newComp.layer(i);
      L.startTime = L.startTime - start;
    }
    var frame = newComp.frameDuration || (1 / (newComp.frameRate || 30));
    var span = end - start;
    if (span < frame) span = frame;
    newComp.duration = span;

    // The nested layer that now hosts the new comp, back in the original comp.
    for (i = 1; i <= comp.numLayers; i++) {
      var nested = comp.layer(i);
      var src = null;
      try { src = nested.source; } catch (e) { src = null; }
      if (src === newComp) {
        nested.startTime = start;
        nested.inPoint = start;
        nested.outPoint = end;
        break;
      }
    }
    return true;
  }

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || !selected.length) {
      throw new Error('Select one or more layers to precompose.');
    }

    var indices = [];
    for (var i = 0; i < selected.length; i++) {
      indices.push(selected[i].index);
    }

    var name = (args.name == null || args.name === '') ? 'Precomp' : '' + args.name;
    var moveAttributes = !!args.moveAttributes;

    var newComp = comp.layers.precompose(indices, name, moveAttributes);

    var trimmed = false;
    if (args.trim && newComp) {
      trimmed = trimToSpan(comp, newComp);
    }

    if (args.open && newComp) {
      newComp.openInViewer();
    }

    return { created: 1, name: newComp ? newComp.name : name, trimmed: trimmed };
  }

  R.register('precompose.apply', apply, 'Rebound: Precompose');
})();
