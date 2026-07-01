/*
 * Rebound host, motion behaviors.
 *
 * behavior.apply(spec) turns a behavior SPEC (client/js/behaviors/library.js)
 * into real, editable keyframes with real temporal eases on the selected layers,
 * starting at the playhead. The keyframes are clean and hand-tunable — the whole
 * point vs a locked expression preset.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  var PROP_MATCH = {
    opacity: 'ADBE Opacity',
    position: 'ADBE Position',
    scale: 'ADBE Scale',
    rotation: 'ADBE Rotate Z',
    anchor: 'ADBE Anchor Point'
  };

  function clampInfl(v) { return v < 0.1 ? 0.1 : v > 100 ? 100 : v; }
  function outKE(ease, avg) { return new KeyframeEase(ease.x1 === 0 ? 0 : (ease.y1 / ease.x1) * avg, clampInfl(ease.x1 * 100)); }
  function inKE(ease, avg) { var den = 1 - ease.x2; return new KeyframeEase(den === 0 ? 0 : ((1 - ease.y2) / den) * avg, clampInfl(den * 100)); }
  function arrify(v) { return v instanceof Array ? v : [v]; }
  function mag(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = (b[i] || 0) - (a[i] || 0); s += d * d; } return Math.sqrt(s); }

  // Absolute target value coerced to the property's shape (keep existing dims we
  // weren't given, e.g. a 2D value on a 3D property keeps z).
  function coerce(base, v) {
    if (base instanceof Array) {
      var vl = arrify(v), out = [];
      for (var i = 0; i < base.length; i++) out.push(vl[i] != null ? vl[i] : base[i]);
      return out;
    }
    return v instanceof Array ? v[0] : v;
  }
  // Relative offset added to the current value.
  function addVal(base, off) {
    if (base instanceof Array) {
      var ol = arrify(off), out = [];
      for (var i = 0; i < base.length; i++) out.push(base[i] + (ol[i] || 0));
      return out;
    }
    return base + (off instanceof Array ? off[0] : off);
  }

  function easeSegment(mp, tA, tB, ease, spatial) {
    var a = mp.nearestKeyIndex(tA), b = mp.nearestKeyIndex(tB);
    var dt = mp.keyTime(b) - mp.keyTime(a);
    if (dt <= 0) return;
    var av = arrify(mp.keyValue(a)), bv = arrify(mp.keyValue(b));
    var outArr = [], inArr = [];
    if (spatial) {
      var avg = mag(av, bv) / dt;
      outArr.push(outKE(ease, avg)); inArr.push(inKE(ease, avg));
    } else {
      for (var d = 0; d < av.length; d++) {
        var a1 = ((bv[d] || 0) - (av[d] || 0)) / dt;
        outArr.push(outKE(ease, a1)); inArr.push(inKE(ease, a1));
      }
    }
    mp.setInterpolationTypeAtKey(a, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    mp.setTemporalEaseAtKey(a, mp.keyInTemporalEase(a), outArr);
    mp.setInterpolationTypeAtKey(b, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    mp.setTemporalEaseAtKey(b, inArr, mp.keyOutTemporalEase(b));
  }

  function applyToLayer(layer, spec, t0, durSec) {
    var tr = layer.property(M.transform);
    var props = spec.props || [];
    var touched = 0;
    for (var i = 0; i < props.length; i++) {
      var P = props[i];
      var mp = tr.property(PROP_MATCH[P.prop]);
      if (!mp) continue;
      // Separated position can't take a unified value — skip cleanly.
      try { if (P.prop === 'position' && mp.dimensionsSeparated) continue; } catch (eSep) {}
      var base = mp.value;
      var keys = P.keys || [];
      var times = [];
      for (var k = 0; k < keys.length; k++) {
        var t = t0 + keys[k].f * durSec;
        var val = P.relative ? addVal(base, keys[k].v) : coerce(base, keys[k].v);
        mp.setValueAtTime(t, val);
        times.push(t);
      }
      var spatial = (P.prop === 'position' || P.prop === 'anchor');
      for (var s = 0; s < times.length - 1; s++) easeSegment(mp, times[s], times[s + 1], P.ease, spatial);
      touched++;
    }
    return touched;
  }

  function apply(spec) {
    if (!spec || !spec.props) throw new Error('No behavior supplied.');
    var comp = util.activeComp();
    var sel = comp.selectedLayers;
    var fps = comp.frameRate;
    var t0 = comp.time + ((spec.startFrame || 0) / fps);
    var durSec = (spec.durFrames || 20) / fps;

    var applied = 0;
    R.beginUndo('Rebound: Behavior');
    try {
      for (var i = 0; i < sel.length; i++) {
        var layer = sel[i];
        if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
        if (applyToLayer(layer, spec, t0, durSec) > 0) applied++;
      }
    } finally {
      R.endUndo();
    }
    if (!applied) throw new Error('Select one or more layers.');
    return { applied: applied };
  }

  R.register('behavior.apply', apply, 'Rebound: Behavior');
})();
