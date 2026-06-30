/*
 * Rebound host, audio timing helpers.
 *
 * audio.info         -> the selected audio layer's file path + timing, so the
 *                       panel can read & analyze the file (Node-side) and map
 *                       onset times (file-relative) into composition time.
 * audio.placeMarkers -> drop comp or layer markers at the given comp-time seconds.
 *
 * The heavy lifting (WAV decode, onset detection, beat grid) is the panel's pure,
 * unit-tested module client/js/audio/onset.js. This host side stays thin.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function hasAudio(layer) {
    try { return layer.hasAudio === true; } catch (e) { return false; }
  }

  function info() {
    var comp = util.activeComp();
    var sel = comp.selectedLayers;
    var layer = null;
    for (var i = 0; i < sel.length; i++) { if (hasAudio(sel[i])) { layer = sel[i]; break; } }
    if (!layer && sel.length) layer = sel[0];

    var out = {
      fps: comp.frameRate,
      durationSec: comp.duration,
      compName: comp.name,
      hasAudio: false,
      path: null,
      startTime: 0,
      inSec: 0,
      outSec: comp.duration,
      layerIndex: layer ? layer.index : 0,
      layerName: layer ? layer.name : null
    };
    if (layer) {
      try { out.startTime = layer.startTime; } catch (e0) {}
      try { out.inSec = layer.inPoint; } catch (e1) {}
      try { out.outSec = layer.outPoint; } catch (e2) {}
      out.hasAudio = hasAudio(layer);
      try { if (layer.source && layer.source.file) out.path = layer.source.file.fsName; } catch (e3) {}
    }
    return out;
  }

  // args: { markers:[{ t(sec, comp time), label? }], target:'comp'|'layer', layerIndex? }
  function placeMarkers(args) {
    var comp = util.activeComp();
    var marks = (args && args.markers) || [];
    if (!marks.length) throw new Error('No markers to place.');
    var target = args && args.target === 'layer' ? 'layer' : 'comp';

    app.beginUndoGroup('Rebound: Place Markers');
    try {
      var mp;
      if (target === 'layer') {
        var idx = args.layerIndex;
        var layer = (idx && idx >= 1 && idx <= comp.numLayers) ? comp.layer(idx) : comp.selectedLayers[0];
        if (!layer) throw new Error('Select a layer for layer markers.');
        mp = layer.property('ADBE Marker');
      } else {
        mp = comp.markerProperty;
      }
      if (!mp) throw new Error('Marker property unavailable.');
      var added = 0, dur = comp.duration;
      for (var i = 0; i < marks.length; i++) {
        var t = marks[i].t;
        if (t == null || t < 0 || t > dur) continue;
        mp.setValueAtTime(t, new MarkerValue(marks[i].label || ''));
        added++;
      }
      return { added: added, target: target };
    } finally {
      app.endUndoGroup();
    }
  }

  R.register('audio.info', info);
  R.register('audio.placeMarkers', placeMarkers, 'Rebound: Place Markers');
})();
