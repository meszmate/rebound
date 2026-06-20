/*
 * Rebound host, velocity commands.
 *
 * Numeric speed + influence editor for the selected keyframes. For each selected
 * Property and each of its selected keys we build per-dimension KeyframeEase
 * arrays, taking the supplied influence/speed where requested, otherwise the
 * key's current values, then set BEZIER interpolation and write the eases back.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function clampInfluence(v) {
    return v < 0.1 ? 0.1 : v > 100 ? 100 : v;
  }

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function ensureBezier(prop, index) {
    prop.setInterpolationTypeAtKey(
      index,
      KeyframeInterpolationType.BEZIER,
      KeyframeInterpolationType.BEZIER
    );
  }

  function applyVelocity(args) {
    var inInfluence = clampInfluence(num(args.inInfluence, 33.33));
    var outInfluence = clampInfluence(num(args.outInfluence, 33.33));
    var inSpeed = num(args.inSpeed, 0);
    var outSpeed = num(args.outSpeed, 0);
    var setInfluence = !!args.setInfluence;
    var setSpeed = !!args.setSpeed;

    if (!setInfluence && !setSpeed) {
      throw new Error('Enable "Set influence" or "Set speed".');
    }

    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var keysTouched = 0;

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      // Spatial Position/Anchor take a single temporal ease; others per dimension.
      var dims = util.isSpatial(p) ? 1 : util.dimensionsOf(p);
      if (dims < 1) continue;
      var keys = p.selectedKeys;

      for (var k = 0; k < keys.length; k++) {
        var ki = keys[k];
        var curIn = p.keyInTemporalEase(ki);
        var curOut = p.keyOutTemporalEase(ki);
        var inArr = [];
        var outArr = [];

        for (var d = 0; d < dims; d++) {
          var inInf = setInfluence ? inInfluence : clampInfluence(curIn[d].influence);
          var outInf = setInfluence ? outInfluence : clampInfluence(curOut[d].influence);
          var inSpd = setSpeed ? inSpeed : curIn[d].speed;
          var outSpd = setSpeed ? outSpeed : curOut[d].speed;
          inArr.push(new KeyframeEase(inSpd, inInf));
          outArr.push(new KeyframeEase(outSpd, outInf));
        }

        ensureBezier(p, ki);
        p.setTemporalEaseAtKey(ki, inArr, outArr);
        keysTouched++;
      }
    }

    if (!keysTouched) {
      throw new Error('Select one or more keyframes.');
    }
    return { keys: keysTouched };
  }

  // Read the first selected keyframe's in/out influence + speed (dimension 0).
  function readVelocity() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;
      var keys = p.selectedKeys;
      if (!keys.length) continue;
      var ki = keys[0];
      var inE = p.keyInTemporalEase(ki)[0];
      var outE = p.keyOutTemporalEase(ki)[0];
      return {
        found: true,
        propertyName: p.name,
        inInfluence: inE.influence,
        outInfluence: outE.influence,
        inSpeed: inE.speed,
        outSpeed: outE.speed
      };
    }
    return { found: false };
  }

  R.register('velocity.apply', applyVelocity, 'Rebound: Set Velocity');
  R.register('velocity.read', readVelocity);
})();