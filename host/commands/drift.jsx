/*
 * Rebound host, Drift (organic wiggle / randomizer).
 *
 * Adds living, random motion to any selected property via a wiggle expression
 * backed by Amount + Frequency sliders, with a per-layer random seed and an
 * optional stepped (Hold) mode. Works on static or animated properties.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  function expression(hold) {
    var lines = [
      'amt = effect("Drift Amount")("Slider");',
      'frq = effect("Drift Frequency")("Slider");',
      'seedRandom(index, true);'
    ];
    if (hold) {
      lines.push('posterizeTime(frq);');
      lines.push('wiggle(frq, amt);');
    } else {
      lines.push('wiggle(frq, amt);');
    }
    return lines.join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var applied = 0;
    var skipped = [];
    var hold = args.type === 'hold';

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      if (p.propertyValueType === PropertyValueType.NO_VALUE) continue;

      var layer = util.layerOfProperty(p);
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(p.name + ' (camera/light)'); continue; }

      rig.ensureSlider(layer, 'Drift Amount', args.amount != null ? args.amount : 20);
      rig.ensureSlider(layer, 'Drift Frequency', args.frequency != null ? args.frequency : 2);

      if (rig.setExpression(p, expression(hold))) applied++;
      else skipped.push(p.name + ' (has an expression)');
    }

    if (!applied && !skipped.length) {
      throw new Error('Select one or more properties.');
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

  R.register('drift.apply', apply, 'Rebound: Drift');
  R.register('drift.remove', remove, 'Rebound: Remove Drift');
})();
