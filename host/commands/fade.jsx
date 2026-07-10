/*
 * Rebound host, Fade (opacity fade-in / fade-out keyframes).
 *
 * For each selected AVLayer, keyframes the Opacity property: a fade-in ramps
 * 0 -> current over inFrames starting at the layer in point, and a fade-out
 * ramps current -> 0 over outFrames ending at the layer out point, where
 * "current" is the layer's own opacity sampled mid-layer (so a layer sitting
 * at 40% fades to 40%, not to 100%). Existing keyframes inside a fade range
 * are cleared first so re-applying never leaves stale lumps, and the two ramps
 * are scaled down proportionally when the layer is shorter than in + out.
 * Properties carrying an expression are skipped. New keyframes get Easy-Ease
 * bezier smoothing by default, or plain Linear interpolation when the Linear
 * ease is chosen.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function hasExpression(prop) {
    return prop.expressionEnabled && prop.expression !== '';
  }

  // Remove every keyframe whose time falls inside [t0, t1] (inclusive, with a
  // tolerance), iterating backwards so indices stay valid while deleting.
  function removeKeysInRange(prop, t0, t1) {
    var EPS = 1e-6;
    for (var k = prop.numKeys; k >= 1; k--) {
      var t = prop.keyTime(k);
      if (t >= t0 - EPS && t <= t1 + EPS) prop.removeKey(k);
    }
  }

  // Set an opacity keyframe at time t. When smooth, apply Easy-Ease bezier
  // shaping; otherwise leave it Linear for a constant-rate fade.
  function setKey(prop, t, value, smooth) {
    prop.setValueAtTime(t, value);
    var ki = prop.nearestKeyIndex(t);
    if (smooth) {
      prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      var ease = [new KeyframeEase(0, 33.33)];
      prop.setTemporalEaseAtKey(ki, ease, ease);
    } else {
      prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    }
  }

  function fade(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to fade.');

    var doIn = args.doIn !== false;
    var doOut = args.doOut !== false;
    if (!doIn && !doOut) throw new Error('Enable a fade in or fade out.');

    var inFrames = num(args.inFrames, 12);
    var outFrames = num(args.outFrames, 12);
    if (inFrames < 0) inFrames = 0;
    if (outFrames < 0) outFrames = 0;

    var inSeconds = inFrames / comp.frameRate;
    var outSeconds = outFrames / comp.frameRate;
    var smooth = args.ease !== 'linear';

    var faded = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(layer.name); continue; }

      var op = layer.property(M.transform).property(M.opacity);
      if (!op) { skipped.push(layer.name); continue; }
      if (hasExpression(op)) { skipped.push(layer.name + ' (has an expression)'); continue; }

      // Scale both ramps down proportionally when the layer is shorter than
      // in + out, so the four keys can never interleave out of order.
      var inS = doIn ? inSeconds : 0;
      var outS = doOut ? outSeconds : 0;
      var duration = layer.outPoint - layer.inPoint;
      if (duration > 0 && inS + outS > duration) {
        var f = duration / (inS + outS);
        inS = inS * f;
        outS = outS * f;
      }

      // The opacity to fade to: the layer's own value, sampled mid-layer so a
      // stale ramp from an earlier fade cannot skew the reading.
      var current = 100;
      try {
        var mid = layer.inPoint + duration / 2;
        current = op.numKeys > 0 ? op.valueAtTime(mid, false) : op.value;
      } catch (eVal) {}

      var touched = false;

      if (doIn) {
        removeKeysInRange(op, layer.inPoint, layer.inPoint + inS);
        setKey(op, layer.inPoint, 0, smooth);
        setKey(op, layer.inPoint + inS, current, smooth);
        touched = true;
      }
      if (doOut) {
        removeKeysInRange(op, layer.outPoint - outS, layer.outPoint);
        setKey(op, layer.outPoint - outS, current, smooth);
        setKey(op, layer.outPoint, 0, smooth);
        touched = true;
      }

      if (touched) faded++;
    }

    return { faded: faded, skipped: skipped };
  }

  R.register('fade.apply', fade, 'Rebound: Fade');
})();
