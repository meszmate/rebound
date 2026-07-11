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

  // --- Reduce mode: Ramer-Douglas-Peucker over the captured samples ---------

  // Which samples survive RDP simplification of the polyline (xs[i], ys[i]),
  // with both axes already normalized to [0, 1] so `eps` is a fraction of the
  // plot. Iterative (explicit stack) so a long bake cannot blow the
  // ExtendScript call stack; endpoints always survive. Plain ES3.
  function rdpKeep(xs, ys, eps) {
    var n = xs.length;
    var keep = [];
    var i;
    for (i = 0; i < n; i++) keep.push(false);
    keep[0] = true;
    keep[n - 1] = true;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop();
      var a = seg[0];
      var b = seg[1];
      if (b - a < 2) continue;
      var ax = xs[a], ay = ys[a];
      var dx = xs[b] - ax, dy = ys[b] - ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      var maxD = -1;
      var maxI = -1;
      for (i = a + 1; i < b; i++) {
        var d;
        if (len < 1e-12) {
          // Degenerate chord: fall back to the distance from the shared point.
          var ux = xs[i] - ax, uy = ys[i] - ay;
          d = Math.sqrt(ux * ux + uy * uy);
        } else {
          // Perpendicular distance from the chord a->b.
          d = Math.abs(dx * (ay - ys[i]) - (ax - xs[i]) * dy) / len;
        }
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > eps) {
        keep[maxI] = true;
        stack.push([a, maxI]);
        stack.push([maxI, b]);
      }
    }
    return keep;
  }

  // Run RDP per dimension, each normalized by ITS OWN value range (so a subtle
  // but real wiggle on a small-range dimension is preserved just like a big one
  // on Position), and keep the union of the survivors across dimensions. A
  // dimension whose value never changes contributes nothing. Returns the kept
  // sample indices, in order.
  function simplifyIndices(times, samples, eps) {
    var n = times.length;
    var i, d;
    var t0 = times[0];
    var span = times[n - 1] - t0;
    if (span <= 0) span = 1;
    var xs = [];
    for (i = 0; i < n; i++) xs.push((times[i] - t0) / span);

    var dims = (samples[0] instanceof Array) ? samples[0].length : 1;
    var keep = [];
    for (i = 0; i < n; i++) keep.push(false);
    keep[0] = true;
    keep[n - 1] = true;

    for (d = 0; d < dims; d++) {
      var vals = [];
      var lo = 0, hi = 0;
      for (i = 0; i < n; i++) {
        var v = (samples[i] instanceof Array) ? samples[i][d] : samples[i];
        if (typeof v !== 'number' || !isFinite(v)) v = 0;
        vals.push(v);
        if (i === 0 || v < lo) lo = v;
        if (i === 0 || v > hi) hi = v;
      }
      var range = hi - lo;
      if (range < 1e-9) continue; // a flat dimension carries no shape
      var ys = [];
      for (i = 0; i < n; i++) ys.push((vals[i] - lo) / range);
      var k = rdpKeep(xs, ys, eps);
      for (i = 0; i < n; i++) if (k[i]) keep[i] = true;
    }

    var out = [];
    for (i = 0; i < n; i++) if (keep[i]) out.push(i);
    return out;
  }

  function bake(args) {
    var range = args.range === 'layer' ? 'layer' : 'work';
    var includeExpressions = !!args.includeExpressions;
    var stepFrames = args.stepFrames;
    if (stepFrames == null || isNaN(stepFrames) || stepFrames < 1) stepFrames = 1;
    // Reduce mode: a simplify tolerance as a fraction of each dimension's value
    // range (e.g. 0.01 = 1%). 0 / absent keeps the classic every-sample bake.
    var simplify = args.simplify;
    if (simplify == null || isNaN(simplify) || simplify <= 0) simplify = 0;

    var comp = util.activeComp();
    var fps = comp.frameRate;
    var stepDur = stepFrames / fps;

    var props = comp.selectedProperties;
    var propsTouched = 0;
    var keysWritten = 0;
    var sampled = 0;
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
      sampled += times.length;

      // Reduce: keep only the samples that shape the motion (RDP per dimension,
      // union of survivors), so flat stretches thin out and curvy ones stay dense.
      if (simplify > 0 && times.length > 2) {
        var keepIdx = simplifyIndices(times, samples, simplify);
        var rTimes = [];
        var rSamples = [];
        for (var r = 0; r < keepIdx.length; r++) {
          rTimes.push(times[keepIdx[r]]);
          rSamples.push(samples[keepIdx[r]]);
        }
        times = rTimes;
        samples = rSamples;
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

      // Reduce mode: the surviving keys are sparse, so let AE round the motion
      // through them (AUTO_BEZIER) instead of a faceted linear chain. Every-frame
      // bakes keep the classic linear keys, where the density IS the shape.
      if (simplify > 0) {
        for (var q = 1; q <= p.numKeys; q++) {
          var qt = p.keyTime(q);
          if (qt < win.t0 - eps || qt > win.t1 + eps) continue;
          try {
            p.setInterpolationTypeAtKey(q, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            p.setTemporalAutoBezierAtKey(q, true);
          } catch (eAuto) { /* a key type that refuses auto-bezier keeps linear */ }
        }
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
    return { properties: propsTouched, keys: keysWritten, sampled: sampled, skipped: skippedExpr };
  }

  R.register('bake.apply', bake, 'Rebound: Bake');
})();