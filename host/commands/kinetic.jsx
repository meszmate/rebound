/*
 * Rebound host — Kinetic (drive layers from a source layer's motion).
 *
 * The first selected layer is the source. Every other selected AVLayer becomes
 * a target: it gets "Kinetic Sensitivity" and "Kinetic Max" Slider Controls and
 * a marker-guarded expression on the chosen transform property. The expression
 * samples the source layer's position speed and maps it onto the target — Scale
 * grows, Rotation spins, Opacity fades — clamped by Max. The marker guard means
 * we never clobber a user's own expression, and Remove clears only our own from
 * the three candidate target properties.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var rig = R.rig;

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

  // The transform property matchName for a given target.
  function targetMatch(target) {
    if (target === 'rotation') return M.rotation;
    if (target === 'opacity') return M.opacity;
    return M.scale;
  }

  function mapLine(target) {
    if (target === 'rotation') return 'value + amt;';
    if (target === 'opacity') return 'Math.max(0, Math.min(100, value - amt));';
    return '[value[0] + amt, value[1] + amt];';
  }

  function kineticExpression(sourceName, target) {
    return [
      'src = thisComp.layer("' + escapeName(sourceName) + '");',
      'sp = length(src.transform.position.velocity);',
      'amt = Math.min(sp * effect("Kinetic Sensitivity")("Slider") / 1000, effect("Kinetic Max")("Slider"));',
      mapLine(target)
    ].join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (layers.length < 2) {
      throw new Error('Select a source layer plus one or more targets.');
    }

    var target = args.target === 'rotation' || args.target === 'opacity' ? args.target : 'scale';
    var sensitivity = args.sensitivity != null ? args.sensitivity : 50;
    var max = args.max != null ? args.max : 50;
    var match = targetMatch(target);

    var source = layers[0];
    var applied = 0;
    var skipped = [];

    for (var i = 1; i < layers.length; i++) {
      var child = layers[i];
      if (!(child instanceof AVLayer)) { skipped.push(child.name + ' (unsupported layer)'); continue; }

      rig.ensureSlider(child, 'Kinetic Sensitivity', sensitivity);
      rig.ensureSlider(child, 'Kinetic Max', max);

      var prop = child.property(M.transform).property(match);
      if (rig.setExpression(prop, kineticExpression(source.name, target))) applied++;
      else skipped.push(child.name + ' (has an expression)');
    }

    return { applied: applied, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers.');

    var candidates = [M.scale, M.rotation, M.opacity];
    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) continue;
      var group = layer.property(M.transform);
      var hit = false;
      for (var c = 0; c < candidates.length; c++) {
        var prop = group.property(candidates[c]);
        if (prop && rig.clearExpression(prop)) hit = true;
      }
      if (hit) cleared++;
    }

    return { cleared: cleared };
  }

  R.register('kinetic.apply', apply, 'Rebound: Kinetic');
  R.register('kinetic.remove', remove, 'Rebound: Remove Kinetic');
})();
