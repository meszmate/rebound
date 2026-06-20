/*
 * Rebound host, Sequence (line selected layers up end-to-end in time).
 *
 * Orders the selected layers (by selection order, stacking order, or reversed),
 * then walks them placing each so it starts where the previous ends minus the
 * overlap. Each whole layer is shifted in time via startTime, so its keyframes
 * and source ride along. With trim on, each layer's outPoint is clipped to the
 * next layer's start so segments butt together exactly.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function orderLayers(selected, order) {
    var layers = [];
    for (var i = 0; i < selected.length; i++) layers.push(selected[i]);
    if (order === 'topdown') {
      layers.sort(function (a, b) { return a.index - b.index; });
    } else if (order === 'reverse') {
      layers.reverse();
    }
    return layers;
  }

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || selected.length < 2) throw new Error('Select two or more layers to sequence.');

    var layers = orderLayers(selected, args.order);
    var overlapSeconds = num(args.overlapFrames, 0) / comp.frameRate;
    var trim = !!args.trim;

    var cursor = layers[0].inPoint;
    var sequenced = 0;

    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var targetInPoint = cursor;
      var delta = targetInPoint - layer.inPoint;
      layer.startTime += delta;
      cursor = layer.outPoint - overlapSeconds;
      sequenced++;
    }

    if (trim) {
      for (var j = 0; j < layers.length - 1; j++) {
        var current = layers[j];
        var next = layers[j + 1];
        if (next.inPoint > current.inPoint && next.inPoint < current.outPoint) {
          current.outPoint = next.inPoint;
        }
      }
    }

    return { sequenced: sequenced };
  }

  R.register('sequence.apply', apply, 'Rebound: Sequence');
})();