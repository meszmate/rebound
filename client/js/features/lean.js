/*
 * Rebound, Lean tool.
 * Tilts a layer into its motion: rotation reacts to the layer's own horizontal
 * velocity via a marker-guarded expression backed by Amount + Smoothing sliders.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A layer banking into rightward motion: tilt follows Amount, and a faint
  // lagged ghost shows how Smoothing softens the response.
  function leanSvg(state, h) {
    var W = 160, H = 90, cx = W / 2, cy = H / 2 - 4;
    var amt = Math.max(0, Math.min(45, state.amount || 0));
    var sm = Math.max(0, Math.min(30, state.smoothing || 0));
    var lag = amt * (1 - Math.min(0.8, sm / 40));
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('line', { x1: cx - 44, y1: cy + 30, x2: cx + 40, y2: cy + 30, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }));
    kids.push(svg('path', { d: 'M' + (cx + 34) + ' ' + (cy + 26) + 'L' + (cx + 44) + ' ' + (cy + 30) + 'L' + (cx + 34) + ' ' + (cy + 34), fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }));
    if (sm > 0) kids.push(svg('g', { transform: 'translate(' + cx + ',' + cy + ') rotate(' + (-lag) + ')', opacity: '0.28' }, [svg('rect', { x: -26, y: -14, width: 52, height: 28, rx: 3, fill: 'var(--rb-text-faint)' })]));
    kids.push(svg('g', { transform: 'translate(' + cx + ',' + cy + ') rotate(' + (-amt) + ')' }, [svg('rect', { x: -26, y: -14, width: 52, height: 28, rx: 3, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' })]));
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var LEAN_DEFAULTS = [
    { name: 'Subtle', state: { amount: 4, smoothing: 6 } },
    { name: 'Natural', state: { amount: 8, smoothing: 4 } },
    { name: 'Aggressive', state: { amount: 20, smoothing: 2 } },
    { name: 'Smooth Bank', state: { amount: 12, smoothing: 12 } }
  ];
  R.toolPresets.declare('lean', { defaults: LEAN_DEFAULTS });

  R.tools.register({
    id: 'lean',
    title: 'Lean',
    group: 'Physics',
    order: 5,
    // One-click Home tile: the tool's primary apply with its defaults.
    quick: {
      desc: 'Tilt each selected layer into its own motion with a natural 8 degree lean.',
      method: 'lean.apply',
      args: { amount: 8, smoothing: 4 }
    },
    keywords: ['lean', 'tilt', 'banking', 'velocity', 'rotation', 'motion', 'physics'],
    mount: mount
  });

  function mount(ctx) {
    var amount = 8;
    var smoothing = 4;

    // ---- live preview: a card slides left-right and banks into the motion ---
    var cx = 80, cy = 41;
    var card = svg('g', null, [svg('rect', { x: -26, y: -14, width: 52, height: 28, rx: 3, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' })]);
    var stage = svg('svg', { viewBox: '0 0 160 90', width: '100%', height: 90 }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: 12, y1: cy + 30, x2: 148, y2: cy + 30, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }),
      card
    ]);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);

    // The card sweeps sinusoidally; its bank is the velocity smoothed over the
    // Smoothing window (the same windowed average the rig's expression takes),
    // scaled so the peak bank equals Amount.
    var sim = R.ui.miniSim({ el: previewHost, draw: function (t) {
      var w = 2.2;
      var x = cx + Math.sin(t * w) * 42;
      var ws = Math.max(smoothing, 0.5) / 30;
      // average of cos over [t-ws, t]: the smoothed, lagged velocity
      var vAvg = (Math.sin(t * w) - Math.sin((t - ws) * w)) / (ws * w);
      var bank = -vAvg * amount;
      card.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + cy + ') rotate(' + bank.toFixed(1) + ')');
    } });

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 45, step: 0.5, value: amount,
      format: function (v) { return R.units.round(v, 1) + '°'; }, onInput: function (v) { amount = v; } });
    var smoothSlider = ui.slider({ label: 'Smoothing', min: 0, max: 30, step: 1, value: smoothing,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { smoothing = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Tilts each layer into its own motion, rotation reacts to horizontal velocity. Amount is degrees per 1000 px/s.' }),
      previewHost,
      amountSlider.el,
      smoothSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function syncButtons(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.selectedLayerCount);
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); syncButtons(sel); syncRig(); });
    scopeText.textContent = describe(ctx.getSelection());
    syncButtons(ctx.getSelection());

    // ---- rig read-back: selecting a rigged layer loads its values -----------
    var riggedCount = 0, rigSig = null, rigBusy = false;
    function syncRig() {
      applyBtn.textContent = riggedCount > 0 ? 'Update' : 'Apply';
      if (riggedCount > 0) scopeText.textContent = 'Lean on ' + riggedCount + ' layer' + (riggedCount === 1 ? '' : 's');
    }
    function readRig(sel) {
      if (!sel || !sel.hasComp || !sel.selectedLayerCount) { riggedCount = 0; rigSig = null; syncRig(); return; }
      var sig = (sel.layers || []).map(function (l) { return l.index + ':' + l.name + ':' + l.effectCount; }).join('|');
      if (sig === rigSig || rigBusy) return;
      rigBusy = true;
      ctx.invoke('rig.read', { tag: 'lean', sliders: ['Lean Amount', 'Lean Smooth'] })
        .then(function (r) {
          rigBusy = false;
          rigSig = sig;
          riggedCount = (r && r.rigged) || 0;
          if (riggedCount > 0 && r.values) {
            applyState({ amount: r.values['Lean Amount'], smoothing: r.values['Lean Smooth'] });
          }
          syncRig();
        })
        .catch(function () { rigBusy = false; });
    }

    function doApply() {
      ctx.invoke('lean.apply', { amount: amount, smoothing: smoothing })
        .then(function (res) { ctx.toast('Lean on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Lean', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('lean.remove', {})
        .then(function (res) { ctx.toast('Removed Lean from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { amount: amount, smoothing: smoothing };
    }
    function applyState(s) {
      if (!s) return;
      if (s.amount != null) { amount = s.amount; amountSlider.set(s.amount); }
      if (s.smoothing != null) { smoothing = s.smoothing; smoothSlider.set(s.smoothing); }
    }

    return {
      presets: {
        toolId: 'lean',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return leanSvg(st, (opts && opts.height) || 34); },
        defaults: LEAN_DEFAULTS
      },
      selectionRead: {
        matches: function (sel) { return !!(sel && sel.hasComp); },
        apply: function (res, sel) { readRig(sel); }
      },
      destroy: function () { sim.destroy(); off(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});