/*
 * Rebound host, Throw (physics-baked motion).
 *
 * A CEP panel cannot grab a layer in the viewport, so the trajectory is baked
 * from parameters with a real integrator: fixed-substep semi-implicit (symplectic)
 * Euler, air drag, gravity, and proper coefficient-of-restitution bounces against
 * a floor (and optional box walls/ceiling) with Coulomb-style ground friction so
 * the object bounces many shrinking times and rolls to rest. Optional spin and
 * squash-on-impact. Writes real Position (+ Rotation / Scale) keyframes from the
 * playhead, honoring separated Position dimensions.
 *
 * simulateThrow MUST stay byte-identical to client/js/features/throw.js so the
 * in-panel preview matches the baked result.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  // Deterministic integrator. Works in a local frame where the layer starts at
  // (0,0); cfg.floor is the floor distance BELOW the start (positive). Returns
  // { frames:[{x,y,ang,s}], settledFrame:int|null }.
  function simulateThrow(cfg) {
    var H = 1 / 360;
    var sub = Math.ceil(360 / cfg.fps); if (sub < 1) sub = 1;
    var rad = cfg.angle * Math.PI / 180;
    var vx = cfg.strength * Math.cos(rad);
    var vy = -cfg.strength * Math.sin(rad);
    var x = 0, y = 0, ang = 0, omega = 0, squashS = 0;
    var rest = cfg.gravity * H * 4 + 4;
    var total = Math.round(cfg.duration * cfg.fps);
    var frames = [];
    var settledFrame = null;
    for (var f = 0; f <= total; f++) {
      var sp = Math.sqrt(vx * vx + vy * vy);
      var stretch = Math.min(sp * cfg.stretchSens / 1000, cfg.stretchMax);
      frames.push({ x: x, y: y, ang: ang, s: squashS, st: stretch, va: Math.atan2(vy, vx) * 180 / Math.PI });
      for (var k = 0; k < sub; k++) {
        var damp = Math.exp(-cfg.drag * H);
        vx *= damp; vy *= damp;
        vy += cfg.gravity * H;
        vx += cfg.windX * H; vy += cfg.windY * H;
        var nx = x + vx * H, ny = y + vy * H;
        var hit = false, impact = 0;
        if (cfg.bounce && ny > cfg.floor) {
          var tHit = (cfg.floor - y) / (ny - y);
          if (!(tHit >= 0 && tHit <= 1)) tHit = 0;
          x += vx * H * tHit; y = cfg.floor;
          impact = Math.abs(vy);
          if (Math.abs(vy) < rest) { vy = 0; }
          else { vy = -cfg.e * vy; hit = true; }
          vx *= (1 - cfg.friction);
          x += vx * H * (1 - tHit); y += vy * H * (1 - tHit);
        } else { x = nx; y = ny; }
        if (cfg.bounds === 'box') {
          if (x < cfg.wallMin) { x = cfg.wallMin; vx = -cfg.e * vx; }
          if (x > cfg.wallMax) { x = cfg.wallMax; vx = -cfg.e * vx; }
          if (y < cfg.ceiling) { y = cfg.ceiling; vy = -cfg.e * vy; }
        }
        // rolling friction once it stops bouncing
        if (cfg.bounce && y >= cfg.floor - 0.001 && Math.abs(vy) < rest) {
          var dec = cfg.friction * cfg.gravity * H;
          if (Math.abs(vx) <= dec) vx = 0; else vx -= (vx > 0 ? dec : -dec);
        }
        if (cfg.spin === 'roll') {
          if (cfg.bounce && y >= cfg.floor - 0.001) omega = -vx / (cfg.radius < 1 ? 1 : cfg.radius);
          ang += omega * H * 180 / Math.PI * cfg.spinAmount;
        }
        if (cfg.squash && hit) {
          var imp = Math.min(1, impact / (cfg.strength * 0.5 + 1));
          var s = cfg.squashStrength / 100 * imp;
          if (s > squashS) squashS = s;
        }
      }
      if (cfg.squash) squashS *= 0.8;
      if (cfg.spin === 'follow') ang = Math.atan2(vy, vx) * 180 / Math.PI * cfg.spinAmount;
      if (settledFrame === null && cfg.bounce && y >= cfg.floor - 0.5 && Math.abs(vx) < 1 && Math.abs(vy) < rest && f > 1) settledFrame = f;
    }
    return { frames: frames, settledFrame: settledFrame };
  }

  function readStart(tg, t0, sep) {
    if (sep) return [tg.property(M.positionX).valueAtTime(t0, false), tg.property(M.positionY).valueAtTime(t0, false)];
    var v = tg.property(M.position).valueAtTime(t0, false);
    return (v instanceof Array) ? v : [v, 0];
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to throw.');

    var fps = comp.frameRate;
    var t0 = comp.time;
    var spin = (args.spin === 'follow' || args.spin === 'roll') ? args.spin : 'off';
    var doRot = spin !== 'off' || !!args.stretch;
    var doScale = !!args.squash || !!args.stretch;
    if (args.motionBlur) { try { comp.motionBlur = true; } catch (e0) {} }

    var applied = 0, skipped = [];
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(layer.name + ' (camera/light)'); continue; }

      var tg = layer.property(M.transform);
      var pos = tg.property(M.position);
      var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
      var start = readStart(tg, t0, sep);
      var z = (!sep && start.length > 2) ? start[2] : null;

      // Floor below the layer's start, in the same local frame the sim uses.
      var floorAbs = args.useLayerFloor ? start[1] + 4 : comp.height;
      var floorRel = floorAbs - start[1]; if (floorRel < 1) floorRel = 1;

      var radius = 18;
      try { var r = layer.sourceRectAtTime(t0, false); radius = Math.max(4, Math.min(r.width, r.height) / 2); } catch (e2) {}

      var cfg = {
        fps: fps, duration: args.autoDur ? 8 : (args.duration != null ? args.duration : 1.6),
        angle: args.angle != null ? args.angle : 45,
        strength: args.strength != null ? args.strength : 700,
        gravity: args.gravity != null ? args.gravity : 1400,
        drag: args.drag != null ? args.drag : 0.5,
        bounce: !!args.bounce,
        e: args.elasticity != null ? Math.min(0.98, args.elasticity) : 0.5,
        friction: args.friction != null ? args.friction : 0.3,
        bounds: args.bounds === 'box' ? 'box' : 'floor',
        floor: floorRel,
        wallMin: -(comp.width / 2), wallMax: comp.width / 2, ceiling: -(floorRel),
        spin: spin, spinAmount: args.spinAmount != null ? args.spinAmount : 1,
        squash: !!args.squash, squashStrength: args.squashStrength != null ? args.squashStrength : 12,
        radius: radius,
        windX: (args.windStrength || 0) * Math.cos((args.windAngle || 0) * Math.PI / 180),
        windY: (args.windStrength || 0) * Math.sin((args.windAngle || 0) * Math.PI / 180),
        stretchSens: args.stretch ? (args.stretchAmt != null ? args.stretchAmt : 60) : 0,
        stretchMax: (args.stretchAmt != null ? args.stretchAmt : 60) / 100
      };

      var sim = simulateThrow(cfg);
      var frames = sim.frames;
      var endFrame = frames.length - 1;
      if (args.autoDur) {
        if (sim.settledFrame) endFrame = Math.min(endFrame, sim.settledFrame + Math.round(0.3 * fps));
        else {
          var fell = -1;
          for (var ff = 0; ff < frames.length; ff++) { if (Math.abs(frames[ff].y) > floorRel * 1.6 + 200) { fell = ff; break; } }
          endFrame = fell >= 0 ? fell : Math.min(endFrame, Math.round(2.5 * fps));
        }
      }
      var rotProp = doRot ? tg.property(M.rotation) : null;
      var scaleProp = doScale ? tg.property(M.scale) : null;
      var baseRot = rotProp ? rotProp.valueAtTime(t0, false) : 0;
      var baseScale = scaleProp ? scaleProp.valueAtTime(t0, false) : [100, 100];

      for (var fr = 0; fr <= endFrame; fr++) {
        var t = t0 + fr / fps;
        var px = start[0] + frames[fr].x, py = start[1] + frames[fr].y;
        if (sep) { tg.property(M.positionX).setValueAtTime(t, px); tg.property(M.positionY).setValueAtTime(t, py); }
        else { pos.setValueAtTime(t, z != null ? [px, py, z] : [px, py]); }
        if (rotProp) rotProp.setValueAtTime(t, baseRot + (args.stretch ? frames[fr].va : frames[fr].ang));
        if (scaleProp) {
          if (args.stretch) { var stv = frames[fr].st; scaleProp.setValueAtTime(t, [baseScale[0] * (1 + stv), baseScale[1] / (1 + stv)]); }
          else { var s = frames[fr].s; if (s > 0.9) s = 0.9; scaleProp.setValueAtTime(t, [baseScale[0] * (1 / (1 - s)), baseScale[1] * (1 - s)]); }
        }
      }
      if (args.motionBlur) { try { layer.motionBlur = true; } catch (eMB) {} }
      applied++;
    }
    if (!applied) throw new Error('No supported layers to throw: ' + skipped.join(', '));
    return { applied: applied, skipped: skipped };
  }

  R.register('throw.apply', apply, 'Rebound: Throw');
})();
