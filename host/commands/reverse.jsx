/*
 * Rebound host, Reverse (mirror selected keyframes in time).
 *
 * For each selected Property, takes its selected keyframes (or every keyframe
 * when none are selected) and mirrors them within their own span [t0, t1]: a
 * key originally at time t is rebuilt at t0 + (t1 - t). Each key keeps its
 * value but has its in/out temporal ease and in/out interpolation type swapped,
 * so the eases that led into a key now lead out of it (the curve plays
 * backwards). A property needs at least two keys to define a span.
 *
 * The original keys are captured first, then removed from the highest index
 * down (so lower indices stay valid), then re-added. After each re-add the key
 * index is resolved afresh by time, because adding a key renumbers the others.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var EPS = 1e-6;

  // The key indices to reverse on a property: its selected keys when two or
  // more are selected, otherwise all keys when the property has at least two.
  function indicesFor(prop) {
    var selected = prop.selectedKeys;
    if (selected && selected.length >= 2) return selected;
    if (prop.numKeys >= 2) {
      var all = [];
      for (var k = 1; k <= prop.numKeys; k++) all.push(k);
      return all;
    }
    return null;
  }

  // Snapshot a single keyframe so it survives removal of the originals.
  function captureKey(prop, index) {
    var snap = {
      time: prop.keyTime(index),
      value: prop.keyValue(index),
      inEase: prop.keyInTemporalEase(index),
      outEase: prop.keyOutTemporalEase(index),
      inInterp: prop.keyInInterpolationType(index),
      outInterp: prop.keyOutInterpolationType(index)
    };
    return snap;
  }

  // Find the key whose time matches t (within tolerance) after a re-add.
  function indexAtTime(prop, t) {
    var i = prop.nearestKeyIndex(t);
    if (i >= 1 && i <= prop.numKeys && Math.abs(prop.keyTime(i) - t) <= EPS) {
      return i;
    }
    // Fall back to a linear scan if the nearest index drifted.
    for (var k = 1; k <= prop.numKeys; k++) {
      if (Math.abs(prop.keyTime(k) - t) <= EPS) return k;
    }
    return i;
  }

  // Rebuild one mirrored key and restore its swapped ease / interpolation.
  function rebuildKey(prop, snap, t0, t1) {
    var t = t0 + (t1 - snap.time);
    prop.setValueAtTime(t, snap.value);
    var idx = indexAtTime(prop, t);

    // Swap the interpolation direction: what came in now goes out.
    try {
      prop.setInterpolationTypeAtKey(idx, snap.outInterp, snap.inInterp);
    } catch (eInterp) {}

    // Swap the temporal ease the same way (only meaningful for bezier sides).
    try {
      prop.setTemporalEaseAtKey(idx, snap.outEase, snap.inEase);
    } catch (eEase) {}
  }

  function apply() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;

    var propertiesTouched = 0;
    var keysTouched = 0;

    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      if (!(prop instanceof Property)) continue;
      if (!prop.canVaryOverTime) continue;

      var indices = indicesFor(prop);
      if (!indices) continue;

      // Capture every key we will move before touching the property.
      var snaps = [];
      for (var s = 0; s < indices.length; s++) {
        snaps.push(captureKey(prop, indices[s]));
      }

      // The mirror span runs from the first to the last captured key time.
      var t0 = snaps[0].time;
      var t1 = snaps[snaps.length - 1].time;
      for (var m = 1; m < snaps.length; m++) {
        if (snaps[m].time < t0) t0 = snaps[m].time;
        if (snaps[m].time > t1) t1 = snaps[m].time;
      }
      if (t1 - t0 <= EPS) continue;

      // Remove the originals from the highest index down so lower indices stay
      // valid while we delete.
      var sortedDown = indices.slice(0);
      sortedDown.sort(function (a, b) { return b - a; });
      for (var r = 0; r < sortedDown.length; r++) {
        prop.removeKey(sortedDown[r]);
      }

      // Re-add each captured key at its mirrored time.
      for (var a = 0; a < snaps.length; a++) {
        rebuildKey(prop, snaps[a], t0, t1);
        keysTouched++;
      }

      propertiesTouched++;
    }

    if (!propertiesTouched) {
      throw new Error('Select an animated property with at least two keyframes to reverse.');
    }

    return { properties: propertiesTouched, keys: keysTouched };
  }

  R.register('reverse.apply', apply, 'Rebound: Reverse');
})();
