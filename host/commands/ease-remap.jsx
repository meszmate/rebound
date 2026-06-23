/*
 * Rebound host, ease remap.
 *
 * Applies a normalized factor table (the same table bake.factors would bake)
 * as a LIVE between-keyframe remap EXPRESSION, so an overshooting / elastic /
 * spring curve drives the motion with NO extra keyframes: just the original
 * keyframes plus one expression. Clean timeline, perfectly smooth, undoable,
 * and the Bake tool can flatten it to keyframes later for export / Lottie.
 *
 * This is how easing should land by default: native ease for monotonic curves
 * (handled elsewhere), a single remap expression for overshooting ones, never
 * hundreds of baked keyframes.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  // Round + serialize the factor table into an expression array literal.
  function tableLiteral(factors) {
    var parts = [];
    for (var i = 0; i < factors.length; i++) {
      parts.push(Math.round(factors[i] * 10000) / 10000);
    }
    return '[' + parts.join(',') + ']';
  }

  // Within the segment the playhead is in, look the normalized factor table up
  // at the segment progress and interpolate the two surrounding keyframe values.
  // Outside the keyframe range the value passes through untouched. Lands exactly
  // on every keyframe (factor 0 at the start, 1 at the end of each segment).
  function buildExpr(factors) {
    return [
      'f = ' + tableLiteral(factors) + ';',
      'n = numKeys;',
      'if (n < 2) { value; }',
      'else if (time <= key(1).time || time >= key(n).time) { value; }',
      'else {',
      '  i = 1; while (i < n && key(i + 1).time <= time) { i++; }',
      '  ka = key(i); kb = key(i + 1);',
      '  seg = kb.time - ka.time;',
      '  t = (seg > 0) ? (time - ka.time) / seg : 0;',
      '  pos = t * (f.length - 1);',
      '  lo = Math.floor(pos); hi = lo + 1; if (hi > f.length - 1) { hi = f.length - 1; }',
      '  fac = f[lo] + (f[hi] - f[lo]) * (pos - lo);',
      '  ka.value + (kb.value - ka.value) * fac;',
      '}'
    ].join('\n');
  }

  function remap(args) {
    var factors = args.factors;
    if (!factors || factors.length < 2) throw new Error('No ease data supplied.');
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var expr = buildExpr(factors);
    var applied = 0;
    var skipped = [];

    app.beginUndoGroup('Rebound: Ease');
    try {
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (!(p instanceof Property)) continue;
        if (!p.canVaryOverTime || p.numKeys < 2) continue;
        if (p.selectedKeys.length < 2) continue;
        if (rig.setExpression(p, expr)) applied++;
        else skipped.push(p.name);
      }
    } finally {
      app.endUndoGroup();
    }

    if (!applied) {
      if (skipped.length) throw new Error('Those properties already have a custom expression.');
      throw new Error('Select at least two keyframes on an animated property.');
    }
    return { applied: applied, skipped: skipped };
  }

  function clear() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var cleared = 0;
    app.beginUndoGroup('Rebound: Remove ease');
    try {
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        if (p instanceof Property && rig.clearExpression(p)) cleared++;
      }
    } finally {
      app.endUndoGroup();
    }
    return { cleared: cleared };
  }

  R.register('ease.remap', remap, 'Rebound: Ease');
  R.register('ease.clear', clear, 'Rebound: Remove ease');
})();
