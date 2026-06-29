/*
 * Rebound host, import transforms.
 *
 * Places a built layer to match its source node: position, rotation, and scale
 * (decomposed from the node's absolute affine matrix when present), opacity, and
 * blend mode. Geometry is built in node-local space with the anchor at the local
 * origin, so rotation and scale pivot exactly where the source did.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var N = R.ir.N;
  var M = util.MATCH;

  // IR blend mode -> After Effects BlendingMode. PASS_THROUGH and NORMAL stay
  // Normal; anything unmapped is reported rather than silently dropped.
  function blendEnum(mode) {
    switch (mode) {
      case 'MULTIPLY': return BlendingMode.MULTIPLY;
      case 'SCREEN': return BlendingMode.SCREEN;
      case 'OVERLAY': return BlendingMode.OVERLAY;
      case 'DARKEN': return BlendingMode.DARKEN;
      case 'LIGHTEN': return BlendingMode.LIGHTEN;
      case 'COLOR_DODGE': return BlendingMode.COLOR_DODGE;
      case 'COLOR_BURN': return BlendingMode.COLOR_BURN;
      case 'HARD_LIGHT': return BlendingMode.HARD_LIGHT;
      case 'SOFT_LIGHT': return BlendingMode.SOFT_LIGHT;
      case 'DIFFERENCE': return BlendingMode.DIFFERENCE;
      case 'EXCLUSION': return BlendingMode.EXCLUSION;
      case 'HUE': return BlendingMode.HUE;
      case 'SATURATION': return BlendingMode.SATURATION;
      case 'COLOR': return BlendingMode.COLOR;
      case 'LUMINOSITY': return BlendingMode.LUMINOSITY;
      default: return null;
    }
  }

  function applyBlend(layer, node, report) {
    var mode = node.blendMode;
    if (!mode || mode === 'NORMAL' || mode === 'PASS_THROUGH') return;
    var e = blendEnum(mode);
    if (e != null) {
      try { layer.blendingMode = e; } catch (err) { /* some layer kinds reject it */ }
    } else {
      R.importer.util.note(report, 'approximated', { name: node.name, detail: 'blend mode ' + mode + ' is not available in After Effects' });
    }
  }

  function apply(layer, node, report) {
    var t = node.transform || {};
    var tr = layer.property(M.transform);
    tr.property(M.anchor).setValue([0, 0]);

    if (t.matrix && t.matrix.length === 6) {
      var d = N.decomposeMatrix(t.matrix);
      var px = isFinite(d.x) ? d.x : (t.x || 0);
      var py = isFinite(d.y) ? d.y : (t.y || 0);
      try { tr.property(M.position).setValue([px, py]); } catch (e0) {}
      if (isFinite(d.rotationDeg) && Math.abs(d.rotationDeg) > 0.001) {
        try { tr.property(M.rotation).setValue(d.rotationDeg); } catch (e) {}
      }
      if (isFinite(d.scaleX) && isFinite(d.scaleY) && (Math.abs(d.scaleX - 1) > 1e-4 || Math.abs(d.scaleY - 1) > 1e-4)) {
        try { tr.property(M.scale).setValue([d.scaleX * 100, d.scaleY * 100]); } catch (e2) {}
      }
      // AE 2D layers have no skew channel, so a sheared source (the exporter
      // rasterizes most of these; text and any stragglers still arrive here)
      // loses its shear silently. Warn once rather than drop it without notice.
      if (report && isFinite(d.skewDeg) && Math.abs(d.skewDeg) > 0.1) {
        try {
          R.importer.util.note(report, 'approximated', { name: node.name, detail: 'shear/skew is not reproducible as an After Effects 2D layer transform' });
        } catch (eSk) {}
      }
    } else {
      tr.property(M.position).setValue([t.x || 0, t.y || 0]);
      if (t.rotation) {
        try { tr.property(M.rotation).setValue(t.rotation); } catch (e3) {}
      }
    }

    if (typeof node.opacity === 'number' && node.opacity < 1) {
      tr.property(M.opacity).setValue(node.opacity * 100);
    }
    applyBlend(layer, node, report);
    // Photoshop clipping mask: show only over the layers below.
    if (node.clipBelow) { try { layer.preserveTransparency = true; } catch (e) {} }
  }

  R.importer.transform = { apply: apply, blendEnum: blendEnum };
})();
