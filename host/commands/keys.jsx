/*
 * Rebound host, keyframe utilities.
 * Quick interpolation-type setters for the selected keyframes (Linear, Easy
 * Ease, Hold, Bezier), iterated in one undo group.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function eachSelectedKey(fn) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var count = 0;
    var failed = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      var keys = p.selectedKeys;
      for (var k = 0; k < keys.length; k++) {
        // Guard each key so an edge key (no in-side on the first, no out-side
        // on the last) cannot abort the batch mid-undo-group.
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
    var keys = eachSelectedKey(function (p, ki) {
      if (type === 'linear') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
      } else if (type === 'hold') {
        p.setInterpolationTypeAtKey(ki, p.keyInInterpolationType(ki), KeyframeInterpolationType.HOLD);
      } else if (type === 'bezier') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      } else if (type === 'easyEase') {
        p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        var dims = util.isSpatial(p) ? 1 : util.dimensionsOf(p);
        var inEase = [];
        var outEase = [];
        for (var d = 0; d < dims; d++) {
          inEase.push(new KeyframeEase(0, 33.33));
          outEase.push(new KeyframeEase(0, 33.33));
        }
        p.setTemporalEaseAtKey(ki, inEase, outEase);
      } else {
        throw new Error('Unknown keyframe type: ' + type);
      }
    });
    return { keys: keys };
  }

  R.register('keys.setInterp', setInterp, 'Rebound: Set Keyframe Type');
})();
