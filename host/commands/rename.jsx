/*
 * Rebound host, Rename (batch-rename selected layers).
 *
 * Builds each new name from the original via an optional base name, a literal
 * find/replace, prefix/suffix, and sequential numbering. Numbering follows
 * top-to-bottom layer order (by index), so it is predictable no matter what
 * order the layers were selected in. A layer is never given a blank name.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function pad(n, width) {
    var neg = n < 0;
    var s = '' + Math.abs(Math.round(n));
    while (s.length < width) s = '0' + s;
    return (neg ? '-' : '') + s;
  }

  // Literal (non-regex) replace-all, ES3-safe.
  function replaceAll(str, find, repl) {
    if (find === '') return str;
    return str.split(find).join(repl);
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select one or more layers to rename.');

    // Order a copy top-to-bottom so numbering is stable regardless of how the
    // layers were selected.
    var ordered = [];
    for (var i = 0; i < layers.length; i++) ordered.push(layers[i]);
    ordered.sort(function (a, b) { return a.index - b.index; });

    var base = args.base != null ? ('' + args.base) : '';
    var find = args.find != null ? ('' + args.find) : '';
    var replace = args.replace != null ? ('' + args.replace) : '';
    var prefix = args.prefix != null ? ('' + args.prefix) : '';
    var suffix = args.suffix != null ? ('' + args.suffix) : '';
    var number = !!args.number;
    var start = args.start != null ? Math.round(args.start) : 1;
    var step = args.step != null ? Math.round(args.step) : 1;
    var width = args.padding != null ? Math.max(1, Math.round(args.padding)) : 1;

    var renamed = 0;
    for (var j = 0; j < ordered.length; j++) {
      var layer = ordered[j];
      var core = base !== '' ? base : layer.name;
      if (find !== '') core = replaceAll(core, find, replace);
      var name = prefix + core;
      if (number) name += pad(start + j * step, width);
      name += suffix;
      if (name === '') name = layer.name; // never blank a layer name
      if (name !== layer.name) { // only count (and touch) real changes
        layer.name = name;
        renamed++;
      }
    }
    return { renamed: renamed };
  }

  R.register('rename.apply', apply, 'Rebound: Rename');
})();
