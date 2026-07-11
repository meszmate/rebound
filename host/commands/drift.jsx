/*
 * Rebound host, Drift (organic wiggle / randomizer).
 *
 * Adds living, random motion to any selected property via a wiggle expression
 * backed by Amount + Frequency sliders, with a per-layer random seed (a "Drift
 * Seed" slider feeds seedRandom, so a dice re-roll changes the noise), an
 * optional stepped (Hold) mode, an Axis restriction (All / X / Y with 2D/3D
 * guards), and an optional seamless Loop (the standard blend of wiggle(t) and
 * wiggle(t - period)). Works on static or animated properties.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  function expression(opts) {
    var lines = [
      'amt = effect("Drift Amount")("Slider");',
      'frq = effect("Drift Frequency")("Slider");',
      'sd = effect("Drift Seed")("Slider");',
      'seedRandom(index + sd, true);'
    ];
    if (opts.hold) lines.push('posterizeTime(frq);');
    if (opts.loop) {
      // Seamless loop: crossfade this cycle's wiggle into the previous cycle's
      // over the period, so t = per lands exactly back on t = 0.
      lines.push('per = Math.max(0.1, effect("Drift Loop")("Slider"));');
      lines.push('t = time % per;');
      lines.push('w1 = wiggle(frq, amt, 1, 0.5, t);');
      lines.push('w2 = wiggle(frq, amt, 1, 0.5, t - per);');
      lines.push('w = linear(t, 0, per, w1, w2);');
    } else {
      lines.push('w = wiggle(frq, amt);');
    }
    // Axis restriction with dimension guards (scalar props ignore the axis;
    // 3D keeps its untouched components).
    if (opts.axis === 'x') {
      lines.push('(value instanceof Array) ? ((value.length > 2) ? [w[0], value[1], value[2]] : [w[0], value[1]]) : w;');
    } else if (opts.axis === 'y') {
      lines.push('(value instanceof Array) ? ((value.length > 2) ? [value[0], w[1], value[2]] : [value[0], w[1]]) : w;');
    } else {
      lines.push('w;');
    }
    return lines.join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var applied = 0;
    var skipped = [];
    var opts = {
      hold: args.type === 'hold',
      axis: (args.axis === 'x' || args.axis === 'y') ? args.axis : 'all',
      loop: !!args.loop
    };

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      if (p.propertyValueType === PropertyValueType.NO_VALUE) continue;

      var layer = util.layerOfProperty(p);
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(p.name + ' (camera/light)'); continue; }

      rig.ensureSlider(layer, 'Drift Amount', args.amount != null ? args.amount : 20);
      rig.ensureSlider(layer, 'Drift Frequency', args.frequency != null ? args.frequency : 2);
      rig.ensureSlider(layer, 'Drift Seed', args.seed != null ? args.seed : 0);
      if (opts.loop) rig.ensureSlider(layer, 'Drift Loop', (args.loopSec != null && args.loopSec > 0) ? args.loopSec : 3);

      if (rig.setExpression(p, expression(opts), 'drift')) applied++;
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
      if (!(p instanceof Property)) continue;
      if (rig.clearExpression(p, 'drift')) {
        cleared++;
        var layer = util.layerOfProperty(p);
        if (layer) rig.removeControls(layer, ['Drift Amount', 'Drift Frequency', 'Drift Seed', 'Drift Loop']);
      }
    }
    return { cleared: cleared };
  }

  R.register('drift.apply', apply, 'Rebound: Drift');
  R.register('drift.remove', remove, 'Rebound: Remove Drift');
})();
