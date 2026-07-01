/*
 * Rebound host, import verifier — the objective "are the red borders gone?" check.
 *
 * The environment that builds Rebound cannot run After Effects, so the "red
 * borders everywhere" fix can only be *observed* inside AE. This command turns
 * that observation into a machine check the user runs in-app: it scans a comp
 * (recursing into precomps) for the two — and only two — ways AE renders a
 * DEFAULT RED:
 *
 *   1. An enabled Stroke LAYER STYLE (frameFX). This was the actual bug source:
 *      Figma's default INSIDE strokes used to be reproduced as a Stroke layer
 *      style, which AE left at its default red whenever the scripted colour set
 *      silently failed. The fix draws every border as a real shape stroke, so a
 *      correct Rebound import now has ZERO enabled Stroke layer styles. Any hit
 *      here is a genuine regression -> this is the pass/fail signal.
 *
 *   2. A shape Fill / Stroke operator whose colour is red-dominant. The importer
 *      always sets an explicit colour, so an operator sitting at AE's red default
 *      would show up here. This is a HEURISTIC (a legitimately red design element
 *      trips it too), so it is reported as "review", never as failure.
 *
 * Returns a structured report the panel shows; also usable head-less in tests
 * (R.verify.scanComp / isRedDefault run against a mock comp tree).
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // AE's default new-shape paint is a strongly red-dominant colour. Flag any
  // paint that is clearly red (high red, low green/blue, wide separation) so the
  // old default can't hide; legitimately-red art trips it too, hence "review".
  function isRedDefault(c) {
    if (!c || c.length < 3) return false;
    var r = c[0], g = c[1], b = c[2];
    return r >= 0.5 && g <= 0.25 && b <= 0.25 && (r - g) >= 0.35 && (r - b) >= 0.35;
  }

  var FILL = 'ADBE Vector Graphic - Fill';
  var STROKE = 'ADBE Vector Graphic - Stroke';

  // Walk a shape layer's vector tree, calling onOp(operator, kind, colour) for
  // every Fill / Stroke operator found at any nesting depth.
  function walkVectors(group, onOp, depth) {
    if (!group || depth > 40) return;
    var n = 0;
    try { n = group.numProperties; } catch (e) { n = 0; }
    for (var i = 1; i <= n; i++) {
      var p = null;
      try { p = group.property(i); } catch (e2) { p = null; }
      if (!p) continue;
      var mn = '';
      try { mn = p.matchName; } catch (e3) { mn = ''; }
      if (mn === FILL || mn === STROKE) {
        var col = null;
        try {
          col = p.property(mn === FILL ? 'ADBE Vector Fill Color' : 'ADBE Vector Stroke Color').value;
        } catch (e4) { col = null; }
        onOp(p, mn === FILL ? 'fill' : 'stroke', col);
      } else if (mn === 'ADBE Vector Group') {
        var sub = null;
        try { sub = p.property('ADBE Vectors Group'); } catch (e5) { sub = null; }
        walkVectors(sub, onOp, depth + 1);
      } else {
        // Unknown group that still holds children (build differences): recurse.
        var has = 0;
        try { has = p.numProperties; } catch (e6) { has = 0; }
        if (has) walkVectors(p, onOp, depth + 1);
      }
    }
  }

  // True when the layer carries an ENABLED Stroke layer style (frameFX). The
  // sub-group only exists once the style is enabled, so its mere presence — with
  // enabled !== false — means an active Stroke layer style is on the layer.
  function hasStrokeLayerStyle(layer) {
    var styles = null;
    try { styles = layer.property('ADBE Layer Styles'); } catch (e) { styles = null; }
    if (!styles) return false;
    var fx = null;
    try { fx = styles.property('frameFX'); } catch (e2) { fx = null; }
    if (!fx) return false;
    var on = true;
    try { if (fx.enabled === false) on = false; } catch (e3) { on = true; }
    return on;
  }

  function rootVectors(layer) {
    try { return layer.property('ADBE Root Vectors Group'); } catch (e) { return null; }
  }

  // Scan one comp: every shape layer's paints + every layer's Stroke layer style,
  // recursing into precomp sources (cycle-guarded). Mutates `acc`, the running
  // report, so nested comps accumulate into one result.
  function scanComp(comp, acc, seen) {
    acc = acc || { compsScanned: 0, shapeLayers: 0, redPaints: [], strokeLayerStyles: [] };
    seen = seen || {};
    if (!comp) return acc;
    var id = null;
    try { id = comp.id; } catch (e) { id = null; }
    if (id != null) { if (seen[id]) return acc; seen[id] = true; }
    acc.compsScanned++;
    var count = 0;
    try { count = comp.numLayers; } catch (e2) { count = 0; }
    for (var i = 1; i <= count; i++) {
      var layer = null;
      try { layer = comp.layer(i); } catch (e3) { layer = null; }
      if (!layer) continue;
      var name = '';
      try { name = layer.name; } catch (e4) { name = '?'; }

      // (1) the definitive signal: an enabled Stroke layer style.
      if (hasStrokeLayerStyle(layer)) {
        acc.strokeLayerStyles.push({ comp: safeName(comp), layer: name });
      }

      // (2) advisory: shape paints sitting at a red default.
      var root = rootVectors(layer);
      if (root) {
        acc.shapeLayers++;
        walkVectors(root, function (op, kind, col) {
          if (isRedDefault(col)) {
            acc.redPaints.push({ comp: safeName(comp), layer: name, kind: kind, color: col });
          }
        }, 0);
      }

      // Recurse into a precomp source so nested frames are covered too.
      var src = null;
      try { src = layer.source; } catch (e5) { src = null; }
      if (src && isComp(src)) scanComp(src, acc, seen);
    }
    return acc;
  }

  function isComp(item) {
    try { return item instanceof CompItem; } catch (e) {
      // In a test harness CompItem may be undefined; fall back to a duck check.
      return !!(item && typeof item.numLayers === 'number' && item.layer);
    }
  }
  function safeName(comp) { try { return comp.name; } catch (e) { return '?'; } }

  // The pass/fail verdict is the unambiguous one: zero enabled Stroke layer
  // styles across every scanned comp. Red paints are advisory context.
  function verdict(acc) {
    return {
      clean: acc.strokeLayerStyles.length === 0,
      compsScanned: acc.compsScanned,
      shapeLayers: acc.shapeLayers,
      strokeLayerStyles: acc.strokeLayerStyles,
      redPaints: acc.redPaints
    };
  }

  // RPC entry: scan the active comp and return the verdict. `args.allComps`
  // scans every comp in the project instead of just the active one.
  function run(args) {
    args = args || {};
    var acc = { compsScanned: 0, shapeLayers: 0, redPaints: [], strokeLayerStyles: [] };
    var seen = {};
    if (args.allComps) {
      var items = app.project.items;
      for (var i = 1; i <= items.length; i++) {
        var it = items[i];
        if (isComp(it)) scanComp(it, acc, seen);
      }
    } else {
      scanComp(util.activeComp(), acc, seen);
    }
    return verdict(acc);
  }

  R.verify = { run: run, scanComp: scanComp, isRedDefault: isRedDefault, verdict: verdict };
  R.register('verify.redScan', run);
})();
