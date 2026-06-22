/*
 * Rebound host, import geometry.
 *
 * Bezier builders for shapes the parametric primitives cannot express exactly:
 * a per-corner rounded rectangle (each corner its own radius) and an ellipse as
 * a path. Returns IR-style subpaths (vertices with relative tangents) so
 * shape.jsx and mask.jsx can add them the same way as any other path. Quarter
 * circles use the standard kappa = 0.5523.
 */
(function () {
  var R = $.__rebound;
  var K = 0.5523;

  function clamp0(v) { return (v > 0) ? v : 0; }

  // Per-corner rounded rectangle in local space [0..w] x [0..h], clockwise.
  function roundedRect(w, h, radii) {
    var maxR = Math.min(w, h) / 2;
    var a = Math.min(clamp0(radii.tl), maxR);
    var b = Math.min(clamp0(radii.tr), maxR);
    var c = Math.min(clamp0(radii.br), maxR);
    var d = Math.min(clamp0(radii.bl), maxR);
    var v = [
      { x: a, y: 0, inTangent: [-a * K, 0], outTangent: [0, 0] },
      { x: w - b, y: 0, inTangent: [0, 0], outTangent: [b * K, 0] },
      { x: w, y: b, inTangent: [0, -b * K], outTangent: [0, 0] },
      { x: w, y: h - c, inTangent: [0, 0], outTangent: [0, c * K] },
      { x: w - c, y: h, inTangent: [c * K, 0], outTangent: [0, 0] },
      { x: d, y: h, inTangent: [0, 0], outTangent: [-d * K, 0] },
      { x: 0, y: h - d, inTangent: [0, d * K], outTangent: [0, 0] },
      { x: 0, y: a, inTangent: [0, 0], outTangent: [0, -a * K] }
    ];
    return { vertices: v, closed: true, windingRule: 'NONZERO' };
  }

  // Full ellipse as a 4-point bezier in local space [0..w] x [0..h].
  function ellipsePath(w, h) {
    var rx = w / 2, ry = h / 2;
    var ox = rx * K, oy = ry * K;
    var v = [
      { x: rx, y: 0, inTangent: [-ox, 0], outTangent: [ox, 0] },
      { x: w, y: ry, inTangent: [0, -oy], outTangent: [0, oy] },
      { x: rx, y: h, inTangent: [ox, 0], outTangent: [-ox, 0] },
      { x: 0, y: ry, inTangent: [0, oy], outTangent: [0, -oy] }
    ];
    return { vertices: v, closed: true, windingRule: 'NONZERO' };
  }

  R.importer.geometry = {
    roundedRect: roundedRect,
    ellipsePath: ellipsePath
  };
})();
