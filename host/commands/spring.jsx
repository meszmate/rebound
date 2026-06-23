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

  function findKeyAt(prop, t) {
    for (var i = 1; i <= prop.numKeys; i++) {
      if (Math.abs(prop.keyTime(i) - t) < 1e-5) return i;
    }
    return -1;
  }

  // Place one keyframe per sparse anchor inside a segment (skipping the existing
  // endpoints), then auto-bezier the new interior keys so the curve flows. This
  // gives a Graph-Editor-visible, editable overshoot with a handful of keys
  // instead of one per frame.
  function bakeSparseSegment(prop, pr, pts, dims) {
    removeKeysBetween(prop, pr.ta, pr.tb);
    var dt = pr.tb - pr.ta;
    var added = [];
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
      added.push(t);
    }
    for (var a = 0; a < added.length; a++) {
      var ki = findKeyAt(prop, added[a]);
      if (ki > 0) {
        try { prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) {}
        try { prop.setTemporalAutoBezierAtKey(ki, true); } catch (e2) {}
      }
    }
  }

  // Bake a sparse { t, y } anchor set onto each adjacent selected keyframe pair.
  function bakeSparse(args) {
    var pts = args.points;
    if (!pts || pts.length < 2) throw new Error('No ease data supplied.');
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
        bakeSparseSegment(p, pr, pts, dims);
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
