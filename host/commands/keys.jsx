/*
 * Rebound host, keyframe utilities.
 * Interpolation-type setters for the selected (or all) keyframes: Linear, Hold,
 * Bezier, Easy Ease (both sides, or just the in or out side, with a settable
 * influence), Auto Bezier, Continuous Bezier, and Rove. All iterate in one undo
 * group and guard each key so an edge key cannot abort the batch.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function clampInfluence(v) {
    if (v == null || isNaN(v)) return 33.33;
    return v < 0.1 ? 0.1 : v > 100 ? 100 : v;
  }

  // Unseparated spatial Position/Anchor take one ease; others one per dimension.
  function dimsOf(p) {
    return util.isSpatial(p) ? 1 : util.dimensionsOf(p);
  }

  function easeArray(dims, influence) {
    var arr = [];
    for (var d = 0; d < dims; d++) arr.push(new KeyframeEase(0, influence));
    return arr;
  }

  // Iterate the keys to operate on (the selection, or every key when allKeys),
  // guarding each so one bad key cannot abort the whole undo group.
  function eachKey(allKeys, fn) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var count = 0;
    var failed = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      var keys;
      if (allKeys) {
        keys = [];
        for (var n = 1; n <= p.numKeys; n++) keys.push(n);
      } else {
        keys = p.selectedKeys;
      }
      for (var k = 0; k < keys.length; k++) {
        try {
          fn(p, keys[k]);
          count++;
        } catch (e) {
          failed++;
        }
      }
    }
    if (!count) {
      if (failed) throw new Error('Could not set ' + failed + ' keyframe' + (failed === 1 ? '' : 's') + '.');
      throw new Error('Select one or more keyframes.');
    }
    return count;
  }

  function setInterp(args) {
    var type = args.type;
    var inInf = clampInfluence(args.inInfluence);
    var outInf = clampInfluence(args.outInfluence);
    var allKeys = !!args.allKeys;

    var keys = eachKey(allKeys, function (p, ki) {
      var dims;
      if (type === 'linear') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
      } else if (type === 'hold') {
        p.setInterpolationTypeAtKey(ki, p.keyInInterpolationType(ki), KeyframeInterpolationType.HOLD);
      } else if (type === 'bezier') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      } else if (type === 'easyEase') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        dims = dimsOf(p);
        p.setTemporalEaseAtKey(ki, easeArray(dims, inInf), easeArray(dims, outInf));
      } else if (type === 'easyEaseIn') {
        // Ease the incoming side only; keep the outgoing ease as it is.
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        dims = dimsOf(p);
        p.setTemporalEaseAtKey(ki, easeArray(dims, inInf), p.keyOutTemporalEase(ki));
      } else if (type === 'easyEaseOut') {
        // Ease the outgoing side only; keep the incoming ease as it is.
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        dims = dimsOf(p);
        p.setTemporalEaseAtKey(ki, p.keyInTemporalEase(ki), easeArray(dims, outInf));
      } else if (type === 'autoBezier') {
        p.setTemporalAutoBezierAtKey(ki, true);
      } else if (type === 'continuous') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        p.setTemporalContinuousAtKey(ki, true);
      } else if (type === 'roving') {
        // Endpoints cannot rove; skip them quietly.
        if (ki !== 1 && ki !== p.numKeys) p.setRovingAtKey(ki, true);
      } else {
        throw new Error('Unknown keyframe type: ' + type);
      }
    });
    return { keys: keys };
  }

  R.register('keys.setInterp', setInterp, 'Rebound: Set Keyframe Type');
})();
