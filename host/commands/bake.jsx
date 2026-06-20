/*
 * Rebound host, bake commands.
 *
 * Bakes the live animation of each selected property, expression-driven or
 * keyframed, into clean, evenly spaced keyframes. We sample the property's
 * value across the chosen range FIRST (so the live curve is read intact), then
 * write the captured samples back as plain keyframes. Sampling uses
 * valueAtTime(t, false), post-expression, pre-other-influences, at a fixed
 * frame step, inclusive of the range end.
 *
 * Non-destructive by default:
 *  - Our own (marker) expressions are cleared, since the bake replaces them.
 *  - A user's hand-written expression is never deleted. By default such a
 *    property is skipped and reported; with includeExpressions the expression
 *    is merely DISABLED (its text preserved) so the baked keys can drive it and
 *    the user can re-enable later.
 *  - Only keyframes inside the baked window are removed; keys outside [t0, t1]
 *    are left untouched.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

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

  // True when the property carries a hand-written expression that is not ours.
  function hasUserExpression(p) {
    if (!p.expressionEnabled) return false;
    var expr = p.expression;
    if (!expr || expr === '') return false;
    return expr.indexOf(rig.MARKER) === -1;
  }

  function bake(args) {
    var range = args.range === 'layer' ? 'layer' : 'work';
    var includeExpressions = !!args.includeExpressions;
    var stepFrames = args.stepFrames;
    if (stepFrames == null || isNaN(stepFrames) || stepFrames < 1) stepFrames = 1;

    var comp = util.activeComp();
    var fps = comp.frameRate;
    var stepDur = stepFrames / fps;

    var props = comp.selectedProperties;
    var propsTouched = 0;
    var keysWritten = 0;
    var skippedExpr = 0;

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.isTimeVarying) continue;

      // Protect user expressions: skip unless the caller opted in.
      var userExpr = hasUserExpression(p);
      if (userExpr && !includeExpressions) {
        skippedExpr++;
        continue;
      }

      var win = rangeFor(p, range, comp);
      if (win.t1 - win.t0 <= 0) continue;

      // Capture every sample up front, before we mutate the property.
      var times = sampleTimes(win.t0, win.t1, stepDur);
      if (!times.length) continue;
      var samples = [];
      for (var s = 0; s < times.length; s++) {
        samples.push(p.valueAtTime(times[s], false));
      }

      // Stop the live expression from driving the value. Ours we clear; a
      // user's we only disable, so the text survives and can be re-enabled.
      if (userExpr) {
        try { p.expressionEnabled = false; } catch (e1) { /* ignore */ }
      } else {
        rig.clearExpression(p);
      }

      // Remove existing keys inside the baked window only, highest index first
      // so indices stay valid; keys outside [t0, t1] are preserved.
      var eps = stepDur * 1e-6;
      for (var k = p.numKeys; k >= 1; k--) {
        var kt = p.keyTime(k);
        if (kt >= win.t0 - eps && kt <= win.t1 + eps) p.removeKey(k);
      }

      // Write the captured samples back as plain keyframes.
      for (var w = 0; w < times.length; w++) {
        p.setValueAtTime(times[w], samples[w]);
        keysWritten++;
      }
      propsTouched++;
    }

    if (!propsTouched) {
      if (skippedExpr) {
        throw new Error(
          'Skipped ' + skippedExpr + ' propert' + (skippedExpr === 1 ? 'y' : 'ies') +
          ' with a user expression. Enable "Include expressions" to bake them.'
        );
      }
      throw new Error('Select one or more animated properties to bake.');
    }
    return { properties: propsTouched, keys: keysWritten, skipped: skippedExpr };
  }

  R.register('bake.apply', bake, 'Rebound: Bake');
})();