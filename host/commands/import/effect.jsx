/*
 * Rebound host, import effects.
 *
 * Maps IR effects onto After Effects effects on the built layer:
 *   DROP_SHADOW    -> ADBE Drop Shadow
 *   LAYER_BLUR     -> ADBE Gaussian Blur 2
 *   INNER_SHADOW   -> approximated with a drop shadow (flagged)
 *   BACKGROUND_BLUR-> not reconstructed (flagged; needs an adjustment + matte)
 *
 * Shadow direction/distance are derived from the IR offset, and shadow opacity
 * comes from the shadow colour's alpha. Effect properties are addressed by their
 * indexed matchNames and every set is guarded, since effect builds vary.
 */
(function () {
  var R = $.__rebound;
  var N = R.ir.N;

  function setSafe(group, name, value) {
    try { group.property(name).setValue(value); } catch (e) { /* build differences */ }
  }

  function addDropShadow(parade, e) {
    var ds = parade.addProperty('ADBE Drop Shadow');
    if (!ds) return;
    var c = N.normalizeColor(e.color);
    var alpha = (e.color && typeof e.color.a === 'number') ? e.color.a : 0.5;
    var off = e.offset || [0, 0];
    var dist = Math.sqrt(off[0] * off[0] + off[1] * off[1]);
    // AE direction is clockwise with 0 deg casting straight down (+Y).
    var dir = Math.atan2(off[0], off[1]) * 180 / Math.PI;
    setSafe(ds, 'ADBE Drop Shadow-0001', [c.r, c.g, c.b]); // Shadow Color
    setSafe(ds, 'ADBE Drop Shadow-0002', alpha * 255);      // Opacity (0..255)
    setSafe(ds, 'ADBE Drop Shadow-0003', dir);              // Direction
    setSafe(ds, 'ADBE Drop Shadow-0004', dist);             // Distance
    setSafe(ds, 'ADBE Drop Shadow-0005', e.radius || 0);    // Softness
  }

  function addBlur(parade, e) {
    var gb = parade.addProperty('ADBE Gaussian Blur 2');
    if (!gb) return;
    setSafe(gb, 'ADBE Gaussian Blur 2-0001', e.radius || 0); // Blurriness
    setSafe(gb, 'ADBE Gaussian Blur 2-0003', true);          // Repeat Edge Pixels
  }

  function addEffect(parade, e, node, report) {
    if (e.type === 'DROP_SHADOW') { addDropShadow(parade, e); return; }
    if (e.type === 'LAYER_BLUR') { addBlur(parade, e); return; }
    if (e.type === 'INNER_SHADOW') {
      addDropShadow(parade, e);
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'inner shadow approximated with a drop shadow' });
      return;
    }
    if (e.type === 'BACKGROUND_BLUR') {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'background blur not reconstructed (needs an adjustment layer + matte)' });
      return;
    }
  }

  function apply(layer, node, report) {
    var fx = node.effects;
    if (!fx || !fx.length) return;
    var parade = layer.property('ADBE Effect Parade');
    if (!parade) return;
    for (var i = 0; i < fx.length; i++) {
      var e = fx[i];
      if (!e || e.visible === false) continue;
      addEffect(parade, e, node, report);
    }
  }

  R.importer.effect = { apply: apply };
})();
