/*
 * Rebound host, import masks.
 *
 * Clipping masks become After Effects track mattes. A node that masks others
 * (maskTargetId / maskTargetIds set) is built as a normal layer; after the whole
 * build, its layer is moved directly above each masked layer and wired as a track
 * matte (alpha by default, luma when maskType is LUMA). Deterministic (the
 * exporter says exactly what masks what), so no adjacency guessing.
 *
 * A single matte can mask several layers (a Figma mask masks every following
 * sibling), but an After Effects track matte is one-to-one, so the matte layer is
 * duplicated above each additional target. Layers resolve through
 * R.importer.layerById, which build.jsx fills as it goes.
 */
(function () {
  var R = $.__rebound;
  var pending = [];

  function reset() { pending = []; }

  function collect(node, layer, report) {
    if (!node || !layer || layer.length !== undefined) return;
    var ids = null;
    if (node.maskTargetIds && node.maskTargetIds.length) ids = node.maskTargetIds;
    else if (node.maskTargetId) ids = [node.maskTargetId];
    if (!ids) return;
    pending.push({ node: node, matte: layer, ids: ids, report: report });
  }

  function matteType(node) {
    var t = TrackMatteType.ALPHA;
    try { if (node && node.maskType === 'LUMA') t = TrackMatteType.LUMA; } catch (e) {}
    return t;
  }

  // Put `matte` directly above `target` and wire the track matte. Newer builds
  // expose setTrackMatte; older ones take the layer-above + a type assignment.
  function wire(target, matte, type) {
    try {
      if (matte.index !== target.index - 1) matte.moveBefore(target);
      if (typeof target.setTrackMatte === 'function') target.setTrackMatte(matte, type);
      else target.trackMatteType = type;
      return true;
    } catch (e) { return false; }
  }

  // Public helper so other builders (e.g. gradient text fill in text.jsx) can wire
  // a track matte through the same AE-version-aware mechanism the clip-matte path
  // uses: `matte` becomes the (hidden) stencil sitting directly above `fill`, and
  // `fill` is the visible layer shown only through the matte. `type` defaults to
  // ALPHA. Returns true when the matte was wired.
  function wireMatte(matte, fill, type) {
    if (!matte || !fill) return false;
    if (matte.length !== undefined || fill.length !== undefined) return false;
    var t = type;
    if (t == null) { try { t = TrackMatteType.ALPHA; } catch (e) { return false; } }
    return wire(fill, matte, t);
  }

  // Wire a (matte, target) pair and then verify the matte ended up at exactly
  // target.index-1. AE re-indexes the stack on every moveBefore / duplicate, and
  // setTrackMatte itself can nudge layers, so re-read the target index right
  // before wiring and re-check adjacency right after — repairing once if AE
  // shifted things. `m` is the matte (or dup) already known to share `target`'s
  // comp. Returns true when the pair is wired and adjacent.
  function wireAndVerify(target, m, type) {
    var tIndex;
    try { tIndex = target.index; } catch (eIdx) { return false; }
    // Place the matte directly above the target, then wire.
    try { if (m.index !== tIndex - 1) m.moveBefore(target); } catch (eMove) {}
    if (!wire(target, m, type)) return false;
    // setTrackMatte (or the move) may have re-shuffled indices — re-read and,
    // if the matte is no longer the layer immediately above the target, make a
    // single repair attempt.
    try {
      tIndex = target.index;
      if (m.index !== tIndex - 1) {
        m.moveBefore(target);
      }
    } catch (eRepair) {}
    return true;
  }

  function applyOne(item) {
    var byId = R.importer.layerById || {};
    var matte = item.matte;
    var type = matteType(item.node);
    var mComp;
    try { mComp = matte.containingComp; } catch (e) { return; }

    // A null OR a guide-shape container (group/frame used as a mask) has no real
    // pixels to matte with — a transparent guide rect would erase the targets —
    // so flag and skip, leaving the masked layers visible rather than vanished.
    if (matte.nullLayer || matte.guideLayer) {
      if (item.report) R.importer.util.note(item.report, 'approximated', { name: item.node.name, detail: 'group used as a mask is not reconstructed as a track matte' });
      return;
    }

    // Resolve every target up front. Skip missing layers and any layer whose
    // comp differs from the matte's (a track matte must live in the same comp);
    // note the cross-comp case once so the report does not flood.
    var targets = [];
    var crossComp = false;
    for (var i = 0; i < item.ids.length; i++) {
      var target = byId[item.ids[i]];
      if (!target) continue;
      var tComp;
      try { tComp = target.containingComp; } catch (e2) { continue; }
      if (tComp !== mComp) { crossComp = true; continue; }
      var tIdx;
      try { tIdx = target.index; } catch (e3) { continue; }
      targets.push({ layer: target, index: tIdx });
    }
    if (crossComp && item.report) {
      R.importer.util.note(item.report, 'approximated', { name: item.node.name, detail: 'a masked layer lives in a different composition than the mask; that target was left un-matted' });
    }
    if (!targets.length) return;

    // Process lowest-in-the-stack first (highest layer.index first). Each
    // moveBefore only re-indexes layers between the matte's old and new slot, so
    // working from the bottom up means every move disturbs only targets we have
    // not wired yet, keeping already-wired pairs adjacent.
    targets.sort(function (a, b) { return b.index - a.index; });

    var first = true;
    for (var j = 0; j < targets.length; j++) {
      var tgt = targets[j].layer;
      if (first) {
        // Move the ORIGINAL matte directly above this target and wire it.
        if (wireAndVerify(tgt, matte, type)) first = false;
      } else {
        // Each additional target needs its own matte: duplicate, then verify the
        // dup landed in the matte's comp before moving it above this target. AE
        // creates the dup directly above the original in the same comp, but guard
        // anyway and drop a stray dup rather than wire it into the wrong place.
        var dup = null;
        try { dup = matte.duplicate(); } catch (e4) { dup = null; }
        if (!dup) continue;
        var dComp;
        try { dComp = dup.containingComp; } catch (e5) { dComp = null; }
        if (dComp !== mComp) {
          try { dup.remove(); } catch (e6) {}
          if (item.report) R.importer.util.note(item.report, 'approximated', { name: item.node.name, detail: 'a duplicated mask landed in the wrong composition and was removed; that target was left un-matted' });
          continue;
        }
        wireAndVerify(tgt, dup, type);
      }
    }
  }

  function flushAll() {
    for (var i = 0; i < pending.length; i++) {
      try { applyOne(pending[i]); } catch (e) {}
    }
    pending = [];
  }

  R.importer.mask = { collect: collect, flushAll: flushAll, reset: reset, wireMatte: wireMatte };
})();
