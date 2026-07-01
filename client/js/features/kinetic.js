/*
 * Rebound, Kinetic tool.
 * Drives every selected layer except the first from the first layer's motion:
 * the faster the lead moves, the more the chosen transform property reacts,
 * via a marker-guarded expression backed by per-layer Slider Controls.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A response graph: input lead velocity on X, output property change on Y. The
  // slope is Sensitivity and the dashed ceiling is Max.
  function kineticSvg(state, h) {
    var W = 160, H = 90, pad = 14;
    var x0 = pad, y0 = H - pad, x1 = W - pad, y1 = pad;
    var plotW = x1 - x0, plotH = y0 - y1;
    var sens = Math.max(0, Math.min(200, state.sensitivity || 0)) / 100;
    var maxF = Math.max(0, Math.min(200, state.max || 0)) / 200;
    var capY = y0 - maxF * plotH;
    var d = 'M' + x0 + ' ' + y0;
    for (var i = 0; i <= 40; i++) { var u = i / 40, val = Math.min(maxF, sens * u); d += ' L' + (x0 + u * plotW).toFixed(1) + ' ' + (y0 - val * plotH).toFixed(1); }
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: x0, y1: y0, x2: x1, y2: y0, stroke: 'var(--rb-border)', 'stroke-width': 1 }),
      svg('line', { x1: x0, y1: y0, x2: x0, y2: y1, stroke: 'var(--rb-border)', 'stroke-width': 1 }),
      svg('line', { x1: x0, y1: capY.toFixed(1), x2: x1, y2: capY.toFixed(1), stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.6' }),
      svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.8 }),
      svg('text', { x: x0 + 1, y: y1 + 7, 'font-size': 8, fill: 'var(--rb-text-faint)' }, [String(state.target || '')]),
      svg('text', { x: x1 - 1, y: y0 - 3, 'font-size': 8, 'text-anchor': 'end', fill: 'var(--rb-text-faint)' }, ['velocity'])
    ]);
  }

  R.tools.register({
    id: 'kinetic',
    title: 'Kinetic',
    group: 'Physics',
    order: 6,
    keywords: ['kinetic', 'motion', 'velocity', 'speed', 'react', 'energy', 'drive'],
    mount: mount
  });

  function mount(ctx) {
    var target = 'scale';
    var sensitivity = 50;
    var max = 50;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(kineticSvg({ target: target, sensitivity: sensitivity, max: max }, 90)); }

    var targetCtl = ui.segmented([
      { value: 'scale', label: 'Scale' },
      { value: 'rotation', label: 'Rotation' },
      { value: 'opacity', label: 'Opacity' }
    ], { value: target, onChange: function (v) { target = v; renderPreview(); } });

    var sensSlider = ui.slider({ label: 'Sensitivity', min: 0, max: 200, step: 1, value: sensitivity,
      format: function (v) { return Math.round(v); }, onInput: function (v) { sensitivity = v; renderPreview(); } });
    var maxSlider = ui.slider({ label: 'Max', min: 0, max: 200, step: 1, value: max,
      format: function (v) { return Math.round(v); }, onInput: function (v) { max = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Drives every selected layer except the first from the first layer’s motion. Faster lead movement pushes the chosen property further; Max caps how far.' }),
      previewHost,
      ui.row('Target', targetCtl.el),
      sensSlider.el,
      maxSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('kinetic.apply', { target: target, sensitivity: sensitivity, max: max })
        .then(function (res) {
          ctx.toast(res.applied + ' layer' + (res.applied === 1 ? '' : 's') + ' driven', { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Kinetic', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('kinetic.remove', {})
        .then(function (res) { ctx.toast('Removed Kinetic from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not remove Kinetic', { kind: 'error' }); });
    }

    function getState() {
      return { target: target, sensitivity: sensitivity, max: max };
    }
    function applyState(s) {
      if (!s) return;
      if (s.target != null) { target = s.target; targetCtl.set(s.target); }
      if (s.sensitivity != null) { sensitivity = s.sensitivity; sensSlider.set(s.sensitivity); }
      if (s.max != null) { max = s.max; maxSlider.set(s.max); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'kinetic',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return kineticSvg(st, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Scale Pulse', state: { target: 'scale', sensitivity: 50, max: 50 } },
          { name: 'Big Scale', state: { target: 'scale', sensitivity: 120, max: 100 } },
          { name: 'Spin React', state: { target: 'rotation', sensitivity: 80, max: 90 } },
          { name: 'Speed Fade', state: { target: 'opacity', sensitivity: 60, max: 70 } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select a source layer plus targets';
    return (sel.selectedLayerCount - 1) + ' target' + (sel.selectedLayerCount - 1 === 1 ? '' : 's');
  }
})(window.Rebound = window.Rebound || {});
