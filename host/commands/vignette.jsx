/*
 * Rebound host, Vignette (edge-darkening adjustment layer).
 *
 * Creates a black solid named "Vignette" sized to the comp, then cuts a
 * feathered elliptical hole in it with a single subtractive mask so the center
 * stays clear and the black edges darken whatever sits beneath. Amount drives
 * the layer opacity, Feather the mask feather, and Scale the ellipse size as a
 * percentage of the frame. Every property is addressed by matchName. The layer
 * is a normal solid, not an adjustment layer: an adjustment layer composites
 * only the effects applied to it and ignores its own black pixels, so a black
 * adjustment layer with no effect would darken nothing.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  var MASK_ATOM = 'ADBE Mask Atom';
  var MASK_SHAPE = 'ADBE Mask Shape';
  var MASK_MODE = 'ADBE Mask Mode';
  var MASK_FEATHER = 'ADBE Mask Feather';

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  // Build a four-vertex Shape() approximating a centered ellipse of the given
  // half-width / half-height. The tangent magnitude (kappa) makes the cubic
  // Bezier hull match a true ellipse closely.
  function ellipseShape(cx, cy, rx, ry) {
    var k = 0.5522847498307936; // 4/3 * (sqrt(2) - 1)
    var kx = rx * k;
    var ky = ry * k;

    var shape = new Shape();
    shape.vertices = [
      [cx, cy - ry], // top
      [cx + rx, cy], // right
      [cx, cy + ry], // bottom
      [cx - rx, cy]  // left
    ];
    shape.inTangents = [
      [-kx, 0],
      [0, -ky],
      [kx, 0],
      [0, ky]
    ];
    shape.outTangents = [
      [kx, 0],
      [0, ky],
      [-kx, 0],
      [0, -ky]
    ];
    shape.closed = true;
    return shape;
  }

  function apply(args) {
    var comp = util.activeComp();

    var amount = clamp(num(args.amount, 60), 0, 100);
    var feather = num(args.feather, 150);
    if (feather < 0) feather = 0;
    var scale = clamp(num(args.scale, 100), 50, 150);

    var layer = comp.layers.addSolid([0, 0, 0], 'Vignette', comp.width, comp.height, 1);

    // Mask is described in layer space; the solid spans the full comp.
    var cx = comp.width / 2;
    var cy = comp.height / 2;
    var rx = (comp.width / 2) * (scale / 100);
    var ry = (comp.height / 2) * (scale / 100);

    var mask = layer.Masks.addProperty(MASK_ATOM);
    mask.property(MASK_SHAPE).setValue(ellipseShape(cx, cy, rx, ry));
    mask.property(MASK_MODE).setValue(MaskMode.SUBTRACT);
    mask.property(MASK_FEATHER).setValue([feather, feather]);
    mask.maskExpansion.setValue(0);

    var opacity = layer.property(M.transform).property(M.opacity);
    opacity.setValue(amount);

    return { created: 1 };
  }

  R.register('vignette.apply', apply, 'Rebound: Vignette');
})();