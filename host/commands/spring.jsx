/*
 * Rebound host, spring / bake commands.
 *
 * Baking writes per-frame keyframes from a normalized factor table the panel
 * computes with the (unit-tested) spring engine, so the physics stays in JS and
 * the host only samples the table and writes values. Used by springs, bounce,
 * and any overshooting curve that can't be a single temporal ease.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function valuesAt(prop, index) {
    var v = prop.keyValue(index);
    return v instanceof Array ? v : [v];
  }

  // Linear lookup into a normalized factor table at progress p in [0,1].
  function lookup(factors, p) {
    if (p <= 0) return factors[0];
    if (p >= 1) return factors[factors.length - 1];
    var pos = p * (factors.length - 1);
    var i = Math.floor(pos);
    var frac = pos - i;
    return factors[i] + (factors[i + 1] - factors[i]) * frac;
  }

  function removeKeysBetween(prop, ta, tb) {
    // Remove from the highest index down so indices stay valid.
    for (var i = prop.numKeys; i >= 1; i--) {
      var t = prop.keyTime(i);
      if (t > ta + 1e-6 && t < tb - 1e-6) {
        prop.removeKey(i);
      }
    }
  }

  function bakeSegment(prop, ta, tb, va, vb, factors, fps, dims) {
    removeKeysBetween(prop, ta, tb);
    var dt = tb - ta;
    var frameDur = 1 / fps;
    for (var t = ta + frameDur; t < tb - 1e-6; t += frameDur) {
      var p = (t - ta) / dt;
      var f = lookup(factors, p);
      if (dims === 1) {
        prop.setValueAtTime(t, va[0] + (vb[0] - va[0]) * f);
      } else {
        var out = [];
        for (var d = 0; d < dims; d++) {
          out.push(va[d] + (vb[d] - va[d]) * f);
        }
        prop.setValueAtTime(t, out);
      }
    }
  }

  // Bake a normalized factor table onto each adjacent selected keyframe pair.
  function bake(args) {
    var factors = args.factors;
    if (!factors || factors.length < 2) {
      throw new Error('No bake data supplied.');
    }
    var comp = util.activeComp();
    var fps = comp.frameRate;
    var props = comp.selectedProperties;
    var propsTouched = 0;
    var segments = 0;

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;
      var idx = p.selectedKeys.length >= 2 ? p.selectedKeys : null;
      if (!idx) continue;
      var dims = util.dimensionsOf(p);
      var did = false;

      // Capture every pair's endpoints up front (times/values), since baking
      // mutates keys and shifts indices.
      var pairs = [];
      for (var s = 0; s < idx.length - 1; s++) {
        pairs.push({
          ta: p.keyTime(idx[s]),
          tb: p.keyTime(idx[s + 1]),
          va: valuesAt(p, idx[s]),
          vb: valuesAt(p, idx[s + 1])
        });
      }
      for (var k = 0; k < pairs.length; k++) {
        var pr = pairs[k];
        if (pr.tb - pr.ta <= 0) continue;
        bakeSegment(p, pr.ta, pr.tb, pr.va, pr.vb, factors, fps, dims);
        segments++;
        did = true;
      }
      if (did) propsTouched++;
    }

    if (!segments) {
      throw new Error('Select at least two keyframes on an animated property.');
    }
    return { properties: propsTouched, segments: segments };
  }

  // Make a keyframe a smooth, hand-editable CONTINUOUS bezier with LONG tangent
  // handles, the buttery feel: bezier interpolation, not auto (so the two
  // handles stay where set and are draggable in the Graph Editor), continuous
  // tangents through the point so the curve flows without a kink, then the
  // handles are lengthened by raising temporal-ease influence on both sides.
  //
  // Handle length is a sweet spot, not "longer is better": ~45% gives a clean
  // ease-in-out arc between peaks. Too short pinches the corners; too long
  // (70%+) flattens each turning point into a shelf. We keep AE's
  // continuous-computed speed (slope) and only set the influence.
  function smoothKey(prop, ki, influence) {
    influence = influence > 0 ? influence : 45;
    if (influence > 90) influence = 90; // leave headroom so beziers stay valid
    try { prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) {}
    try { prop.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
    try { prop.setTemporalContinuousAtKey(ki, true); } catch (e2) {}
    // Lengthen both handles: reuse the continuous-computed speed, raise influence.
    try {
      var inE = prop.keyInTemporalEase(ki);
      var outE = prop.keyOutTemporalEase(ki);
      var nin = [];
      var nout = [];
      for (var d = 0; d < inE.length; d++) {
        nin.push(new KeyframeEase(inE[d].speed, influence));
        nout.push(new KeyframeEase(outE[d].speed, influence));
      }
      prop.setTemporalEaseAtKey(ki, nin, nout);
    } catch (e3) {}
  }

  // ---- Faithful (true-slope Hermite) baking --------------------------------
  // When an anchor carries its true slope m (dy/dt in normalized segment time),
  // we pin the keyframe's temporal handle to that slope at a 1/3 influence, so
  // the cubic AE draws between two anchors IS the Hermite that hugs the curve,
  // not a guessed continuous-bezier that sags between peaks. This is the same
  // technique the unit-tested recoil bake uses; it's what makes the baked spring
  // match the live preview (which samples the exact function).
  var FIT_INFLUENCE = 33.3333;

  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  function keyIndexAtTime(prop, t, eps) {
    for (var i = 1; i <= prop.numKeys; i++) {
      if (Math.abs(prop.keyTime(i) - t) <= eps) return i;
    }
    return -1;
  }

  // Per-dimension value slope (units/sec) for anchor slope m: value = va + (vb -
  // va)*y, so d(value)/d(realTime) = (vb - va) * m / dt.
  function valueSlopeVec(va, vb, m, dt, dims) {
    var vp = [];
    for (var d = 0; d < dims; d++) vp.push(((vb[d] || 0) - (va[d] || 0)) * m / dt);
    return vp;
  }

  // Build a temporal-ease array matching the live arity: spatial props share one
  // speed graph (the magnitude); everything else gets one signed speed per dim.
  function easeFromSlope(cur, vp, dims) {
    var arr = [];
    if (cur.length === 1) {
      var speed;
      if (dims > 1) { var m = 0; for (var d = 0; d < dims; d++) m += vp[d] * vp[d]; speed = Math.sqrt(m); }
      else speed = vp[0];
      arr.push(new KeyframeEase(speed, FIT_INFLUENCE));
    } else {
      for (var d2 = 0; d2 < cur.length; d2++) arr.push(new KeyframeEase(d2 < vp.length ? vp[d2] : 0, FIT_INFLUENCE));
    }
    return arr;
  }

  // Straighten the spatial tangents that are INTERNAL to the baked overshoot so
  // the path traces the straight velocity line (no AE auto-bezier bow); keep the
  // endpoints' outward tangents so the surrounding motion is untouched.
  function straightenSpatial(prop, ki, dims, keepIn, keepOut) {
    try {
      var z = zeros(dims);
      var inT = keepIn ? prop.keyInSpatialTangent(ki) : z;
      var outT = keepOut ? prop.keyOutSpatialTangent(ki) : z;
      prop.setSpatialTangentsAtKey(ki, inT, outT);
    } catch (e) {}
  }

  // Interior overshoot key: both sides pinned to the true slope (in == out, no
  // kink), spatial path straightened.
  function setFitEase(prop, ki, vp, dims, spatial) {
    try { prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) {}
    try { prop.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
    try { prop.setTemporalContinuousAtKey(ki, false); } catch (e2) {}
    try { var cur = prop.keyInTemporalEase(ki); var a = easeFromSlope(cur, vp, dims); prop.setTemporalEaseAtKey(ki, a, a); } catch (e3) {}
    if (spatial) straightenSpatial(prop, ki, dims, false, false);
  }

  // Start key: set ONLY its OUT handle to the curve's leaving slope; keep the
  // arrival (IN) the user had. End key: set ONLY its IN handle to the arriving
  // slope; keep the departure (OUT).
  function setEndpointEase(prop, ki, vp, dims, spatial, isStart) {
    try {
      if (isStart) {
        var curIn = prop.keyInTemporalEase(ki);
        var inType = prop.keyInInterpolationType(ki);
        try { prop.setInterpolationTypeAtKey(ki, inType, KeyframeInterpolationType.BEZIER); } catch (e0) {}
        try { prop.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
        prop.setTemporalEaseAtKey(ki, curIn, easeFromSlope(curIn, vp, dims));
      } else {
        var curOut = prop.keyOutTemporalEase(ki);
        var outType = prop.keyOutInterpolationType(ki);
        try { prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, outType); } catch (e2) {}
        try { prop.setTemporalAutoBezierAtKey(ki, false); } catch (e3) {}
        prop.setTemporalEaseAtKey(ki, easeFromSlope(curOut, vp, dims), curOut);
      }
    } catch (e) {}
    if (spatial) straightenSpatial(prop, ki, dims, !isStart, isStart);
  }

  // Place one keyframe per anchor inside a segment (endpoints already exist),
  // then pin each key's handle to the anchor's true slope so the overshoot is a
  // smooth, editable curve that matches the math with the fewest possible keys.
  // Anchors without a slope fall back to the old continuous-bezier smoothing.
  function bakeSparseSegment(prop, pr, pts, dims, influence) {
    removeKeysBetween(prop, pr.ta, pr.tb);
    var dt = pr.tb - pr.ta;
    var spatial = util.isSpatial(prop);
    var hasSlopes = pts.length > 0 && pts[0].m != null;
    for (var j = 0; j < pts.length; j++) {
      var pt = pts[j];
      if (pt.t <= 1e-6 || pt.t >= 1 - 1e-6) continue; // endpoints already exist
      var t = pr.ta + pt.t * dt;
      var val;
      if (dims === 1) {
        val = pr.va[0] + (pr.vb[0] - pr.va[0]) * pt.y;
      } else {
        val = [];
        for (var d = 0; d < dims; d++) val.push(pr.va[d] + (pr.vb[d] - pr.va[d]) * pt.y);
      }
      prop.setValueAtTime(t, val);
    }
    var eps = 1e-5;
    if (hasSlopes) {
      for (var a2 = 0; a2 < pts.length; a2++) {
        var p2 = pts[a2];
        var ki = keyIndexAtTime(prop, pr.ta + p2.t * dt, eps);
        if (ki < 1) continue;
        var vp = valueSlopeVec(pr.va, pr.vb, p2.m, dt, dims);
        if (p2.t <= 1e-6) setEndpointEase(prop, ki, vp, dims, spatial, true);
        else if (p2.t >= 1 - 1e-6) setEndpointEase(prop, ki, vp, dims, spatial, false);
        else setFitEase(prop, ki, vp, dims, spatial);
      }
    } else {
      for (var ki2 = 1; ki2 <= prop.numKeys; ki2++) {
        var kt = prop.keyTime(ki2);
        if (kt >= pr.ta - eps && kt <= pr.tb + eps) smoothKey(prop, ki2, influence);
      }
    }
  }

  // Bake a sparse { t, y } anchor set onto each adjacent selected keyframe pair.
  function bakeSparse(args) {
    var pts = args.points;
    if (!pts || pts.length < 2) throw new Error('No ease data supplied.');
    // Handle length (temporal-ease influence, %) controls how long the bezier
    // tangents reach: longer = smoother, more buttery arcs between peaks.
    var influence = (args.handleLength > 0) ? args.handleLength : 45;
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var propsTouched = 0;
    var segments = 0;

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;
      var idx = p.selectedKeys;
      if (!idx || idx.length < 2) continue;
      var dims = util.dimensionsOf(p);
      var pairs = [];
      for (var s = 0; s < idx.length - 1; s++) {
        pairs.push({
          ta: p.keyTime(idx[s]),
          tb: p.keyTime(idx[s + 1]),
          va: valuesAt(p, idx[s]),
          vb: valuesAt(p, idx[s + 1])
        });
      }
      for (var k = 0; k < pairs.length; k++) {
        var pr = pairs[k];
        if (pr.tb - pr.ta <= 0) continue;
        bakeSparseSegment(p, pr, pts, dims, influence);
        segments++;
      }
      propsTouched++;
    }

    if (!segments) {
      throw new Error('Select at least two keyframes on an animated property.');
    }
    return { properties: propsTouched, segments: segments };
  }

  R.register('bake.factors', bake, 'Rebound: Bake Spring');
  R.register('ease.bakeSparse', bakeSparse, 'Rebound: Ease');
})();
