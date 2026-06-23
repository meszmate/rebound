/*
 * Rebound host, Pins (puppet / rig-handle assist).
 *
 * Puppet pin meshes are only partly scriptable, so this is best-effort and
 * honest about it: it adds the Puppet (FreePin) effect to each selected layer
 * when After Effects allows it (so the mesh is generated and you place pins with
 * the Puppet tool), and it always drops controller nulls at the layer's bounding
 * box points (corners, edge midpoints, center) as ready rig handles. The result
 * reports exactly what it managed to do.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  var PUPPET = 'ADBE FreePin3';

  function readPos(tg, t0) {
    var pos = tg.property(M.position);
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) return [tg.property(M.positionX).valueAtTime(t0, false), tg.property(M.positionY).valueAtTime(t0, false)];
    var v = pos.valueAtTime(t0, false);
    return (v instanceof Array) ? v : [v, 0];
  }

  function layerToComp(pt, ref, t0) {
    var tg = ref.property(M.transform);
    var anchor = tg.property(M.anchor).valueAtTime(t0, false);
    var pos = readPos(tg, t0);
    var scale = tg.property(M.scale).valueAtTime(t0, false);
    var rot = tg.property(M.rotation).valueAtTime(t0, false);
    var lx = (pt[0] - anchor[0]) * (scale[0] / 100);
    var ly = (pt[1] - anchor[1]) * (scale[1] / 100);
    var r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [pos[0] + (lx * c - ly * s), pos[1] + (lx * s + ly * c)];
  }

  function hasEffect(layer, matchName) {
    var fx = layer.property('ADBE Effect Parade');
    if (!fx) return false;
    for (var i = 1; i <= fx.numProperties; i++) {
      if (fx.property(i).matchName === matchName) return true;
    }
    return false;
  }

  function pinPoints(rect, count) {
    var L, T, W, H;
    if (rect) { L = rect.left; T = rect.top; W = rect.width; H = rect.height; }
    else { L = -50; T = -50; W = 100; H = 100; }
    var Rt = L + W, B = T + H, cx = L + W / 2, cy = T + H / 2;
    var cand = [[L, T], [Rt, T], [Rt, B], [L, B], [cx, T], [Rt, cy], [cx, B], [L, cy], [cx, cy]];
    return cand.slice(0, count);
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select a layer to pin.');

    var t0 = comp.time;
    var count = args.count != null ? Math.max(1, Math.min(9, Math.round(args.count))) : 4;
    var addPuppet = args.puppet !== false;
    var label = args.label != null ? args.label : 0;

    var nulls = 0, puppetAdded = 0, puppetFailed = 0, skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (unsupported layer)'); continue; }

      if (addPuppet) {
        try {
          var fx = layer.property('ADBE Effect Parade');
          if (fx && hasEffect(layer, PUPPET)) { /* already present */ }
          else if (fx && fx.canAddProperty(PUPPET)) { fx.addProperty(PUPPET); puppetAdded++; }
          else puppetFailed++;
        } catch (e) { puppetFailed++; }
      }

      var rect = null;
      try { rect = layer.sourceRectAtTime(t0, false); } catch (e2) { rect = null; }
      var pts = pinPoints(rect, count);
      for (var p = 0; p < pts.length; p++) {
        var cp = layerToComp(pts[p], layer, t0);
        var nul = comp.layers.addNull();
        nul.name = layer.name + ' Pin ' + (p + 1);
        nul.property(M.transform).property(M.position).setValue(cp);
        try { if (label) nul.label = label; } catch (e3) {}
        nulls++;
      }
    }

    if (!nulls && !puppetAdded) throw new Error('No supported layers to pin: ' + skipped.join(', '));
    return { nulls: nulls, puppetAdded: puppetAdded, puppetFailed: puppetFailed, skipped: skipped };
  }

  R.register('pins.apply', apply, 'Rebound: Pins');
})();
