/*
 * Rebound host, Lottie export reader/writer.
 *
 * lottie.read  -> a JSON-able doc of the selected layers' transform animation
 *                 (anchor/position/scale/rotation/opacity), with each segment's
 *                 normalized cubic-bezier ease. The panel turns this into Lottie
 *                 JSON (client/js/export/lottie.js, unit-tested) — same math as
 *                 the rest of Rebound, so eases round-trip exactly.
 * lottie.save  -> write a JSON string the panel produced to a file.
 *
 * v1 scope: transform animation of solids/nulls/shapes (shapes carry a colored
 * rect placeholder); text/other export transform-only. Flagged back to the panel.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function r3(v) { return Math.round((v || 0) * 1000) / 1000; }
  function r4(v) { return Math.round((v || 0) * 10000) / 10000; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function arrify(v) { return v instanceof Array ? v : [v]; }
  function mag(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = (b[i] || 0) - (a[i] || 0); s += d * d; } return Math.sqrt(s); }

  // Normalized cubic-bezier of the segment a->b (same as system.segmentEase).
  function segBez(prop, a, b) {
    try {
      var dt = prop.keyTime(b) - prop.keyTime(a);
      if (dt <= 0) return null;
      var av = arrify(prop.keyValue(a)), bv = arrify(prop.keyValue(b));
      var dv = util.isSpatial(prop) ? mag(av, bv) : ((bv[0] || 0) - (av[0] || 0));
      var avg = dv / dt;
      var outE = prop.keyOutTemporalEase(a)[0];
      var inE = prop.keyInTemporalEase(b)[0];
      var x1 = clamp01(outE.influence / 100);
      var x2 = 1 - clamp01(inE.influence / 100);
      var y1 = avg === 0 ? x1 : (outE.speed / avg) * x1;
      var y2 = avg === 0 ? x2 : 1 - (inE.speed / avg) * (1 - x2);
      return { x1: r4(x1), y1: r4(y1), x2: r4(x2), y2: r4(y2) };
    } catch (e) { return null; }
  }

  // Trim a value to `dims` components (Lottie export is 2D: ddd=0).
  function trim(v, dims) {
    var a = arrify(v);
    if (dims === 1) return a[0];
    return a.slice(0, dims);
  }

  // Read a leaf property to a PROP { static, value } | { static:false, keys:[] }.
  // dims: 1 (scalar) or 2 (vector, trimmed to 2D).
  function readProp(comp, prop, dims) {
    if (!prop) return null;
    var fps = comp.frameRate;
    if (!prop.canVaryOverTime || prop.numKeys === 0) {
      return { 'static': true, value: trim(prop.value, dims) };
    }
    var keys = [];
    for (var k = 1; k <= prop.numKeys; k++) {
      var entry = { t: r3(prop.keyTime(k) * fps), v: trim(prop.keyValue(k), dims) };
      entry.bez = (k < prop.numKeys) ? segBez(prop, k, k + 1) : null;
      keys.push(entry);
    }
    return { 'static': false, keys: keys };
  }

  // Separated Position: sample [x,y] at positionX's key times (bez from X). Keeps
  // the animation rather than collapsing to a static value.
  function readSeparatedPosition(comp, tr) {
    var px = tr.property(M.positionX), py = tr.property(M.positionY);
    if (!px || px.numKeys === 0) {
      return { 'static': true, value: [px ? px.value : 0, py ? py.value : 0] };
    }
    var fps = comp.frameRate, keys = [];
    for (var k = 1; k <= px.numKeys; k++) {
      var t = px.keyTime(k);
      keys.push({
        t: r3(t * fps),
        v: [r3(px.valueAtTime(t, false)), r3(py ? py.valueAtTime(t, false) : 0)],
        bez: (k < px.numKeys) ? segBez(px, k, k + 1) : null
      });
    }
    return { 'static': false, keys: keys };
  }

  function readTransform(comp, layer) {
    var tr = layer.property(M.transform);
    var pos;
    var posProp = tr.property(M.position);
    var sep = false; try { sep = posProp.dimensionsSeparated; } catch (e) { sep = false; }
    pos = sep ? readSeparatedPosition(comp, tr) : readProp(comp, posProp, 2);
    return {
      anchor: readProp(comp, tr.property(M.anchor), 2),
      position: pos,
      scale: readProp(comp, tr.property(M.scale), 2),
      rotation: readProp(comp, tr.property(M.rotation), 1),
      opacity: readProp(comp, tr.property(M.opacity), 1)
    };
  }

  function layerKind(layer) {
    var out = { type: 'other', color: null, size: null };
    try { if (layer.nullLayer) out.type = 'null'; } catch (e0) {}
    try { if (layer instanceof ShapeLayer) out.type = 'shape'; } catch (e1) {}
    try { if (layer instanceof TextLayer) out.type = 'text'; } catch (e2) {}
    try {
      if (out.type === 'other' && layer.source && layer.source.mainSource &&
          (layer.source.mainSource instanceof SolidSource)) {
        out.type = 'solid';
        out.color = layer.source.mainSource.color;
      }
    } catch (e3) {}
    try { if (layer.source) out.size = [layer.source.width, layer.source.height]; } catch (e4) {}
    return out;
  }

  function read() {
    var comp = util.activeComp();
    var fps = comp.frameRate;
    var sel = comp.selectedLayers;
    var layers = sel.length ? sel : null;
    if (!layers) throw new Error('Select one or more layers to export.');

    var out = {
      name: comp.name,
      width: comp.width,
      height: comp.height,
      fps: fps,
      durationFrames: r3(comp.duration * fps),
      layers: [],
      partial: []
    };

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
      var k = layerKind(layer);
      if (k.type === 'text' || k.type === 'other') out.partial.push(layer.name);
      out.layers.push({
        name: layer.name,
        type: k.type,
        color: k.color,
        size: k.size,
        inFrame: r3(Math.max(0, layer.inPoint) * fps),
        outFrame: r3(Math.min(comp.duration, layer.outPoint) * fps),
        transform: readTransform(comp, layer)
      });
    }
    if (!out.layers.length) throw new Error('No exportable layers selected (cameras/lights are skipped).');
    return out;
  }

  function save(args) {
    var json = args && args.json;
    if (!json) throw new Error('Nothing to write.');
    var base = (args.name || 'rebound') + '.json';
    var f = File.saveDialog('Save Lottie JSON', base + ':*.json');
    if (!f) return { written: false, cancelled: true };
    if (!/\.json$/i.test(f.fsName)) f = new File(f.fsName + '.json');
    f.encoding = 'UTF-8';
    if (!f.open('w')) throw new Error('Could not open file for writing.');
    f.write(json);
    f.close();
    return { written: true, path: f.fsName };
  }

  R.register('lottie.read', read);
  R.register('lottie.save', save, 'Rebound: Save Lottie');
})();
