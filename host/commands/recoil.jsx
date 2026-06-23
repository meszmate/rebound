/*
 * Rebound host, Recoil (velocity-driven overshoot on existing keyframes).
 *
 * Adds elastic overshoot after a keyframe a property passes, scaled by the
 * velocity arriving at that keyframe, via a generated expression backed by
 * shared controls. The "Recoil Each Key" checkbox chooses whether overshoot
 * fires after EVERY keyframe (the value settles after each move) or only after
 * the final keyframe. Non-destructive: the original keyframes stay.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  function expression() {
    return [
      'amp = effect("Recoil Overshoot")("Slider") / 100;',
      'freq = effect("Recoil Bounce")("Slider");',
      'dec = effect("Recoil Friction")("Slider");',
      'eachKey = effect("Recoil Each Key")("Checkbox");',
      'n = 0;',
      'if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }',
      'if (n > 0 && (eachKey || n == numKeys)) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(dec * t);',
      '} else {',
      '  value;',
      '}'
    ].join('\n');
  }

  function apply(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var applied = 0;
    var skipped = [];

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;

      var layer = util.layerOfProperty(p);
      if (!(layer instanceof AVLayer)) { skipped.push(p.name + ' (unsupported layer)'); continue; }

      rig.ensureSlider(layer, 'Recoil Overshoot', args.overshoot != null ? args.overshoot : 60);
      rig.ensureSlider(layer, 'Recoil Bounce', args.bounce != null ? args.bounce : 2);
      rig.ensureSlider(layer, 'Recoil Friction', args.friction != null ? args.friction : 6);
      rig.ensureCheckbox(layer, 'Recoil Each Key', args.eachKey != null ? args.eachKey : true);

      if (rig.setExpression(p, expression())) applied++;
      else skipped.push(p.name + ' (has an expression)');
    }

    if (!applied && !skipped.length) {
      throw new Error('Select a property with at least two keyframes.');
    }
    return { applied: applied, skipped: skipped };
  }

  function remove() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var cleared = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p instanceof Property && rig.clearExpression(p)) cleared++;
    }
    return { cleared: cleared };
  }

  // ---- Baked follow-through (the same motion as the expression, as keyframes).
  // Exactly mirrors the expression: baked = value(t) + velocity*amp*s(t), where
  // value(t) is the property's ORIGINAL interpolated value (sampled before any
  // mutation) and s(t) = sin(2*PI*freq*t)*exp(-decay*t). Keyframes land only at
  // the EXACT peaks/valleys of s(t), so a clean handful of editable keys, not
  // one per frame. velocity is the real per-dimension speed of arrival, read
  // just before the keyframe (matching velocityAtTime(key.time - fd/10)).
  //
  // NOTE: the extrema phase math and autoDuration are duplicated, validated, in
  // client/js/easing/overshoot.js (unit-tested). Keep the two in sync.
  var PI = Math.PI;

  function asArray(v) {
    return (v instanceof Array) ? v : [v];
  }

  function zeros(dims) {
    var a = [];
    for (var d = 0; d < dims; d++) a.push(0);
    return a;
  }

  // Incoming velocity (value units/sec) per dim, a centered difference at
  // tk - fd/10 so it matches the reference's velocityAtTime(tk - fd/10).
  function incomingVelocity(p, tk, frameDur, dims) {
    var e = frameDur / 10;
    if (e <= 0) e = 0.001;
    var vb = asArray(p.valueAtTime(tk - e / 2, true));
    var va = asArray(p.valueAtTime(tk - 3 * e / 2, true));
    var out = [];
    for (var d = 0; d < dims; d++) out.push((vb[d] - va[d]) / e);
    return out;
  }

  function removeKeysBetween(p, ta, tb) {
    for (var i = p.numKeys; i >= 1; i--) {
      var t = p.keyTime(i);
      if (t > ta + 1e-6 && t < tb - 1e-6) p.removeKey(i);
    }
  }

  // Exact extrema times of s(t)=sin(omega t)exp(-dec t) in (0, dur), the peaks
  // and valleys: tan(omega t) = omega/dec => omega t = atan2(omega,dec)+k*PI.
  function extremaTimes(omega, dec, dur) {
    var phase = Math.atan2(omega, dec); // in (0, PI/2)
    var out = [];
    for (var k = 0; k <= 256; k++) {
      var tt = (phase + k * PI) / omega;
      if (tt >= dur) break;
      out.push(tt);
    }
    return out;
  }

  function autoDuration(dec) {
    var d = Math.log(120) / Math.max(0.4, dec);
    if (d < 0.25) return 0.25;
    if (d > 2.0) return 2.0;
    return d;
  }

  // Straight (linear) spatial path on a key so the baked oscillation traces the
  // velocity line instead of AE's default auto-bezier bow. keepIn preserves the
  // arrival tangent (used on the landing key); new keys get zero in and out.
  function linearSpatial(p, ki, dims, keepIn) {
    try {
      var z = zeros(dims);
      var inT = keepIn ? p.keyInSpatialTangent(ki) : z;
      p.setSpatialTangentsAtKey(ki, inT, z);
    } catch (e) {}
  }

  // Bake one follow-through described by `job` (times + the original base value
  // at each, captured before mutation).
  function bakeJob(p, job, amp, omega, dec, dims, influence, spatial) {
    var tk = job.tk, dur = job.dur, v = job.v, times = job.times, bases = job.bases;
    removeKeysBetween(p, tk, tk + dur);
    for (var a = 0; a < times.length; a++) {
      var tt = times[a];
      var sval = Math.sin(omega * tt) * Math.exp(-dec * tt);
      var base = bases[a];
      var val;
      if (dims === 1) {
        val = base[0] + v[0] * amp * sval;
      } else {
        val = [];
        for (var d = 0; d < dims; d++) val.push(base[d] + v[d] * amp * sval);
      }
      p.setValueAtTime(tk + tt, val);
    }
    // Buttery continuous-bezier handles on the NEW keys only; the landing key
    // (the user's arrival) is left untouched so its velocity stays intact.
    var eps = 1e-5;
    for (var ki = 1; ki <= p.numKeys; ki++) {
      var kt = p.keyTime(ki);
      if (kt > tk + eps && kt <= tk + dur + eps) {
        util.smoothTemporalKey(p, ki, influence);
        if (spatial) linearSpatial(p, ki, dims, false);
      }
    }
    // Straighten just the landing's OUT spatial tangent so it departs along the
    // velocity line; its arrival (IN) is preserved.
    if (spatial) {
      for (var li = 1; li <= p.numKeys; li++) {
        if (Math.abs(p.keyTime(li) - tk) <= eps) { linearSpatial(p, li, dims, true); break; }
      }
    }
  }

  function bake(args) {
    var amp = (args.overshoot != null ? args.overshoot : 60) / 100;
    var freq = args.bounce != null ? args.bounce : 2;
    if (freq < 0.01) freq = 0.01; // guard: 0 => no extrema, negative => wrong way
    var dec = args.friction != null ? args.friction : 6;
    if (dec < 0.01) dec = 0.01; // guard: <=0 would never decay (runaway amplitude)
    var eachKey = args.eachKey === true; // default: only the last selected key
    var influence = args.handleLength > 0 ? args.handleLength : 45;
    var reqDur = args.duration > 0 ? args.duration : 0;
    var omega = 2 * PI * freq;

    var comp = util.activeComp();
    var frameDur = comp.frameDuration;
    var props = comp.selectedProperties;
    var applied = 0;
    var segments = 0;
    var skipped = [];

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;
      var dims = util.dimensionsOf(p);
      if (dims < 1) { skipped.push(p.name + ' (unsupported value)'); continue; }
      var spatial = util.isSpatial(p);
      // If a prior Rebound recoil expression is on this property, clear it so the
      // baked keyframes are what actually drives the motion (valueAtTime(t,true)
      // already samples the keyframed base regardless).
      rig.clearExpression(p);

      // Recoil after the selected keyframes (each needs a previous key for an
      // arrival velocity). Default: the last selected key; eachKey: every one.
      var sel = p.selectedKeys; // ascending indices
      var targets = [];
      if (eachKey) {
        var pool = (sel && sel.length) ? sel : null;
        if (pool) { for (var s = 0; s < pool.length; s++) targets.push(pool[s]); }
        else { for (var n = 2; n <= p.numKeys; n++) targets.push(n); }
      } else {
        targets.push((sel && sel.length) ? sel[sel.length - 1] : p.numKeys);
      }

      // Capture velocity + anchor times + the ORIGINAL value each anchor rides
      // on, for every target, BEFORE mutating any keys (baking changes both
      // indices and valueAtTime sampling).
      var jobs = [];
      for (var j = 0; j < targets.length; j++) {
        var ni = targets[j];
        if (ni < 2) continue; // no previous key => no arrival velocity
        var tk = p.keyTime(ni);
        var vel = incomingVelocity(p, tk, frameDur, dims);
        var mag = 0;
        for (var dd = 0; dd < dims; dd++) mag += vel[dd] * vel[dd];
        if (mag < 1e-6) continue; // no real arrival, nothing to recoil from
        var dur = reqDur > 0 ? reqDur : autoDuration(dec);
        // Never run into the next existing key (leave a frame of room).
        if (ni < p.numKeys) {
          var maxDur = p.keyTime(ni + 1) - tk - frameDur;
          if (maxDur <= 0) continue; // keys too close to settle between
          if (dur > maxDur) dur = maxDur;
        }
        var times = extremaTimes(omega, dec, dur);
        var lastT = times.length ? times[times.length - 1] : 0;
        if (dur - lastT > 1e-4) times.push(dur); // close the window
        var bases = [];
        for (var b = 0; b < times.length; b++) bases.push(asArray(p.valueAtTime(tk + times[b], true)));
        jobs.push({ tk: tk, v: vel, dur: dur, times: times, bases: bases });
      }

      if (!jobs.length) { skipped.push(p.name + ' (no incoming motion)'); continue; }
      for (var q = 0; q < jobs.length; q++) {
        bakeJob(p, jobs[q], amp, omega, dec, dims, influence, spatial);
        segments++;
      }
      applied++;
    }

    if (!applied && !skipped.length) {
      throw new Error('Select a property with at least two keyframes.');
    }
    return { applied: applied, segments: segments, skipped: skipped };
  }

  R.register('recoil.apply', apply, 'Rebound: Recoil');
  R.register('recoil.bake', bake, 'Rebound: Recoil');
  R.register('recoil.remove', remove, 'Rebound: Remove Recoil');
})();
