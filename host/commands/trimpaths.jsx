/*
 * Rebound host, Trim Paths (animated write-on for shape layers).
 *
 * For each selected shape layer, adds a Trim Paths operator to its root vectors
 * group and keyframes it over durationFrames starting at the playhead:
 *   start-end : End  0 -> 100
 *   end-start : Start 100 -> 0   (stroke drains from its start, revealing the end)
 *   center    : Start 50 -> 0 and End 50 -> 100, growing outward from the middle
 * Non-shape layers are collected by name and reported as skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var ROOT = 'ADBE Root Vectors Group';
  var TRIM = 'ADBE Vector Filter - Trim';
  var TRIM_START = 'ADBE Vector Trim Start';
  var TRIM_END = 'ADBE Vector Trim End';

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  // True when a property is free of keyframes and Rebound-safe to keyframe.
  function isClear(prop) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    return true;
  }

  function rootGroupOf(layer) {
    // Address by matchName; null on layers without a vector tree.
    return layer.property(ROOT);
  }

  function keyTwo(prop, t0, v0, t1, v1) {
    prop.setValueAtTime(t0, v0);
    prop.setValueAtTime(t1, v1);
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more shape layers.');

    var direction = args.direction || 'start-end';
    var durationFrames = Math.round(num(args.durationFrames, 24));
    if (durationFrames < 1) durationFrames = 1;

    var t0 = comp.time;
    var t1 = t0 + durationFrames / comp.frameRate;

    var applied = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var root = rootGroupOf(layer);
      if (!root) { skipped.push(layer.name + ' (not a shape layer)'); continue; }

      var trim = root.addProperty(TRIM);
      var startProp = trim.property(TRIM_START);
      var endProp = trim.property(TRIM_END);
      if (!startProp || !endProp) { skipped.push(layer.name + ' (no trim controls)'); continue; }

      if (direction === 'end-start') {
        if (isClear(endProp)) endProp.setValue(100);
        if (isClear(startProp)) keyTwo(startProp, t0, 100, t1, 0);
      } else if (direction === 'center') {
        if (isClear(startProp)) keyTwo(startProp, t0, 50, t1, 0);
        if (isClear(endProp)) keyTwo(endProp, t0, 50, t1, 100);
      } else {
        // start-end (default)
        if (isClear(startProp)) startProp.setValue(0);
        if (isClear(endProp)) keyTwo(endProp, t0, 0, t1, 100);
      }

      applied++;
    }

    if (!applied && !skipped.length) {
      throw new Error('Select one or more shape layers.');
    }
    return { applied: applied, skipped: skipped };
  }

  R.register('trimpaths.apply', apply, 'Rebound: Trim Paths');
})();
