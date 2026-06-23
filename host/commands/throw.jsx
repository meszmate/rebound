/*
 * Rebound host, Throw (physics-baked motion, a Dynamic-style toss).
 *
 * A CEP panel cannot grab a layer in the comp viewport, so instead of an
 * interactive drag this bakes the trajectory from parameters: an initial
 * velocity (angle + strength), air drag, gravity, and an optional floor bounce.
 * It integrates frame by frame from the playhead and writes Position keyframes,
 * so the result is real, hand-editable keyframes (like Convert to Keyframes),
 * not an expression. Honors separated Position dimensions.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to throw.');

    var fps = comp.frameRate;
    var dt = 1 / fps;
    var t0 = comp.time;

    var angle = args.angle != null ? args.angle : 35;        // deg, 0 = right, 90 = up
    var strength = args.strength != null ? args.strength : 700; // px/s
    var gravity = args.gravity != null ? args.gravity : 1400;   // px/s^2 (down)
    var drag = args.drag != null ? args.drag : 0.5;             // per second
    var bounceOn = !!args.bounce;
    var elasticity = args.elasticity != null ? args.elasticity : 0.5;
    var duration = args.duration != null ? args.duration : 1.6; // seconds
    if (duration < dt) duration = dt;

    var rad = angle * Math.PI / 180;
    var ivx = strength * Math.cos(rad);
    var ivy = -strength * Math.sin(rad); // screen y is down, so up is negative

    var applied = 0;
    var skipped = [];
    var totalFrames = 0;

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!(layer instanceof AVLayer)) { skipped.push(layer.name + ' (unsupported layer)'); continue; }

      var tg = layer.property(M.transform);
      var pos = tg.property(M.position);
      var sep = false;
      try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }

      var px = null, py = null, start;
      if (sep) {
        px = tg.property(M.positionX);
        py = tg.property(M.positionY);
        start = [px.valueAtTime(t0, false), py.valueAtTime(t0, false)];
      } else {
        start = pos.valueAtTime(t0, false);
        if (!(start instanceof Array)) start = [start, 0];
      }

      var floor = comp.height;
      var x = start[0], y = start[1], z = start.length > 2 ? start[2] : null;
      var vx = ivx, vy = ivy;
      var frames = Math.round(duration * fps);

      for (var f = 0; f <= frames; f++) {
        var t = t0 + f * dt;
        if (f > 0) {
          var damp = Math.exp(-drag * dt);
          vx *= damp; vy *= damp;
          vy += gravity * dt;
          x += vx * dt; y += vy * dt;
          if (bounceOn && y > floor) { y = floor; vy = -vy * elasticity; vx *= 0.9; }
        }
        if (sep) { px.setValueAtTime(t, x); py.setValueAtTime(t, y); }
        else { pos.setValueAtTime(t, z != null ? [x, y, z] : [x, y]); }
      }
      totalFrames += frames;
      applied++;
    }

    if (!applied) throw new Error('No supported layers to throw: ' + skipped.join(', '));
    return { applied: applied, skipped: skipped, frames: totalFrames };
  }

  R.register('throw.apply', apply, 'Rebound: Throw');
})();
