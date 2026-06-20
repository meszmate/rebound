/*
 * Rebound host — Motion (auto-motion rig: Orbit / Spin / Look At).
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

  function spinExpression() {
    return [
      'spd = effect("Spin Speed")("Slider");',
      'value + time * spd;'
    ].join('\n');
  }

  function orbitExpression() {
    return [
      'r = effect("Orbit Radius")("Slider");',
      's = effect("Orbit Speed")("Slider");',
      'cx = effect("Orbit Center X")("Slider");',
      'cy = effect("Orbit Center Y")("Slider");',
      'a = degreesToRadians(time * s);',
      '[cx + Math.cos(a) * r, cy + Math.sin(a) * r];'
    ].join('\n');
  }

  function lookAtExpression() {
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
    return rig.setExpression(rot, spinExpression());
  }

  function applyOrbit(layer, args, comp) {
    rig.ensureSlider(layer, 'Orbit Radius', num(args.orbitRadius, 150));
    rig.ensureSlider(layer, 'Orbit Speed', num(args.orbitSpeed, 60));
    rig.ensureSlider(layer, 'Orbit Center X', comp.width / 2);
    rig.ensureSlider(layer, 'Orbit Center Y', comp.height / 2);
    var pos = layer.property(M.transform).property(M.position);
    return rig.setExpression(pos, orbitExpression());
  }

  function applyLookAt(layer, comp) {
    rig.ensureSlider(layer, 'Look Target X', comp.width / 2);
    rig.ensureSlider(layer, 'Look Target Y', comp.height / 2);
    var rot = layer.property(M.transform).property(M.rotation);
    return rig.setExpression(rot, lookAtExpression());
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to rig.');

    var mode = args.mode || 'spin';
    var applied = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (unsupported layer)'); continue; }

      var ok;
      if (mode === 'orbit') ok = applyOrbit(layer, args, comp);
      else if (mode === 'lookat') ok = applyLookAt(layer, comp);
      else ok = applySpin(layer, args);

      if (ok) applied++;
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
      var transform = layer.property(M.transform);
      if (rig.clearExpression(transform.property(M.rotation))) cleared++;
      if (rig.clearExpression(transform.property(M.position))) cleared++;
    }

    return { cleared: cleared };
  }

  R.register('motion.apply', apply, 'Rebound: Motion');
  R.register('motion.remove', remove, 'Rebound: Remove Motion');
})();