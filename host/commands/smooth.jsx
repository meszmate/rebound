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
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;

      var spatial = util.isSpatial(p);
      // Unseparated spatial Position/Anchor take ONE temporal ease (along the
      // path); everything else is per dimension.
      var dims = spatial ? 1 : util.dimensionsOf(p);
      var selected = p.selectedKeys;

      for (var k = 0; k < selected.length; k++) {
        var ki = selected[k];
        var changed = false;

        try {
          p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
          changed = true;
        } catch (eInterp) {}

        if (autoBezier) {
          // Auto-bezier rounds the tangents automatically and overrides any
          // manual ease, so it is applied instead of the influence amount.
          try { p.setTemporalAutoBezierAtKey(ki, true); changed = true; } catch (eTemporal) {}
          if (spatial) {
            try { p.setSpatialAutoBezierAtKey(ki, true); changed = true; } catch (eSpatial) {}
          }
        } else {
          // Apply the Smoothness amount as ease influence on the chosen side(s),
          // preserving the untouched side's existing ease.
          try {
            var arr = easeArray(dims, inf);
            var inE = setIn ? arr : p.keyInTemporalEase(ki);
            var outE = setOut ? arr : p.keyOutTemporalEase(ki);
            p.setTemporalEaseAtKey(ki, inE, outE);
            changed = true;
          } catch (eEase) {}
        }

        if (roving && ki !== 1 && ki !== p.numKeys) {
          try { p.setRovingAtKey(ki, true); changed = true; } catch (eRoving) {}
        }

        if (changed) keys++;
      }
    }

    if (!keys) throw new Error('Select one or more keyframes to smooth.');

    return { keys: keys };
  }

  R.register('smooth.apply', apply, 'Rebound: Smooth');
})();
