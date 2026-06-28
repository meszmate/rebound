/*
 * Rebound host, native shape-layer gradients.
 *
 * After Effects does NOT let a script set a shape gradient's stop colours:
 * 'ADBE Vector Grad Colors' is PropertyValueType.NO_VALUE, so setValue() on it is
 * silently ignored (the value never grows past the default two-stop black->white
 * ramp). The native C++ SDK hits the same wall ('ADBE Vector Grad Colors' is
 * NO_DATA there too), which is why even Overlord does NOT write the stream
 * directly.
 *
 * The proven way -- used by Overlord and Google's open-source AEUX -- is the
 * animation-preset (.ffx) trick: an After Effects gradient preset stores its
 * stops as a small XML block inside a RIFX container, and that block CAN be
 * substituted from a script. So we ship one template per stop count (2..8, the
 * AE ceiling), drop the real positions/colours/alpha into the template's
 * <float> slots, write a temp .ffx, select the target G-Fill / G-Stroke, and
 * layer.applyPreset() the colours onto it. The result is a TRUE editable native
 * multi-stop gradient -- not a rasterised image and not a Gradient Ramp effect.
 *
 * Templates live in host/assets/grad/grad{N}.ffx.tmpl and are derived from
 * AEUX (Apache-2.0); see host/assets/grad/NOTICE and tools/build-grad-templates.mjs.
 *
 * Preconditions: "Allow Scripts to Write Files and Access Network" must be on
 * (we need a temp file). If it is off, or anything fails, applyGradientColors()
 * returns false and the caller falls back to the Gradient Ramp / 4-Colour
 * approximation in paint.jsx -- so a gradient always shows, just less exactly.
 *
 * The flat-array encoder (encode) is kept for the panel Gradient tool and tests.
 */
