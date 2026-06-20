/*
 * Rebound host, Nullify (drop a control null at the selection).
 *
 * Builds a null over the selected layers: its position is the average of the
 * selected layers' positions (selection center) or the first layer's position
 * (first-layer anchor). The null's anchor is centered on its own bounding box
 * via sourceRectAtTime so the handle sits where you expect, and the null is
 * moved just above the topmost selected layer. With Parent on, every layer that
 * was selected is parented to the new null.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function positionOf(layer, time) {
    return layer.property(M.transform).property(M.position).valueAtTime(time, false);
  }

  // Average the selected AVLayers' positions for the selection center.
  function centerOf(layers, time) {
    var sx = 0;
    var sy = 0;
    var n = 0;
    for (var i = 0; i < layers.length; i++) {
      var p = positionOf(layers[i], time);
      sx += p[0];
      sy += p[1];
      n++;
    }
    return [sx / n, sy / n];
  }

  // Move the null's anchor to the middle of its own bounds (a null's source
  // rect is its square), so its position handle lands on its visual center.
  function centerAnchor(nullLayer, time) {
    var rect = nullLayer.sourceRectAtTime(time, false);
    var tr = nullLayer.property(M.transform);
    tr.property(M.anchor).setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
  }

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || !selected.length) throw new Error('Select one or more layers to nullify.');

    var time = comp.time;

    // Snapshot the selection and the topmost layer before we mutate the comp:
    // adding the null clears the current selection and shifts layer indices.
    var targets = [];
    var top = selected[0];
    for (var i = 0; i < selected.length; i++) {
      targets.push(selected[i]);
      if (selected[i].index < top.index) top = selected[i];
    }

    var point = (args.position === 'first')
      ? positionOf(targets[0], time)
      : centerOf(targets, time);

    var nullLayer = comp.layers.addNull();
    nullLayer.name = 'Control';
    centerAnchor(nullLayer, time);
    nullLayer.property(M.transform).property(M.position).setValue([point[0], point[1]]);
    nullLayer.moveBefore(top);

    var parented = 0;
    if (args.parent) {
      for (var k = 0; k < targets.length; k++) {
        targets[k].parent = nullLayer;
        parented++;
      }
    }

    return { created: 1, parented: parented };
  }

  R.register('nullify.apply', apply, 'Rebound: Nullify');
})();