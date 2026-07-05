/*
 * Rebound, Retime tool.
 * Proportionally rescales the timing of the selected keyframes around an anchor
 * (first key, playhead, or last key) so the move speeds up or slows down while
 * keeping its relative spacing and every key's value and ease. Drive it with a
 * scale factor or a target duration. A live track shows the before/after spacing
 * and reacts to the controls.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // A two-row track: faint "before" ticks and accent "after" ticks rescaled
  // around the anchor, for the live preview and the preset tiles.
  function retimeSvg(state, h) {
    var W = 160, H = 100;
    var f = state.factor;
    if (f == null || isNaN(f)) f = 1;
    if (f < 0.05) f = 0.05;
    if (f > 4) f = 4;
    var anchor = state.anchor || 'first';
    var ap = anchor === 'last' ? 1 : anchor === 'playhead' ? 0.5 : 0;
    var base = [0, 0.26, 0.5, 0.74, 1];
    var padX = 14, trackW = W - 2 * padX;
    function X(u) { return padX + clamp01(u) * trackW; }

    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    var ax = X(ap);
    kids.push(svg('line', { x1: ax.toFixed(1), y1: 12, x2: ax.toFixed(1), y2: H - 10, stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.7' }));

    var yBefore = 38, yAfter = 74;
    kids.push(svg('text', { x: 6, y: yBefore - 11, 'font-size': 9, fill: 'var(--rb-text-faint)' }, ['before']));
    kids.push(svg('text', { x: 6, y: yAfter - 11, 'font-size': 9, fill: 'var(--rb-text-faint)' }, ['after']));
    kids.push(svg('line', { x1: padX, y1: yBefore, x2: W - padX, y2: yBefore, stroke: 'var(--rb-border-strong)', 'stroke-width': 1 }));
    kids.push(svg('line', { x1: padX, y1: yAfter, x2: W - padX, y2: yAfter, stroke: 'var(--rb-border-strong)', 'stroke-width': 1 }));

    function tick(x, y, on) {
      return svg('rect', { x: (x - 1.4).toFixed(1), y: (y - 6).toFixed(1), width: 2.8, height: 12, rx: 1,
        fill: on ? 'var(--rb-accent)' : 'var(--rb-text-faint)', 'fill-opacity': on ? '0.95' : '0.6' });
    }
    for (var i = 0; i < base.length; i++) {
      kids.push(tick(X(base[i]), yBefore, false));
      kids.push(tick(X(ap + (base[i] - ap) * f), yAfter, true));
    }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var RETIME_DEFAULTS = [
    { name: '2x faster', state: { mode: 'scale', factor: 0.5, anchor: 'first' } },
    { name: 'Half speed', state: { mode: 'scale', factor: 2, anchor: 'first' } },
    { name: 'Tighten', state: { mode: 'scale', factor: 0.75, anchor: 'first' } },
    { name: 'Loosen', state: { mode: 'scale', factor: 1.5, anchor: 'first' } },
    { name: 'Faster from playhead', state: { mode: 'scale', factor: 0.5, anchor: 'playhead' } }
  ];
  R.toolPresets.declare('retime', { defaults: RETIME_DEFAULTS });

  R.tools.register({
    id: 'retime',
    title: 'Retime',
    group: 'Timing',
    order: 7,
    quick: {
      desc: 'Rescale the selected keyframes to half their spacing (2x faster), holding the first key.',
      method: 'retime.apply',
      args: { mode: 'scale', factor: 0.5, duration: 1, anchor: 'first' },
      config: [{ arg: 'anchor', label: 'Anchor', type: 'select', options: [
        { value: 'first', label: 'First' },
        { value: 'playhead', label: 'Playhead' },
        { value: 'last', label: 'Last' }
      ] }]
    },
    keywords: ['retime', 'rescale', 'speed', 'slow', 'fast', 'stretch', 'duration', 'timing', 'keyframe', 'dependener'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'scale';
    var factor = 0.5;
    var duration = 1;
    var anchor = 'first';

    // A factor that drives the preview in either mode (duration is illustrated
    // against a nominal one-second span).
    function previewFactor() {
      return mode === 'duration' ? Math.max(0.05, Math.min(4, duration)) : factor;
    }

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(retimeSvg({ factor: previewFactor(), anchor: anchor }, 110)); }

    var modeCtl = ui.segmented([
      { value: 'scale', label: 'Scale', title: 'Multiply the spacing by a factor' },
      { value: 'duration', label: 'Duration', title: 'Fit the selected keys into a target total duration' }
    ], { value: mode, onChange: function (v) { mode = v; syncMode(); renderPreview(); } });

    var factorField = ui.numberField({ label: 'Scale', value: factor, min: 0.05, max: 4, step: 0.05, decimals: 2, suffix: 'x', width: '120px',
      onChange: function (v) { factor = v; renderPreview(); } });
    var durationField = ui.numberField({ label: 'Duration', value: duration, min: 0.05, step: 0.1, decimals: 2, suffix: 's', width: '120px',
      onChange: function (v) { duration = v; renderPreview(); } });

    var factorRow = ui.row('Scale', factorField.el);
    var durationRow = ui.row('Duration', durationField.el);

    var anchorCtl = ui.segmented([
      { value: 'first', label: 'First', title: 'Hold the first selected key in place' },
      { value: 'playhead', label: 'Playhead', title: 'Rescale around the current time' },
      { value: 'last', label: 'Last', title: 'Hold the last selected key in place' }
    ], { value: anchor, onChange: function (v) { anchor = v; renderPreview(); } });

    function syncMode() {
      factorRow.style.display = mode === 'scale' ? '' : 'none';
      durationRow.style.display = mode === 'duration' ? '' : 'none';
    }
    syncMode();
    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Speeds up or slows down the selected keyframes around an anchor, keeping their relative spacing, values, and eases.' }),
      previewHost,
      ui.row('Mode', modeCtl.el),
      factorRow,
      durationRow,
      ui.row('Anchor', anchorCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('retime.apply', { mode: mode, factor: factor, duration: duration, anchor: anchor })
        .then(function (res) {
          ctx.toast('Retimed ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not retime', { kind: 'error' }); });
    }

    function getState() { return { mode: mode, factor: factor, duration: duration, anchor: anchor }; }
    function applyState(s) {
      if (!s) return;
      if (s.mode != null) { mode = s.mode; modeCtl.set(s.mode); }
      if (s.factor != null) { factor = s.factor; factorField.set(s.factor); }
      if (s.duration != null) { duration = s.duration; durationField.set(s.duration); }
      if (s.anchor != null) { anchor = s.anchor; anchorCtl.set(s.anchor); }
      syncMode();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'retime',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return retimeSvg({ factor: st.mode === 'duration' ? st.duration : st.factor, anchor: st.anchor }, (opts && opts.height) || 38); },
        defaults: RETIME_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
