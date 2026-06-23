/*
 * Rebound host, Path Follow (send layers along a path).
 *
 * The path is supplied as a mask (CEP can't record a freehand sketch): the FIRST
 * selected layer's first mask is sampled into comp-space points, an arc-length
 * lookup table is built, and the remaining selected layers are baked along it.
 * Constant-speed mode reparameterizes by arc length so the layer doesn't slow
 * through tight curves; even-parameter mode feeds progress straight in. Progress
 * over time runs through an ease LUT (the client builds it from the speed graph),
 * with start/end offset window, reverse, loop / ping-pong, orient-to-path +
 * angle offset, and per-layer stagger. Bakes Position (+ Rotation). 2D, unparented
 * layers; parenting / 3D are not compensated.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  function readPos(tg, t0) {
    var pos = tg.property(M.position);
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) return [tg.property(M.positionX).valueAtTime(t0, false), tg.property(M.positionY).valueAtTime(t0, false)];
    var v = pos.valueAtTime(t0, false);
    return (v instanceof Array) ? v : [v, 0];
  }

  function layerToComp(pt, ref, t0) {
    var tg = ref.property(M.transform);
    var anchor = tg.property(M.anchor).valueAtTime(t0, false);
    var pos = readPos(tg, t0);
    var scale = tg.property(M.scale).valueAtTime(t0, false);
    var rot = tg.property(M.rotation).valueAtTime(t0, false);
    var lx = (pt[0] - anchor[0]) * (scale[0] / 100);
    var ly = (pt[1] - anchor[1]) * (scale[1] / 100);
    var r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [pos[0] + (lx * c - ly * s), pos[1] + (lx * s + ly * c)];
  }

  function cubicAt(p0, c0, c1, p1, t) {
    var u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t * t * t * p1[1]
    ];
  }

  function samplePath(shape, ref, t0, per) {
    var V = shape.vertices, I = shape.inTangents, O = shape.outTangents;
    var n = V.length; if (n < 2) return [];
    var segs = [];
    for (var i = 0; i < n - 1; i++) segs.push([i, i + 1]);
    if (shape.closed) segs.push([n - 1, 0]);
    var pts = [];
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s][0], b = segs[s][1];
      var p0 = V[a], p1 = V[b];
      var c0 = [p0[0] + O[a][0], p0[1] + O[a][1]];
      var c1 = [p1[0] + I[b][0], p1[1] + I[b][1]];
      var startK = (s === 0) ? 0 : 1;
      for (var k = startK; k <= per; k++) pts.push(layerToComp(cubicAt(p0, c0, c1, p1, k / per), ref, t0));
    }
    return pts;
  }

  function buildLengths(pts) {
    var L = [0];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      L.push(L[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return L;
  }

  function lut(arr, p) {
    if (p <= 0) return arr[0];
    if (p >= 1) return arr[arr.length - 1];
    var x = p * (arr.length - 1), i = Math.floor(x), f = x - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }

  function pointAtLen(pts, L, target) {
    var total = L[L.length - 1];
    if (target <= 0) return pts[0];
    if (target >= total) return pts[pts.length - 1];
    var lo = 0, hi = L.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (L[mid] < target) lo = mid; else hi = mid; }
    var seg = L[hi] - L[lo], f = seg > 0 ? (target - L[lo]) / seg : 0;
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
  }

  function pointAtIndex(pts, p) {
    var x = p * (pts.length - 1);
    if (x <= 0) return pts[0];
    if (x >= pts.length - 1) return pts[pts.length - 1];
    var i = Math.floor(x), f = x - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  }

  function setPosAt(tg, t, x, y) {
    var pos = tg.property(M.position);
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) { tg.property(M.positionX).setValueAtTime(t, x); tg.property(M.positionY).setValueAtTime(t, y); return; }
    var cur = pos.valueAtTime(t, false);
    if (cur instanceof Array && cur.length > 2) pos.setValueAtTime(t, [x, y, cur[2]]);
    else pos.setValueAtTime(t, [x, y]);
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select a layer with a mask path (plus any layers to send along it).');

    var fps = comp.frameRate, t0 = comp.time;
    var ref = layers[0];
    var parade = ref.property('ADBE Mask Parade');
    if (!parade || parade.numProperties < 1) throw new Error('The first selected layer needs a mask to use as the path.');
    var shape = parade.property(1).property('ADBE Mask Shape').valueAtTime(t0, false);
    if (!shape || !shape.vertices || shape.vertices.length < 2) throw new Error('The mask path needs at least two points.');

    var per = args.smoothness != null ? Math.max(8, Math.round(args.smoothness)) : 24;
    var pts = samplePath(shape, ref, t0, per);
    if (pts.length < 2) throw new Error('Could not sample the path.');
    var L = buildLengths(pts), total = L[L.length - 1];

    var dur = args.duration != null && args.duration > 0 ? args.duration : 1.5;
    var ease = (args.easeLut && args.easeLut.length > 1) ? args.easeLut : [0, 1];
    var arclen = args.speed !== 'event';
    var orient = !!args.orient, angleOff = args.angleOffset != null ? args.angleOffset : 0;
    var startOff = args.startOffset != null ? args.startOffset : 0;
    var endOff = args.endOffset != null ? args.endOffset : 1;
    var reverse = !!args.reverse, loop = !!args.loop;
    var loops = loop ? Math.max(1, Math.round(args.loopCount || 1)) : 1;
    var ping = !!args.pingpong;
    var stagger = args.stagger != null ? args.stagger : 0;

    function sampleAt(p) { return arclen ? pointAtLen(pts, L, p * total) : pointAtIndex(pts, p); }

    var targets = layers.length > 1 ? layers.slice(1) : [ref];
    var applied = 0, skipped = [];
    var frames = Math.max(1, Math.round(dur * loops * fps));

    for (var ti = 0; ti < targets.length; ti++) {
      var lay = targets[ti];
      if (!(lay instanceof AVLayer)) { skipped.push(lay.name + ' (unsupported layer)'); continue; }
      var tg = lay.property(M.transform);
      var delay = stagger > 0 ? ti * stagger / fps : 0;
      var rotProp = orient ? tg.property(M.rotation) : null;
      var baseRot = rotProp ? rotProp.valueAtTime(t0, false) : 0;

      for (var f = 0; f <= frames; f++) {
        var tp = f / frames;
        var ltime = tp * loops, cyc = Math.floor(ltime); if (cyc >= loops) cyc = loops - 1;
        var ph = ltime - cyc; if (ph > 1) ph = 1;
        if (ping && (cyc % 2 === 1)) ph = 1 - ph;
        var eph = lut(ease, ph);
        if (reverse) eph = 1 - eph;
        var p = startOff + eph * (endOff - startOff);
        var pt = sampleAt(p);
        var t = t0 + delay + f / fps;
        setPosAt(tg, t, pt[0], pt[1]);
        if (rotProp) {
          var pt2 = sampleAt(p + 0.003 <= 1 ? p + 0.003 : p - 0.003);
          var dx = pt2[0] - pt[0], dy = pt2[1] - pt[1];
          if (p + 0.003 > 1) { dx = -dx; dy = -dy; }
          rotProp.setValueAtTime(t, baseRot + Math.atan2(dy, dx) * 180 / Math.PI + angleOff);
        }
      }
      applied++;
    }
    if (!applied) throw new Error('No supported layers to animate: ' + skipped.join(', '));
    return { applied: applied, skipped: skipped, points: pts.length };
  }

  // Echo the resolved route so the panel can explain what will happen.
  function read() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) return { ok: false, reason: 'none' };
    var ref = layers[0];
    var parade = null;
    try { parade = ref.property('ADBE Mask Parade'); } catch (e) { parade = null; }
    if (!parade || parade.numProperties < 1) return { ok: false, reason: 'nomask', layerName: ref.name };
    var mask = parade.property(1);
    var pts = 0;
    try { pts = mask.property('ADBE Mask Shape').value.vertices.length; } catch (e2) { pts = 0; }
    return { ok: true, maskName: mask.name, points: pts, layerName: ref.name, targets: layers.length > 1 ? layers.length - 1 : 0, self: layers.length === 1 };
  }

  R.register('pathfollow.apply', apply, 'Rebound: Path Follow');
  R.register('pathfollow.read', read);
})();
