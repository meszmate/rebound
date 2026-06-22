/*
 * Rebound host, import masks.
 *
 * Clipping masks become After Effects track mattes. A node that clips another
 * (maskTargetId set) is built as a normal layer; after the whole build, its
 * layer is moved directly above the clipped layer and wired as an alpha track
 * matte. Deterministic (the exporter says exactly what clips what), so no
 * adjacency guessing. Layers are resolved through R.importer.layerById, which
 * build.jsx fills as it goes.
 */
(function () {
  var R = $.__rebound;
  var pending = [];

  function reset() { pending = []; }

  function collect(node, layer) {
    if (node && node.maskTargetId && layer && layer.length === undefined) {
      pending.push({ node: node, matte: layer });
    }
  }

  function applyOne(item) {
    var byId = R.importer.layerById || {};
    var target = byId[item.node.maskTargetId];
    var matte = item.matte;
    if (!target || !matte) return;
    var tComp, mComp;
    try { tComp = target.containingComp; mComp = matte.containingComp; } catch (e) { return; }
    if (tComp !== mComp) return;
    try {
      if (matte.index !== target.index - 1) matte.moveBefore(target);
      if (typeof target.setTrackMatte === 'function') {
        target.setTrackMatte(matte, TrackMatteType.ALPHA);
      } else {
        target.trackMatteType = TrackMatteType.ALPHA;
      }
    } catch (e2) { /* track mattes vary by version */ }
  }

  function flushAll() {
    for (var i = 0; i < pending.length; i++) {
      try { applyOne(pending[i]); } catch (e) {}
    }
    pending = [];
  }

  R.importer.mask = { collect: collect, flushAll: flushAll, reset: reset };
})();
