/*
 * Rebound host, easing commands.
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

  // Handle X lives in [0.001, 0.999] (AE influence is a % in [0.1, 100]).
  function clampX(v) {
    return v < 0.001 ? 0.001 : v > 0.999 ? 0.999 : v;
  }

  // Constrain a curve to the domain AE reproduces EXACTLY as a native temporal
  // ease: X in [0.001,0.999] and x1<=x2 (monotonic time, handles never overlap).
  // Y stays free (overshoot/anticipation render faithfully). Mirrors the panel's
  // bezier.sanitizeHandles so host and panel agree.
  function sanitizeCurve(curve) {
    var x1 = clampX(curve.x1);
    var x2 = clampX(curve.x2);
    if (x1 > x2) { var m = (x1 + x2) / 2; x1 = m; x2 = m; }
    return { x1: x1, y1: curve.y1, x2: x2, y2: curve.y2 };
  }

  // Speed is derived from the SAME clamped x used for influence, so the stored
  // (influence, speed) pair reconstructs the exact handle point that was drawn.
  function outEase(curve, avg) {
    return new KeyframeEase((curve.y1 / curve.x1) * avg, curve.x1 * 100);
  }

  function inEase(curve, avg) {
    var den = 1 - curve.x2;
    return new KeyframeEase(((1 - curve.y2) / den) * avg, den * 100);
  }

  function valuesAt(prop, index) {
    var v = prop.keyValue(index);
    return v instanceof Array ? v : [v];
  }

  // Euclidean distance between two value vectors (for spatial properties, the
  // ease is a single scalar along the motion path, not per-axis).
  function magnitude(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) {
      var d = (b[i] || 0) - (a[i] || 0);
      s += d * d;
    }
    return Math.sqrt(s);
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

  // Convert ONLY the side being eased to BEZIER, preserving the other side's
  // interpolation (so easing the outgoing side of a key doesn't disturb a HOLD
  // on its incoming side, and vice-versa). A plain LINEAR side becoming BEZIER is
  // expected; a HOLD on the OTHER side is left intact.
  function ensureBezierSide(prop, index, side) {
    var inType = prop.keyInInterpolationType(index);
    var outType = prop.keyOutInterpolationType(index);
    if (side === 'out') outType = KeyframeInterpolationType.BEZIER;
    else inType = KeyframeInterpolationType.BEZIER;
    prop.setInterpolationTypeAtKey(index, inType, outType);
  }

  // A stepped (HOLD-out) segment has no interpolation to ease; easing it would
  // silently turn a deliberate stepped hold into a smooth ramp. Skip + report.
  function isHoldSegment(prop, a) {
    try { return prop.keyOutInterpolationType(a) === KeyframeInterpolationType.HOLD; } catch (e) { return false; }
  }

  function applyEase(args) {
    var curve = args.curve;
    if (!curve) throw new Error('No curve supplied.');
    curve = sanitizeCurve(curve);
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
    var skippedHold = 0;
    var skippedFlat = 0;

    for (var t = 0; t < list.length; t++) {
      var prop = list[t].prop;
      var idx = list[t].indices;
      // Unseparated spatial Position/Anchor take ONE temporal ease (along the
      // path); everything else is per dimension.
      var spatial = util.isSpatial(prop);
      var dims = spatial ? 1 : util.dimensionsOf(prop);
      var didProp = false;

      for (var s = 0; s < idx.length - 1; s++) {
        var a = idx[s];
        var b = idx[s + 1];
        var dt = prop.keyTime(b) - prop.keyTime(a);
        if (dt <= 0) continue;
        // A stepped (HOLD) segment has no interpolation to ease — leave it as-is
        // instead of silently smoothing a deliberate stepped hold.
        if (isHoldSegment(prop, a)) { skippedHold++; continue; }

        var aVals = valuesAt(prop, a);
        var bVals = valuesAt(prop, b);
        // A spatial segment with no motion (identical position/anchor values) has
        // a zero-length path; applying a temporal ease throws "zero denominator
        // converting ratio" in AE. Leave that segment untouched.
        if (spatial && magnitude(aVals, bVals) < 1e-6) { skippedFlat++; continue; }
        var outArr = [];
        var inArr = [];
        for (var d = 0; d < dims; d++) {
          var dv = spatial ? magnitude(aVals, bVals) : (bVals[d] || 0) - (aVals[d] || 0);
          var avg = dv / dt;
          outArr.push(outEase(curve, avg));
          inArr.push(inEase(curve, avg));
        }

        if (setOut) {
          ensureBezierSide(prop, a, 'out');
          prop.setTemporalEaseAtKey(a, prop.keyInTemporalEase(a), outArr);
        }
        if (setIn) {
          ensureBezierSide(prop, b, 'in');
          prop.setTemporalEaseAtKey(b, inArr, prop.keyOutTemporalEase(b));
        }
        segments++;
        didProp = true;
      }
      if (didProp) propsTouched++;
    }

    return {
      properties: propsTouched,
      segments: segments,
      skippedHold: skippedHold,
      skippedFlat: skippedFlat
    };
  }

  // Reconstruct a normalized cubic-bezier from one selected segment's ease. The
  // y (slope) factors divide by the segment's average speed `avg`, so a segment
  // whose value does NOT change over time (avg == 0) carries no recoverable
  // timing — it can only read back as the linear diagonal. `flat` flags that.
  // True when the property's motion is driven by an (enabled) expression, so the
  // keyframe temporal ease Read reconstructs is NOT what actually plays back.
  function hasExpr(p) {
    try { return p.expressionEnabled === true; } catch (e) { return false; }
  }

  function reconstructSegment(p, a, b, avg, dim) {
    var outE = p.keyOutTemporalEase(a)[dim];
    var inE = p.keyInTemporalEase(b)[dim];
    var x1 = clamp01(outE.influence / 100);
    var x2 = 1 - clamp01(inE.influence / 100);
    var flat = Math.abs(avg) < 1e-6;
    var y1 = flat ? x1 : (outE.speed / avg) * x1;
    var y2 = flat ? x2 : 1 - (inE.speed / avg) * (1 - x2);
    return {
      found: true,
      flat: flat,
      hasExpression: hasExpr(p),
      propertyName: p.name,
      layerName: util.layerOfProperty(p).name,
      curve: { type: 'bezier', x1: x1, y1: y1, x2: x2, y2: y2 }
    };
  }

  // Read the existing ease back into a normalized cubic-bezier (reverse sync into
  // the editor). A property whose value is constant across the segment (a held
  // Scale, a non-moving axis) cannot encode a timing curve — it always reads back
  // linear — so prefer the first selected property that actually MOVES; only fall
  // back to a flat one if nothing in the selection moves.
  function readEase() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var flatFallback = null;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property)) continue;
      if (!p.canVaryOverTime || p.numKeys < 2) continue;
      // Inspect consecutive pairs among the SELECTED keys (or every key if fewer
      // than two are selected) and return the FIRST segment that actually moves —
      // scanning within the property, not just its first pair, so a held opening
      // segment (avg == 0, reads linear) can't mask a later moving one.
      var keys = p.selectedKeys.length >= 2 ? p.selectedKeys : null;
      if (!keys) { keys = []; for (var k = 1; k <= p.numKeys; k++) keys.push(k); }
      for (var s = 0; s < keys.length - 1; s++) {
        var a = keys[s];
        var b = keys[s + 1];
        var dt = p.keyTime(b) - p.keyTime(a);
        if (dt <= 0) continue;

        var aVals = valuesAt(p, a);
        var bVals = valuesAt(p, b);
        var dv, dim;
        if (util.isSpatial(p)) {
          dv = magnitude(aVals, bVals); dim = 0;          // single temporal ease along the path
        } else {
          // Pick the dimension that moves most; a flat axis carries no timing.
          dv = 0; dim = 0;
          for (var d = 0; d < aVals.length; d++) {
            var chg = (bVals[d] || 0) - (aVals[d] || 0);
            if (Math.abs(chg) > Math.abs(dv)) { dv = chg; dim = d; }
          }
        }
        var avg = dv / dt;

        var res = reconstructSegment(p, a, b, avg, dim);
        if (res.flat) { if (!flatFallback) flatFallback = res; continue; }
        return res;
      }
    }
    return flatFallback || { found: false };
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  R.register('ease.apply', applyEase, 'Rebound: Apply Ease');
  R.register('ease.read', readEase);
})();
