/*
 * Rebound host, import builder (entry).
 *
 * Walks a Rebound IR document and reconstructs it as native After Effects
 * layers inside a single undo group. Each frame becomes a CompItem; if a
 * composition is active, the frame comps are dropped into it as precomp layers,
 * otherwise they are left in the project for the user to place.
 *
 * This is the Phase 1 skeleton: it stands up the whole bridge (transport ->
 * validate -> build -> report) and renders solid rectangles and frame
 * backgrounds end to end. Later phases register richer node builders on
 * $.__rebound.importer; this entry dispatches to whatever is registered and
 * records anything it cannot yet build in the fidelity report.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // Shared namespace later phases extend with node builders, keyed by IR type.
  R.importer = R.importer || {};
  var builders = R.importer.builders || (R.importer.builders = {});

  // ---- report --------------------------------------------------------------

  function newReport() {
    return {
      framesBuilt: 0,
      layersBuilt: 0,
      skipped: [],      // { name, type, reason }
      approximated: [], // { name, detail }
      missingFonts: [], // family names
      warnings: [],
      errors: [],
      placedInComp: false
    };
  }

  function note(report, list, entry) {
    // Cap the lists so a huge document cannot produce a runaway report.
    if (report[list].length < 500) report[list].push(entry);
  }

  // ---- helpers (shared with later phases via R.importer) -------------------

  function colorToAE(c) { return R.ir.N.colorToAE(c); }

  function firstVisible(paints, type) {
    if (!paints) return null;
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i];
      if (!p || p.visible === false) continue;
      if (!type || p.type === type) return p;
    }
    return null;
  }

  function uniformRadius(radii) {
    if (!radii) return 0;
    var tl = radii.topLeft || 0, tr = radii.topRight || 0, br = radii.bottomRight || 0, bl = radii.bottomLeft || 0;
    if (tl === tr && tr === br && br === bl) return tl;
    return tl; // non-uniform corners are refined in a later phase
  }

  // Place a layer so its content origin (the node's top-left) lands at the
  // node's position in comp space. Geometry is built in node-local coords, so
  // anchor [0,0] + position [x,y] reproduces the source placement exactly.
  function placeLocal(layer, node) {
    var t = node.transform || {};
    var tr = layer.property(util.MATCH.transform);
    tr.property(util.MATCH.anchor).setValue([0, 0]);
    tr.property(util.MATCH.position).setValue([t.x || 0, t.y || 0]);
    if (typeof node.opacity === 'number' && node.opacity < 1) {
      tr.property(util.MATCH.opacity).setValue(node.opacity * 100);
    }
  }

  R.importer.util = {
    colorToAE: colorToAE,
    firstVisible: firstVisible,
    uniformRadius: uniformRadius,
    placeLocal: placeLocal,
    note: note
  };

  // Node builders (RECTANGLE, ELLIPSE, VECTOR, BOOLEAN, ...) register themselves
  // on R.importer.builders from import/shape.jsx and import/text.jsx, which load
  // after this file.

  // ---- node + frame walk ---------------------------------------------------

  // Map a node id to its created layer, so clipping masks can resolve targets.
  function registerLayer(node, layer) {
    if (!layer || layer.length !== undefined || !node || !node.id) return;
    if (!R.importer.layerById) R.importer.layerById = {};
    R.importer.layerById[node.id] = layer;
  }

  // Accumulate created layers (a builder may return one layer or an array).
  function collect(into, result) {
    if (!result) return;
    if (result.length !== undefined) {
      for (var i = 0; i < result.length; i++) { if (result[i]) into.push(result[i]); }
    } else {
      into.push(result);
    }
  }

  function buildChildren(comp, children, report) {
    var made = [];
    for (var i = 0; i < children.length; i++) collect(made, buildNode(comp, children[i], report));
    return made;
  }

  // Preserve the source hierarchy with a named null. Because IR child transforms
  // are absolute within the frame, the group transform is already baked into the
  // children, so the null is an identity handle. Group-level opacity / blend /
  // effects need a precomp; flag them until that build lands.
  // Group opacity, applied per child, is exact for non-overlapping content (the
  // common case) and a close approximation otherwise. Nulls (nested groups) do
  // not propagate opacity, so those are flagged instead.
  function applyGroupOpacity(made, node, report) {
    if (typeof node.opacity !== 'number' || node.opacity >= 1) return;
    var flagged = false;
    for (var i = 0; i < made.length; i++) {
      var layer = made[i];
      if (!layer) continue;
      if (layer.nullLayer) { flagged = true; continue; }
      try {
        var op = layer.property(util.MATCH.transform).property(util.MATCH.opacity);
        op.setValue(op.value * node.opacity);
      } catch (e) { flagged = true; }
    }
    if (flagged) note(report, 'approximated', { name: node.name, detail: 'group opacity on nested groups is not exact' });
  }

  function buildGroup(comp, node, report) {
    var made = buildChildren(comp, node.children || [], report);
    if (!made.length) return null;
    var nul = comp.layers.addNull();
    nul.name = node.name || 'Group';
    for (var i = 0; i < made.length; i++) {
      try { made[i].parent = nul; } catch (e) { /* some layers reject parenting */ }
    }
    applyGroupOpacity(made, node, report);
    flagGroupExtras(node, report);
    return nul;
  }

  function flagGroupExtras(node, report) {
    if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
      note(report, 'approximated', { name: node.name, detail: 'group blend mode is applied per layer, not as a group' });
    }
    if (node.effects && node.effects.length) {
      note(report, 'approximated', { name: node.name, detail: 'group-level effects are not applied to the group as a whole' });
    }
    if (node.isMask) {
      note(report, 'skipped', { name: node.name, type: 'MASK', reason: 'group-level masking is not reconstructed' });
    }
    if (node.clipsContent) {
      note(report, 'approximated', { name: node.name, detail: 'group clipping needs a precomp; overflow is not clipped on a null group' });
    }
  }

  // A nested frame is its own world: build it as a real precomp (a CompItem) so
  // its clipping, background, rounded corners and chrome survive, then place that
  // precomp as a layer in the parent comp. Frames whose buildMode is GROUP (no
  // clip, no chrome to preserve) stay flat nulls via buildGroup, which is cheaper
  // and keeps existing simple-group imports unchanged. A clipping frame defaults
  // to PRECOMP; a non-clipping one with no chrome can fall back to a null group.
  function frameWantsPrecomp(node) {
    if (node.buildMode === 'GROUP') return false;
    if (node.buildMode === 'PRECOMP') return true;
    // No explicit mode: a clip, a background, corners or frame chrome needs a comp.
    if (node.clipsContent) return true;
    if (node.background && node.background.length) return true;
    if (node.cornerRadii) return true;
    if (node.stroke && node.stroke.weight) return true;
    if (node.effects && node.effects.length) return true;
    return false;
  }

  // Clip a precomp layer to its comp bounds (or rounded corners) so overflowing
  // children are hidden, matching a Figma frame's clipsContent. roundFrameCorners
  // already adds a rounded mask when cornerRadii are present; only add a plain
  // comp-sized rectangular mask when the frame clips but has no corner rounding.
  function clipPrecompLayer(pcLayer, frame) {
    if (!frame.clipsContent) return;
    var cr = frame.cornerRadii;
    if (cr && (cr.topLeft || cr.topRight || cr.bottomRight || cr.bottomLeft)) return; // rounded mask clips already
    try {
      // Nested frames size only via transform; fall back so the clip matches.
      var w = Math.max(1, Math.round(frame.width || (frame.transform && frame.transform.width) || 100));
      var h = Math.max(1, Math.round(frame.height || (frame.transform && frame.transform.height) || 100));
      var sp = R.importer.geometry.roundedRect(w, h, { tl: 0, tr: 0, br: 0, bl: 0 });
      var masks = pcLayer.property('ADBE Mask Parade');
      var mask = masks.addProperty('ADBE Mask Atom');
      mask.property('ADBE Mask Shape').setValue(shapeFromSubpath(sp));
    } catch (e) { /* masks vary by build */ }
  }

  // Build the nested frame's own CompItem, fill its background and recurse its
  // children into it, then drop it into the parent comp as a precomp layer and
  // decorate it (shadow/border/rounded/clip) just like a top-level frame.
  function buildNestedFrame(comp, node, report) {
    var fps = 30, dur = 10, par = 1;
    try { fps = comp.frameRate; dur = comp.duration; par = comp.pixelAspect; } catch (e) {}
    var w = Math.max(1, Math.round(node.width || (node.transform && node.transform.width) || 100));
    var h = Math.max(1, Math.round(node.height || (node.transform && node.transform.height) || 100));

    var inner = app.project.items.addComp(node.name || 'Frame', w, h, par, dur, fps);
    if (node.background && node.background.length) buildFrameBackground(inner, node, report);
    buildChildren(inner, node.children || [], report);
    report.framesBuilt++;

    var pcLayer = comp.layers.add(inner);
    placeLocal(pcLayer, node);
    decorateFrameLayer(pcLayer, node, report);
    clipPrecompLayer(pcLayer, node);
    return pcLayer;
  }

  function buildNode(comp, node, report) {
    if (!node || node.visible === false) return null;
    if (node.type === 'FRAME' && frameWantsPrecomp(node)) {
      try {
        var fl = buildNestedFrame(comp, node, report);
        registerLayer(node, fl);
        if (R.importer.mask) R.importer.mask.collect(node, fl, report);
        return fl;
      } catch (e) {
        // Never let a nested-frame failure lose the content: fall back to a group.
        note(report, 'approximated', { name: node.name, detail: 'nested frame fell back to a group' });
        return buildGroup(comp, node, report);
      }
    }
    if (node.type === 'GROUP' || node.type === 'FRAME') return buildGroup(comp, node, report);
    var builder = builders[node.type];
    if (builder) {
      try {
        var layer = builder(comp, node, report);
        registerLayer(node, layer);
        if (R.importer.mask) R.importer.mask.collect(node, layer, report);
        return layer;
      } catch (e) {
        note(report, 'skipped', { name: node.name, type: node.type, reason: (e && e.message) || 'build failed' });
        return null;
      }
    }
    note(report, 'skipped', { name: node.name, type: node.type, reason: 'not yet supported by this build' });
    // Still descend into containers so their children are not lost.
    if (node.children && node.children.length) return buildChildren(comp, node.children, report);
    return null;
  }

  // One comp-sized shape per background paint, reusing the proven fill path so a
  // gradient frame background lands with the right direction (not just solids).
  function addBackgroundShape(comp, frame, paint, report) {
    var sl = comp.layers.addShape();
    sl.name = (frame.name || 'Frame') + ' BG';
    var tr = sl.property(util.MATCH.transform);
    tr.property(util.MATCH.anchor).setValue([0, 0]);
    tr.property(util.MATCH.position).setValue([0, 0]);
    var contents = sl.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').property('ADBE Vectors Group');
    var rect = contents.addProperty('ADBE Vector Shape - Rect');
    rect.property('ADBE Vector Rect Size').setValue([comp.width, comp.height]);
    rect.property('ADBE Vector Rect Position').setValue([comp.width / 2, comp.height / 2]);
    var bgNode = { name: sl.name, transform: { width: comp.width, height: comp.height }, fills: [paint] };
    R.importer.paint.applyFills(contents, bgNode, report);
    R.importer.paint.gradientEffect(sl, bgNode, report);
    return sl;
  }

  function buildFrameBackground(comp, frame, report) {
    var bgs = frame.background || [];
    for (var i = 0; i < bgs.length; i++) {
      var p = bgs[i];
      if (!p || p.visible === false) continue;
      if (p.type === 'SOLID') {
        if (p.color) comp.layers.addSolid(colorToAE(p.color), (frame.name || 'Frame') + ' BG', comp.width, comp.height, comp.pixelAspect, comp.duration);
        continue;
      }
      if (p.type === 'IMAGE') {
        note(report, 'approximated', { name: frame.name, detail: 'image frame background not reconstructed' });
        continue;
      }
      try { addBackgroundShape(comp, frame, p, report); } catch (e) { /* shape build varies */ }
    }
  }

  // ---- frame decorations (effects/border/corners on the precomp layer) -----

  // Build an AE Shape from an IR subpath (relative tangents), for a layer mask.
  function shapeFromSubpath(sp) {
    var verts = sp.vertices || [];
    var shape = new Shape();
    var vv = [], it = [], ot = [];
    for (var j = 0; j < verts.length; j++) {
      var v = verts[j];
      vv.push([v.x, v.y]);
      it.push(v.inTangent || [0, 0]);
      ot.push(v.outTangent || [0, 0]);
    }
    shape.vertices = vv;
    shape.inTangents = it;
    shape.outTangents = ot;
    shape.closed = !!sp.closed;
    return shape;
  }

  // A precomp clips its content to a sharp rectangle; round it with a mask so a
  // Figma frame's rounded corners (and rounded clip) survive.
  function roundFrameCorners(pcLayer, frame) {
    var cr = frame.cornerRadii;
    if (!cr) return;
    var tl = cr.topLeft || 0, tr = cr.topRight || 0, br = cr.bottomRight || 0, bl = cr.bottomLeft || 0;
    if (!(tl || tr || br || bl)) return;
    try {
      // Nested-frame nodes carry size only on transform; fall back to it so the
      // mask is sized to the frame, not the 100x100 default (which overhangs).
      var w = Math.max(1, Math.round(frame.width || (frame.transform && frame.transform.width) || 100));
      var h = Math.max(1, Math.round(frame.height || (frame.transform && frame.transform.height) || 100));
      var sp = R.importer.geometry.roundedRect(w, h, { tl: tl, tr: tr, br: br, bl: bl });
      var masks = pcLayer.property('ADBE Mask Parade');
      var mask = masks.addProperty('ADBE Mask Atom');
      mask.property('ADBE Mask Shape').setValue(shapeFromSubpath(sp));
    } catch (e) { /* masks vary by build */ }
  }

  // A node-like object so effect.jsx / layerstyle.jsx can decorate the precomp
  // exactly like any other layer: frame shadow/blur as effects, frame border as a
  // Stroke layer style (any alignment, since a precomp has no shape stroke).
  function frameStyleNode(frame) {
    var node = { name: frame.name || 'Frame', effects: frame.effects || [], stroke: null, layerStyles: [] };
    var st = frame.stroke;
    if (st && st.weight && st.paints && st.paints.length) {
      var p = null;
      for (var i = 0; i < st.paints.length; i++) { if (st.paints[i] && st.paints[i].visible !== false) { p = st.paints[i]; break; } }
      if (p && p.type === 'SOLID') {
        node.layerStyles.push({ type: 'STROKE', size: st.weight, color: p.color, position: st.align || 'CENTER', opacity: (p.opacity != null ? p.opacity : 1) });
      }
    }
    return node;
  }

  function decorateFrameLayer(pcLayer, frame, report) {
    if (!pcLayer || pcLayer.length !== undefined) return;
    if (typeof frame.opacity === 'number' && frame.opacity < 1) {
      try { pcLayer.property(util.MATCH.transform).property(util.MATCH.opacity).setValue(frame.opacity * 100); } catch (e) {}
    }
    if (frame.blendMode && frame.blendMode !== 'NORMAL' && frame.blendMode !== 'PASS_THROUGH') {
      var be = R.importer.transform.blendEnum(frame.blendMode);
      if (be != null) { try { pcLayer.blendingMode = be; } catch (e2) {} }
    }
    roundFrameCorners(pcLayer, frame);
    var styleNode = frameStyleNode(frame);
    if (R.importer.effect) R.importer.effect.apply(pcLayer, styleNode, report);
    if (R.importer.layerStyle) R.importer.layerStyle.collect(pcLayer, styleNode, report);
  }

  function buildFrame(target, frame, report) {
    var fps = target ? target.frameRate : 30;
    var dur = target ? target.duration : 10;
    var par = target ? target.pixelAspect : 1;
    var w = Math.max(1, Math.round(frame.width || 100));
    var h = Math.max(1, Math.round(frame.height || 100));

    var comp = app.project.items.addComp(frame.name || 'Frame', w, h, par, dur, fps);
    if (frame.background && frame.background.length) buildFrameBackground(comp, frame, report);

    buildChildren(comp, frame.children || [], report);

    report.framesBuilt++;

    if (target) {
      var pcLayer = target.layers.add(comp);
      decorateFrameLayer(pcLayer, frame, report);
      report.placedInComp = true;
    }
    return comp;
  }

  function build(ir) {
    var check = R.ir.validate(ir);
    var report = newReport();
    report.warnings = check.warnings || [];
    if (!check.valid) {
      var err = new Error((check.errors || ['Invalid IR.']).join('\n'));
      throw err;
    }

    // Assets (decoded to file paths by the panel) and a per-import footage cache
    // so a reused image is imported only once.
    R.importer.assets = (ir.document && ir.document.assets) || {};
    R.importer.footageCache = {};
    R.importer.layerById = {};
    if (R.importer.layerStyle) R.importer.layerStyle.reset();
    if (R.importer.mask) R.importer.mask.reset();

    var active = app.project ? app.project.activeItem : null;
    var target = (active && util.isComp(active)) ? active : null;

    var frames = ir.document.frames;
    for (var i = 0; i < frames.length; i++) {
      buildFrame(target, frames[i], report);
    }

    // Clipping mattes and layer styles run last (after every layer exists).
    if (R.importer.mask) R.importer.mask.flushAll();
    if (R.importer.layerStyle) R.importer.layerStyle.flushAll();
    if (target) { try { target.openInViewer(); } catch (e) {} }
    return report;
  }

  R.importer.build = build;
  R.register('import.build', build, 'Rebound: Import');
})();