$.__rebound = $.__rebound || {};
$.__rebound.grad = (function () {
  var G = $.global.ReboundGrad;

  function clamp01(v) { return (v == null || isNaN(v)) ? 0 : (v < 0 ? 0 : (v > 1 ? 1 : v)); }

  function encodeLocal(stops) {
    var s = stops.slice().sort(function (a, b) { return a.pos - b.pos; });
    var arr = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s[i].color || [0, 0, 0];
      arr.push(clamp01(s[i].pos), clamp01(c[0]), clamp01(c[1]), clamp01(c[2]));
    }
    for (i = 0; i < s.length; i++) {
      arr.push(clamp01(s[i].pos), (typeof s[i].alpha === 'number') ? clamp01(s[i].alpha) : 1);
    }
    return arr;
  }

  // stops: [{ pos:Number(0..1), color:[r,g,b](0..1), alpha?:Number(0..1) }]
  function encode(stops) {
    return (G && G.encode) ? G.encode(stops) : encodeLocal(stops);
  }

  // --- native gradient colours via the .ffx animation-preset trick ----------

  var MAX_STOPS = 8; // After Effects shape gradients cap at 8 stops (Overlord too)

  // Is "Allow Scripts to Write Files and Access Network" enabled? We need it to
  // write the temp preset. Without it, callers fall back to the effect approx.
  function writeAllowed() {
    try {
      return app.preferences.getPrefAsLong('Main Pref Section', 'Pref_SCRIPTING_FILE_NETWORK_SECURITY') === 1;
    } catch (e) { return false; }
  }

  function templatePath(n) {
    var base = ($.__rebound.paths && $.__rebound.paths.host) ? $.__rebound.paths.host : null;
    if (!base) return null;
    return base + '/assets/grad/grad' + n + '.ffx.tmpl';
  }

  function readBinary(path) {
    var f = new File(path);
    if (!f.exists) return null;
    f.encoding = 'BINARY';
    if (!f.open('r')) return null;
    var s = f.read();
    f.close();
    return s;
  }

  // Normalise to sorted, clamped stops; collapse to the 8-stop ceiling by picking
  // evenly spaced representatives (endpoints kept) when there are more.
  function prepStops(raw) {
    var s = [];
    for (var i = 0; i < raw.length; i++) {
      var c = raw[i].color || [0, 0, 0];
      s.push({
        pos: clamp01(raw[i].pos),
        color: [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])],
        alpha: (typeof raw[i].alpha === 'number') ? clamp01(raw[i].alpha) : 1,
        // Per-pair skew toward the next stop (0..1). Source-supplied when present
        // (Illustrator/Photoshop); 0.5 = an even ramp, the AE default.
        midPoint: (typeof raw[i].midPoint === 'number') ? clamp01(raw[i].midPoint) : 0.5
      });
    }
    s.sort(function (a, b) { return a.pos - b.pos; });
    if (s.length > MAX_STOPS) {
      var picked = [];
      for (var k = 0; k < MAX_STOPS; k++) {
        picked.push(s[Math.round(k * (s.length - 1) / (MAX_STOPS - 1))]);
      }
      s = picked;
    }
    return s;
  }

  // Fill the template's <float> token lines (points[i].rampPoint / .midPoint /
  // .opacity / .color[j]) with this gradient's real values. Everything else --
  // the RIFX binary chrome -- is left byte-for-byte intact.
  var TOKEN = /^\s*points\[(\d+)\]\.(rampPoint|midPoint|opacity|color\[([0-2])\])\s*$/;
  function substitute(tmpl, stops) {
    var lines = tmpl.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(TOKEN);
      if (!m) continue;
      var idx = parseInt(m[1], 10);
      var s = stops[idx] || stops[stops.length - 1];
      var val;
      if (m[2] === 'rampPoint') val = s.pos;
      else if (m[2] === 'midPoint') val = (typeof s.midPoint === 'number') ? s.midPoint : 0.5;
      else if (m[2] === 'opacity') val = s.alpha;
      else val = s.color[parseInt(m[3], 10)];
      lines[i] = '<float>' + val.toFixed(8) + '</float>';
    }
    return lines.join('\n');
  }

  function deselectAll(comp) {
    try {
      var sp = comp.selectedProperties;
      for (var i = sp.length - 1; i >= 0; i--) { try { sp[i].selected = false; } catch (e) {} }
    } catch (e2) {}
    try {
      var sl = comp.selectedLayers;
      for (var j = sl.length - 1; j >= 0; j--) { try { sl[j].selected = false; } catch (e3) {} }
    } catch (e4) {}
  }

  // Why the last applyGradientColors() fell back (surfaced in the fidelity report
  // so a failure is diagnosable instead of a silent "wrong-looking" gradient).
  var lastReason = '';
  function reason() { return lastReason; }

  // Write real stop COLOURS onto an existing G-Fill / G-Stroke operator by
  // applying a generated gradient preset to it. Returns true only when the
  // preset path actually ran; false means "use the effect fallback instead".
  // (Grad type / start / end points are settable normally -- see applyGradient.)
  //
  // We do NOT pre-check the "Allow Scripts to Write Files" preference: the pref
  // key is version-sensitive and reading it wrong would wrongly skip the native
  // path. Instead we just attempt the temp-file write -- File.open('w') fails
  // cleanly when writes are disallowed -- and report that as the reason.
  function applyGradientColors(op, rawStops) {
    lastReason = '';
    if (!op) { lastReason = 'no fill/stroke property'; return false; }
    var stops = prepStops(rawStops || []);
    if (stops.length < 2) { lastReason = 'fewer than 2 stops'; return false; }
    var path = templatePath(stops.length);
    if (!path) { lastReason = 'template path unresolved -- reload the panel / restart After Effects'; return false; }
    var tmpl = readBinary(path);
    if (!tmpl) { lastReason = 'template missing (' + path + ') -- restart After Effects so the host reloads'; return false; }
    var tmp = null;
    try {
      var out = substitute(tmpl, stops);
      tmp = new File(Folder.temp.fsName + '/rebound_grad.ffx');
      tmp.encoding = 'BINARY';
      if (!tmp.open('w')) {
        lastReason = 'cannot write temp preset -- enable "Allow Scripts to Write Files and Access Network" (Preferences > Scripting & Expressions)';
        return false;
      }
      tmp.write(out);
      tmp.close();

      var layer = op.propertyGroup(op.propertyDepth);
      var comp = layer.containingComp;
      var root = layer.property('ADBE Root Vectors Group');
      var before = root.numProperties;

      deselectAll(comp);
      op.selected = true;
      layer.applyPreset(tmp);

      // If selection was off, applyPreset can graft a stray group at the root;
      // remove anything it added so the layer is never left with extra content.
      var rootNow = layer.property('ADBE Root Vectors Group');
      while (rootNow.numProperties > before) {
        try { rootNow.property(rootNow.numProperties).remove(); } catch (ePrune) { break; }
      }
      try { op.selected = false; } catch (eSel) {}
      try { tmp.remove(); } catch (eRm) {}
      return true;
    } catch (e) {
      lastReason = 'preset apply failed: ' + ((e && e.message) ? e.message : String(e));
      if (tmp) { try { tmp.remove(); } catch (eRm2) {} }
      return false;
    }
  }

  // Apply a gradient's GEOMETRY (type + endpoints) to a G-Fill / G-Stroke. These
  // properties are scriptable; colours are handled separately by
  // applyGradientColors (preset) or the effect fallback. opts:
  //   { type:1(linear)|2(radial), start:[x,y], end:[x,y] }
  function applyGradient(op, opts) {
    try { op.property('ADBE Vector Grad Type').setValue(opts.type); } catch (e) {}
    try {
      op.property('ADBE Vector Grad Start Pt').setValue(opts.start);
      op.property('ADBE Vector Grad End Pt').setValue(opts.end);
    } catch (e2) {}
  }

  return {
    encode: encode,
    applyGradient: applyGradient,
    applyGradientColors: applyGradientColors,
    writeAllowed: writeAllowed,
    reason: reason
  };
})();
