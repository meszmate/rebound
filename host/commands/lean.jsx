/*
 * Rebound host, Lean (tilt a layer into its motion).
 *
 * For each selected layer, ensures Lean Amount + Lean Smooth Slider Controls
 * and drives its Rotation with a marker-guarded expression: it smooths the
 * position velocity over the Lean Smooth window (in frames) and maps the
 * horizontal component to degrees. The marker guard means we never clobber a
 * user's existing expression, and Remove clears only our own.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var rig = R.rig;

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function leanExpression() {
    return [
      'amt = effect("Lean Amount")("Slider");',
      'sm = effect("Lean Smooth")("Slider");',
      'w = sm/thisComp.frameRate;',
      'vx = (position.valueAtTime(time)[0] - position.valueAtTime(time - w)[0]) / (w==0?0.001:w);',
      'value + vx/1000*amt;'
    ].join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to rig.');

    var amount = num(args.amount, 8);
    var smoothing = num(args.smoothing, 4);
    if (smoothing < 0) smoothing = 0;

    var applied = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (unsupported layer)'); continue; }

      rig.ensureSlider(layer, 'Lean Amount', amount);
      rig.ensureSlider(layer, 'Lean Smooth', smoothing);

      var rot = layer.property(M.transform).property(M.rotation);
      if (rig.setExpression(rot, leanExpression())) applied++;
      else skipped.push(layer.name + ' (has an expression)');
    }

    return { applied: applied, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');

    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) continue;
      var rot = layer.property(M.transform).property(M.rotation);
      if (rig.clearExpression(rot)) cleared++;
    }

    return { cleared: cleared };
  }

  R.register('lean.apply', apply, 'Rebound: Lean');
  R.register('lean.remove', remove, 'Rebound: Remove Lean');
})();