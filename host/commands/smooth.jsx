/*
 * Rebound host, Smooth (ease selected keyframes into a flowing curve).
 *
 * For every selected keyframe on the selected properties: switch to bezier
 * interpolation, optionally apply auto-bezier shaping (temporal everywhere,
 * spatial on spatial properties), and optionally rove the interior keys so
 * they redistribute by velocity. Each call is guarded so a property that does
 * not support a given operation is skipped gracefully.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function apply(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;

    var roving = !!args.roving;
    var autoBezier = !!args.autoBezier;

    var keys = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime) continue;

      var spatial = util.isSpatial(p);
      var selected = p.selectedKeys;

      for (var k = 0; k < selected.length; k++) {
        var ki = selected[k];

        try {
          p.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        } catch (eInterp) {}

        if (autoBezier) {
          try {
            p.setTemporalAutoBezierAtKey(ki, true);
          } catch (eTemporal) {}
          if (spatial) {
            try {
              p.setSpatialAutoBezierAtKey(ki, true);
            } catch (eSpatial) {}
          }
        }

        if (roving && ki !== 1 && ki !== p.numKeys) {
          try {
            p.setRovingAtKey(ki, true);
          } catch (eRoving) {}
        }

        keys++;
      }
    }

    if (!keys) throw new Error('Select one or more keyframes to smooth.');

    return { keys: keys };
  }

  R.register('smooth.apply', apply, 'Rebound: Smooth');
})();