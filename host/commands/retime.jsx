/*
 * Rebound host, Retime (proportional keyframe rescaling).
 *
 * Rescales the timing of the selected keyframes around an anchor (the first or
 * last selected key, or the playhead) so the whole move plays faster or slower
 * while keeping the relative spacing and every key's value and ease intact.
 * Driven either by a direct scale factor or by a target total duration. Keys are
 * relocated with setKeyTime in a collision-safe order and re-found by time, so
 * shifting key indices never corrupt the batch.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // Leaf properties that carry at least two selected keyframes.
  function targets() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var out = [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      if (p.selectedKeys.length < 2) continue;
      out.push(p);
    }
    return out;
  }

  // The key index whose time is closest to t (within tol), or 0 if none. Used to
  // re-resolve a key after earlier moves may have shifted indices.
  function findKeyByTime(prop, t, tol) {
    var best = 0, bestD = tol;
    for (var k = 1; k <= prop.numKeys; k++) {
      var d = Math.abs(prop.keyTime(k) - t);
      if (d <= bestD) { bestD = d; best = k; }
    }
    return best;
  }

  function retimeProp(prop, factor, mode, targetDur, anchorMode, compTime, frameDur) {
    var sel = prop.selectedKeys;
    var times = [];
    var i;
    for (i = 0; i < sel.length; i++) times.push(prop.keyTime(sel[i]));

    var minT = times[0], maxT = times[0];
    for (i = 1; i < times.length; i++) {
      if (times[i] < minT) minT = times[i];
      if (times[i] > maxT) maxT = times[i];
    }
    var span = maxT - minT;

    var f = factor;
    if (mode === 'duration') f = span > 0 ? (targetDur / span) : 1;
    if (f < 0) f = 0;

    var anchorT = anchorMode === 'last' ? maxT : anchorMode === 'playhead' ? compTime : minT;

    var moves = [];
    for (i = 0; i < times.length; i++) {
      moves.push({ t: times[i], nt: anchorT + (times[i] - anchorT) * f });
    }

    // Collision-safe order: keys moving earlier first (ascending by original
    // time), then keys moving later (descending). The mapping is affine and
    // monotonic, so the selected keys keep their order and each lands in a slot
    // not yet occupied by an unmoved selected key.
    var earlier = [], later = [];
    for (i = 0; i < moves.length; i++) {
      if (moves[i].nt < moves[i].t) earlier.push(moves[i]); else later.push(moves[i]);
    }
    earlier.sort(function (a, b) { return a.t - b.t; });
    later.sort(function (a, b) { return b.t - a.t; });
    var ordered = earlier.concat(later);

    var tol = frameDur > 0 ? frameDur / 4 : 0.001;
    var moved = 0;
    for (i = 0; i < ordered.length; i++) {
      if (Math.abs(ordered[i].nt - ordered[i].t) < 1e-9) continue;
      var idx = findKeyByTime(prop, ordered[i].t, tol);
      if (!idx) continue;
      try {
        prop.setKeyTime(idx, ordered[i].nt);
        moved++;
      } catch (e) { /* a key collided with an existing one; skip it */ }
    }
    return moved;
  }

  function apply(args) {
    var comp = util.activeComp();
    var mode = args.mode === 'duration' ? 'duration' : 'scale';
    var factor = (args.factor == null || isNaN(args.factor)) ? 1 : args.factor;
    var targetDur = (args.duration == null || isNaN(args.duration)) ? 1 : args.duration;
    var anchorMode = args.anchor || 'first';
    var frameDur = comp.frameDuration;

    var list = targets();
    if (!list.length) throw new Error('Select two or more keyframes on a property.');

    var props = 0, keys = 0;
    for (var i = 0; i < list.length; i++) {
      var m = retimeProp(list[i], factor, mode, targetDur, anchorMode, comp.time, frameDur);
      if (m) { props++; keys += m; }
    }
    if (!keys) throw new Error('Nothing to retime (the scale left every key in place).');
    return { properties: props, keys: keys };
  }

  R.register('retime.apply', apply, 'Rebound: Retime');
})();
