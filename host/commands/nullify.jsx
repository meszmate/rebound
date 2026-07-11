/*
 * Rebound host, Nullify (drop a control null at the selection).
 *
 * Builds a null over the selected layers: its position is the average of the
 * selected layers' positions (anchor average), the centre of their combined
 * bounding boxes (bounds center), or the first layer's position (first-layer
 * anchor). The null's anchor is centered on its own bounding box via
 * sourceRectAtTime so the handle sits where you expect, and the null is moved
 * just above the topmost selected layer. With Parent on, every layer that was
 * selected is parented to the new null. Mode 'each' instead drops one null per
 * layer ('<layer> Ctrl', label colour matched) at that layer's world position.
 * Names auto-increment so repeated applies never pile up duplicates.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  // A layer's position point in COMP space. Raw Position is PARENT-space for
  // parented layers (e.g. imported groups), so averaging raw values would land
  // the unparented control null in the wrong place. The anchor point mapped
  // through the full parent-chain matrix is exactly the position point in comp
  // space (and equals raw Position for unparented layers).
  function positionOf(layer, time) {
    var anc = [0, 0];
    try { anc = layer.property(M.transform).property(M.anchor).valueAtTime(time, false); } catch (e) { anc = [0, 0]; }
    return util.applyMat(util.compMatrix(layer, time), anc[0], anc[1]);
  }

  // Average the selected AVLayers' comp-space positions for the selection center.
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

  // The VISUAL centre of the selection: the middle of the union of the layers'
  // comp-space bounding boxes (util.bboxOf), not the anchor average — a big
  // background plus a small badge centres on what you see, not between anchors.
  function boundsCenterOf(layers, time) {
    var boxes = [];
    for (var i = 0; i < layers.length; i++) {
      if (layers[i] instanceof CameraLayer || layers[i] instanceof LightLayer) continue;
      var b = null;
      try { b = util.bboxOf(layers[i], time); } catch (e) { b = null; }
      if (b) boxes.push(b);
    }
    if (!boxes.length) return null;
    var u = util.unionBoxes(boxes);
    return [(u.minX + u.maxX) / 2, (u.minY + u.maxY) / 2];
  }

  // First unused variant of a name ('Control', 'Control 2', 'Control 3', …) so
  // repeated applies never pile up five identical 'Control's.
  function uniqueLayerName(comp, base) {
    var used = {};
    for (var i = 1; i <= comp.numLayers; i++) used[comp.layer(i).name] = true;
    if (!used[base]) return base;
    var n = 2;
    while (used[base + ' ' + n]) n++;
    return base + ' ' + n;
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

    // One null PER layer: a control at each layer's world position, named
    // '<layer> Ctrl', label colour matched, sitting just above its layer.
    if (args.mode === 'each') {
      var created = 0;
      var parentedEach = 0;
      for (var e = 0; e < targets.length; e++) {
        var layer = targets[e];
        var lp = positionOf(layer, time);
        var nl = comp.layers.addNull();
        nl.name = uniqueLayerName(comp, layer.name + ' Ctrl');
        try { nl.label = layer.label; } catch (eLabel) {}
        centerAnchor(nl, time);
        nl.property(M.transform).property(M.position).setValue([lp[0], lp[1]]);
        nl.moveBefore(layer);
        created++;
        if (args.parent) {
          layer.parent = nl;
          parentedEach++;
        }
      }
      return { created: created, parented: parentedEach };
    }

    var point;
    if (args.position === 'first') {
      point = positionOf(targets[0], time);
    } else if (args.position === 'bounds') {
      point = boundsCenterOf(targets, time) || centerOf(targets, time);
    } else {
      point = centerOf(targets, time);
    }

    var baseName = (args.name == null || String(args.name) === '') ? 'Control' : String(args.name);
    var nullLayer = comp.layers.addNull();
    nullLayer.name = uniqueLayerName(comp, baseName);
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