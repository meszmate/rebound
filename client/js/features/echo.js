/*
 * Rebound, Echo tool.
 * Adds an optical echo/trail to selected layers via the built-in Echo effect,
 * blending a number of time-shifted copies of the frame with a decay falloff.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A subject plus a trail of ghost copies: count = number of echoes, spacing
  // grows with the echo time, and each ghost fades by the decay.
  function echoSvg(state, h) {
    var W = 160, H = 90, y = H / 2;
    var n = Math.max(1, Math.min(30, Math.round(state.numEchoes || 1)));
    var decay = Math.max(0, Math.min(1, state.decay == null ? 0.7 : state.decay));
    var spacing = Math.min(22, 6 + Math.abs(state.echoTime == null ? 0.05 : state.echoTime) * 30);
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    var baseX = W - 28;
    for (var k = n; k >= 0; k--) {
      var x = baseX - k * spacing;
      if (x < 14) continue;
      var op = k === 0 ? 0.95 : Math.max(0.05, Math.pow(decay, k)) * 0.8;
      kids.push(svg('rect', { x: (x - 12).toFixed(1), y: (y - 12).toFixed(1), width: 24, height: 24, rx: 3, fill: 'var(--rb-accent)', 'fill-opacity': op.toFixed(2) }));
    }
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var ECHO_DEFAULTS = [
    { name: 'Subtle trail', state: { echoTime: -0.03, numEchoes: 4, decay: 0.5 } },
    { name: 'Long smear', state: { echoTime: -0.08, numEchoes: 16, decay: 0.85 } },
    { name: 'Strobe', state: { echoTime: -0.12, numEchoes: 6, decay: 1 } },
    { name: 'Ghost fade', state: { echoTime: -0.05, numEchoes: 10, decay: 0.65 } }
  ];
  R.toolPresets.declare('echo', { defaults: ECHO_DEFAULTS });

  R.tools.register({
    id: 'echo',
    title: 'Echo',
    group: 'Generators',
    order: 3,
    keywords: ['echo', 'trail', 'ghost', 'streak', 'smear', 'motion trail', 'afterimage', 'optical'],
    mount: mount
  });

  function mount(ctx) {
    var echoTime = -0.05;
    var numEchoes = 8;
    var decay = 0.7;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(echoSvg({ echoTime: echoTime, numEchoes: numEchoes, decay: decay }, 90)); }

    var echoTimeSlider = ui.slider({ label: 'Echo time', min: -1, max: 0, step: 0.01, value: echoTime,
      format: function (v) { return v.toFixed(2) + 's'; }, onInput: function (v) { echoTime = v; renderPreview(); } });
    var numEchoesField = ui.numberField({ label: 'Number of echoes', value: numEchoes, min: 1, max: 30, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { numEchoes = v; renderPreview(); } });
    var decaySlider = ui.slider({ label: 'Decay', min: 0, max: 1, step: 0.01, value: decay,
      format: function (v) { return v.toFixed(2); }, onInput: function (v) { decay = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Blends time-shifted copies of each selected layer into a single optical trail. Echo time sets the gap between copies; decay fades successive echoes.' }),
      previewHost,
      echoTimeSlider.el,
      numEchoesField.el,
      decaySlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('echo.apply', { echoTime: echoTime, numEchoes: numEchoes, decay: decay })
        .then(function (res) { ctx.toast('Echo on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: res.applied ? 'success' : 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add Echo', { kind: 'error' }); });
    }

    function getState() {
      return { echoTime: echoTime, numEchoes: numEchoes, decay: decay };
    }
    function applyState(s) {
      if (!s) return;
      if (s.echoTime != null) { echoTime = s.echoTime; echoTimeSlider.set(s.echoTime); }
      if (s.numEchoes != null) { numEchoes = s.numEchoes; numEchoesField.set(s.numEchoes); }
      if (s.decay != null) { decay = s.decay; decaySlider.set(s.decay); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'echo',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return echoSvg(st, (opts && opts.height) || 34); },
        defaults: ECHO_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to echo';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
