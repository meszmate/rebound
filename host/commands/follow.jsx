/*
 * Rebound host, Follow (follow-through: trail the lead layer's position).
 *
 * The first selected layer is the lead. Every other selected layer becomes a
 * follower: it gets a "Follow Delay" Slider Control and a marker-guarded
 * expression on its Position that samples the lead's position a few frames in
 * the past. With cascade on, each successive follower is delayed by one more
 * step. The marker guard means we never clobber a user's own expression, and
 * Remove clears only our own.
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

  function followExpression(parentName) {
    return [
      'd = effect("Follow Delay")("Slider") / thisComp.frameRate;',
      'p = thisComp.layer("' + escapeName(parentName) + '").transform.position.valueAtTime(time - d);',
      // Match the follower's own dimensionality: a 2D follower truncates a 3D
      // lead, a 3D follower keeps its own Z when the lead is 2D.
      '(value.length > 2) ? ((p.length > 2) ? p : [p[0], p[1], value[2]]) : [p[0], p[1]];'
    ].join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (layers.length < 2) {
      throw new Error('Select a lead layer plus one or more followers.');
    }

    var delayFrames = num(args.delayFrames, 4);
    if (delayFrames < 0) delayFrames = 0;
    var cascade = !!args.cascade;

    var parent = layers[0];
    var applied = 0;
    var skipped = [];

    for (var i = 1; i < layers.length; i++) {
      var child = layers[i];
      if (child instanceof CameraLayer || child instanceof LightLayer) { skipped.push(child.name + ' (camera/light)'); continue; }

      var pos = child.property(M.transform).property(M.position);
      // With separated dimensions AE drives X/Y Position separately and the
      // composite property can't hold the rig.
      var sep = false; try { sep = pos.dimensionsSeparated; } catch (eSep) { sep = false; }
      if (sep) { skipped.push(child.name + ' (separate dimensions is on)'); continue; }
      var step = cascade ? delayFrames * i : delayFrames;

      rig.ensureSlider(child, 'Follow Delay', step);

      if (rig.setExpression(pos, followExpression(parent.name), 'follow')) applied++;
      else skipped.push(child.name + ' (has an expression)');
    }

    if (!applied) throw new Error('No followers rigged: ' + skipped.join(', '));
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
      var pos = layer.property(M.transform).property(M.position);
      if (rig.clearExpression(pos, 'follow')) cleared++;
      rig.removeControls(layer, ['Follow Delay']);
    }

    return { cleared: cleared };
  }

  R.register('follow.apply', apply, 'Rebound: Follow');
  R.register('follow.remove', remove, 'Rebound: Remove Follow');
})();