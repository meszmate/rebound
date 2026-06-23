/*
 * Rebound host, Squash & Stretch.
 *
 * Volume-preserving non-uniform Scale, in two modes:
 *   - One-shot: a triggered impact that compresses then springs back with a
 *     decaying-sine follow-through (wobble) that settles on its own.
 *   - Smart: stretch driven live by the layer's speed, along the dominant motion
 *     axis, smoothed over a window.
 * Optional base/contact pivot pins the bottom (or chosen axis edge) so the shape
 * squashes ONTO the ground instead of shrinking toward its center, via a paired
 * Position expression that reads the live scale. Marker-guarded; Remove clears
 * both the Scale and Position expressions we wrote.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var rig = R.rig;

  function smartExpression() {
    return [
      'sens = effect("Squash Sensitivity")("Slider");',
      'mx = effect("Squash Max")("Slider");',
      'sm = effect("Squash Smooth")("Slider");',
      'vol = effect("Squash Volume")("Slider") / 100;',
      'ax = effect("Squash Axis")("Slider");',
      'w = (sm > 0 ? sm : 0) / thisComp.frameRate;',
      'vel = [0, 0];',
      'try { if (w > 0) { p0 = thisLayer.transform.position.valueAtTime(time - w); p1 = thisLayer.transform.position.valueAtTime(time); vel = (p1 - p0) / w; } else { vel = thisLayer.transform.position.velocity; } } catch (e) { vel = [0, 0]; }',
      'sp = (vel instanceof Array) ? length(vel) : Math.abs(vel);',
      'str = Math.min(sp * sens / 1000, mx / 100);',
      'vert = (ax == 0) ? true : (ax == 1 ? false : ((vel instanceof Array) ? (Math.abs(vel[1]) >= Math.abs(vel[0])) : true));',
      'v = value;',
      'inv = 1 / (1 + str);',
      'fo = 1 + (inv - 1) * vol;',
      'fp = 1 + str;',
      'vert ? [v[0] * fo, v[1] * fp] : [v[0] * fp, v[1] * fo];'
    ].join('\n');
  }

  function oneShotExpression() {
    return [
      'trig = effect("Squash Trigger")("Slider");',
      't = time - trig;',
      'amp = effect("Squash Amount")("Slider") / 100;',
      'freq = effect("Squash Wobbles")("Slider");',
      'dec = effect("Squash Decay")("Slider");',
      'follow = effect("Squash Follow")("Checkbox") == 1;',
      'vol = effect("Squash Volume")("Slider") / 100;',
      'ax = effect("Squash Axis")("Slider");',
      'vert = (ax == 1) ? false : true;',
      'if (t < 0) { s = 0; } else if (follow) { s = amp * Math.cos(t * freq * 2 * Math.PI) * Math.exp(-t * dec); } else { s = amp * Math.exp(-t * dec); }',
      'if (s > 0.95) s = 0.95; if (s < -0.95) s = -0.95;',
      'v = value;',
      'inv = 1 / (1 - s);',
      'fo = 1 + (inv - 1) * vol;',
      'fp = 1 - s;',
      'vert ? [v[0] * fo, v[1] * fp] : [v[0] * fp, v[1] * fo];'
    ].join('\n');
  }

  // Pin the contact edge: when scale changes, nudge Position so the base (or the
  // axis edge) stays put. Reads the live, post-squash scale.
  function pivotExpression() {
    return [
      'piv = effect("Squash Pivot")("Checkbox") == 1;',
      'if (!piv) { value; } else {',
      '  ax = effect("Squash Axis")("Slider");',
      '  vert = (ax == 1) ? false : true;',
      '  bx = effect("Squash BaseSX")("Slider"); by = effect("Squash BaseSY")("Slider");',
      '  r = thisLayer.sourceRectAtTime(time, false);',
      '  sc = thisLayer.transform.scale;',
      '  if (vert) { d = (by - sc[1]) / 100 * (r.height / 2); value + [0, d]; }',
      '  else { d = (bx - sc[0]) / 100 * (r.width / 2); value + [d, 0]; }',
      '}'
    ].join('\n');
  }

  function axisNum(s) { return s === 'horizontal' ? 1 : (s === 'auto' ? 2 : 0); }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to rig.');

    var mode = args.mode === 'oneshot' ? 'oneshot' : 'smart';
    var pivotBase = args.pivot === 'base';
    var applied = 0, skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (unsupported layer)'); continue; }

      var scaleProp = layer.property(M.transform).property(M.scale);
      var base = scaleProp.valueAtTime(comp.time, false);
      if (!(base instanceof Array)) base = [base, base];

      rig.ensureSlider(layer, 'Squash Volume', args.volume != null ? args.volume : 100);
      rig.ensureSlider(layer, 'Squash Axis', axisNum(args.axis));
      rig.ensureCheckbox(layer, 'Squash Pivot', pivotBase ? 1 : 0);
      rig.ensureSlider(layer, 'Squash BaseSX', base[0]);
      rig.ensureSlider(layer, 'Squash BaseSY', base[1]);

      if (mode === 'oneshot') {
        rig.ensureSlider(layer, 'Squash Amount', args.amount != null ? args.amount : 30);
        rig.ensureSlider(layer, 'Squash Wobbles', args.wobbles != null ? args.wobbles : 2.5);
        rig.ensureSlider(layer, 'Squash Decay', args.decay != null ? args.decay : 6);
        rig.ensureCheckbox(layer, 'Squash Follow', args.follow == null || args.follow ? 1 : 0);
        rig.ensureSlider(layer, 'Squash Trigger', comp.time);
      } else {
        rig.ensureSlider(layer, 'Squash Sensitivity', args.sensitivity != null ? args.sensitivity : 60);
        rig.ensureSlider(layer, 'Squash Max', args.max != null ? args.max : 40);
        rig.ensureSlider(layer, 'Squash Smooth', args.smoothing != null ? args.smoothing : 3);
      }

      if (rig.setExpression(scaleProp, mode === 'oneshot' ? oneShotExpression() : smartExpression())) applied++;
      else { skipped.push(layer.name + ' (has an expression)'); continue; }

      if (pivotBase) {
        var posProp = layer.property(M.transform).property(M.position);
        var sep = false; try { sep = posProp.dimensionsSeparated; } catch (e) { sep = false; }
        if (!sep) rig.setExpression(posProp, pivotExpression());
      }
    }

    if (!applied) throw new Error('No supported layers: ' + skipped.join(', '));
    return { applied: applied, skipped: skipped, mode: mode };
  }

  function remove() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');
    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) continue;
      var tg = layer.property(M.transform);
      var hit = false;
      if (rig.clearExpression(tg.property(M.scale))) hit = true;
      if (rig.clearExpression(tg.property(M.position))) hit = true;
      if (hit) cleared++;
    }
    return { cleared: cleared };
  }

  R.register('squash.apply', apply, 'Rebound: Squash & Stretch');
  R.register('squash.remove', remove, 'Rebound: Remove Squash');
})();
