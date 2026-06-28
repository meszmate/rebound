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

  // An elliptical arc (a0 -> a1, radians) on the ellipse centred at (cx, cy) with
  // radii (rx, ry). Angles use Figma arcData's convention: 0 = +X axis (3 o'clock)
  // increasing CLOCKWISE in Y-down space, so 0 is the RIGHT and +90deg is the
  // bottom. Splits the sweep into <=90deg segments and appends each as a cubic
  // bezier vertex (relative tangents). Reverse walks a1 -> a0 for the inner ring
  // edge. Returns the vertex array; tangents are filled so AE reproduces the curve.
  function arcVertices(cx, cy, rx, ry, a0, a1, reverse) {
    var sweep = a1 - a0;
    var segs = Math.ceil(Math.abs(sweep) / (Math.PI / 2));
    if (segs < 1) segs = 1;
    var step = sweep / segs;
    // Tangent length factor for a circular arc of half-angle (step/2).
    var k = (4 / 3) * Math.tan(step / 4);
    var pts = [];
    for (var i = 0; i <= segs; i++) {
      var a = a0 + step * i;
      // 3 o'clock / +X origin, clockwise (Y down): x = cos, y = sin.
      var sx = Math.cos(a), sy = Math.sin(a);
      var px = cx + rx * sx, py = cy + ry * sy;
      // Tangent = d(position)/da = (-sin*rx, cos*ry), scaled per radius.
      var tx = -Math.sin(a) * rx, ty = Math.cos(a) * ry;
      pts.push({
        x: px, y: py,
        outTangent: [tx * k, ty * k],
        inTangent: [-tx * k, -ty * k]
      });
    }
    if (reverse) pts.reverse();
    return pts;
  }

  // A partial ellipse: pie (sweep closed to centre) when innerRadius<=0, or a
  // concentric ring/donut wedge when innerRadius>0. innerRadius is a 0..1 fraction
  // of the radius (Figma arcData). Built in local space [0..w] x [0..h].
  function ellipseArcPath(w, h, arc) {
    var rx = w / 2, ry = h / 2;
    var cx = rx, cy = ry;
    var d2r = Math.PI / 180;
    var a0 = (arc.startAngle || 0) * d2r;
    var a1 = (arc.endAngle === undefined ? 360 : arc.endAngle) * d2r;
    var inner = arc.innerRadius || 0;
    if (inner < 0) inner = 0; if (inner > 1) inner = 1;
    var verts;
    if (inner > 0) {
      // Ring wedge: outer edge forward, inner edge back, closed across the ends.
      var outer = arcVertices(cx, cy, rx, ry, a0, a1, false);
      var innr = arcVertices(cx, cy, rx * inner, ry * inner, a0, a1, true);
      verts = outer.concat(innr);
    } else {
      // Pie: arc plus the centre point so AE closes the wedge to the middle.
      verts = arcVertices(cx, cy, rx, ry, a0, a1, false);
      verts.push({ x: cx, y: cy, inTangent: [0, 0], outTangent: [0, 0] });
    }
    return { vertices: verts, closed: true, windingRule: 'NONZERO' };
  }

  R.importer.geometry = {
    roundedRect: roundedRect,
    ellipsePath: ellipsePath,
    ellipseArcPath: ellipseArcPath
  };
})();
