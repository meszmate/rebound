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

  // One expression shape per trailed property, all reading the one shared
  // "Follow Delay" slider. Position keeps the 3D-aware dimensionality handling;
  // Rotation is a plain scalar; Scale copies X/Y and keeps the follower's Z.
  function followExpression(parentName, channel) {
    var lead = 'thisComp.layer("' + escapeName(parentName) + '")';
    if (channel === 'rotation') {
      return [
        'd = effect("Follow Delay")("Slider") / thisComp.frameRate;',
        lead + '.transform.rotation.valueAtTime(time - d);'
      ].join('\n');
    }
    if (channel === 'scale') {
      return [
        'd = effect("Follow Delay")("Slider") / thisComp.frameRate;',
        's = ' + lead + '.transform.scale.valueAtTime(time - d);',
        '(value.length > 2) ? [s[0], s[1], value[2]] : [s[0], s[1]];'
      ].join('\n');
    }
    return [
      'd = effect("Follow Delay")("Slider") / thisComp.frameRate;',
      'p = ' + lead + '.transform.position.valueAtTime(time - d);',
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
    // What trails: Position stays the default; Rotation / Scale are opt-in.
    var wantPos = args.position !== false;
    var wantRot = !!args.rotation;
    var wantScale = !!args.scale;
    if (!wantPos && !wantRot && !wantScale) throw new Error('Choose at least one property to follow.');

    var parent = layers[0];
    var applied = 0;
    var skipped = [];

    for (var i = 1; i < layers.length; i++) {
      var child = layers[i];
      if (child instanceof CameraLayer || child instanceof LightLayer) { skipped.push(child.name + ' (camera/light)'); continue; }

      var tg = child.property(M.transform);
      var step = cascade ? delayFrames * i : delayFrames;
      rig.ensureSlider(child, 'Follow Delay', step);

      var wrote = 0;
      if (wantPos) {
        var pos = tg.property(M.position);
        // With separated dimensions AE drives X/Y Position separately and the
        // composite property can't hold the rig.
        var sep = false; try { sep = pos.dimensionsSeparated; } catch (eSep) { sep = false; }
        if (sep) skipped.push(child.name + ' (position: separate dimensions is on)');
        else if (rig.setExpression(pos, followExpression(parent.name, 'position'), 'follow')) wrote++;
        else skipped.push(child.name + ' (position has an expression)');
      }
      if (wantRot) {
        if (rig.setExpression(tg.property(M.rotation), followExpression(parent.name, 'rotation'), 'follow')) wrote++;
        else skipped.push(child.name + ' (rotation has an expression)');
      }
      if (wantScale) {
        if (rig.setExpression(tg.property(M.scale), followExpression(parent.name, 'scale'), 'follow')) wrote++;
        else skipped.push(child.name + ' (scale has an expression)');
      }

      if (wrote) applied++;
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
      var tg = layer.property(M.transform);
      var hit = false;
      if (rig.clearExpression(tg.property(M.position), 'follow')) hit = true;
      if (rig.clearExpression(tg.property(M.rotation), 'follow')) hit = true;
      if (rig.clearExpression(tg.property(M.scale), 'follow')) hit = true;
      rig.removeControls(layer, ['Follow Delay']);
      if (hit) cleared++;
    }

    return { cleared: cleared };
  }

  R.register('follow.apply', apply, 'Rebound: Follow');
  R.register('follow.remove', remove, 'Rebound: Remove Follow');
})();