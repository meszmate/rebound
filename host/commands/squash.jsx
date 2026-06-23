/*
 * Rebound host, Squash & Stretch.
 *
 * Drives a layer's Scale with a volume-preserving squash expression in one of
 * two modes:
 *   - manual: a keyframeable "Squash Amount" slider (+ axis) so you squash on
 *     impact by hand. Positive stretches the chosen axis and squashes the other.
 *   - smart:  the squash is derived automatically from the layer's own position
 *     velocity, stretch along the dominant motion axis, squash across it, scaled
 *     by Sensitivity and capped by Max.
 * Volume is preserved (one axis * the other stays constant). Marker-guarded so
 * we never clobber a user's own expression; Remove clears only ours.
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
      'vel = [0, 0];',
      'try { vel = thisLayer.transform.position.velocity; } catch (e) { vel = [0, 0]; }',
      'sp = (vel instanceof Array) ? length(vel) : Math.abs(vel);',
      'str = Math.min(sp * sens / 1000, mx) / 100;',
      'vert = (vel instanceof Array) ? (Math.abs(vel[1]) >= Math.abs(vel[0])) : true;',
      's = value;',
      'fx = vert ? 1 / (1 + str) : (1 + str);',
      'fy = vert ? (1 + str) : 1 / (1 + str);',
      '(s.length > 2) ? [s[0] * fx, s[1] * fy, s[2]] : [s[0] * fx, s[1] * fy];'
    ].join('\n');
  }

  function manualExpression() {
    return [
      'k = effect("Squash Amount")("Slider") / 100;',
      'if (k <= -0.99) k = -0.99;',
      'vert = effect("Squash Axis")("Checkbox") == 1;',
      's = value;',
      'fx = vert ? 1 / (1 + k) : (1 + k);',
      'fy = vert ? (1 + k) : 1 / (1 + k);',
      '(s.length > 2) ? [s[0] * fx, s[1] * fy, s[2]] : [s[0] * fx, s[1] * fy];'
    ].join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to rig.');

    var mode = args.mode === 'manual' ? 'manual' : 'smart';
    var applied = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (unsupported layer)'); continue; }

      if (mode === 'smart') {
        rig.ensureSlider(layer, 'Squash Sensitivity', args.sensitivity != null ? args.sensitivity : 60);
        rig.ensureSlider(layer, 'Squash Max', args.max != null ? args.max : 40);
      } else {
        rig.ensureSlider(layer, 'Squash Amount', args.amount != null ? args.amount : 0);
        rig.ensureCheckbox(layer, 'Squash Axis', args.vertical == null || args.vertical ? 1 : 0);
      }

      var scale = layer.property(M.transform).property(M.scale);
      if (rig.setExpression(scale, mode === 'smart' ? smartExpression() : manualExpression())) applied++;
      else skipped.push(layer.name + ' (has an expression)');
    }

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
      var scale = layer.property(M.transform).property(M.scale);
      if (scale && rig.clearExpression(scale)) cleared++;
    }
    return { cleared: cleared };
  }

  R.register('squash.apply', apply, 'Rebound: Squash & Stretch');
  R.register('squash.remove', remove, 'Rebound: Remove Squash');
})();
