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

  function addBlur(parade, e) {
    var gb = parade.addProperty('ADBE Gaussian Blur 2');
    if (!gb) return;
    setSafe(gb, 'ADBE Gaussian Blur 2-0001', e.radius || 0); // Blurriness
    setSafe(gb, 'ADBE Gaussian Blur 2-0003', true);          // Repeat Edge Pixels
  }

  // Shadows, glows, satin, and overlays are applied as real layer styles
  // (layerstyle.jsx); only blurs live in the Effect Parade.
  function addEffect(parade, e, node, report) {
    if (e.type === 'LAYER_BLUR') { addBlur(parade, e); return; }
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
