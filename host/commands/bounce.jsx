/*
 * Rebound host, Bounce (gravitational rebound on existing keyframes).
 *
 * After the last keyframe a property passes, the value rebounds off its target
 * like a ball, each bounce smaller. Driven by a generated expression backed by
 * three shared Slider Controls. Non-destructive: the original keyframes stay.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  function expression() {
    return [
      'elas = effect("Bounce Elasticity")("Slider");',
      'grav = effect("Bounce Gravity")("Slider");',
      'maxB = Math.floor(effect("Bounce Count")("Slider"));',
      'n = 0;',
      'if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }',
      'if (n > 0 && n == numKeys) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  amp = v * elas;',
      '  cycles = Math.floor(grav * t / Math.PI);',
      '  if (cycles >= maxB) {',
      '    value;',
      '  } else {',
      '    value - amp * Math.abs(Math.sin(grav * t)) * Math.exp(-grav * t) * Math.pow(elas, cycles);',
      '  }',
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

      rig.ensureSlider(layer, 'Bounce Elasticity', args.elasticity != null ? args.elasticity : 0.7);
      rig.ensureSlider(layer, 'Bounce Gravity', args.gravity != null ? args.gravity : 4);
      rig.ensureSlider(layer, 'Bounce Count', args.maxBounces != null ? args.maxBounces : 4);

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

  R.register('bounce.apply', apply, 'Rebound: Bounce');
  R.register('bounce.remove', remove, 'Rebound: Remove Bounce');
})();
