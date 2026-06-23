/*
 * Rebound host, Path Follow (send layers along a drawn path).
 *
 * Motion's Dynamic Sketch records a freehand path in the viewport; a CEP panel
 * cannot, so the path is supplied as a mask: the FIRST selected layer's first
 * mask is the route. Its bezier is sampled into comp-space points (via the
 * reference layer's transform) and baked as Position keyframes on the remaining
 * selected layers, spread over a duration with linear or smooth timing, with an
 * optional auto-orient along the path. If only one layer is selected it travels
 * its own mask. 2D, unparented layers; parenting / 3D are not compensated.
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

  // A point in the reference layer's space -> comp space, using its transform.
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
    var n = V.length;
    if (n < 2) return [];
    var segs = [];
    for (var i = 0; i < n - 1; i++) segs.push([i, i + 1]);
    if (shape.closed) segs.push([n - 1, 0]);
    var pts = [];
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s][0], b = segs[s][1];
      var p0 = V[a], p1 = V[b];
      var c0 = [p0[0] + O[a][0], p0[1] + O[a][1]];
      var c1 = [p1[0] + I[b][0], p1[1] + I[b][1]];
      var startK = (s === 0) ? 0 : 1; // shared vertex already emitted
      for (var k = startK; k <= per; k++) {
        pts.push(layerToComp(cubicAt(p0, c0, c1, p1, k / per), ref, t0));
      }
    }
    return pts;
  }

  function easeP(p, mode) { return mode === 'smooth' ? p * p * (3 - 2 * p) : p; }

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

    var t0 = comp.time;
    var ref = layers[0];
    var parade = ref.property('ADBE Mask Parade');
    if (!parade || parade.numProperties < 1) throw new Error('The first selected layer needs a mask to use as the path.');
    var shape = parade.property(1).property('ADBE Mask Shape').valueAtTime(t0, false);
    if (!shape || !shape.vertices || shape.vertices.length < 2) throw new Error('The mask path needs at least two points.');

    var per = args.smoothness != null ? Math.max(1, Math.round(args.smoothness)) : 6;
    var pts = samplePath(shape, ref, t0, per);
    if (pts.length < 2) throw new Error('Could not sample the path.');

    var duration = args.duration != null && args.duration > 0 ? args.duration : 1.5;
    var mode = args.ease === 'smooth' ? 'smooth' : 'linear';
    var orient = !!args.orient;

    var targets = layers.length > 1 ? layers.slice(1) : [ref];
    var applied = 0, skipped = [];
    for (var ti = 0; ti < targets.length; ti++) {
      var lay = targets[ti];
      if (!(lay instanceof AVLayer)) { skipped.push(lay.name + ' (unsupported layer)'); continue; }
      var tg = lay.property(M.transform);
      var N = pts.length;
      for (var i = 0; i < N; i++) {
        var t = t0 + easeP(i / (N - 1), mode) * duration;
        setPosAt(tg, t, pts[i][0], pts[i][1]);
      }
      if (orient) { try { lay.autoOrient = AutoOrientType.ALONG_PATH; } catch (e) {} }
      applied++;
    }
    if (!applied) throw new Error('No supported layers to animate: ' + skipped.join(', '));
    return { applied: applied, skipped: skipped, points: pts.length };
  }

  R.register('pathfollow.apply', apply, 'Rebound: Path Follow');
})();
