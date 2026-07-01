/*
 * Rebound host, system commands.
 * Connectivity, host environment, and a structured summary of the current
 * selection that the panel's reactive store reads from.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // ---- Selection classification helpers (cheap, poll-safe) -----------------

  // A short, stable kind string for a layer, most specific first.
  function layerKind(layer) {
    if (layer instanceof TextLayer) return 'text';
    if (layer instanceof CameraLayer) return 'camera';
    if (layer instanceof LightLayer) return 'light';
    if (layer.nullLayer) return 'null';
    if (layer.adjustmentLayer) return 'adjustment';
    if (layer.property('ADBE Root Vectors Group')) return 'shape';
    var src = layer.source;
    if (src instanceof CompItem) return 'precomp';
    if (src && src.mainSource) {
      var ms = src.mainSource;
      if (ms instanceof SolidSource) return 'solid';
      if (ms instanceof FileSource) {
        if (src.hasVideo && !src.hasAudio && src.duration === 0) return 'still';
        if (!src.hasVideo && src.hasAudio) return 'audio';
        return 'footage';
      }
    }
    return 'av';
  }

  function lightTypeName(t) {
    if (t === LightType.PARALLEL) return 'Parallel';
    if (t === LightType.SPOT) return 'Spot';
    if (t === LightType.POINT) return 'Point';
    if (t === LightType.AMBIENT) return 'Ambient';
    return 'Light';
  }

  // Shallow, depth-limited scan for whether a shape layer has any fill/stroke.
  function scanShape(group, out, depth) {
    if (depth > 3 || (out.hasFill && out.hasStroke)) return;
    for (var i = 1; i <= group.numProperties; i++) {
      var ch = group.property(i);
      var mn = ch.matchName;
      if (mn === 'ADBE Vector Graphic - Fill') out.hasFill = true;
      else if (mn === 'ADBE Vector Graphic - Stroke') out.hasStroke = true;
      else if (mn === 'ADBE Vector Group') {
        var contents = ch.property('ADBE Vectors Group');
        if (contents) scanShape(contents, out, depth + 1);
      } else if (mn === 'ADBE Vectors Group') {
        scanShape(ch, out, depth + 1);
      }
      if (out.hasFill && out.hasStroke) return;
    }
  }

  function textAnimated(layer) {
    try {
      var anim = layer.property('ADBE Text Properties').property('ADBE Text Animators');
      return !!(anim && anim.numProperties > 0);
    } catch (e) { return false; }
  }

  function transformHasExpression(layer) {
    try {
      var tg = layer.property('ADBE Transform Group');
      if (!tg) return false;
      for (var i = 1; i <= tg.numProperties; i++) {
        var p = tg.property(i);
        if (p && p.canSetExpression && p.expressionEnabled && p.expression !== '') return true;
      }
    } catch (e) {}
    return false;
  }

  // Per-kind extra state, kept cheap and stable enough for the 800ms poll.
  function kindState(layer, kind) {
    var st = {};
    try {
      if (kind === 'solid') {
        st.color = layer.source.mainSource.color;
      } else if (kind === 'shape') {
        var sh = { hasFill: false, hasStroke: false };
        var root = layer.property('ADBE Root Vectors Group');
        if (root) scanShape(root, sh, 0);
        st.hasFill = sh.hasFill; st.hasStroke = sh.hasStroke;
      } else if (kind === 'light') {
        st.lightType = lightTypeName(layer.lightType);
      } else if (kind === 'precomp') {
        st.sourceName = layer.source.name;
      } else if (kind === 'footage' || kind === 'still' || kind === 'audio') {
        st.hasVideo = layer.source.hasVideo; st.hasAudio = layer.source.hasAudio;
      } else if (kind === 'text') {
        st.animated = textAnimated(layer);
      }
    } catch (e) {}
    return st;
  }

  function layerInfo(layer) {
    var kind = layerKind(layer);
    var info = {
      index: layer.index,
      name: layer.name,
      kind: kind,
      enabled: layer.enabled === true,
      threeD: false,
      isGuide: false,
      hasParent: !!layer.parent,
      parentIndex: layer.parent ? layer.parent.index : 0,
      parentName: layer.parent ? layer.parent.name : null,
      effectCount: 0,
      transformHasExpression: transformHasExpression(layer),
      kindState: kindState(layer, kind)
    };
    try { info.threeD = layer.threeDLayer === true; } catch (e1) {}
    try { info.isGuide = layer.guideLayer === true; } catch (e2) {}
    try { var fx = layer.property('ADBE Effect Parade'); info.effectCount = fx ? fx.numProperties : 0; } catch (e3) {}
    return info;
  }

  function interpName(t) {
    if (t === KeyframeInterpolationType.HOLD) return 'HOLD';
    if (t === KeyframeInterpolationType.LINEAR) return 'LINEAR';
    return 'BEZIER';
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function keyVals(p, i) { var v = p.keyValue(i); return v instanceof Array ? v : [v]; }
  function mag(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var d = (b[i] || 0) - (a[i] || 0); s += d * d; } return Math.sqrt(s); }

  // The current temporal ease of the segment between two keys, as a normalized
  // cubic-bezier plus in/out influence/speed. Same formula as ease.read, but
  // read-only and rounded so identical eases never churn the poll diff. Returns
  // null when the segment is degenerate.
  // The real-units speed unit for a property's keyframe velocity (px/s, %/s,
  // °/s, …). Used so the Ease tool can show the ACTUAL AE values a curve will set.
  function speedUnit(p) {
    var mn = String(p.matchName || '');
    var nm = String(p.name || '');
    if (mn.indexOf('Scale') !== -1) return '%';
    if (mn.indexOf('Opacity') !== -1) return '%';
    if (mn.indexOf('Rotat') !== -1 || nm.indexOf('Rotation') !== -1) return '°';
    if (mn.indexOf('Position') !== -1 || mn.indexOf('Anchor') !== -1 ||
        nm === 'Position' || nm === 'Anchor Point') return 'px';
    return '';
  }

  // The representative segment for the live readout: scan the selected pairs and
  // return the FIRST that actually moves, and within it the dimension that moves
  // most (spatial props use the path magnitude). This mirrors ease.read exactly,
  // so the passive curve shown on selection always matches what the Read button
  // loads (previously segmentEase read dimension [0] of the first pair only, so a
  // held opening segment or a flat dim-0 made the two disagree).
  function pickSegment(p, selKeys) {
    if (!selKeys || selKeys.length < 2) return null;
    var fallback = null;
    for (var s = 0; s < selKeys.length - 1; s++) {
      var a = selKeys[s], b = selKeys[s + 1];
      var dt = p.keyTime(b) - p.keyTime(a);
      if (dt <= 0) continue;
      var aVals = keyVals(p, a), bVals = keyVals(p, b);
      var dv, dim;
      if (util.isSpatial(p)) {
        dv = util.spatialDelta(p, p.keyTime(a), p.keyTime(b), aVals, bVals); dim = 0;
      } else {
        dv = 0; dim = 0;
        for (var d = 0; d < aVals.length; d++) {
          var chg = (bVals[d] || 0) - (aVals[d] || 0);
          if (Math.abs(chg) > Math.abs(dv)) { dv = chg; dim = d; }
        }
      }
      var seg = { a: a, b: b, dim: dim, dv: dv, dt: dt };
      if (Math.abs(dv / dt) < 1e-6) { if (!fallback) fallback = seg; continue; }
      return seg;
    }
    return fallback;
  }

  // Signed average speed (dv/dt) of the picked segment, plus its unit, so the
  // panel can project a normalized curve into the influence/speed AE will store.
  function segmentMotion(p, seg) {
    if (!seg) return null;
    return { dv: r2(seg.dv), dt: r4(seg.dt), avg: r2(seg.dv / seg.dt), unit: speedUnit(p) };
  }

  function segmentEase(p, seg) {
    if (!seg) return null;
    var avg = seg.dv / seg.dt;
    var outE = p.keyOutTemporalEase(seg.a)[seg.dim];
    var inE = p.keyInTemporalEase(seg.b)[seg.dim];
    var x1 = clamp01(outE.influence / 100);
    var x2 = 1 - clamp01(inE.influence / 100);
    var y1 = avg === 0 ? x1 : (outE.speed / avg) * x1;
    var y2 = avg === 0 ? x2 : 1 - (inE.speed / avg) * (1 - x2);
    return {
      inInfluence: r2(inE.influence),
      outInfluence: r2(outE.influence),
      inSpeed: r2(inE.speed),
      outSpeed: r2(outE.speed),
      curve: { type: 'bezier', x1: r4(x1), y1: r4(y1), x2: r4(x2), y2: r4(y2) }
    };
  }

  R.register('system.ping', function () {
    return { pong: true, version: R.version, time: (new Date()).getTime() };
  });

  // Which command modules failed to load (so the panel can warn instead of
  // silently missing features). Populated by host/index.jsx.
  R.register('system.loadErrors', function () {
    return { errors: ($.__rebound && $.__rebound.loadErrors) ? $.__rebound.loadErrors : [] };
  });

  R.register('system.env', function () {
    return {
      appName: app.appName,
      appVersion: app.version,
      buildName: app.buildName,
      language: app.isoLanguage,
      hostVersion: app.version,
      projectPath: app.project && app.project.file ? app.project.file.fsName : null
    };
  });

  // A compact, panel-friendly snapshot of what is selected right now.
  R.register('system.selectionSummary', function () {
    var out = {
      hasComp: false,
      compName: null,
      frameRate: 0,
      duration: 0,
      time: 0,
      selectedLayerCount: 0,
      totalSelectedKeys: 0,
      properties: []
    };

    var item = app.project ? app.project.activeItem : null;
    if (!util.isComp(item)) {
      return out;
    }

    out.hasComp = true;
    out.compName = item.name;
    out.frameRate = item.frameRate;
    out.duration = item.duration;
    out.time = item.time;
    out.selectedLayerCount = item.selectedLayers.length;

    // Per-layer kind + cheap state so the panel can react to WHAT is selected.
    out.layers = [];
    out.layerKinds = [];
    var selLayers = item.selectedLayers;
    for (var sl = 0; sl < selLayers.length; sl++) {
      var info = layerInfo(selLayers[sl]);
      out.layers.push(info);
      out.layerKinds.push(info.kind);
    }
    out.layerKind = out.layers.length ? out.layers[0].kind : null;

    var props = item.selectedProperties;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      // Skip property groups; we only summarise leaf, keyframable properties.
      if (!(p instanceof Property)) {
        continue;
      }
      if (p.propertyValueType === PropertyValueType.NO_VALUE) {
        continue;
      }

      var layer = util.layerOfProperty(p);
      var selKeys = p.selectedKeys; // array of 1-based key indices
      out.totalSelectedKeys += selKeys.length;

      var entry = {
        layerIndex: layer.index,
        layerName: layer.name,
        matchName: p.matchName,
        name: p.name,
        canVaryOverTime: p.canVaryOverTime,
        isTimeVarying: p.isTimeVarying,
        numKeys: p.numKeys,
        selectedKeys: selKeys,
        dimensions: util.dimensionsOf(p),
        isSpatial: util.isSpatial(p),
        hasExpression: p.canSetExpression ? p.expressionEnabled : false,
        dimensionsSeparated: p.dimensionsSeparated === true,
        interpInType: null,
        interpOutType: null,
        currentEase: null,
        segment: null
      };

      // When a usable segment is selected, capture its current ease so the panel
      // can draw the live curve with no extra round trip, plus its motion (avg
      // speed + unit) so the Ease tool can show the REAL values a curve will set.
      if (selKeys.length >= 2) {
        var seg = null;
        try { seg = pickSegment(p, selKeys); } catch (ep) {}
        if (seg) {
          try { entry.interpOutType = interpName(p.keyOutInterpolationType(seg.a)); } catch (eo) {}
          try { entry.interpInType = interpName(p.keyInInterpolationType(seg.b)); } catch (ei) {}
          try { entry.currentEase = segmentEase(p, seg); } catch (es) {}
          try { entry.segment = segmentMotion(p, seg); } catch (em) {}
        }
      }

      out.properties.push(entry);
    }

    return out;
  });
})();
