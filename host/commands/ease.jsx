/*
 * Rebound host — easing commands.
 *
 * Applies a normalized cubic-bezier ease to the live selection, iterating
 * entirely inside ExtendScript (one round trip, one undo group). The
 * conversion mirrors the unit-tested formula in client/js/easing/bezier.js:
 *   outgoing: influence = x1*100, speed = (y1/x1) * (dv/dt)
 *   incoming: influence = (1-x2)*100, speed = ((1-y2)/(1-x2)) * (dv/dt)
 * where dv/dt is the segment's signed average speed, computed per dimension.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function clampInfluence(v) {
    return v < 0.1 ? 0.1 : v > 100 ? 100 : v;
  }

  function outEase(curve, avg) {
    var influence = clampInfluence(curve.x1 * 100);
    var speed = curve.x1 === 0 ? 0 : (curve.y1 / curve.x1) * avg;
    return new KeyframeEase(speed, influence);
  }

  function inEase(curve, avg) {
    var den = 1 - curve.x2;
    var influence = clampInfluence(den * 100);
    var speed = den === 0 ? 0 : ((1 - curve.y2) / den) * avg;
    return new KeyframeEase(speed, influence);
  }

  function valuesAt(prop, index) {
    var v = prop.keyValue(index);
    return v instanceof Array ? v : [v];
  }

  // Collect the leaf properties to operate on, with the key indices to use.
  function targets(applyToAll) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var out = [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;
      var indices;
      if (applyToAll) {
        indices = [];
        for (var k = 1; k <= p.numKeys; k++) indices.push(k);
      } else {
        indices = p.selectedKeys;
      }
      if (indices.length >= 2) out.push({ prop: p, indices: indices });
    }
    return out;
  }

  function ensureBezier(prop, index) {
    prop.setInterpolationTypeAtKey(
      index,
      KeyframeInterpolationType.BEZIER,
      KeyframeInterpolationType.BEZIER
    );
  }

  function applyEase(args) {
    var curve = args.curve;
    if (!curve) throw new Error('No curve supplied.');
    var scope = args.scope || 'inout';
    if (scope === 'auto') scope = 'inout';
    var setOut = scope === 'out' || scope === 'inout';
    var setIn = scope === 'in' || scope === 'inout';

    var list = targets(args.applyToAll);
    if (!list.length) {
      throw new Error('Select at least two keyframes on an animated property.');
    }

    var propsTouched = 0;
    var segments = 0;

    for (var t = 0; t < list.length; t++) {
      var prop = list[t].prop;
      var idx = list[t].indices;
      var dims = util.dimensionsOf(prop);
      var didProp = false;

      for (var s = 0; s < idx.length - 1; s++) {
        var a = idx[s];
        var b = idx[s + 1];
        var dt = prop.keyTime(b) - prop.keyTime(a);
        if (dt <= 0) continue;

        var aVals = valuesAt(prop, a);
        var bVals = valuesAt(prop, b);
        var outArr = [];
        var inArr = [];
        for (var d = 0; d < dims; d++) {
          var dv = (bVals[d] || 0) - (aVals[d] || 0);
          var avg = dv / dt;
          outArr.push(outEase(curve, avg));
          inArr.push(inEase(curve, avg));
        }

        if (setOut) {
          ensureBezier(prop, a);
          prop.setTemporalEaseAtKey(a, prop.keyInTemporalEase(a), outArr);
        }
        if (setIn) {
          ensureBezier(prop, b);
          prop.setTemporalEaseAtKey(b, inArr, prop.keyOutTemporalEase(b));
        }
        segments++;
        didProp = true;
      }
      if (didProp) propsTouched++;
    }

    return { properties: propsTouched, segments: segments };
  }

  // Read the existing ease of the first usable selected segment back into a
  // normalized cubic-bezier (reverse sync into the editor).
  function readEase() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;
      var keys = p.selectedKeys.length >= 2 ? p.selectedKeys : [1, 2];
      var a = keys[0];
      var b = keys[1];
      var dt = p.keyTime(b) - p.keyTime(a);
      if (dt <= 0) continue;

      var aVals = valuesAt(p, a);
      var bVals = valuesAt(p, b);
      var dv = (bVals[0] || 0) - (aVals[0] || 0);
      var avg = dv / dt;

      var outE = p.keyOutTemporalEase(a)[0];
      var inE = p.keyInTemporalEase(b)[0];

      var x1 = clamp01(outE.influence / 100);
      var x2 = 1 - clamp01(inE.influence / 100);
      var y1 = avg === 0 ? x1 : (outE.speed / avg) * x1;
      var y2 = avg === 0 ? x2 : 1 - (inE.speed / avg) * (1 - x2);

      return {
        found: true,
        propertyName: p.name,
        layerName: util.layerOfProperty(p).name,
        curve: { type: 'bezier', x1: x1, y1: y1, x2: x2, y2: y2 }
      };
    }
    return { found: false };
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  R.register('ease.apply', applyEase, 'Rebound: Apply Ease');
  R.register('ease.read', readEase);
})();
