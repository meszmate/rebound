/*
 * Rebound host, Stagger (cascade selected layers in time).
 *
 * Orders the selected layers (by stacking index, reversed, by name, by label
 * color, or a seeded shuffle), then shifts each whole layer so its in-point
 * lands along the cascade, starting from the playhead or the earliest selected
 * in-point. The cascade span comes from a fixed interval (span = interval *
 * (n-1)) or a total span the whole cascade fits into, and the delays are
 * distributed along it linearly or with a cubic ease (in / out / both):
 * delay_k = span * f(k / (n-1)).
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  // Cubic distribution curves for the cascade delays (ES3-safe).
  function distEaseIn(u) { return u * u * u; }
  function distEaseOut(u) { var v = 1 - u; return 1 - v * v * v; }
  function distEaseBoth(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function distLinear(u) { return u; }
  function distFn(kind) {
    if (kind === 'in') return distEaseIn;
    if (kind === 'out') return distEaseOut;
    if (kind === 'both') return distEaseBoth;
    return distLinear;
  }

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

    // Total cascade span in seconds: interval mode spreads (n-1) fixed steps,
    // span mode fits the whole cascade into spanFrames.
    var n = layers.length;
    var span;
    if (args.mode === 'span') {
      span = num(args.spanFrames, 24) / comp.frameRate;
    } else {
      span = num(args.intervalFrames, 0) * (n - 1) / comp.frameRate;
    }
    if (span < 0) span = 0;
    var f = distFn(args.distribute);

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
      var u = n > 1 ? k / (n - 1) : 0;
      var targetInPoint = base + span * f(u);
      var delta = targetInPoint - layer.inPoint;
      layer.startTime += delta;
      staggered++;
    }

    return { staggered: staggered };
  }

  R.register('stagger.apply', apply, 'Rebound: Stagger');
})();
