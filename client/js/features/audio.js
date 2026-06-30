/*
 * Rebound, Audio & rhythm tool.
 * Places comp/layer markers from a BPM beat grid (with tap-tempo) or from
 * transients detected in a WAV audio layer (decoded + analyzed by the pure
 * client/js/audio/onset.js). Markers feed Stagger/Sequence for music/VO sync.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'audio',
    title: 'Audio & rhythm',
    group: 'Timing',
    order: 7,
    keywords: ['audio', 'beat', 'bpm', 'rhythm', 'music', 'marker', 'onset', 'transient', 'sync', 'tempo', 'voiceover'],
    mount: mountAudio
  });

  function nodeFs() {
    try {
      if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
        return window.cep_node.require('fs');
      }
    } catch (e) { /* none */ }
    return null;
  }

  function mountAudio(ctx) {
    var bpm = 120, offset = 0, subdiv = 1, target = 'comp', sensitivity = 0.5;

    var bpmField = ui.numberField({ label: 'BPM', value: bpm, step: 1, decimals: 0, width: '100%',
      onChange: function (v) { bpm = Math.max(20, Math.min(400, v || 120)); } });

    var taps = [];
    var tapBtn = el('button.rb-btn.is-ghost', { title: 'Tap a few beats to set the tempo' }, ['Tap']);
    tapBtn.addEventListener('click', function () {
      var now = Date.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now);
      taps = taps.slice(-8);
      if (taps.length >= 2) {
        var sum = 0;
        for (var i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
        var avg = sum / (taps.length - 1);
        if (avg > 0) { bpm = Math.round(60000 / avg); bpmField.set(bpm); }
      }
    });

    var offsetField = ui.numberField({ label: 'Offset (s)', value: offset, step: 0.01, decimals: 2, width: '100%',
      onChange: function (v) { offset = Math.max(0, v || 0); } });

    var subCtl = ui.segmented([
      { value: '1', label: '1/4' }, { value: '2', label: '1/8' }, { value: '4', label: '1/16' }
    ], { value: '1', onChange: function (v) { subdiv = parseInt(v, 10) || 1; } });

    var targetCtl = ui.segmented([
      { value: 'comp', label: 'Comp markers' }, { value: 'layer', label: 'Layer markers' }
    ], { value: target, onChange: function (v) { target = v; } });

    var sensSlider = ui.slider({ label: 'Detection sensitivity', min: 0, max: 1, step: 0.05, value: sensitivity,
      format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { sensitivity = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Drop markers on the beat — from a tempo grid or detected from the audio — then Stagger/Sequence snap to them.' }),
      el('div.rb-section-label', { text: 'Tempo grid' }),
      el('div.rb-row.rb-wrap', null, [el('div', { style: { flex: '1 1 90px' } }, [bpmField.el]), tapBtn,
        el('div', { style: { flex: '1 1 90px' } }, [offsetField.el])]),
      ui.row('Subdivision', subCtl.el),
      el('div.rb-section-label', { text: 'From audio (WAV)' }),
      sensSlider.el,
      el('div.rb-hint', { text: 'Select an audio layer. WAV is analyzed for transients; MP3/AAC fall back to the tempo grid.' }),
      el('div.rb-section-label', { text: 'Place on' }),
      targetCtl.el
    ]));

    var status = el('span.rb-scope', { text: '' });
    var beatBtn = el('button.rb-btn', { title: 'Place markers on the BPM grid', onclick: doBeats }, ['Beat markers']);
    var detectBtn = el('button.rb-btn.is-primary', { title: 'Detect transients in the selected WAV layer', onclick: doDetect }, ['Detect from audio']);
    ctx.footer.appendChild(status);
    ctx.footer.appendChild(beatBtn);
    ctx.footer.appendChild(detectBtn);

    function describe(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      return (sel.selectedLayerCount || 0) + ' selected';
    }
    var off = ctx.onSelection(function (sel) { status.textContent = describe(sel); });
    status.textContent = describe(ctx.getSelection());

    function placeMarks(marks, inf, doneMsg) {
      if (!marks.length) { ctx.toast('Nothing to place', { kind: 'error' }); return; }
      ctx.invoke('audio.placeMarkers', { markers: marks, target: target, layerIndex: inf ? inf.layerIndex : 0 })
        .then(function (res) { ctx.toast('Placed ' + res.added + ' ' + (doneMsg || 'marker' + (res.added === 1 ? '' : 's')), { kind: 'success' }); })
        .catch(function (err) { ctx.toast((err && err.message) || 'Could not place markers', { kind: 'error' }); });
    }

    function doBeats() {
      ctx.invoke('audio.info', {}).then(function (inf) {
        var grid = R.audio.beatGrid(bpm, offset, subdiv, inf.durationSec);
        placeMarks(grid.map(function (t) { return { t: t, label: '' }; }), inf, bpm + ' BPM beat markers');
      }).catch(function (err) { ctx.toast((err && err.message) || 'No composition', { kind: 'error' }); });
    }

    function doDetect() {
      ctx.invoke('audio.info', {}).then(function (inf) {
        if (!inf.path) { ctx.toast('Select an audio layer that has a source file', { kind: 'error' }); return; }
        if (!/\.wav$/i.test(inf.path)) { ctx.toast('Onset detection needs a WAV file — use the beat grid for MP3/AAC', { kind: 'error' }); return; }
        var fs = nodeFs();
        if (!fs) { ctx.toast('File access unavailable here; use the beat grid', { kind: 'error' }); return; }
        var buf;
        try { buf = fs.readFileSync(inf.path); } catch (e) { ctx.toast('Could not read the audio file', { kind: 'error' }); return; }
        var dec, onsets;
        try {
          dec = R.audio.parseWav(buf);
          onsets = R.audio.detectOnsets(dec.samples, dec.sampleRate, { sensitivity: sensitivity });
        } catch (e2) { ctx.toast('Could not analyze audio: ' + (e2.message || e2), { kind: 'error' }); return; }
        if (!onsets.length) { ctx.toast('No transients found — raise sensitivity', { kind: 'info' }); return; }
        var marks = [];
        for (var i = 0; i < onsets.length; i++) {
          var ct = Math.round((inf.startTime + onsets[i]) * 1e5) / 1e5;
          if (ct >= inf.inSec - 1e-6 && ct <= inf.outSec + 1e-6) marks.push({ t: ct, label: '' });
        }
        placeMarks(marks, inf, 'transient marker' + (marks.length === 1 ? '' : 's'));
      }).catch(function (err) { ctx.toast((err && err.message) || 'No composition', { kind: 'error' }); });
    }

    return { destroy: function () { off(); } };
  }
})(window.Rebound = window.Rebound || {});
