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

  function applyOne(item) {
    var byId = R.importer.layerById || {};
    var matte = item.matte;
    var type = matteType(item.node);
    var mComp;
    try { mComp = matte.containingComp; } catch (e) { return; }

    // A null (group used as a mask) has no pixels to matte; flag and skip.
    if (matte.nullLayer) {
      if (item.report) R.importer.util.note(item.report, 'approximated', { name: item.node.name, detail: 'group used as a mask is not reconstructed as a track matte' });
      return;
    }

    var first = true;
    for (var i = 0; i < item.ids.length; i++) {
      var target = byId[item.ids[i]];
      if (!target) continue;
      var tComp;
      try { tComp = target.containingComp; } catch (e2) { continue; }
      if (tComp !== mComp) continue;
      if (first) {
        if (wire(target, matte, type)) first = false;
      } else {
        var dup = null;
        try { dup = matte.duplicate(); } catch (e3) { dup = null; }
        if (dup) wire(target, dup, type);
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
