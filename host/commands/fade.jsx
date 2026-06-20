/*
 * Rebound host, Fade (opacity fade-in / fade-out keyframes).
 *
 * For each selected AVLayer, keyframes the Opacity property: a fade-in ramps
 * 0 -> 100 over inFrames starting at the layer in point, and a fade-out ramps
 * 100 -> 0 over outFrames ending at the layer out point. Properties carrying an
 * expression are skipped. New keyframes get Easy-Ease-style bezier smoothing.
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

  // Set an opacity keyframe at time t, then apply Easy-Ease bezier smoothing.
  function setKey(prop, t, value) {
    prop.setValueAtTime(t, value);
    var ki = prop.nearestKeyIndex(t);
    prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    var ease = [new KeyframeEase(0, 33.33)];
    prop.setTemporalEaseAtKey(ki, ease, ease);
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

    var faded = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name); continue; }

      var op = layer.property(M.transform).property(M.opacity);
      if (!op) { skipped.push(layer.name); continue; }
      if (hasExpression(op)) { skipped.push(layer.name + ' (has an expression)'); continue; }

      var touched = false;

      if (doIn) {
        setKey(op, layer.inPoint, 0);
        setKey(op, layer.inPoint + inSeconds, 100);
        touched = true;
      }
      if (doOut) {
        setKey(op, layer.outPoint - outSeconds, 100);
        setKey(op, layer.outPoint, 0);
        touched = true;
      }

      if (touched) faded++;
    }

    return { faded: faded, skipped: skipped };
  }

  R.register('fade.apply', fade, 'Rebound: Fade');
})();
