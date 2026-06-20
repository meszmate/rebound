/*
 * Rebound host — bake commands.
 *
 * Bakes the live animation of each selected property — expression-driven or
 * keyframed — into clean, evenly spaced keyframes. We sample the property's
 * value across the chosen range FIRST (so the live curve is read intact), then
 * tear down the source (clear our/any expression, drop existing keys) and write
 * the captured samples back as plain keyframes. Sampling uses valueAtTime(t,
 * false) — post-expression, pre-other-influences — at a fixed frame step,
 * inclusive of the range end.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // Inclusive-of-end frame stepping. Times are generated up to t1 with a small
  // epsilon so floating-point drift never drops the final frame.
  function sampleTimes(t0, t1, stepDur) {
    var times = [];
    if (stepDur <= 0) stepDur = 1;
    var eps = stepDur * 1e-6;
    for (var t = t0; t <= t1 + eps; t += stepDur) {
      var ct = t > t1 ? t1 : t;
      times.push(ct);
    }
    // Guarantee the end frame is present even when rounding fell short.
    if (times.length && times[times.length - 1] < t1 - eps) {
      times.push(t1);
    }
    return times;
  }

  // The [t0, t1] window for one property, per the requested range mode.
  function rangeFor(prop, range, comp) {
    if (range === 'layer') {
      var layer = util.layerOfProperty(prop);
      return { t0: layer.inPoint, t1: layer.outPoint };
    }
    var start = comp.workAreaStart;
    return { t0: start, t1: start + comp.workAreaDuration };
  }

  function bake(args) {
    var range = args.range === 'layer' ? 'layer' : 'work';
    var stepFrames = args.stepFrames;
    if (stepFrames == null || isNaN(stepFrames) || stepFrames < 1) stepFrames = 1;

    var comp = util.activeComp();
    var fps = comp.frameRate;
    var stepDur = stepFrames / fps;

    var props = comp.selectedProperties;
    var propsTouched = 0;
    var keysWritten = 0;

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.isTimeVarying) continue;

      var win = rangeFor(p, range, comp);
      if (win.t1 - win.t0 <= 0) continue;

      // Capture every sample up front, before we mutate the property.
      var times = sampleTimes(win.t0, win.t1, stepDur);
      if (!times.length) continue;
      var samples = [];
      for (var s = 0; s < times.length; s++) {
        samples.push(p.valueAtTime(times[s], false));
      }

      // Drop the live expression (if any) so it stops driving the value.
      if (p.expression && p.expression !== '') {
        try { p.expression = ''; } catch (e) { /* ignore */ }
      }

      // Remove every existing key, highest index first so indices stay valid.
      for (var k = p.numKeys; k >= 1; k--) {
        p.removeKey(k);
      }

      // Write the captured samples back as plain keyframes.
      for (var w = 0; w < times.length; w++) {
        p.setValueAtTime(times[w], samples[w]);
        keysWritten++;
      }
      propsTouched++;
    }

    if (!propsTouched) {
      throw new Error('Select one or more animated properties to bake.');
    }
    return { properties: propsTouched, keys: keysWritten };
  }

  R.register('bake.apply', bake, 'Rebound: Bake');
})();