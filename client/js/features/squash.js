/*
 * Rebound, Squash & Stretch tool.
 * Volume-preserving squash on a layer's Scale, in two modes: Manual (a
 * keyframeable amount + axis) or Smart (derived automatically from the layer's
 * motion). A live box deforms to match the current settings.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Peak deformation a given state implies, as a factor k around 0.
  function peakK(st) {
    if (st.mode === 'manual') return (st.amount || 0) / 100;
    return (st.max || 0) / 100; // smart: show the cap as the peak squash
  }

  // A box sitting on a floor, deformed (volume-preserving) by the current state.
  function squashSvg(st, h) {
    var W = 160, H = 90, cx = W / 2, floor = 64, base = 38;
    var k = peakK(st);
    if (k <= -0.95) k = -0.95;
    var vert = st.mode === 'manual' ? (st.vertical !== false) : true;
    var fx = vert ? 1 / (1 + k) : (1 + k);
    var fy = vert ? (1 + k) : 1 / (1 + k);
    var w = base * fx, ht = base * fy;
    var kids = [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: cx - 50, y1: floor, x2: cx + 50, y2: floor, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }),
      // ghost of the neutral box for reference
      svg('rect', { x: cx - base / 2, y: floor - base, width: base, height: base, rx: 4, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-dasharray': '3 3', opacity: '0.4' }),
      svg('rect', { x: cx - w / 2, y: floor - ht, width: w, height: ht, rx: 4, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' })
    ];
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'squash',
    title: 'Squash',
    group: 'Physics',
    order: 9,
    keywords: ['squash', 'stretch', 'smart squash', 'volume', 'deform', 'bounce', 'impact', 'motion', 'physics'],
    mount: mount
  });

  function mount(ctx) {
    var st = { mode: 'smart', sensitivity: 60, max: 40, amount: -25, vertical: true };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(squashSvg(st, 90)); }

    var modeSeg = ui.segmented(
      [{ value: 'smart', label: 'Smart' }, { value: 'manual', label: 'Manual' }],
      { value: st.mode, onChange: function (v) { st.mode = v; syncMode(); renderPreview(); } }
    );

    // Smart controls
    var sensSlider = ui.slider({ label: 'Sensitivity', min: 0, max: 200, step: 1, value: st.sensitivity,
      format: function (v) { return Math.round(v); }, onInput: function (v) { st.sensitivity = v; renderPreview(); } });
    var maxSlider = ui.slider({ label: 'Max squash', min: 0, max: 90, step: 1, value: st.max,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.max = v; renderPreview(); } });
    var smartBox = el('div.rb-col', null, [sensSlider.el, maxSlider.el]);

    // Manual controls
    var amountSlider = ui.slider({ label: 'Amount', min: -80, max: 80, step: 1, value: st.amount,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.amount = v; renderPreview(); } });
    var axisSeg = ui.segmented(
      [{ value: 'v', label: 'Stretch Y' }, { value: 'h', label: 'Stretch X' }],
      { value: st.vertical ? 'v' : 'h', onChange: function (v) { st.vertical = (v === 'v'); renderPreview(); } }
    );
    var manualBox = el('div.rb-col', null, [amountSlider.el, ui.row('Axis', axisSeg.el)]);

    function syncMode() {
      smartBox.style.display = st.mode === 'smart' ? '' : 'none';
      manualBox.style.display = st.mode === 'manual' ? '' : 'none';
    }
    syncMode();
    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Volume-preserving squash on Scale. Smart derives it from the layer’s motion; Manual gives you a keyframeable amount.' }),
      previewHost,
      ui.row('Mode', modeSeg.el),
      smartBox,
      manualBox
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('squash.apply', st)
        .then(function (res) { ctx.toast((res.mode === 'smart' ? 'Smart squash' : 'Squash') + ' on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Squash', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('squash.remove', {})
        .then(function (res) { ctx.toast('Removed Squash from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() { return { mode: st.mode, sensitivity: st.sensitivity, max: st.max, amount: st.amount, vertical: st.vertical }; }
    function applyState(s) {
      if (!s) return;
      if (s.mode) { st.mode = s.mode; modeSeg.set(s.mode); }
      if (s.sensitivity != null) { st.sensitivity = s.sensitivity; sensSlider.set(s.sensitivity); }
      if (s.max != null) { st.max = s.max; maxSlider.set(s.max); }
      if (s.amount != null) { st.amount = s.amount; amountSlider.set(s.amount); }
      if (s.vertical != null) { st.vertical = s.vertical; axisSeg.set(s.vertical ? 'v' : 'h'); }
      syncMode();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'squash',
        get: getState,
        set: applyState,
        thumbFor: function (s, opts) { return squashSvg(s, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Smart Subtle', state: { mode: 'smart', sensitivity: 40, max: 22 } },
          { name: 'Smart Lively', state: { mode: 'smart', sensitivity: 80, max: 50 } },
          { name: 'Squash', state: { mode: 'manual', amount: -35, vertical: true } },
          { name: 'Stretch', state: { mode: 'manual', amount: 45, vertical: true } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
