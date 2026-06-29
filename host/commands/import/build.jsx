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
      // Nulls and guide-shape containers (nested groups/frames) do not propagate
      // opacity to their parented children, so flag them rather than multiply.
      if (layer.nullLayer || layer.guideLayer) { flagged = true; continue; }
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
    var t = node.transform || {};
    var gw = t.width || 0, gh = t.height || 0;
    var container;
    if (gw > 0 && gh > 0) {
      // A sized guide shape layer covers the group's bounds (a null cannot be
      // resized). Centre the anchor and sit it on the group's own origin
      // (children carry frame-local coords, so it is a handle, not a transform).
      // Set transform BEFORE parenting so AE's re-parent counterbalance keeps
      // children put; the frame-level shiftLayer moves the whole group later.
      container = addGuideContainer(comp, node.name || 'Group', gw, gh);
      try {
        var trg = container.property(util.MATCH.transform);
        trg.property(util.MATCH.anchor).setValue([gw / 2, gh / 2]);
        trg.property(util.MATCH.position).setValue([(t.x || 0) + gw / 2, (t.y || 0) + gh / 2]);
      } catch (eT) {}
    } else {
      // Degenerate group (no size): keep the old identity-null handle so it works.
      container = comp.layers.addNull();
      try { container.name = node.name || 'Group'; } catch (eN) {}
      placeNull(container, t.x || 0, t.y || 0);
    }
    for (var i = 0; i < made.length; i++) {
      try { made[i].parent = container; } catch (e) { /* some layers reject parenting */ }
    }
    applyGroupOpacity(made, node, report);
    flagGroupExtras(node, report);
    return container;
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

  // Does a frame's content spill past its bounds? A heuristic over each direct
  // child's axis-aligned transform box (frame-local). It is exact for the common
  // case and intentionally conservative; it can miss a rotated child whose rotated
  // bbox pokes out (unrotated box used) or a non-clipping nested frame whose own
  // content overflows. Used only to decide whether a CLIPPING frame needs a precomp
  // (so a clipping frame whose content fits stays a flat editable group); a missed
  // case just leaves a little overflow visible rather than breaking anything.
  function frameContentOverflows(node) {
    var kids = node.children || [];
    var fw = node.width || (node.transform && node.transform.width) || 0;
    var fh = node.height || (node.transform && node.transform.height) || 0;
    if (!fw || !fh || !kids.length) return false;
    var eps = 0.5;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (!c || c.visible === false) continue;
      var t = c.transform || {};
      var x = t.x || 0, y = t.y || 0, w = t.width || 0, h = t.height || 0;
      if (x < -eps || y < -eps || (x + w) > fw + eps || (y + h) > fh + eps) return true;
    }
    return false;
  }

  // Clip 1:1 with Figma: only a frame whose clipsContent is ON AND whose content
  // overflows needs clipping (and clipping in AE needs a comp boundary). A frame
  // that does not clip in Figma is never clipped here.
  function frameShouldClip(node) {
    return !!node.clipsContent && frameContentOverflows(node);
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
  function buildNestedFrame(comp, node, report, baseX, baseY, childOffset) {
    var fps = 30, dur = 10, par = 1;
    try { fps = comp.frameRate; dur = comp.duration; par = comp.pixelAspect; } catch (e) {}
    var w = Math.max(1, Math.round(node.width || (node.transform && node.transform.width) || 100));
    var h = Math.max(1, Math.round(node.height || (node.transform && node.transform.height) || 100));

    var inner = app.project.items.addComp(node.name || 'Frame', w, h, par, dur, fps);
    if (node.background && node.background.length) buildFrameBackground(inner, node, report);
    buildChildren(inner, node.children || [], report);
    // A GROUP's children carry FRAME-local coords (not group-local), so when a
    // group is precomped (used as a mask) the inner content sits offset by the
    // group's own origin. Slide every root layer back into the group's own space
    // (parented children follow their root). Frames don't need this — their
    // children are already re-based to the frame's own origin by the exporter.
    if (childOffset && (childOffset.x || childOffset.y)) {
      for (var li = 1; li <= inner.numLayers; li++) {
        var L = inner.layer(li);
        try { if (L.parent == null) shiftLayer(L, -childOffset.x, -childOffset.y); } catch (eShift) {}
      }
    }
    report.framesBuilt++;

    var pcLayer = comp.layers.add(inner);
    // Place at an explicit comp position when given (a clipping top-level frame),
    // otherwise at the node's own local origin (a nested frame).
    if (typeof baseX === 'number' && typeof baseY === 'number') {
      try {
        var ptr = pcLayer.property(util.MATCH.transform);
        ptr.property(util.MATCH.anchor).setValue([0, 0]);
        ptr.property(util.MATCH.position).setValue([baseX, baseY]);
      } catch (eP) {}
    } else {
      placeLocal(pcLayer, node);
    }
    decorateFrameLayer(pcLayer, node, report);
    clipPrecompLayer(pcLayer, node);
    return pcLayer;
  }

  // ---- flat build (Overlord / AEUX default: one comp, frames as groups) ----

  // A frame needs a visible background card only if it actually paints something:
  // a fill, a visible border, or a frame-level effect. Corners alone are invisible.
  function frameHasChrome(node) {
    if (node.background && node.background.length) return true;
    var st = node.stroke;
    if (st && st.paints) {
      for (var i = 0; i < st.paints.length; i++) { if (st.paints[i] && st.paints[i].visible !== false) return true; }
    }
    if (node.effects && node.effects.length) return true;
    return false;
  }

  // The frame's chrome as a real shape layer (rounded rect + fills + border +
  // shadow), built at the frame's local origin and reused through buildShapeNode
  // so gradients / strokes / effects land exactly like any other shape.
  function buildFrameChrome(comp, node, report) {
    var w = Math.max(1, Math.round(node.width || (node.transform && node.transform.width) || 100));
    var h = Math.max(1, Math.round(node.height || (node.transform && node.transform.height) || 100));
    var chromeNode = {
      name: (node.name || 'Frame') + ' BG',
      type: 'RECTANGLE',
      transform: { x: 0, y: 0, width: w, height: h },
      primitive: { rect: { size: [w, h], roundness: 0 } },
      cornerRadii: node.cornerRadii || null,
      fills: node.background || [],
      stroke: (node.stroke && node.stroke.paints && node.stroke.paints.length) ? node.stroke : null,
      effects: node.effects || []
    };
    return R.importer.buildShapeNode(comp, chromeNode, report);
  }

  // Add (dx,dy) to a layer's position — moves the layer (and, for a null, every
  // layer parented to it) by that delta. Used to slide a group/frame's content
  // from its built local space into its place in the comp.
  function shiftLayer(layer, dx, dy) {
    if ((!dx && !dy) || !layer || layer.length !== undefined) return;
    try {
      var pos = layer.property(util.MATCH.transform).property(util.MATCH.position);
      var p = pos.value;
      pos.setValue([p[0] + dx, p[1] + dy]);
    } catch (e) { /* position rig varies */ }
  }

  // Sit a group/frame null right on its content (anchor at the node's top-left),
  // instead of leaving it at the comp centre where it reads as "detached". Set
  // BEFORE parenting children so AE's re-parent counterbalance keeps them put.
  function placeNull(nul, x, y) {
    try {
      var tr = nul.property(util.MATCH.transform);
      tr.property(util.MATCH.anchor).setValue([0, 0]);
      tr.property(util.MATCH.position).setValue([x || 0, y || 0]);
    } catch (e) { /* position rig varies */ }
  }

  // A frame/group container as an INVISIBLE sized shape layer (not a null): a null
  // cannot be resized, so a wide frame would collapse to a 100x100 corner square.
  // This shape is sized to the node bounds so its selection box covers the whole
  // group and it parents the children (move them together) — but it draws NOTHING
  // (a fully transparent fill, no stroke), matching a Figma group/frame that has
  // no background or border. Its only role is bounds + a parent handle. A frame
  // that DOES have a fill/border/shadow gets that real card via buildFrameChrome,
  // separately. Marked as a guide layer so it never renders to output either.
  function addGuideContainer(comp, name, w, h) {
    var sl = comp.layers.addShape();
    try { sl.name = name || 'Frame'; } catch (eN) {}
    try {
      var contents = sl.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').property('ADBE Vectors Group');
      var rect = contents.addProperty('ADBE Vector Shape - Rect');
      try { rect.property('ADBE Vector Rect Size').setValue([w, h]); } catch (eS) {}
      try { rect.property('ADBE Vector Rect Position').setValue([w / 2, h / 2]); } catch (eP) {}
      // A fully transparent fill (no stroke): the layer has the frame's bounds for
      // selection/parenting but renders nothing — no fake outline or background.
      try {
        var fill = contents.addProperty('ADBE Vector Graphic - Fill');
        try { fill.property('ADBE Vector Fill Opacity').setValue(0); } catch (eFo) {}
      } catch (eF) {}
    } catch (eC) { /* shape contents vary by build */ }
    // A guide layer never renders to output; keep it un-shy so it stays visible in
    // the timeline as the group's handle.
    try { sl.guideLayer = true; } catch (eG) {}
    try { sl.shy = false; } catch (eSh) {}
    return sl;
  }

  // Frame opacity has nowhere to live on a null (parenting does not inherit it),
  // so fold it into each child, exactly like group opacity.
  function applyFrameFlatOpacity(made, chrome, node, report) {
    if (typeof node.opacity !== 'number' || node.opacity >= 1) return;
    var layers = made.slice();
    if (chrome) layers.push(chrome);
    var flagged = false;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer) continue;
      // Nulls and guide-shape containers do not propagate opacity to their
      // parented children, so flag them rather than apply a meaningless multiply.
      if (layer.nullLayer || layer.guideLayer) { flagged = true; continue; }
      try { var op = layer.property(util.MATCH.transform).property(util.MATCH.opacity); op.setValue(op.value * node.opacity); }
      catch (e) { flagged = true; }
    }
    if (flagged) note(report, 'approximated', { name: node.name, detail: 'frame opacity on nested groups is not exact' });
  }

  // Build a frame as a group in the CURRENT comp: a background card (if any), its
  // children, and a null that owns them, positioned by (dx,dy). No precomp, no
  // clip — everything stays in one editable comp (the Overlord/AEUX default).
  function buildFrameFlat(comp, node, baseX, baseY, report) {
    // Chrome first so it sits at the bottom of the group, then children above it.
    var chrome = frameHasChrome(node) ? buildFrameChrome(comp, node, report) : null;
    var made = buildChildren(comp, node.children || [], report);
    if (!made.length && !chrome) return null;

    // Children build in this frame's local space; slide them (and the chrome) to
    // the frame's place in the comp, then sit the container right on top of them.
    if (chrome) shiftLayer(chrome, baseX, baseY);
    for (var i = 0; i < made.length; i++) shiftLayer(made[i], baseX, baseY);

    // A sized guide shape layer covers the frame's bounds (a null cannot be
    // resized, so a wide frame would collapse to a 100x100 corner square). Size
    // it like the chrome; centre the anchor and place it over the slid content.
    // Set transform BEFORE parenting so AE's re-parent counterbalance keeps the
    // children put.
    var w = Math.max(1, Math.round(node.width || (node.transform && node.transform.width) || 100));
    var h = Math.max(1, Math.round(node.height || (node.transform && node.transform.height) || 100));
    var container = addGuideContainer(comp, node.name || 'Frame', w, h);
    try {
      var trc = container.property(util.MATCH.transform);
      trc.property(util.MATCH.anchor).setValue([w / 2, h / 2]);
      trc.property(util.MATCH.position).setValue([baseX + w / 2, baseY + h / 2]);
    } catch (eT) {}
    if (chrome) { try { chrome.parent = container; } catch (e) {} }
    for (var j = 0; j < made.length; j++) { try { made[j].parent = container; } catch (e2) {} }

    applyFrameFlatOpacity(made, chrome, node, report);
    if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
      note(report, 'approximated', { name: node.name, detail: 'frame blend mode is applied per layer, not as a group' });
    }
    // No clip note here: a clipping frame whose content overflows is routed to a
    // precomp (which clips) before it ever reaches buildFrameFlat, so a frame that
    // lands here either does not clip or has nothing overflowing to clip.
    report.framesBuilt++;
    return container;
  }

  // Top-level frames place into ONE comp; (px,py) is where the selection's
  // top-left lands, then each frame keeps its position relative to the others.
  function buildTopFrameFlat(comp, frame, origin, px, py, report) {
    var off = frame.offset || { x: 0, y: 0 };
    var baseX = px + (off.x - origin.x), baseY = py + (off.y - origin.y);
    // A clipping top-level frame whose content overflows is clipped 1:1 by building
    // it as a precomp placed at its comp position; everything else stays flat.
    if (frameShouldClip(frame)) {
      var pc;
      try { pc = buildNestedFrame(comp, frame, report, baseX, baseY); }
      catch (e) { pc = buildFrameFlat(comp, frame, baseX, baseY, report); }
      registerLayer(frame, pc);
      if (R.importer.mask) R.importer.mask.collect(frame, pc, report);
      return pc;
    }
    return buildFrameFlat(comp, frame, baseX, baseY, report);
  }

  // Union of all top-level frames in canvas space, for sizing the one new comp.
  function framesBounds(frames) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      var off = f.offset || { x: 0, y: 0 };
      var w = f.width || 100, h = f.height || 100;
      if (off.x < minX) minX = off.x;
      if (off.y < minY) minY = off.y;
      if (off.x + w > maxX) maxX = off.x + w;
      if (off.y + h > maxY) maxY = off.y + h;
    }
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    return { x: minX, y: minY, w: Math.max(1, Math.round(maxX - minX)), h: Math.max(1, Math.round(maxY - minY)) };
  }

  function buildNode(comp, node, report) {
    if (!node || node.visible === false) return null;
    if (node.type === 'FRAME') {
      var result;
      var tx = (node.transform && node.transform.x) || 0;
      var ty = (node.transform && node.transform.y) || 0;
      // A precomp is the faithful tool when: the user opted into precomp frames;
      // the frame is used as a mask (a track matte needs one pixel layer); or it
      // clips AND its content overflows (so a non-clipping frame is never precomped).
      var needPrecomp = (R.importer.opts && R.importer.opts.precompFrames && frameWantsPrecomp(node)) ||
        node.isMask || frameShouldClip(node);
      if (needPrecomp) {
        try {
          result = buildNestedFrame(comp, node, report);
        } catch (e) {
          note(report, 'approximated', { name: node.name, detail: 'nested frame fell back to a group' });
          result = buildFrameFlat(comp, node, tx, ty, report);
        }
      } else {
        result = buildFrameFlat(comp, node, tx, ty, report);
      }
      registerLayer(node, result);
      if (R.importer.mask) R.importer.mask.collect(node, result, report);
      return result;
    }
    if (node.type === 'GROUP') {
      var gresult;
      // A group used as a mask needs a single pixel layer to matte with -> precomp;
      // otherwise it stays a flat editable group.
      if (node.isMask) {
        // Re-base the group's frame-local children into group-local space inside
        // the precomp (see buildNestedFrame childOffset), so the matte silhouette
        // lands where the group actually is.
        var goff = { x: (node.transform && node.transform.x) || 0, y: (node.transform && node.transform.y) || 0 };
        try { gresult = buildNestedFrame(comp, node, report, undefined, undefined, goff); }
        catch (eg) { gresult = buildGroup(comp, node, report); }
      } else {
        gresult = buildGroup(comp, node, report);
      }
      registerLayer(node, gresult);
      if (R.importer.mask) R.importer.mask.collect(node, gresult, report);
      return gresult;
    }
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
    // Import options (panel-side). Default is the Overlord/AEUX flat build: one
    // comp, frames as groups. precompFrames restores trimmed precomp-per-frame.
    var opts = ir.options || {};
    R.importer.opts = {
      precompFrames: !!opts.precompFrames,
      importToActiveComp: opts.importToActiveComp !== false // default true
    };
    if (R.importer.layerStyle) R.importer.layerStyle.reset();
    if (R.importer.mask) R.importer.mask.reset();

    var active = app.project ? app.project.activeItem : null;
    // Honor the "use active composition" toggle: when off, never reuse the active
    // comp — the flat branch then always makes a new comp, the precomp branch
    // leaves the frame comps loose in the project.
    var useActive = R.importer.opts.importToActiveComp;
    var target = (useActive && active && util.isComp(active)) ? active : null;
    var frames = ir.document.frames;

    if (R.importer.opts.precompFrames) {
      // Opt-in: each top-level frame is its own trimmed comp, nested into the
      // active comp as a precomp layer when one is open.
      for (var i = 0; i < frames.length; i++) buildFrame(target, frames[i], report);
    } else {
      // Default flat build: drop everything into ONE comp as editable layers.
      // Use the active comp if there is one, else create a single comp sized to
      // the selection. A new comp is sized to the art (top-left at origin); an
      // existing comp gets the art centred so the import is immediately visible.
      var bounds = framesBounds(frames);
      var comp = target;
      var px = 0, py = 0;
      if (!comp) {
        var name = (frames.length === 1 && frames[0].name) || (ir.document && ir.document.name) || 'Import';
        comp = app.project.items.addComp(name, bounds.w, bounds.h, 1, 10, 30);
      } else {
        px = Math.round((comp.width - bounds.w) / 2);
        py = Math.round((comp.height - bounds.h) / 2);
      }
      for (var k = 0; k < frames.length; k++) buildTopFrameFlat(comp, frames[k], bounds, px, py, report);
      report.placedInComp = !!target;
      target = comp;
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
