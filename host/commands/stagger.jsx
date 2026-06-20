/*
 * Rebound host, Stagger (cascade selected layers in time).
 *
 * Orders the selected layers by their timeline index (optionally reversed),
 * then shifts each whole layer so its in-point lands one interval after the
 * previous, starting from the playhead or the earliest selected in-point.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || !selected.length) throw new Error('Select one or more layers to stagger.');

    var layers = [];
    for (var i = 0; i < selected.length; i++) layers.push(selected[i]);

    layers.sort(function (a, b) { return a.index - b.index; });
    if (args.reverse) layers.reverse();

    var step = (args.intervalFrames || 0) / comp.frameRate;

    var base;
    if (args.anchor === 'first') {
      base = layers[0].inPoint;
      for (var e = 1; e < layers.length; e++) {
        if (layers[e].inPoint < base) base = layers[e].inPoint;
      }
    } else {
      base = comp.time;
    }

    var staggered = 0;
    for (var k = 0; k < layers.length; k++) {
      var layer = layers[k];
      var targetInPoint = base + k * step;
      var delta = targetInPoint - layer.inPoint;
      layer.startTime += delta;
      staggered++;
    }

    return { staggered: staggered };
  }

  R.register('stagger.apply', apply, 'Rebound: Stagger');
})();
