/*
 * Rebound host, import layer styles.
 *
 * The single place that talks to After Effects layer styles, so shadows, glows,
 * bevel, satin, colour/gradient overlay, and stroke are EXACT (a real inner
 * shadow, a real inside/outside stroke) instead of Effect-Parade approximations.
 *
 * Layer styles cannot be added with addProperty; they are enabled with the menu
 * command (app.executeCommand 9000..9008) on the selected layer in the front
 * comp. So application is DEFERRED: builders call collect(layer, node); after the
 * whole build, flushAll() groups by comp, brings each comp forward once, selects
 * each layer, enables its styles, and sets the sub-properties by slash matchName.
 */
(function () {
  var R = $.__rebound;
  var N = R.ir.N;
  var FX = $.global.ReboundEffects;

  var COMMAND = {
    DROP_SHADOW: 9000, INNER_SHADOW: 9001, OUTER_GLOW: 9002, INNER_GLOW: 9003,
    BEVEL_EMBOSS: 9004, SATIN: 9005, COLOR_OVERLAY: 9006, GRADIENT_OVERLAY: 9007, STROKE: 9008
  };
  var GROUP = {
    DROP_SHADOW: 'dropShadow', INNER_SHADOW: 'innerShadow', OUTER_GLOW: 'outerGlow', INNER_GLOW: 'innerGlow',
    BEVEL_EMBOSS: 'bevelEmboss', SATIN: 'chromeFX', COLOR_OVERLAY: 'solidFill', GRADIENT_OVERLAY: 'gradientFill', STROKE: 'frameFX'
  };

  function ord(mode) { return FX.blendModeToLayerStyleOrdinal(mode || 'NORMAL'); }
  function rgb(c) { return N.colorToAE(c); }

  // A setter bound to one style: tries the slash matchName on the styles group
  // directly, then under the style sub-group (builds differ).
  function makeSetter(styles, prefix) {
    var group = null;
    try { group = styles.property(prefix); } catch (e) { group = null; }
    return function (slash, value) {
      try { var p = styles.property(slash); if (p) { p.setValue(value); return; } } catch (e1) {}
      if (group) { try { var p2 = group.property(slash); if (p2) { p2.setValue(value); return; } } catch (e2) {} }
    };
  }

  function setShadow(set, prefix, ls) {
    set(prefix + '/enabled', true);
    if (ls.blendMode) set(prefix + '/mode2', ord(ls.blendMode));
    if (ls.color) set(prefix + '/color', rgb(ls.color));
    if (ls.opacity != null) set(prefix + '/opacity', ls.opacity * 100);
    set(prefix + '/useGlobalAngle', false);
    if (ls.angle != null) set(prefix + '/localLightingAngle', ls.angle);
    if (ls.distance != null) set(prefix + '/distance', ls.distance);
    if (ls.choke != null) set(prefix + '/chokeMatte', ls.choke);
    else if (ls.spread != null) set(prefix + '/chokeMatte', ls.spread);
    if (ls.size != null) set(prefix + '/blur', ls.size);
  }

  function setGlow(set, prefix, ls, node, report) {
    set(prefix + '/enabled', true);
    if (ls.blendMode) set(prefix + '/mode2', ord(ls.blendMode));
    if (ls.opacity != null) set(prefix + '/opacity', ls.opacity * 100);
    set(prefix + '/AEColorChoice', 1); // solid colour (gradient stops are not scriptable)
    if (ls.color) set(prefix + '/color', rgb(ls.color));
    if (ls.choke != null) set(prefix + '/chokeMatte', ls.choke);
    else if (ls.spread != null) set(prefix + '/chokeMatte', ls.spread);
    if (ls.size != null) set(prefix + '/blur', ls.size);
    if (prefix === 'innerGlow' && ls.glowSource) set(prefix + '/innerGlowSource', ls.glowSource === 'CENTER' ? 1 : 2);
    if (ls.gradient) R.importer.util.note(report, 'approximated', { name: node.name, detail: 'glow gradient stops are not scriptable; used a solid colour' });
  }

  function setColorOverlay(set, ls) {
    set('solidFill/enabled', true);
    if (ls.blendMode) set('solidFill/mode2', ord(ls.blendMode));
    if (ls.color) set('solidFill/color', rgb(ls.color));
    if (ls.opacity != null) set('solidFill/opacity', ls.opacity * 100);
  }

  function setGradientOverlay(set, ls, node, report) {
    set('gradientFill/enabled', true);
    if (ls.blendMode) set('gradientFill/mode2', ord(ls.blendMode));
    if (ls.opacity != null) set('gradientFill/opacity', ls.opacity * 100);
    if (ls.angle != null) set('gradientFill/angle', ls.angle);
    if (ls.reverse) set('gradientFill/reverse', true);
    R.importer.util.note(report, 'approximated', { name: node.name, detail: 'gradient overlay geometry set; stops are not scriptable' });
  }

  // Convert a gradient PAINT (schema "paint": type/stops/gradientHandles/reverse)
  // into a GRADIENT_OVERLAY layerStyle the deferred queue can apply. Used by the
  // text path for gradient text fills, which AE cannot express as a native fill.
  // Stops are not scriptable, so only geometry/blend/angle survive (see caveat
  // emitted by setGradientOverlay).
  function gradientPaintToOverlay(paint) {
    if (!paint || !paint.type || paint.type.indexOf('GRADIENT') !== 0) return null;
    var ls = { type: 'GRADIENT_OVERLAY', gradient: paint };
    if (paint.reverse) ls.reverse = true;
    if (paint.opacity != null) ls.opacity = paint.opacity;
    // Derive the ramp angle from the handles (node-local px, Y-down). AE gradient
    // overlay angle is degrees counter-clockwise from +X, so negate the screen
    // angle. Absent handles fall through to the AE default (0).
    var h = paint.gradientHandles;
    if (h && h.length >= 2 && h[0] && h[1]) {
      var dx = h[1][0] - h[0][0];
      var dy = h[1][1] - h[0][1];
      if (dx !== 0 || dy !== 0) {
        var deg = Math.atan2(dy, dx) * 180 / Math.PI;
        ls.angle = -deg;
      }
    }
    return ls;
  }

  function setStroke(set, ls) {
    set('frameFX/enabled', true);
    if (ls.blendMode) set('frameFX/mode2', ord(ls.blendMode));
    if (ls.color) set('frameFX/color', rgb(ls.color));
    if (ls.size != null) set('frameFX/size', ls.size);
    if (ls.opacity != null) set('frameFX/opacity', ls.opacity * 100);
    var pos = ls.position === 'OUTSIDE' ? 1 : (ls.position === 'INSIDE' ? 3 : 2);
    set('frameFX/style', pos);
  }

  var BEVEL_STYLE = { OUTER: 1, INNER: 2, EMBOSS: 3, PILLOW: 4, STROKE: 5 };
  var BEVEL_TECH = { SMOOTH: 1, CHISEL_HARD: 2, CHISEL_SOFT: 3 };

  function setBevel(set, ls) {
    var b = ls.bevel || {};
    set('bevelEmboss/enabled', true);
    if (b.style && BEVEL_STYLE[b.style]) set('bevelEmboss/bevelStyle', BEVEL_STYLE[b.style]);
    if (b.technique && BEVEL_TECH[b.technique]) set('bevelEmboss/bevelTechnique', BEVEL_TECH[b.technique]);
    if (b.direction) set('bevelEmboss/bevelDirection', b.direction === 'DOWN' ? 2 : 1);
    if (b.depth != null) set('bevelEmboss/strengthRatio', b.depth);
    if (ls.size != null) set('bevelEmboss/blur', ls.size);
    if (b.soften != null) set('bevelEmboss/softness', b.soften);
    set('bevelEmboss/useGlobalAngle', false);
    if (ls.angle != null) set('bevelEmboss/localLightingAngle', ls.angle);
    if (ls.altitude != null) set('bevelEmboss/localLightingAltitude', ls.altitude);
    if (b.highlightMode) set('bevelEmboss/highlightMode', ord(b.highlightMode));
    if (b.highlightColor) set('bevelEmboss/highlightColor', rgb(b.highlightColor));
    if (b.highlightOpacity != null) set('bevelEmboss/highlightOpacity', b.highlightOpacity * 100);
    if (b.shadowMode) set('bevelEmboss/shadowMode', ord(b.shadowMode));
    if (b.shadowColor) set('bevelEmboss/shadowColor', rgb(b.shadowColor));
    if (b.shadowOpacity != null) set('bevelEmboss/shadowOpacity', b.shadowOpacity * 100);
  }

  function setSatin(set, ls) {
    set('chromeFX/enabled', true);
    if (ls.blendMode) set('chromeFX/mode2', ord(ls.blendMode));
    if (ls.color) set('chromeFX/color', rgb(ls.color));
    if (ls.opacity != null) set('chromeFX/opacity', ls.opacity * 100);
    if (ls.angle != null) set('chromeFX/localLightingAngle', ls.angle);
    if (ls.distance != null) set('chromeFX/distance', ls.distance);
    if (ls.size != null) set('chromeFX/blur', ls.size);
    if (ls.invert) set('chromeFX/invert', true);
  }

  function enableAndSet(layer, ls, node, report) {
    if (ls.enabled === false) return;
    var cmd = COMMAND[ls.type];
    var prefix = GROUP[ls.type];
    if (!cmd) return;
    try { app.executeCommand(cmd); } catch (e) {
      R.importer.util.note(report, 'skipped', { name: node.name, type: ls.type, reason: 'layer style could not be enabled' });
      return;
    }
    var styles;
    try { styles = layer.property('ADBE Layer Styles'); } catch (e2) { return; }
    if (!styles) return;
    var set = makeSetter(styles, prefix);
    switch (ls.type) {
      case 'DROP_SHADOW': case 'INNER_SHADOW': setShadow(set, prefix, ls); break;
      case 'OUTER_GLOW': case 'INNER_GLOW': setGlow(set, prefix, ls, node, report); break;
      case 'COLOR_OVERLAY': setColorOverlay(set, ls); break;
      case 'GRADIENT_OVERLAY': setGradientOverlay(set, ls, node, report); break;
      case 'STROKE': setStroke(set, ls); break;
      case 'BEVEL_EMBOSS': setBevel(set, ls); break;
      case 'SATIN': setSatin(set, ls); break;
      default: break;
    }
  }

  // An inside/outside SOLID stroke has no centred-shape-stroke equivalent, so it
  // is reproduced exactly as a Stroke layer style instead.
  function strokeToLayerStyle(node) {
    var st = node.stroke;
    if (!st || !st.weight || !st.align || st.align === 'CENTER' || !st.paints || !st.paints.length) return null;
    var p = null;
    for (var i = 0; i < st.paints.length; i++) { if (st.paints[i] && st.paints[i].visible !== false) { p = st.paints[i]; break; } }
    if (!p || p.type !== 'SOLID') return null; // gradient strokes stay shape strokes
    return { type: 'STROKE', size: st.weight, color: p.color, position: st.align, opacity: (p.opacity != null ? p.opacity : 1) };
  }

  // Gather the styles for a node: explicit layerStyles, any shadow/glow/overlay
  // effects (blurs stay in effect.jsx), and an inside/outside stroke.
  function gatherStyles(node) {
    var out = [];
    var seen = {};
    // De-dup by type: enabling the same style twice toggles it back off.
    function add(s) {
      if (s && s.type && s.enabled !== false && !seen[s.type]) { seen[s.type] = true; out.push(s); }
    }
    var i;
    if (node.layerStyles) { for (i = 0; i < node.layerStyles.length; i++) add(node.layerStyles[i]); }
    if (node.effects) { for (i = 0; i < node.effects.length; i++) add(FX.effectToLayerStyle(node.effects[i])); }
    add(strokeToLayerStyle(node));
    return out;
  }

  var pending = [];

  function reset() { pending = []; }

  function collect(layer, node, report) {
    var styles = gatherStyles(node);
    if (styles.length) pending.push({ layer: layer, node: node, styles: styles, report: report });
  }

  function deselectAll(comp) {
    for (var i = 1; i <= comp.numLayers; i++) {
      try { comp.layer(i).selected = false; } catch (e) {}
    }
  }

  function applyComp(comp, items) {
    try { comp.openInViewer(); } catch (e) {}
    // executeCommand acts on the front comp; if we could not bring this one
    // forward, skip its styles with a clear flag rather than corrupt another.
    var active = false;
    try { active = (app.project.activeItem === comp); } catch (e1) {}
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!active) {
        R.importer.util.note(it.report, 'skipped', { name: it.node.name, type: 'STYLE', reason: 'could not bring the composition forward for layer styles' });
        continue;
      }
      try {
        deselectAll(comp);
        it.layer.selected = true;
        for (var s = 0; s < it.styles.length; s++) enableAndSet(it.layer, it.styles[s], it.node, it.report);
      } catch (e2) { /* keep going */ }
    }
  }

  function flushAll() {
    var groups = [];
    function groupFor(comp) {
      for (var i = 0; i < groups.length; i++) { if (groups[i].comp === comp) return groups[i]; }
      var g = { comp: comp, items: [] };
      groups.push(g);
      return g;
    }
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      var comp = null;
      try { comp = p.layer.containingComp; } catch (e) { comp = null; }
      if (comp) groupFor(comp).items.push(p);
    }
    for (var g = 0; g < groups.length; g++) applyComp(groups[g].comp, groups[g].items);
    pending = [];
  }

  R.importer.layerStyle = {
    collect: collect,
    flushAll: flushAll,
    reset: reset,
    gatherStyles: gatherStyles,
    gradientPaintToOverlay: gradientPaintToOverlay
  };
})();
