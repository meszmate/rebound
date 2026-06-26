/*
 * Rebound host, Scatter (distribute duplicates in a pattern).
 *
 * For each selected AV layer, captures its base position as the pattern center
 * and creates 'count' duplicates placed by the chosen pattern: a jittered grid,
 * a Fibonacci (phyllotaxis) spiral, or seeded random with optional minimum
 * spacing so copies do not overlap. Each copy can vary in scale and rotation.
 * Only static transforms are written; originals are left untouched.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function num(v, fallback) { return (v == null || isNaN(v)) ? fallback : v; }

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  function isStatic(prop) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    return true;
  }

  function gridPositions(count, w, h, jitter, rng) {
    var cols = Math.max(1, Math.round(Math.sqrt(count * (w / Math.max(1, h)))));
    var rows = Math.ceil(count / cols);
    var pts = [];
    for (var k = 0; k < count; k++) {
      var c = k % cols, r = Math.floor(k / cols);
      var x = cols > 1 ? (-w / 2 + w * c / (cols - 1)) : 0;
      var y = rows > 1 ? (-h / 2 + h * r / (rows - 1)) : 0;
      x += (rng() - 0.5) * jitter;
      y += (rng() - 0.5) * jitter;
      pts.push([x, y]);
    }
    return pts;
  }

  function fibPositions(count, radius, jitter, rng) {
    var ga = Math.PI * (3 - Math.sqrt(5)); // golden angle
    var pts = [];
    for (var k = 0; k < count; k++) {
      var rr = radius * Math.sqrt((k + 0.5) / count);
      var th = k * ga;
      pts.push([Math.cos(th) * rr + (rng() - 0.5) * jitter, Math.sin(th) * rr + (rng() - 0.5) * jitter]);
    }
    return pts;
  }

  function randomPositions(count, w, h, minDist, rng) {
    var pts = [];
    var cap = count * 40, attempts = 0;
    while (pts.length < count && attempts < cap) {
      attempts++;
      var x = (rng() - 0.5) * w, y = (rng() - 0.5) * h, ok = true;
      if (minDist > 0) {
        for (var i = 0; i < pts.length; i++) {
          var dx = pts[i][0] - x, dy = pts[i][1] - y;
          if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
        }
      }
      if (ok) pts.push([x, y]);
    }
    while (pts.length < count) pts.push([(rng() - 0.5) * w, (rng() - 0.5) * h]);
    return pts;
  }

  function positionsFor(pattern, count, args, rng) {
    var w = num(args.width, 600), h = num(args.height, 400);
    var jitter = num(args.jitter, 0);
    if (pattern === 'fibonacci') return fibPositions(count, num(args.radius, 250), jitter, rng);
    if (pattern === 'random') return randomPositions(count, w, h, num(args.minDist, 0), rng);
    return gridPositions(count, w, h, jitter, rng);
  }

  function setPosition(layer, x, y) {
    var pos = layer.property(M.transform).property(M.position);
    if (!isStatic(pos)) return;
    var v = pos.value;
    var nv = [x, y];
    if (v.length > 2) nv.push(v[2]);
    pos.setValue(nv);
  }

  function varyScale(layer, factor) {
    if (factor === 1) return;
    var sc = layer.property(M.transform).property(M.scale);
    if (!isStatic(sc)) return;
    var v = sc.value;
    var nv = [v[0] * factor, v[1] * factor];
    if (v.length > 2) nv.push(v[2] * factor);
    sc.setValue(nv);
  }

  function varyRotation(layer, deg) {
    if (deg === 0) return;
    var rot = layer.property(M.transform).property(M.rotation);
    if (!isStatic(rot)) return;
    rot.setValue(rot.value + deg);
  }

  function scatter(args) {
    var comp = util.activeComp();
    var sources = comp.selectedLayers;
    if (!sources.length) throw new Error('Select one or more layers to scatter.');

    var pattern = args.pattern || 'grid';
    var count = Math.round(num(args.count, 24));
    if (count < 1) count = 1;
    if (count > 200) count = 200;
    var seed = num(args.seed, 1);
    var scaleVary = num(args.scaleVary, 0) / 100;
    var rotateVary = num(args.rotateVary, 0);

    var originals = [];
    for (var i = 0; i < sources.length; i++) {
      if (!(sources[i] instanceof CameraLayer || sources[i] instanceof LightLayer)) originals.push(sources[i]);
    }
    if (!originals.length) throw new Error('Select one or more layers to scatter.');

    var created = 0;
    for (var s = 0; s < originals.length; s++) {
      var src = originals[s];
      var basePos = src.property(M.transform).property(M.position).value;
      var cx = basePos[0], cy = basePos[1];

      // Reset the RNG per source so the seed gives a reproducible layout.
      var rng = makeRng(seed);
      var pts = positionsFor(pattern, count, args, rng);

      for (var k = 0; k < pts.length; k++) {
        var copy = src.duplicate();
        setPosition(copy, cx + pts[k][0], cy + pts[k][1]);
        if (scaleVary > 0) varyScale(copy, 1 + (rng() * 2 - 1) * scaleVary);
        if (rotateVary > 0) varyRotation(copy, (rng() * 2 - 1) * rotateVary);
        created++;
      }
    }

    return { created: created };
  }

  R.register('scatter.apply', scatter, 'Rebound: Scatter');
})();
