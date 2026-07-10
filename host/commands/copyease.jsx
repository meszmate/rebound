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
    var skippedHold = 0;
    for (var i = 0; i < list.length; i++) {
      var prop = list[i];
      // Temporal-ease dimensionality, NOT value dimensionality: spatial and
      // COLOR/CUSTOM_VALUE props take ONE ease, plain TwoD/ThreeD take 2/3.
      var dims = util.temporalDims(prop);
      var keys = prop.selectedKeys;

      for (var k = 0; k < keys.length; k++) {
        var index = keys[k];
        var inType = prop.keyInInterpolationType(index);
        var outType = prop.keyOutInterpolationType(index);
        // A HOLD side is a deliberate stepped stop: pasting an ease onto it
        // would silently un-hold it, so that side keeps its interpolation and
        // its current ease. A key held on BOTH sides is skipped entirely.
        var writeIn = inType !== KeyframeInterpolationType.HOLD;
        var writeOut = outType !== KeyframeInterpolationType.HOLD;
        if (!writeIn && !writeOut) { skippedHold++; continue; }
        var curIn = prop.keyInTemporalEase(index);
        var curOut = prop.keyOutTemporalEase(index);
        var inArr = [];
        var outArr = [];
        for (var d = 0; d < dims; d++) {
          inArr.push(writeIn ? combine(inSource, easeToPlain(curIn[d]), mode, scale) : curIn[d]);
          outArr.push(writeOut ? combine(outSource, easeToPlain(curOut[d]), mode, scale) : curOut[d]);
        }
        prop.setInterpolationTypeAtKey(
          index,
          writeIn ? KeyframeInterpolationType.BEZIER : inType,
          writeOut ? KeyframeInterpolationType.BEZIER : outType
        );
        prop.setTemporalEaseAtKey(index, inArr, outArr);
        count++;
      }
    }

    return { keys: count, skippedHold: skippedHold };
  }

  R.register('copyease.copy', copyEase);
  R.register('copyease.paste', pasteEase, 'Rebound: Paste Ease');
})();