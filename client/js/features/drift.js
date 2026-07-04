/*
 * Rebound, Drift tool.
 * Adds organic random motion (smooth or stepped) to any property via a wiggle
 * expression rig with a per-layer seed.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A wander path: amplitude scales with Amount, wiggle rate with Frequency, and
  // Hold quantizes it into steps.
  function driftSvg(state, h) {
    var W = 160, H = 90, padX = 12, padY = 12, midY = H / 2;
    var amp = Math.max(0, Math.min(200, state.amount || 0)) / 200 * (H / 2 - padY);
    var freq = Math.max(0.1, Math.min(12, state.frequency || 1));
    function noise(u) { return Math.sin(u * freq * 2 * Math.PI) * 0.6 + Math.sin(u * freq * 4.3 * Math.PI + 1.3) * 0.4; }
    var n = 64, d = '', i;
    for (i = 0; i <= n; i++) {
      var u = i / n, x = padX + u * (W - 2 * padX), y;
      if (state.type === 'hold') { var steps = Math.max(2, Math.round(freq * 2)); y = midY - noise(Math.floor(u * steps) / steps) * amp; }
      else y = midY - noise(u) * amp;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: padX, y1: midY, x2: W - padX, y2: midY, stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.5' }),
      svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' })
    ]);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var DRIFT_DEFAULTS = [
    { name: 'Subtle', state: { type: 'smooth', amount: 8, frequency: 1 } },
    { name: 'Organic', state: { type: 'smooth', amount: 20, frequency: 2 } },
    { name: 'Lively', state: { type: 'smooth', amount: 60, frequency: 4 } },
    { name: 'Stepped', state: { type: 'hold', amount: 40, frequency: 6 } }
  ];
  R.toolPresets.declare('drift', { defaults: DRIFT_DEFAULTS });

  R.tools.register({
    id: 'drift',
    title: 'Drift',
    group: 'Physics',
    order: 1,
    keywords: ['drift', 'wiggle', 'random', 'noise', 'organic', 'jitter'],
    mount: mount
  });

  function mount(ctx) {
    var type = 'smooth';
    var amount = 20;
    var frequency = 2;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(driftSvg({ type: type, amount: amount, frequency: frequency }, 90)); }

    var typeCtl = ui.segmented([
      { value: 'smooth', label: 'Smooth' },
      { value: 'hold', label: 'Hold' }
    ], { value: type, onChange: function (v) { type = v; renderPreview(); } });

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 200, step: 1, value: amount,
      format: function (v) { return Math.round(v); }, onInput: function (v) { amount = v; renderPreview(); } });
    var freqSlider = ui.slider({ label: 'Frequency', min: 0.1, max: 12, step: 0.1, value: frequency,
      format: function (v) { return R.units.round(v, 1) + '/s'; }, onInput: function (v) { frequency = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds living, random motion to the selected properties. Amount is in the property’s own units (px, °, %).' }),
      previewHost,
      ui.row('Type', typeCtl.el),
      amountSlider.el,
      freqSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.properties.length ? sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies') : 'Select properties')
        : 'Open a composition';
    });

    function doApply() {
      ctx.invoke('drift.apply', { type: type, amount: amount, frequency: frequency })
        .then(function (res) { ctx.toast('Drift on ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Drift', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('drift.remove', {})
        .then(function (res) { ctx.toast('Removed Drift from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'info' }); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { type: type, amount: amount, frequency: frequency };
    }
    function applyState(s) {
      if (!s) return;
      if (s.type != null) { type = s.type; typeCtl.set(s.type); }
      if (s.amount != null) { amount = s.amount; amountSlider.set(s.amount); }
      if (s.frequency != null) { frequency = s.frequency; freqSlider.set(s.frequency); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'drift',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return driftSvg(st, (opts && opts.height) || 34); },
        defaults: DRIFT_DEFAULTS
      },
      destroy: off
    };
  }
})(window.Rebound = window.Rebound || {});
