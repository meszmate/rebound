/*
 * Rebound host, anchor point commands.
 *
 * Moves a layer's anchor to a point on its bounding box WITHOUT moving the
 * layer, by compensating Position. The exact relationship is:
 *   newPosition = oldPosition + R*S*(newAnchor - oldAnchor)
 * where S is the layer's scale and R its rotation at the evaluated time. When
 * Position is keyframed, every key is offset by the same delta.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function transformOf(layer) {
    return layer.property(M.transform);
  }

  function rotate2d(v, deg) {
    var r = (deg * Math.PI) / 180;
    var c = Math.cos(r);
    var s = Math.sin(r);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  }

  // Compensation delta in parent space for an anchor change dA (layer space).
  function compensate(tr, dA, time) {
    var scale = tr.property(M.scale).valueAtTime(time, false);
    var sx = scale[0] / 100;
    var sy = scale[1] / 100;
    var scaled = [dA[0] * sx, dA[1] * sy];
    var rotProp = tr.property(M.rotation);
    var deg = rotProp ? rotProp.valueAtTime(time, false) : 0;
    var rot = rotate2d(scaled, deg);
    return [rot[0], rot[1], dA.length > 2 ? dA[2] * (scale[2] ? scale[2] / 100 : 1) : 0];
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

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) {
        skipped.push(layer.name + ' (no bounds)');
        continue;
      }

      var tr = transformOf(layer);
      var anchorProp = tr.property(M.anchor);
      var posProp = tr.property(M.position);

      if (anchorProp.numKeys > 0) {
        skipped.push(layer.name + ' (animated anchor)');
        continue;
      }
      if (posProp.expressionEnabled && posProp.expression !== '') {
        skipped.push(layer.name + ' (position expression)');
        continue;
      }

      var rect = layer.sourceRectAtTime(time, false);
      var is3d = anchorProp.value.length > 2;
      var a0 = anchorProp.value;
      var a1 = [rect.left + gx * rect.width, rect.top + gy * rect.height];
      if (is3d) a1.push(a0[2]);

      var dA = [a1[0] - a0[0], a1[1] - a0[1], is3d ? 0 : 0];
      var delta = compensate(tr, dA, time);

      anchorProp.setValue(a1);

      if (posProp.numKeys > 0) {
        for (var k = 1; k <= posProp.numKeys; k++) {
          var v = posProp.keyValue(k);
          var nv = [v[0] + delta[0], v[1] + delta[1]];
          if (v.length > 2) nv.push(v[2] + delta[2]);
          posProp.setValueAtTime(posProp.keyTime(k), nv);
        }
      } else {
        var pv = posProp.value;
        var np = [pv[0] + delta[0], pv[1] + delta[1]];
        if (pv.length > 2) np.push(pv[2] + delta[2]);
        posProp.setValue(np);
      }
      moved++;
    }

    return { moved: moved, skipped: skipped };
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

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var pos = layer.property(M.transform).property(M.position);
      if (pos.numKeys > 0 || (pos.expressionEnabled && pos.expression !== '')) continue;
      var v = pos.value;
      var nv = [axisX ? cx : v[0], axisY ? cy : v[1]];
      if (v.length > 2) nv.push(v[2]);
      pos.setValue(nv);
      moved++;
    }
    return { moved: moved };
  }

  R.register('anchor.move', moveAnchor, 'Rebound: Move Anchor');
  R.register('anchor.centerInComp', centerInComp, 'Rebound: Center in Comp');
})();
