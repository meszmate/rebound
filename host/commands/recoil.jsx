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
  // baked = value(t) + velocity*amp*s(t), where value(t) is the property's
  // ORIGINAL interpolated value (sampled before mutation) and
  // s(t) = sin(2*PI*freq*t)*exp(-decay*t).
  //
  // To look IDENTICAL to the curve (not a rough approximation) with few editable
  // keys, we place a keyframe at every quarter-cycle (each peak/valley AND each
  // zero-crossing) and set each key's bezier tangent to the curve's TRUE slope
  // (base' + velocity*amp*s'). With the right slopes the cubic between keys is a
  // Hermite that hugs the math; the handles stay draggable.
  //
  // NOTE: the anchor + slope math is duplicated, validated, in
  // client/js/easing/overshoot.js (unit-tested fidelity). Keep the two in sync.
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

  // Extrema (peaks/valleys) of s(t)=sin(omega t)exp(-dec t) in (0, dur):
  // tan(omega t) = omega/dec => omega t = atan2(omega,dec)+k*PI.
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

  // Zero-crossings (target passes) of s(t) in (0, dur): sin(omega t)=0 => k*PI/omega.
  function crossingTimes(omega, dur) {
    var out = [];
    for (var k = 1; k <= 256; k++) {
      var tt = k * PI / omega;
      if (tt >= dur) break;
      out.push(tt);
    }
    return out;
  }

  // Sorted, de-duped union of extrema and crossings: a key every quarter-cycle so
  // each cubic segment spans a monotonic arc the bezier can match.
  function extremaAndCrossings(omega, dec, dur) {
    var all = extremaTimes(omega, dec, dur).concat(crossingTimes(omega, dur));
    all.sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!out.length || all[i] - out[out.length - 1] > 1e-6) out.push(all[i]);
    }
    return out;
  }

  function sShape(omega, dec, tt) { return Math.sin(omega * tt) * Math.exp(-dec * tt); }
  function sSlope(omega, dec, tt) { return Math.exp(-dec * tt) * (omega * Math.cos(omega * tt) - dec * Math.sin(omega * tt)); }

  function autoDuration(dec) {
    var d = Math.log(120) / Math.max(0.4, dec);
    if (d < 0.25) return 0.25;
    if (d > 2.0) return 2.0;
    return d;
  }

  function keyIndexAtTime(p, t, eps) {
    for (var i = 1; i <= p.numKeys; i++) {
      if (Math.abs(p.keyTime(i) - t) <= eps) return i;
    }
    return -1;
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

  // AE's standard ease influence; with the true slope set, a 33.33% handle makes
  // the cubic between keys the Hermite that matches the math curve.
  var FIT_INFLUENCE = 33.3333;

  // Build the temporal ease array from a per-dim slope vector vp. Reads the live
  // ease-array length so the arity is right: spatial props share one speed graph
  // (length 1, the magnitude); other props get one signed speed per dimension.
  function easeFromSlope(cur, vp, dims) {
    var arr = [];
    if (cur.length === 1) {
      var speed;
      if (dims > 1) { var mag = 0; for (var d = 0; d < dims; d++) mag += vp[d] * vp[d]; speed = Math.sqrt(mag); }
      else speed = vp[0];
      arr.push(new KeyframeEase(speed, FIT_INFLUENCE));
    } else {
      for (var d2 = 0; d2 < cur.length; d2++) arr.push(new KeyframeEase(d2 < vp.length ? vp[d2] : 0, FIT_INFLUENCE));
    }
    return arr;
  }

  // Smooth, editable bezier key whose in == out tangent slope IS the curve's true
  // slope vp, so the cubic hugs the math (no kink: in == out).
  function setFitEase(p, ki, vp, dims) {
    try { p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) {}
    try { p.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
    try { p.setTemporalContinuousAtKey(ki, false); } catch (e2) {}
    try {
      var cur = p.keyInTemporalEase(ki);
      var a = easeFromSlope(cur, vp, dims);
      p.setTemporalEaseAtKey(ki, a, a);
    } catch (e3) {}
  }

  // The landing key: set ONLY its OUT tangent to the follow-through's initial
  // slope (so the overshoot leaves at the arrival speed); preserve the user's
  // arrival (IN) interpolation type and ease untouched.
  function setLandingOutEase(p, ki, vp, dims) {
    try {
      var curIn = p.keyInTemporalEase(ki);
      var inType = p.keyInInterpolationType(ki);
      var outA = easeFromSlope(curIn, vp, dims);
      try { p.setInterpolationTypeAtKey(ki, inType, KeyframeInterpolationType.BEZIER); } catch (e0) {}
      try { p.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
      p.setTemporalEaseAtKey(ki, curIn, outA);
    } catch (e) {}
  }

  // Bake one follow-through described by `job` (anchor times, plus the original
  // base value AND base slope at each, captured before mutation).
  function bakeJob(p, job, amp, omega, dec, dims, spatial) {
    var tk = job.tk, dur = job.dur, v = job.v;
    var times = job.times, bases = job.bases, derivs = job.derivs;
    removeKeysBetween(p, tk, tk + dur);
    // 1) Values: original base + velocity*amp*shape.
    for (var a = 0; a < times.length; a++) {
      var tt = times[a];
      var sval = sShape(omega, dec, tt);
      var base = bases[a];
      var val;
      if (dims === 1) val = base[0] + v[0] * amp * sval;
      else { val = []; for (var d = 0; d < dims; d++) val.push(base[d] + v[d] * amp * sval); }
      p.setValueAtTime(tk + tt, val);
    }
    // 2) Tangents: true slope = base' + velocity*amp*shape', on each new key.
    var eps = 1e-5;
    for (var b = 0; b < times.length; b++) {
      var tt2 = times[b];
      var ki = keyIndexAtTime(p, tk + tt2, eps);
      if (ki < 1) continue;
      var sp = sSlope(omega, dec, tt2);
      var vp = [];
      for (var d3 = 0; d3 < dims; d3++) vp.push(derivs[b][d3] + v[d3] * amp * sp);
      setFitEase(p, ki, vp, dims);
      if (spatial) linearSpatial(p, ki, dims, false);
    }
    // 3) Landing OUT: leaves at the arrival speed (s'(0) = omega), arrival kept.
    var lk = keyIndexAtTime(p, tk, eps);
    if (lk >= 1) {
      var lvp = [];
      for (var d4 = 0; d4 < dims; d4++) lvp.push(job.landingDeriv[d4] + v[d4] * amp * omega);
      setLandingOutEase(p, lk, lvp, dims);
      if (spatial) linearSpatial(p, lk, dims, true);
    }
  }

  function bake(args) {
    var amp = (args.overshoot != null ? args.overshoot : 60) / 100;
    var freq = args.bounce != null ? args.bounce : 2;
    if (freq < 0.01) freq = 0.01; // guard: 0 => no extrema, negative => wrong way
    var dec = args.friction != null ? args.friction : 6;
    if (dec < 0.01) dec = 0.01; // guard: <=0 would never decay (runaway amplitude)
    var eachKey = args.eachKey === true; // default: only the last selected key
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
        var times = extremaAndCrossings(omega, dec, dur);
        var lastT = times.length ? times[times.length - 1] : 0;
        if (dur - lastT > 1e-4) times.push(dur); // close the window
        // Capture, per anchor, the original base value AND its slope (central
        // difference), all from the un-mutated animation.
        var hh = frameDur / 20;
        if (hh <= 0) hh = 0.001;
        var bases = [];
        var derivs = [];
        for (var b = 0; b < times.length; b++) {
          var at = tk + times[b];
          bases.push(asArray(p.valueAtTime(at, true)));
          var fwd = asArray(p.valueAtTime(at + hh, true));
          var bwd = asArray(p.valueAtTime(at - hh, true));
          var dv = [];
          for (var db = 0; db < dims; db++) dv.push((fwd[db] - bwd[db]) / (2 * hh));
          derivs.push(dv);
        }
        // Post-landing base slope (forward difference at tk).
        var l0 = asArray(p.valueAtTime(tk, true));
        var lf = asArray(p.valueAtTime(tk + hh, true));
        var ld = [];
        for (var dl = 0; dl < dims; dl++) ld.push((lf[dl] - l0[dl]) / hh);
        jobs.push({ tk: tk, v: vel, dur: dur, times: times, bases: bases, derivs: derivs, landingDeriv: ld });
      }

      if (!jobs.length) { skipped.push(p.name + ' (no incoming motion)'); continue; }
      for (var q = 0; q < jobs.length; q++) {
        bakeJob(p, jobs[q], amp, omega, dec, dims, spatial);
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
