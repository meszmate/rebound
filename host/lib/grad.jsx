/*
 * Rebound host, gradient colour encoding.
 *
 * After Effects stores a shape gradient's stops in the flat, version-sensitive
 * "ADBE Vector Grad Colors" array: 4 numbers per colour stop (position, r, g, b)
 * followed by 2 numbers per alpha stop (position, alpha), colour stops then alpha
 * stops, sorted by position. This is the encoding the Gradient tool already uses
 * and reads back successfully in this project; lifting it here lets the importer
 * reuse the exact same proven encoder for multi-stop gradients with real alpha.
 */
$.__rebound = $.__rebound || {};
$.__rebound.grad = (function () {
  // The flat-array encoding lives in the shared lib (shared/lib/grad.js) so the
  // panel, host, and tests all agree on it; this host module adds the AE calls.
  var G = $.global.ReboundGrad;

  // stops: [{ pos:Number(0..1), color:[r,g,b](0..1), alpha?:Number(0..1) }]
  function encode(stops) {
    return G.encode(stops);
  }

  // Apply a gradient to a G-Fill / G-Stroke operator. opts:
  //   { type:1(linear)|2(radial), start:[x,y], end:[x,y], stops:[...] }
  function applyGradient(op, opts) {
    try { op.property('ADBE Vector Grad Type').setValue(opts.type); } catch (e) {}
    try {
      op.property('ADBE Vector Grad Start Pt').setValue(opts.start);
      op.property('ADBE Vector Grad End Pt').setValue(opts.end);
    } catch (e2) {}
    try { op.property('ADBE Vector Grad Colors').setValue(encode(opts.stops)); } catch (e3) {}
  }

  return { encode: encode, applyGradient: applyGradient };
})();
