/*
 * Rebound host, Multiply (bulk-duplicate into a progressively offset stack).
 *
 * For each selected layer, creates N duplicate copies. Copy k (1..N) receives
 * the original's transform plus k times each per-copy offset, and its start
 * time is shifted by k * delayFrames / frameRate. Only transforms that are not
 * keyframed or expression-driven are adjusted; originals are left untouched.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  // True when a property can be safely overwritten with a static value.
  function isStatic(prop) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    return true;
  }

  function offsetPosition(layer, dx, dy) {
    var pos = layer.property(M.transform).property(M.position);
    if (!isStatic(pos)) return;
    var v = pos.value;
    var nv = [v[0] + dx, v[1] + dy];
    if (v.length > 2) nv.push(v[2]);
    pos.setValue(nv);
  }

  function offsetRotation(layer, deg) {
    if (deg === 0) return;
    var rot = layer.property(M.transform).property(M.rotation);
    if (!isStatic(rot)) return;
    rot.setValue(rot.value + deg);
  }

  function offsetScale(layer, pct) {
    if (pct === 0) return;
    var sc = layer.property(M.transform).property(M.scale);
    if (!isStatic(sc)) return;
    var v = sc.value;
    var nv = [];
    for (var i = 0; i < v.length; i++) nv.push(v[i] + pct);
    sc.setValue(nv);
  }

  function offsetOpacity(layer, delta) {
    if (delta === 0) return;
    var op = layer.property(M.transform).property(M.opacity);
    if (!isStatic(op)) return;
    var nv = op.value + delta;
    if (nv < 0) nv = 0;
    if (nv > 100) nv = 100;
    op.setValue(nv);
  }

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function multiply(args) {
    var comp = util.activeComp();
    var sources = comp.selectedLayers;
    if (!sources.length) throw new Error('Select one or more layers to multiply.');

    var copies = Math.round(num(args.copies, 5));
    if (copies < 1) copies = 1;
    if (copies > 50) copies = 50;

    var offsetX = num(args.offsetX, 0);
    var offsetY = num(args.offsetY, 0);
    var rotation = num(args.rotation, 0);
    var scale = num(args.scale, 0);
    var opacity = num(args.opacity, 0);
    var delaySeconds = num(args.delayFrames, 0) / comp.frameRate;

    // Snapshot the source list first; duplicating mutates the layer collection.
    var originals = [];
    for (var i = 0; i < sources.length; i++) originals.push(sources[i]);

    var created = 0;
    for (var s = 0; s < originals.length; s++) {
      var src = originals[s];
      for (var k = 1; k <= copies; k++) {
        var copy = src.duplicate();
        offsetPosition(copy, k * offsetX, k * offsetY);
        offsetRotation(copy, k * rotation);
        offsetScale(copy, k * scale);
        offsetOpacity(copy, k * opacity);
        if (delaySeconds !== 0) copy.startTime = src.startTime + k * delaySeconds;
        created++;
      }
    }

    return { created: created };
  }

  R.register('multiply.apply', multiply, 'Rebound: Multiply');
})();
