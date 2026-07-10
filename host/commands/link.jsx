/*
 * Rebound host, Link (quick pick-whip parenting for the selection).
 *
 * apply: requires two or more selected layers; chooses the parent as either the
 * first or last layer in the selection and sets every other selected layer's
 * parent to it. unlink: clears the parent of each selected layer.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || selected.length < 2) throw new Error('Select two or more layers to link.');

    // Snapshot the selection before mutating parents.
    var layers = [];
    for (var i = 0; i < selected.length; i++) layers.push(selected[i]);

    var parent = (args && args.target === 'first')
      ? layers[0]
      : layers[layers.length - 1];

    var linked = 0;
    var skipped = [];
    for (var k = 0; k < layers.length; k++) {
      var layer = layers[k];
      if (layer === parent) continue;
      // Parenting the chosen parent's own ancestor would create a cycle; AE
      // throws its raw error mid-loop. Walk up the parent chain and skip any
      // selected layer that appears in it (guarded against corrupt chains).
      var anc = parent.parent;
      var loop = false;
      var guard = 0;
      while (anc && guard < 1000) {
        if (anc === layer) { loop = true; break; }
        anc = anc.parent;
        guard++;
      }
      if (loop) { skipped.push(layer.name + ' (would create a loop)'); continue; }
      layer.parent = parent;
      linked++;
    }

    return { linked: linked, skipped: skipped };
  }

  function unlink() {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || !selected.length) throw new Error('Select one or more layers to unlink.');

    var layers = [];
    for (var i = 0; i < selected.length; i++) layers.push(selected[i]);

    var unlinked = 0;
    for (var k = 0; k < layers.length; k++) {
      layers[k].parent = null;
      unlinked++;
    }

    return { unlinked: unlinked };
  }

  R.register('link.apply', apply, 'Rebound: Link');
  R.register('link.unlink', unlink, 'Rebound: Unlink');
})();