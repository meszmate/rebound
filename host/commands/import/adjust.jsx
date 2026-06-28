/*
 * Rebound host, import adjustment layers.
 *
 * Rebuilds a Photoshop ADJUSTMENT node as a real After Effects adjustment layer
 * carrying the matching NATIVE effect, so it colour-grades every layer beneath it
 * exactly as it did in Photoshop -- instead of being dropped. Kinds AE expresses
 * natively (Brightness/Contrast, Hue/Saturation, Levels, Exposure, Vibrance,
 * Photo Filter, Colour Balance, Black & White) get their parameters mapped; a
 * kind with no native equivalent (Curves, Selective Colour, ...) still creates the
 * adjustment layer so the stacking is preserved, and is flagged in the report.
 *
 * Every effect/parameter write is guarded: an unknown matchName on a given AE
 * build simply no-ops, so the adjustment layer and effect still land even if a
 * particular control could not be set.
 */
(function () {
  var R = $.__rebound;
  var N = R.ir.N;

  function note(report, level, o) { R.importer.util.note(report, level, o); }

  // A comp-sized white solid flagged as an adjustment layer: it affects every
  // layer below it in the stack, matching a Photoshop adjustment layer grading
  // the layers beneath it.
  function makeAdjustmentLayer(comp, name) {
    var layer = comp.layers.addSolid([1, 1, 1], name || 'Adjustment', comp.width, comp.height, comp.pixelAspect, comp.duration);
    try { layer.adjustmentLayer = true; } catch (e) { /* very old builds */ }
    return layer;
  }

  // Add an effect by matchName; return it, or null if this AE lacks it.
  function addEffect(layer, matchName) {
    try {
      var fx = layer.property('ADBE Effect Parade');
      if (fx && fx.canAddProperty(matchName)) return fx.addProperty(matchName);
    } catch (e) { /* effect not present on this build */ }
    return null;
  }
  // Set an effect parameter by matchName, guarded (wrong/absent name no-ops).
  function setP(fx, match, value) {
    if (!fx || value == null) return;
    try { var p = fx.property(match); if (p) p.setValue(value); } catch (e) { /* param varies by build */ }
  }
  function num(v) { return typeof v === 'number' && !isNaN(v); }

  // ---- per-kind native mappers ---------------------------------------------

  function applyBrightnessContrast(layer, a) {
    var fx = addEffect(layer, 'ADBE Brightness & Contrast 2');
    if (!fx) return false;
    if (a.useLegacy) setP(fx, 'ADBE Brightness & Contrast 2-0003', 1);
    if (num(a.brightness)) setP(fx, 'ADBE Brightness & Contrast 2-0001', a.brightness);
    if (num(a.contrast)) setP(fx, 'ADBE Brightness & Contrast 2-0002', a.contrast);
    return true;
  }

  function applyHueSaturation(layer, a) {
    var fx = addEffect(layer, 'ADBE HUE SATURATION');
    if (!fx) return false;
    if (a.colorize) {
      setP(fx, 'ADBE HUE SATURATION-0006', 1); // Colorize on
      if (num(a.hue)) setP(fx, 'ADBE HUE SATURATION-0007', a.hue);
      if (num(a.saturation)) setP(fx, 'ADBE HUE SATURATION-0008', a.saturation);
      if (num(a.lightness)) setP(fx, 'ADBE HUE SATURATION-0009', a.lightness);
    } else {
      if (num(a.hue)) setP(fx, 'ADBE HUE SATURATION-0003', a.hue);            // Master Hue (degrees)
      if (num(a.saturation)) setP(fx, 'ADBE HUE SATURATION-0004', a.saturation); // Master Saturation
      if (num(a.lightness)) setP(fx, 'ADBE HUE SATURATION-0005', a.lightness);   // Master Lightness
    }
    return true;
  }

  function applyLevels(layer, a, report, name) {
    // ADBE Pro Levels2 (the standard Levels effect) is present on every supported
    // AE build. Composite-channel layout: -0001 Channel, -0002 Histogram (read-
    // only), -0003 Input Black, -0004 Input White, -0005 Gamma, -0006 Output Black,
    // -0007 Output White.
    var fx = addEffect(layer, 'ADBE Pro Levels2');
    if (!fx) return false;
    var lv = a.levels;
    if (lv) {
      // AE Levels input/output points are 0..1; Photoshop supplies 0..255.
      if (num(lv.inputBlack)) setP(fx, 'ADBE Pro Levels2-0003', lv.inputBlack / 255);
      if (num(lv.inputWhite)) setP(fx, 'ADBE Pro Levels2-0004', lv.inputWhite / 255);
      if (num(lv.gamma)) setP(fx, 'ADBE Pro Levels2-0005', lv.gamma);
      if (num(lv.outputBlack)) setP(fx, 'ADBE Pro Levels2-0006', lv.outputBlack / 255);
      if (num(lv.outputWhite)) setP(fx, 'ADBE Pro Levels2-0007', lv.outputWhite / 255);
    }
    return true;
  }

  function applyExposure(layer, a) {
    var fx = addEffect(layer, 'ADBE Exposure2');
    if (!fx) return false;
    if (num(a.exposure)) setP(fx, 'ADBE Exposure2-0002', a.exposure); // Master Exposure (stops)
    if (num(a.offset)) setP(fx, 'ADBE Exposure2-0003', a.offset);     // Master Offset
    if (num(a.gamma)) setP(fx, 'ADBE Exposure2-0004', a.gamma);       // Master Gamma
    return true;
  }

  function applyVibrance(layer, a) {
    var fx = addEffect(layer, 'ADBE Vibrance');
    if (!fx) return false;
    if (num(a.vibrance)) setP(fx, 'ADBE Vibrance-0001', a.vibrance);
    if (num(a.saturation)) setP(fx, 'ADBE Vibrance-0002', a.saturation);
    return true;
  }

  function applyPhotoFilter(layer, a) {
    var fx = addEffect(layer, 'ADBE Photo Filter');
    if (!fx) return false;
    if (a.filterColor) {
      var c = N.normalizeColor(a.filterColor);
      setP(fx, 'ADBE Photo Filter-0002', [c.r, c.g, c.b]);
    }
    if (num(a.density)) setP(fx, 'ADBE Photo Filter-0003', a.density);
    setP(fx, 'ADBE Photo Filter-0004', a.preserveLuminosity ? 1 : 0);
    return true;
  }

  function applyColorBalance(layer, a) {
    var fx = addEffect(layer, 'ADBE Pro Color Balance');
    if (!fx) return false;
    var s = a.shadows, m = a.midtones, h = a.highlights;
    if (s) { if (num(s[0])) setP(fx, 'ADBE Pro Color Balance-0001', s[0]); if (num(s[1])) setP(fx, 'ADBE Pro Color Balance-0002', s[1]); if (num(s[2])) setP(fx, 'ADBE Pro Color Balance-0003', s[2]); }
    if (m) { if (num(m[0])) setP(fx, 'ADBE Pro Color Balance-0004', m[0]); if (num(m[1])) setP(fx, 'ADBE Pro Color Balance-0005', m[1]); if (num(m[2])) setP(fx, 'ADBE Pro Color Balance-0006', m[2]); }
    if (h) { if (num(h[0])) setP(fx, 'ADBE Pro Color Balance-0007', h[0]); if (num(h[1])) setP(fx, 'ADBE Pro Color Balance-0008', h[1]); if (num(h[2])) setP(fx, 'ADBE Pro Color Balance-0009', h[2]); }
    return true;
  }

  function applyBlackAndWhite(layer, a) {
    var fx = addEffect(layer, 'ADBE Black&White');
    if (!fx) return false;
    var bw = a.blackAndWhite;
    if (bw) {
      if (num(bw.reds)) setP(fx, 'ADBE Black&White-0001', bw.reds);
      if (num(bw.yellows)) setP(fx, 'ADBE Black&White-0002', bw.yellows);
      if (num(bw.greens)) setP(fx, 'ADBE Black&White-0003', bw.greens);
      if (num(bw.cyans)) setP(fx, 'ADBE Black&White-0004', bw.cyans);
      if (num(bw.blues)) setP(fx, 'ADBE Black&White-0005', bw.blues);
      if (num(bw.magentas)) setP(fx, 'ADBE Black&White-0006', bw.magentas);
    }
    return true;
  }

  // Kinds with a native AE effect, dispatched by kind.
  var MAPPERS = {
    BRIGHTNESS_CONTRAST: applyBrightnessContrast,
    HUE_SATURATION: applyHueSaturation,
    LEVELS: applyLevels,
    EXPOSURE: applyExposure,
    VIBRANCE: applyVibrance,
    PHOTO_FILTER: applyPhotoFilter,
    COLOR_BALANCE: applyColorBalance,
    BLACK_AND_WHITE: applyBlackAndWhite
  };
  // A reasonable native stand-in for kinds with no exact AE equivalent, so the
  // grade is at least present (the layer is still flagged as approximate).
  var FALLBACK_EFFECT = {
    CURVES: 'ADBE CurvesCustom',
    INVERT: 'ADBE Invert',
    THRESHOLD: 'ADBE Threshold2',
    POSTERIZE: 'ADBE Posterize2',
    CHANNEL_MIXER: 'ADBE ChannelMixer',
    SELECTIVE_COLOR: null,
    GRADIENT_MAP: null
  };

  function buildAdjustment(comp, node, report) {
    var a = node.adjust || {};
    var kind = a.kind || 'UNKNOWN';
    var layer = makeAdjustmentLayer(comp, node.name || kind);

    // Opacity / blend ride on the adjustment layer (it can be dimmed / blended);
    // its TRANSFORM is left comp-sized so it grades the whole stack below it.
    var tr = layer.property('ADBE Transform Group');
    if (num(node.opacity) && node.opacity < 1) { try { tr.property('ADBE Opacity').setValue(node.opacity * 100); } catch (eO) {} }
    var be = R.importer.transform.blendEnum(node.blendMode);
    if (be != null) { try { layer.blendingMode = be; } catch (eB) {} }

    var mapper = MAPPERS[kind];
    var mapped = false;
    if (mapper && !a.unread) {
      try { mapped = mapper(layer, a, report, node.name); } catch (eM) { mapped = false; }
    }
    if (!mapped) {
      // No native param mapping: add a best-effort stand-in effect if one exists,
      // and flag the grade as approximate so the layer order is still preserved.
      var fb = FALLBACK_EFFECT.hasOwnProperty(kind) ? FALLBACK_EFFECT[kind] : null;
      if (fb) { try { addEffect(layer, fb); } catch (eF) {} }
      var why = a.unread ? 'its parameters could not be read from Photoshop'
        : (mapper ? 'its effect is unavailable on this After Effects build' : 'it has no native After Effects equivalent');
      note(report, 'approximated', { name: node.name, detail: 'adjustment "' + kind + '" ' + why + '; created an adjustment layer' + (fb ? ' with a stand-in effect' : ' with no grade') });
    }

    report.layersBuilt++;
    return layer;
  }

  R.importer.builders.ADJUSTMENT = buildAdjustment;
})();
