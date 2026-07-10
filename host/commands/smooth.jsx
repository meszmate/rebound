/*
 * Rebound host, Smooth (ease selected keyframes into a flowing curve).
 *
 * The headline control is a Smoothness amount (0-100%) that maps to keyframe
 * ease influence (5..100%), applied as an Easy-Ease-style temporal ease (speed
 * 0) on the chosen side(s) of each selected key. Auto-bezier (which overrides a
 * manual ease) and roving stay available as secondary options. Each call is
 * guarded so a property that does not support an operation is skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function clampInfluence(v) { return v < 0.1 ? 0.1 : v > 100 ? 100 : v; }

  function easeArray(dims, inf) {
    var arr = [];
    for (var i = 0; i < dims; i++) arr.push(new KeyframeEase(0, inf));
    return arr;
  }

  function apply(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;

    var amount = args.amount == null ? 60 : args.amount;
    var inf = clampInfluence(5 + amount / 100 * 95);
    var sides = args.sides || 'inout';
    var setIn = sides === 'in' || sides === 'inout';
    var setOut = sides === 'out' || sides === 'inout';
    var autoBezier = !!args.autoBezier;
    var roving = !!args.roving;

    var keys = 0;
    var rovingSkipped = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;

      var spatial = util.isSpatial(p);
      // Temporal-ease dimensionality, NOT value dimensionality: spatial and
      // COLOR/CUSTOM_VALUE props take ONE ease, plain TwoD/ThreeD take 2/3.
      var dims = util.temporalDims(p);
      var selected = p.selectedKeys;

      for (var k = 0; k < selected.length; k++) {
        var ki = selected[k];
        var changed = false;

        if (autoBezier) {
          // Auto-bezier rounds the tangents automatically and overrides any
          // manual ease, so it is applied instead of the influence amount. It
          // rounds THROUGH the key, so both sides become bezier by design.
          try {
            p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
          } catch (eInterp) {}
          try { p.setTemporalAutoBezierAtKey(ki, true); changed = true; } catch (eTemporal) {}
          if (spatial) {
            try { p.setSpatialAutoBezierAtKey(ki, true); changed = true; } catch (eSpatial) {}
          }
        } else {
          // Convert ONLY the side(s) being smoothed to BEZIER, so easing the
          // outgoing side does not destroy a HOLD on the incoming side (and
          // vice-versa). Then apply the Smoothness amount as ease influence on
          // the chosen side(s), preserving the untouched side's existing ease.
          try {
            var inType = p.keyInInterpolationType(ki);
            var outType = p.keyOutInterpolationType(ki);
            p.setInterpolationTypeAtKey(
              ki,
              setIn ? KeyframeInterpolationType.BEZIER : inType,
              setOut ? KeyframeInterpolationType.BEZIER : outType
            );
          } catch (eInterp2) {}
          try {
            var arr = easeArray(dims, inf);
            var inE = setIn ? arr : p.keyInTemporalEase(ki);
            var outE = setOut ? arr : p.keyOutTemporalEase(ki);
            p.setTemporalEaseAtKey(ki, inE, outE);
            changed = true;
          } catch (eEase) {}
        }

        if (roving && ki !== 1 && ki !== p.numKeys) {
          // Roving only exists for spatial properties (Position/Anchor):
          // setRovingAtKey throws on everything else, so count the skip and
          // report it instead of letting the catch swallow it as a success.
          if (spatial) {
            try { p.setRovingAtKey(ki, true); changed = true; } catch (eRoving) {}
          } else {
            rovingSkipped++;
          }
        }

        if (changed) keys++;
      }
    }

    if (!keys && !rovingSkipped) throw new Error('Select one or more keyframes to smooth.');

    return { keys: keys, rovingSkipped: rovingSkipped };
  }

  R.register('smooth.apply', apply, 'Rebound: Smooth');
})();
