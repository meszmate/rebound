/*
 * Rebound host, Copy Ease.
 *
 * copyease.copy reads the temporal ease (speed + influence) off the first
 * selected keyframe at dimension 0 and hands it back to the panel, which holds
 * it. copyease.paste writes that stored ease onto every selected key across
 * every dimension. The Mode picks which part to write, influence, speed, or
 * both, and the untouched part is read back from each target key's current
 * ease so a "speed only" paste leaves influence alone (and vice versa).
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function clampInfluence(v) {
    return v < 0.1 ? 0.1 : v > 100 ? 100 : v;
  }

  // The leaf properties with selected keys to operate on.
  function selectedProps() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var out = [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      if (!p.selectedKeys.length) continue;
      out.push(p);
    }
    return out;
  }

  function easeToPlain(ke) {
    return { speed: ke.speed, influence: ke.influence };
  }

  // Read the ease off the first selected key at dim 0.
  function copyEase() {
    var list = selectedProps();
    if (!list.length) {
      throw new Error('Select a keyframe to copy its ease.');
    }
    var prop = list[0];
    var index = prop.selectedKeys[0];
    var inE = prop.keyInTemporalEase(index)[0];
    var outE = prop.keyOutTemporalEase(index)[0];
    return {
      inEase: easeToPlain(inE),
      outEase: easeToPlain(outE)
    };
  }

  // Build a KeyframeEase combining the stored ease with the current ease per
  // mode: 'influence' takes only influence, 'speed' takes only speed, 'both'
  // takes the whole stored ease. The pasted (stored) part is scaled by `scale`.
  function combine(stored, current, mode, scale) {
    var speed = (mode === 'influence') ? current.speed : stored.speed * scale;
    var influence = (mode === 'speed') ? current.influence : stored.influence * scale;
    return new KeyframeEase(speed, clampInfluence(influence));
  }

  function pasteEase(args) {
    var ease = args.ease;
    if (!ease || !ease.inEase || !ease.outEase) {
      throw new Error('Copy an ease before pasting.');
    }
    var mode = args.mode || 'both';
    var mirror = !!args.mirror;
    var scale = (args.scale == null || isNaN(args.scale) || args.scale <= 0) ? 1 : args.scale;
    // Mirror pastes the source out-ease onto the target in-side and vice versa.
    var inSource = mirror ? ease.outEase : ease.inEase;
    var outSource = mirror ? ease.inEase : ease.outEase;

    var list = selectedProps();
    if (!list.length) {
      throw new Error('Select one or more keyframes to paste onto.');
    }

    var count = 0;
    for (var i = 0; i < list.length; i++) {
      var prop = list[i];
      // Spatial Position/Anchor take a single temporal ease; others per dimension.
      var dims = util.isSpatial(prop) ? 1 : util.dimensionsOf(prop);
      var keys = prop.selectedKeys;

      for (var k = 0; k < keys.length; k++) {
        var index = keys[k];
        var curIn = prop.keyInTemporalEase(index);
        var curOut = prop.keyOutTemporalEase(index);
        var inArr = [];
        var outArr = [];
        for (var d = 0; d < dims; d++) {
          inArr.push(combine(inSource, easeToPlain(curIn[d]), mode, scale));
          outArr.push(combine(outSource, easeToPlain(curOut[d]), mode, scale));
        }
        prop.setInterpolationTypeAtKey(
          index,
          KeyframeInterpolationType.BEZIER,
          KeyframeInterpolationType.BEZIER
        );
        prop.setTemporalEaseAtKey(index, inArr, outArr);
        count++;
      }
    }

    return { keys: count };
  }

  R.register('copyease.copy', copyEase);
  R.register('copyease.paste', pasteEase, 'Rebound: Paste Ease');
})();