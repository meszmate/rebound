/*
 * Rebound, Drift tool.
 * Adds organic random motion (smooth or stepped) to any property via a wiggle
 * expression rig with a per-layer seed. Axis restricts the wiggle to X or Y,
 * Loop makes it seamless over a period, and the dice re-rolls the seed. The
 * preview animates a dot riding the noise trace, live against every control,
 * and selecting an already-rigged layer loads its values back into the sliders.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var W = 160, H = 90, PADX = 12, PADY = 12, MIDY = H / 2;

  // The shared noise the trace AND the riding dot sample, so the dot always
  // sits exactly on the drawn line. Seed shifts the phases so a re-roll
  // visibly changes the wander.
  function noiseAt(state, u) {
    var freq = Math.max(0.1, Math.min(12, state.frequency || 1));
    var sd = state.seed || 0;
    return Math.sin(u * freq * 2 * Math.PI + sd * 0.7) * 0.6 + Math.sin(u * freq * 4.3 * Math.PI + 1.3 + sd * 1.3) * 0.4;
  }
  function ampOf(state) { return Math.max(0, Math.min(200, state.amount || 0)) / 200 * (H / 2 - PADY); }
  function traceY(state, u) {
    var amp = ampOf(state);
    if (state.type === 'hold') {
      var freq = Math.max(0.1, Math.min(12, state.frequency || 1));
      var steps = Math.max(2, Math.round(freq * 2));
      return MIDY - noiseAt(state, Math.floor(u * steps) / steps) * amp;
    }
    return MIDY - noiseAt(state, u) * amp;
  }
  function traceD(state) {
    var n = 64, d = '', i;
    for (i = 0; i <= n; i++) {
      var u = i / n, x = PADX + u * (W - 2 * PADX);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + traceY(state, u).toFixed(1);
    }
    return d;
  }

  // A wander path: amplitude scales with Amount, wiggle rate with Frequency, and
  // Hold quantizes it into steps. (Static: preset tiles; the tool preview animates.)
  function driftSvg(state, h) {
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: PADX, y1: MIDY, x2: W - PADX, y2: MIDY, stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.5' }),
      svg('path', { d: traceD(state), fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' })
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
    keywords: ['drift', 'wiggle', 'random', 'noise', 'organic', 'jitter', 'seed', 'loop', 'axis'],
    mount: mount
  });

  function mount(ctx) {
    var st = { type: 'smooth', amount: 20, frequency: 2, axis: 'all', loop: false, loopSec: 3, seed: 0 };

    // ---- live preview: the noise trace plus a dot riding it -----------------
    var tracePath = svg('path', { d: '', fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.6, 'stroke-linejoin': 'round', opacity: '0.75' });
    var dot = svg('circle', { cx: PADX, cy: MIDY, r: 3.2, fill: 'var(--rb-accent)' });
    var stage = svg('svg', { viewBox: '0 0 160 90', width: '100%', height: 90 }, [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: PADX, y1: MIDY, x2: W - PADX, y2: MIDY, stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.5' }),
      tracePath, dot
    ]);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);
    function renderPreview() { tracePath.setAttribute('d', traceD(st)); }

    var sim = R.ui.miniSim({ el: previewHost, draw: function (t) {
      // One sweep across the trace per cycle; with Loop on the cycle IS the
      // loop period, so the seamless restart is visible.
      var cycle = st.loop ? Math.max(0.5, st.loopSec || 3) : 4;
      var u = (t / cycle) % 1;
      dot.setAttribute('cx', (PADX + u * (W - 2 * PADX)).toFixed(1));
      dot.setAttribute('cy', traceY(st, u).toFixed(1));
    } });

    // ---- controls ------------------------------------------------------------
    var typeCtl = ui.segmented([
      { value: 'smooth', label: 'Smooth' },
      { value: 'hold', label: 'Hold' }
    ], { value: st.type, onChange: function (v) { st.type = v; renderPreview(); } });

    var axisCtl = ui.segmented([
      { value: 'all', label: 'All' },
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' }
    ], { value: st.axis, onChange: function (v) { st.axis = v; } });

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 200, step: 1, value: st.amount,
      format: function (v) { return Math.round(v); }, onInput: function (v) { st.amount = v; renderPreview(); } });
    var freqSlider = ui.slider({ label: 'Frequency', min: 0.1, max: 12, step: 0.1, value: st.frequency,
      format: function (v) { return R.units.round(v, 1) + '/s'; }, onInput: function (v) { st.frequency = v; renderPreview(); } });

    var loopSecField = ui.numberField({ label: 'Period', value: st.loopSec, min: 0.5, max: 30, step: 0.5, decimals: 1, suffix: 's',
      onChange: function (v) { st.loopSec = v; } });
    var loopBox = el('div.rb-row.rb-wrap', null, [loopSecField.el]);
    loopBox.style.display = 'none';
    var loopTog = ui.toggle({ label: 'Loop seamlessly', value: st.loop,
      onChange: function (v) { st.loop = v; loopBox.style.display = v ? '' : 'none'; } });

    // Dice: bump the seed; if the selection is already rigged, re-apply so the
    // new noise lands immediately.
    var rerollBtn = el('button.rb-btn.is-ghost', {
      title: 'Re-roll the random seed (re-applies when the selection is already rigged)',
      onclick: function () {
        st.seed = Math.floor(Math.random() * 1000);
        syncSeed();
        renderPreview();
        if (riggedCount > 0) doApply();
      }
    }, ['⚄ Re-roll']);
    var seedChip = el('span.rb-faint', { text: '' });
    function syncSeed() { seedChip.textContent = 'Seed ' + Math.round(st.seed); }
    syncSeed();

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds living, random motion to the selected properties. Amount is in the property’s own units (px, °, %).' }),
      previewHost,
      ui.row('Type', typeCtl.el),
      ui.row('Axis', axisCtl.el),
      amountSlider.el,
      freqSlider.el,
      loopTog.el,
      loopBox,
      el('div.rb-row', null, [rerollBtn, seedChip])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function describe(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      return sel.properties.length
        ? sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies')
        : 'Select properties';
    }
    function syncButtons(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.properties.length);
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); syncButtons(sel); syncRig(); });
    scopeText.textContent = describe(ctx.getSelection());
    syncButtons(ctx.getSelection());

    // ---- rig read-back: selecting a rigged layer loads its values -----------
    var riggedCount = 0, rigSig = null, rigBusy = false;
    function syncRig() {
      applyBtn.textContent = riggedCount > 0 ? 'Update' : 'Apply';
      if (riggedCount > 0) scopeText.textContent = 'Drift on ' + riggedCount + ' layer' + (riggedCount === 1 ? '' : 's');
    }
    function readRig(sel) {
      if (!sel || !sel.hasComp || !sel.selectedLayerCount) { riggedCount = 0; rigSig = null; syncRig(); return; }
      var sig = (sel.layers || []).map(function (l) { return l.index + ':' + l.name + ':' + l.effectCount; }).join('|');
      if (sig === rigSig || rigBusy) return;
      rigBusy = true;
      ctx.invoke('rig.read', { tag: 'drift', sliders: ['Drift Amount', 'Drift Frequency', 'Drift Seed', 'Drift Loop'] })
        .then(function (r) {
          rigBusy = false;
          rigSig = sig;
          riggedCount = (r && r.rigged) || 0;
          if (riggedCount > 0 && r.values) {
            var s = {};
            if (r.values['Drift Amount'] != null) s.amount = r.values['Drift Amount'];
            if (r.values['Drift Frequency'] != null) s.frequency = r.values['Drift Frequency'];
            if (r.values['Drift Seed'] != null) s.seed = r.values['Drift Seed'];
            if (r.values['Drift Loop'] != null) { s.loop = true; s.loopSec = r.values['Drift Loop']; }
            applyState(s);
          }
          syncRig();
        })
        .catch(function () { rigBusy = false; });
    }

    function doApply() {
      ctx.invoke('drift.apply', { type: st.type, amount: st.amount, frequency: st.frequency, axis: st.axis, loop: st.loop, loopSec: st.loopSec, seed: st.seed })
        .then(function (res) { ctx.toast('Drift on ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Drift', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('drift.remove', {})
        .then(function (res) { ctx.toast('Removed Drift from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { type: st.type, amount: st.amount, frequency: st.frequency, axis: st.axis, loop: st.loop, loopSec: st.loopSec, seed: st.seed };
    }
    function applyState(s) {
      if (!s) return;
      if (s.type != null) { st.type = s.type; typeCtl.set(s.type); }
      if (s.axis != null) { st.axis = s.axis; axisCtl.set(s.axis); }
      if (s.amount != null) { st.amount = s.amount; amountSlider.set(s.amount); }
      if (s.frequency != null) { st.frequency = s.frequency; freqSlider.set(s.frequency); }
      if (s.loop != null) { st.loop = s.loop; loopTog.set(s.loop); loopBox.style.display = s.loop ? '' : 'none'; }
      if (s.loopSec != null) { st.loopSec = s.loopSec; loopSecField.set(s.loopSec); }
      if (s.seed != null) { st.seed = s.seed; syncSeed(); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'drift',
        get: getState,
        set: applyState,
        thumbFor: function (state, opts) { return driftSvg(state, (opts && opts.height) || 34); },
        defaults: DRIFT_DEFAULTS
      },
      // Selecting an already-rigged layer loads its Drift back into the tool
      // (the shell only fires this for the visible tool, so no host spam).
      selectionRead: {
        matches: function (sel) { return !!(sel && sel.hasComp); },
        apply: function (res, sel) { readRig(sel); }
      },
      destroy: function () { sim.destroy(); off(); }
    };
  }
})(window.Rebound = window.Rebound || {});
