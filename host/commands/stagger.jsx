/*
 * Rebound host, Stagger (cascade selected layers in time).
 *
 * Orders the selected layers (by stacking index, reversed, by name, by label
 * color, or a seeded shuffle), then shifts each whole layer so its in-point
 * lands one interval after the previous, starting from the playhead or the
 * earliest selected in-point.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // A tiny seeded PRNG so 'random' order is reproducible for a given seed.
  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }
  function seededShuffle(arr, seed) {
    var rng = makeRng(seed);
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  function orderLayers(layers, order, seed) {
    layers.sort(function (a, b) { return a.index - b.index; });
    if (order === 'reverse') {
      layers.reverse();
    } else if (order === 'name') {
      layers.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.index - b.index; });
    } else if (order === 'label') {
      layers.sort(function (a, b) { return (a.label - b.label) || (a.index - b.index); });
    } else if (order === 'random') {
      seededShuffle(layers, seed);
    }
    // 'index' keeps the stacking order.
  }

  function apply(args) {
    var comp = util.activeComp();
    var selected = comp.selectedLayers;
    if (!selected || !selected.length) throw new Error('Select one or more layers to stagger.');

    var layers = [];
    for (var i = 0; i < selected.length; i++) layers.push(selected[i]);

    // Back-compat: an older 'reverse' boolean maps to the reverse order.
    var order = args.order || (args.reverse ? 'reverse' : 'index');
    var seed = (args.seed == null || isNaN(args.seed)) ? 1 : args.seed;
    orderLayers(layers, order, seed);

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
