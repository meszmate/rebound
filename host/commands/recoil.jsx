/*
 * Rebound host, Recoil (velocity-driven overshoot on existing keyframes).
 *
 * Adds elastic overshoot AFTER the last keyframe a property passes, scaled by
 * the velocity arriving at that keyframe, via a generated expression backed by
 * three shared Slider Controls. Non-destructive: the original keyframes stay.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  function expression() {
    return [
      'amp = effect("Recoil Overshoot")("Slider") / 100;',
      'freq = effect("Recoil Bounce")("Slider");',
      'dec = effect("Recoil Friction")("Slider");',
      'n = 0;',
      'if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }',
      'if (n > 0 && n == numKeys) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(dec * t);',
      '} else {',
      '  value;',
      '}'
    ].join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var applied = 0;
    var skipped = [];

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;

      var layer = util.layerOfProperty(p);
      if (!(layer instanceof AVLayer)) { skipped.push(p.name + ' (unsupported layer)'); continue; }

      rig.ensureSlider(layer, 'Recoil Overshoot', args.overshoot != null ? args.overshoot : 60);
      rig.ensureSlider(layer, 'Recoil Bounce', args.bounce != null ? args.bounce : 2);
      rig.ensureSlider(layer, 'Recoil Friction', args.friction != null ? args.friction : 6);

      if (rig.setExpression(p, expression())) applied++;
      else skipped.push(p.name + ' (has an expression)');
    }

    if (!applied && !skipped.length) {
      throw new Error('Select a property with at least two keyframes.');
    }
    return { applied: applied, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var cleared = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p instanceof Property && rig.clearExpression(p)) cleared++;
    }
    return { cleared: cleared };
  }

  R.register('recoil.apply', apply, 'Rebound: Recoil');
  R.register('recoil.remove', remove, 'Rebound: Remove Recoil');
})();
