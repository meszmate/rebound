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
 * Scope: transform animation of solids/nulls/shapes. Shape layers also carry
 * their real geometry (groups, paths, rects, ellipses, fills, strokes) read as
 * STATIC values at comp.time; keyframed shape properties and gradient fills are
 * approximated and flagged. Text/other export transform-only. All flagged back
 * to the panel via doc.partial (strings: 'Layer (reason)').
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

  // ---- Shape geometry (static, v1) ------------------------------------------
  // Walk 'ADBE Root Vectors Group' into a nested JSON tree of groups (with
  // their transform), paths, parametric rects/ellipses, fills, and strokes.
  // Values are STATIC: keyframed properties are frozen at comp.time and the
  // layer is flagged partial. Gradient fills degrade to a solid (first stop if
  // readable — usually not, AE hides grad colors from scripts — else mid-gray).

  var VEC_ROOT = 'ADBE Root Vectors Group';
  var VEC_GROUP = 'ADBE Vector Group';
  var VEC_GROUP_CONTENTS = 'ADBE Vectors Group';
  var VEC_GROUP_XFORM = 'ADBE Vector Transform Group';
  var VEC_SHAPE_PATH = 'ADBE Vector Shape - Group';
  var VEC_SHAPE_RECT = 'ADBE Vector Shape - Rect';
  var VEC_SHAPE_ELLIPSE = 'ADBE Vector Shape - Ellipse';
  var VEC_FILL = 'ADBE Vector Graphic - Fill';
  var VEC_STROKE = 'ADBE Vector Graphic - Stroke';
  var VEC_GFILL = 'ADBE Vector Graphic - G-Fill';

  // Read a shape-tree property's value at `time`; a keyframed property is
  // exported at that static value and flagged so the panel can say so.
  function staticVal(prop, time, flags, what) {
    if (!prop) return null;
    var v = null;
    try { v = prop.valueAtTime(time, false); } catch (e) { try { v = prop.value; } catch (e2) { return null; } }
    try { if (prop.numKeys > 0) flags.push(what + ' keyframed; exported the current-frame value'); } catch (e3) {}
    return v;
  }

  function vec2(v) { return (v && v.length >= 2) ? [r3(v[0]), r3(v[1])] : null; }
  function num1(v) { return (v == null) ? null : r3(v instanceof Array ? v[0] : v); }
  function col3(v) { return (v && v.length >= 3) ? [r4(v[0]), r4(v[1]), r4(v[2])] : null; }

  function readGroupTransform(xf, time, flags) {
    if (!xf) return null;
    function get(mn, what) { var p = null; try { p = xf.property(mn); } catch (e) {} return staticVal(p, time, flags, what); }
    return {
      anchor: vec2(get('ADBE Vector Anchor', 'group anchor')),
      position: vec2(get('ADBE Vector Position', 'group position')),
      scale: vec2(get('ADBE Vector Scale', 'group scale')),
      rotation: num1(get('ADBE Vector Rotation', 'group rotation')),
      skew: num1(get('ADBE Vector Skew', 'group skew')),
      skewAxis: num1(get('ADBE Vector Skew Axis', 'group skew axis')),
      opacity: num1(get('ADBE Vector Group Opacity', 'group opacity'))
    };
  }

  function readPathItem(item, time, flags) {
    var prop = null;
    try { prop = item.property('ADBE Vector Shape'); } catch (e) {}
    var s = staticVal(prop, time, flags, 'path "' + item.name + '"');
    if (!s || !s.vertices) return null;
    var v = [], ti = [], to = [];
    for (var i = 0; i < s.vertices.length; i++) {
      v.push([r3(s.vertices[i][0]), r3(s.vertices[i][1])]);
      ti.push([r3(s.inTangents[i][0]), r3(s.inTangents[i][1])]);
      to.push([r3(s.outTangents[i][0]), r3(s.outTangents[i][1])]);
    }
    return { ty: 'sh', name: item.name, closed: !!s.closed, vertices: v, inTangents: ti, outTangents: to };
  }

  // A gradient's first stop, if scripting can read it (AE usually reports the
  // Grad Colors property as NO_VALUE, so this generally returns null).
  function firstGradStop(gfill) {
    try {
      var cp = gfill.property('ADBE Vector Grad Colors');
      var v = cp && cp.value;
      var c = col3(v);
      if (c) return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
    } catch (e) {}
    return null;
  }

  function readShapeItems(group, time, flags) {
    var items = [];
    for (var i = 1; i <= group.numProperties; i++) {
      var child = group.property(i);
      var mn = child.matchName;
      var enabled = true;
      try { enabled = child.enabled !== false; } catch (eEn) {}
      if (!enabled) continue; // hidden operators don't render
      if (mn === VEC_GROUP) {
        var contents = child.property(VEC_GROUP_CONTENTS);
        items.push({
          ty: 'gr',
          name: child.name,
          transform: readGroupTransform(child.property(VEC_GROUP_XFORM), time, flags),
          items: contents ? readShapeItems(contents, time, flags) : []
        });
      } else if (mn === VEC_SHAPE_PATH) {
        var p = readPathItem(child, time, flags);
        if (p) items.push(p);
      } else if (mn === VEC_SHAPE_RECT) {
        items.push({
          ty: 'rc',
          name: child.name,
          size: vec2(staticVal(child.property('ADBE Vector Rect Size'), time, flags, 'rect size')),
          position: vec2(staticVal(child.property('ADBE Vector Rect Position'), time, flags, 'rect position')),
          roundness: num1(staticVal(child.property('ADBE Vector Rect Roundness'), time, flags, 'rect roundness'))
        });
      } else if (mn === VEC_SHAPE_ELLIPSE) {
        items.push({
          ty: 'el',
          name: child.name,
          size: vec2(staticVal(child.property('ADBE Vector Ellipse Size'), time, flags, 'ellipse size')),
          position: vec2(staticVal(child.property('ADBE Vector Ellipse Position'), time, flags, 'ellipse position'))
        });
      } else if (mn === VEC_FILL) {
        items.push({
          ty: 'fl',
          name: child.name,
          color: col3(staticVal(child.property('ADBE Vector Fill Color'), time, flags, 'fill color')) || [0, 0, 0],
          opacity: num1(staticVal(child.property('ADBE Vector Fill Opacity'), time, flags, 'fill opacity'))
        });
      } else if (mn === VEC_STROKE) {
        var capV = null;
        try { capV = child.property('ADBE Vector Stroke Line Cap').value; } catch (eCap) {}
        var joinV = null;
        try { joinV = child.property('ADBE Vector Stroke Line Join').value; } catch (eJoin) {}
        items.push({
          ty: 'st',
          name: child.name,
          color: col3(staticVal(child.property('ADBE Vector Stroke Color'), time, flags, 'stroke color')) || [0, 0, 0],
          opacity: num1(staticVal(child.property('ADBE Vector Stroke Opacity'), time, flags, 'stroke opacity')),
          width: num1(staticVal(child.property('ADBE Vector Stroke Width'), time, flags, 'stroke width')),
          lineCap: capV || 1,
          lineJoin: joinV || 1
        });
      } else if (mn === VEC_GFILL) {
        // Approximate: a solid from the first stop when readable, mid-gray
        // otherwise; the layer is flagged either way.
        items.push({
          ty: 'fl',
          name: child.name,
          color: firstGradStop(child) || [0.5, 0.5, 0.5],
          opacity: num1(staticVal(child.property('ADBE Vector Fill Opacity'), time, flags, 'gradient opacity'))
        });
        flags.push('gradient approximated');
      }
    }
    return items;
  }

  function readShapes(layer, time) {
    var root = null;
    try { root = layer.property(VEC_ROOT); } catch (e) {}
    if (!root) return null;
    var raw = [];
    var items = readShapeItems(root, time, raw);
    // Dedupe flags: a tree full of gradients should flag the layer once.
    var flags = [], seen = {};
    for (var i = 0; i < raw.length; i++) {
      if (!seen[raw[i]]) { seen[raw[i]] = true; flags.push(raw[i]); }
    }
    return { items: items, flags: flags };
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
      if (k.type === 'text' || k.type === 'other') out.partial.push(layer.name + ' (transform only)');
      var entry = {
        name: layer.name,
        type: k.type,
        color: k.color,
        size: k.size,
        inFrame: r3(Math.max(0, layer.inPoint) * fps),
        outFrame: r3(Math.min(comp.duration, layer.outPoint) * fps),
        transform: readTransform(comp, layer)
      };
      if (k.type === 'shape') {
        var sh = readShapes(layer, comp.time);
        if (sh && sh.items.length) {
          entry.shapes = sh.items;
          for (var f = 0; f < sh.flags.length; f++) out.partial.push(layer.name + ' (' + sh.flags[f] + ')');
        } else {
          out.partial.push(layer.name + ' (no readable shape geometry; placeholder rect)');
        }
      }
      out.layers.push(entry);
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
