/*
 * Rebound host, Clone (copy a keyframe sequence and stamp it elsewhere).
 *
 * clone.capture reads the first selected property's selected keyframes (or all
 * of its keys when none are individually selected) into a portable bundle:
 * each key's time offset from the first, value, interpolation, temporal ease,
 * spatial tangents, and auto/continuous/roving flags. clone.stamp writes that
 * bundle onto every selected target property, anchored at the playhead or the
 * layer start, optionally reversed and time-scaled. Unlike Copy Ease (which
 * moves only ease) this clones the whole animation, value and timing included.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function allIndices(p) {
    var out = [];
    for (var i = 1; i <= p.numKeys; i++) out.push(i);
    return out;
  }

  function interpToken(t) {
    if (t === KeyframeInterpolationType.HOLD) return 'hold';
    if (t === KeyframeInterpolationType.LINEAR) return 'linear';
    return 'bezier';
  }
  function tokenToInterp(s) {
    if (s === 'hold') return KeyframeInterpolationType.HOLD;
    if (s === 'linear') return KeyframeInterpolationType.LINEAR;
    return KeyframeInterpolationType.BEZIER;
  }

  function easeToPlain(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) out.push({ speed: arr[i].speed, influence: arr[i].influence });
    return out;
  }
  // Rebuild a KeyframeEase array of exactly len entries from captured plain data.
  function rebuildEase(plain, len) {
    var out = [];
    for (var i = 0; i < len; i++) {
      var src = plain && plain.length ? plain[i < plain.length ? i : plain.length - 1] : { speed: 0, influence: 16.67 };
      out.push(new KeyframeEase(src.speed, src.influence < 0.1 ? 0.1 : src.influence > 100 ? 100 : src.influence));
    }
    return out;
  }

  function nearestKey(prop, t) {
    var best = 0, bestD = Infinity;
    for (var k = 1; k <= prop.numKeys; k++) {
      var d = Math.abs(prop.keyTime(k) - t);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  function removeAllKeys(prop) {
    for (var i = prop.numKeys; i >= 1; i--) prop.removeKey(i);
  }

  // ---- Capture -------------------------------------------------------------

  function captureFrom(p, idxs) {
    var isSpatial = util.isSpatial(p);
    var dims = util.dimensionsOf(p);

    var times = [];
    var i;
    for (i = 0; i < idxs.length; i++) times.push(p.keyTime(idxs[i]));
    var t0 = times[0];
    for (i = 1; i < times.length; i++) if (times[i] < t0) t0 = times[i];

    var keys = [];
    var span = 0;
    for (i = 0; i < idxs.length; i++) {
      var ki = idxs[i];
      var dt = p.keyTime(ki) - t0;
      if (dt > span) span = dt;
      var rec = {
        dt: dt,
        value: p.keyValue(ki),
        inI: interpToken(p.keyInInterpolationType(ki)),
        outI: interpToken(p.keyOutInterpolationType(ki)),
        inEase: easeToPlain(p.keyInTemporalEase(ki)),
        outEase: easeToPlain(p.keyOutTemporalEase(ki)),
        auto: p.keyTemporalAutoBezier(ki),
        cont: p.keyTemporalContinuous(ki),
        rove: p.keyRoving(ki)
      };
      if (isSpatial) {
        rec.inSpatial = p.keyInSpatialTangent(ki);
        rec.outSpatial = p.keyOutSpatialTangent(ki);
      }
      keys.push(rec);
    }

    return {
      sourceName: util.layerOfProperty(p).name + ' > ' + p.name,
      isSpatial: isSpatial,
      dims: dims,
      span: span,
      count: keys.length,
      keys: keys
    };
  }

  function capture() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 1) continue;
      var idxs = p.selectedKeys.length ? p.selectedKeys : allIndices(p);
      if (idxs.length) return captureFrom(p, idxs);
    }
    throw new Error('Select a property (or its keyframes) to capture.');
  }

  // ---- Stamp ---------------------------------------------------------------

  function applyKeyAttrs(prop, idx, k, tDims) {
    var inI = tokenToInterp(k.inI), outI = tokenToInterp(k.outI);
    try { prop.setInterpolationTypeAtKey(idx, inI, outI); } catch (e1) { /* edge key */ }
    if (inI === KeyframeInterpolationType.BEZIER || outI === KeyframeInterpolationType.BEZIER) {
      var expLen = util.isSpatial(prop) ? 1 : tDims;
      try { prop.setTemporalEaseAtKey(idx, rebuildEase(k.inEase, expLen), rebuildEase(k.outEase, expLen)); } catch (e2) { /* linear side */ }
    }
    if (util.isSpatial(prop) && k.inSpatial && k.outSpatial) {
      try { prop.setSpatialTangentsAtKey(idx, k.inSpatial, k.outSpatial); } catch (e3) { /* ignore */ }
    }
    try { if (k.auto) prop.setTemporalAutoBezierAtKey(idx, true); } catch (e4) { /* ignore */ }
    try { if (k.cont) prop.setTemporalContinuousAtKey(idx, true); } catch (e5) { /* ignore */ }
    try { if (k.rove && idx !== 1 && idx !== prop.numKeys) prop.setRovingAtKey(idx, true); } catch (e6) { /* ignore */ }
  }

  function stampOnto(prop, bundle, anchorT, reverse, timeScale, replace) {
    if (replace) removeAllKeys(prop);
    var placed = [];
    var i;
    for (i = 0; i < bundle.keys.length; i++) {
      var k = bundle.keys[i];
      var dt = reverse ? (bundle.span - k.dt) : k.dt;
      var nt = anchorT + dt * timeScale;
      try {
        prop.setValueAtTime(nt, k.value);
        placed.push({ nt: nt, k: k });
      } catch (e) { /* incompatible value; skip this key */ }
    }
    var tDims = util.dimensionsOf(prop);
    var count = 0;
    for (i = 0; i < placed.length; i++) {
      var idx = nearestKey(prop, placed[i].nt);
      if (idx) { applyKeyAttrs(prop, idx, placed[i].k, tDims); count++; }
    }
    return count;
  }

  function stamp(args) {
    var bundle = args.bundle;
    if (!bundle || !bundle.keys || !bundle.keys.length) throw new Error('Capture a keyframe sequence before stamping.');
    var anchor = args.anchor || 'playhead';
    var reverse = !!args.reverse;
    var timeScale = (args.timeScale == null || isNaN(args.timeScale) || args.timeScale <= 0) ? 1 : args.timeScale;
    var replace = args.replace !== false;

    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var targets = [];
    var i;
    for (i = 0; i < props.length; i++) {
      var p = props[i];
      if (p instanceof Property && p.canVaryOverTime) targets.push(p);
    }
    if (!targets.length) throw new Error('Select one or more target properties to stamp onto.');

    var done = 0, totalKeys = 0, skipped = [];
    for (i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (util.dimensionsOf(t) !== bundle.dims) {
        skipped.push(t.name + ' (incompatible property)');
        continue;
      }
      var anchorT = anchor === 'layerStart' ? util.layerOfProperty(t).inPoint : comp.time;
      var n = stampOnto(t, bundle, anchorT, reverse, timeScale, replace);
      if (n) { done++; totalKeys += n; }
    }
    if (!done) throw new Error('No compatible target (clone a property onto one of the same dimensions).');
    return { properties: done, keys: totalKeys, skipped: skipped };
  }

  R.register('clone.capture', capture);
  R.register('clone.stamp', stamp, 'Rebound: Clone Keyframes');
})();
