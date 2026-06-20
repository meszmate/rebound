/*
 * Rebound host, Precompose (nest the selected layers into a new comp).
 *
 * Collects the 1-based indices of the selected layers and hands them to
 * comp.layers.precompose with the requested name and "move all attributes"
 * flag. With moveAttributes off the layers are wrapped without lifting their
 * transforms (only valid when a single layer is selected, which AE enforces).
 * When asked, the freshly created comp is brought up in a viewer.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || !selected.length) {
      throw new Error('Select one or more layers to precompose.');
    }

    var indices = [];
    for (var i = 0; i < selected.length; i++) {
      indices.push(selected[i].index);
    }

    var name = (args.name == null || args.name === '') ? 'Precomp' : '' + args.name;
    var moveAttributes = !!args.moveAttributes;

    var newComp = comp.layers.precompose(indices, name, moveAttributes);

    if (args.open && newComp) {
      newComp.openInViewer();
    }

    return { created: 1, name: newComp ? newComp.name : name };
  }

  R.register('precompose.apply', apply, 'Rebound: Precompose');
})();
