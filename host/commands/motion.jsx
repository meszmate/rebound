/*
 * Rebound host, Motion (auto-motion rig: Orbit / Spin / Look At).
 *
 * For each selected layer, picks a target transform property by mode, ensures
 * the matching Slider Controls, and drives the property with a marker-guarded
 * expression. Orbit targets Position; Spin and Look At target Rotation. The
 * marker guard means we never clobber a user's existing expression, and Remove
 * clears only our own.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var rig = R.rig;

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  // Escape a layer name for safe embedding inside a double-quoted JS string
  // within the generated expression (backslashes first, then quotes).
  function escapeName(name) {
    var s = '' + name;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\') out += '\\\\';
      else if (ch === '"') out += '\\"';
      else out += ch;
    }
    return out;
  }

  function spinExpression() {
    return [
      'spd = effect("Spin Speed")("Slider");',
      'value + time * spd;'
    ].join('\n');
  }

  // Orbit around either the captured Center sliders or a target layer's LIVE
  // position; with Distribute on, a per-layer "Orbit Phase" slider spreads the
  // selection into a ring instead of stacking every layer at the same angle.
  function orbitExpression(opts) {
    var lines = [
      'r = effect("Orbit Radius")("Slider");',
      's = effect("Orbit Speed")("Slider");'
    ];
    if (opts && opts.targetName != null) {
      lines.push('c = thisComp.layer("' + escapeName(opts.targetName) + '").transform.position;');
      lines.push('cx = c[0];');
      lines.push('cy = c[1];');
    } else {
      lines.push('cx = effect("Orbit Center X")("Slider");');
      lines.push('cy = effect("Orbit Center Y")("Slider");');
    }
    if (opts && opts.distribute) {
      lines.push('ph = effect("Orbit Phase")("Slider");');
      lines.push('a = degreesToRadians(time * s + ph);');
    } else {
      lines.push('a = degreesToRadians(time * s);');
    }
    lines.push('p = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];');
    lines.push('(value.length > 2) ? [p[0], p[1], value[2]] : p;');
    return lines.join('\n');
  }

  // Aim at either the captured Target sliders or a target layer's LIVE position.
  function lookAtExpression(targetName) {
    if (targetName != null) {
      return [
        't = thisComp.layer("' + escapeName(targetName) + '").transform.position;',
        'd = sub([t[0], t[1]], position);',
        'radiansToDegrees(Math.atan2(d[1], d[0]));'
      ].join('\n');
    }
    return [
      'tx = effect("Look Target X")("Slider");',
      'ty = effect("Look Target Y")("Slider");',
      'd = sub([tx, ty], position);',
      'radiansToDegrees(Math.atan2(d[1], d[0]));'
    ].join('\n');
  }

  function applySpin(layer, args) {
    rig.ensureSlider(layer, 'Spin Speed', num(args.spinSpeed, 90));
    var rot = layer.property(M.transform).property(M.rotation);
    return rig.setExpression(rot, spinExpression(), 'motion');
  }

  function applyOrbit(layer, args, comp, opts) {
    rig.ensureSlider(layer, 'Orbit Radius', num(args.orbitRadius, 150));
    rig.ensureSlider(layer, 'Orbit Speed', num(args.orbitSpeed, 60));
    if (!opts || opts.targetName == null) {
      rig.ensureSlider(layer, 'Orbit Center X', comp.width / 2);
      rig.ensureSlider(layer, 'Orbit Center Y', comp.height / 2);
    }
    if (opts && opts.distribute) rig.ensureSlider(layer, 'Orbit Phase', opts.phase || 0);
    var pos = layer.property(M.transform).property(M.position);
    return rig.setExpression(pos, orbitExpression(opts), 'motion');
  }

  function applyLookAt(layer, comp, targetName) {
    if (targetName == null) {
      rig.ensureSlider(layer, 'Look Target X', comp.width / 2);
      rig.ensureSlider(layer, 'Look Target Y', comp.height / 2);
    }
    var rot = layer.property(M.transform).property(M.rotation);
    return rig.setExpression(rot, lookAtExpression(targetName), 'motion');
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to rig.');

    var mode = args.mode || 'spin';
    var applied = 0;
    var skipped = [];

    // Target = last selected layer (Orbit's center / Look At's aim point): the
    // last layer is the reference, everything before it gets the rig.
    var useLayerTarget = (mode === 'orbit' || mode === 'lookat') && args.target === 'layer';
    var targetLayer = null;
    if (useLayerTarget) {
      if (layers.length < 2) throw new Error('Select the layers to rig, then the target layer last.');
      targetLayer = layers[layers.length - 1];
    }
    var distribute = mode === 'orbit' && !!args.distribute;

    // Collect the riggable pool first so Distribute can hand out i*360/n phases
    // over the ACTUAL ring size, not the raw selection count.
    var pool = [];
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (targetLayer && layer === targetLayer) continue;
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(layer.name + ' (camera/light)'); continue; }
      if (mode === 'orbit') {
        // Orbit drives the composite Position; with separated dimensions AE
        // exposes X/Y Position instead and the composite can't take the rig.
        var sep = false;
        try { sep = layer.property(M.transform).property(M.position).dimensionsSeparated; } catch (eSep) { sep = false; }
        if (sep) { skipped.push(layer.name + ' (separate dimensions is on)'); continue; }
      }
      pool.push(layer);
    }

    for (var j = 0; j < pool.length; j++) {
      var ok;
      if (mode === 'orbit') {
        ok = applyOrbit(pool[j], args, comp, {
          targetName: targetLayer ? targetLayer.name : null,
          distribute: distribute,
          phase: distribute ? j * 360 / pool.length : 0
        });
      } else if (mode === 'lookat') ok = applyLookAt(pool[j], comp, targetLayer ? targetLayer.name : null);
      else ok = applySpin(pool[j], args);

      if (ok) applied++;
      else skipped.push(pool[j].name + ' (has an expression)');
    }

    if (!applied) throw new Error('No supported layers: ' + skipped.join(', '));
    return { applied: applied, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');

    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
      var transform = layer.property(M.transform);
      if (rig.clearExpression(transform.property(M.rotation), 'motion')) cleared++;
      if (rig.clearExpression(transform.property(M.position), 'motion')) cleared++;
      rig.removeControls(layer, ['Spin Speed', 'Orbit Radius', 'Orbit Speed', 'Orbit Center X', 'Orbit Center Y', 'Orbit Phase', 'Look Target X', 'Look Target Y']);
    }

    return { cleared: cleared };
  }

  R.register('motion.apply', apply, 'Rebound: Motion');
  R.register('motion.remove', remove, 'Rebound: Remove Motion');
})();