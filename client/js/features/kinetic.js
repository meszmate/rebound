/*
 * Rebound, Kinetic tool.
 * Drives every selected layer except the first from the first layer's motion:
 * the faster the lead moves, the more the chosen transform property reacts,
 * via a marker-guarded expression backed by per-layer Slider Controls. The
 * preview animates the relationship: a lead dot sweeps and the driven square
 * pulses / spins / fades with the lead's speed, live against the sliders.
 * Selecting an already-rigged layer loads its values back into the sliders.
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

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var KINETIC_DEFAULTS = [
    { name: 'Scale Pulse', state: { target: 'scale', sensitivity: 50, max: 50 } },
    { name: 'Big Scale', state: { target: 'scale', sensitivity: 120, max: 100 } },
    { name: 'Spin React', state: { target: 'rotation', sensitivity: 80, max: 90 } },
    { name: 'Speed Fade', state: { target: 'opacity', sensitivity: 60, max: 70 } }
  ];
  R.toolPresets.declare('kinetic', { defaults: KINETIC_DEFAULTS });

  R.tools.register({
    id: 'kinetic',
    title: 'Kinetic',
    group: 'Physics',
    order: 6,
    // One-click Home tile: the tool's primary apply with its defaults; the
    // per-tile customizer can retarget the driven property.
    quick: {
      desc: 'Drive scale on every selected layer except the first from the lead layer motion.',
      method: 'kinetic.apply',
      args: { target: 'scale', sensitivity: 50, max: 50 },
      config: [{ arg: 'target', label: 'Target', type: 'select', options: [
        { value: 'scale', label: 'Scale' },
        { value: 'rotation', label: 'Rotation' },
        { value: 'opacity', label: 'Opacity' }
      ] }]
    },
    keywords: ['kinetic', 'motion', 'velocity', 'speed', 'react', 'energy', 'drive'],
    mount: mount
  });

  function mount(ctx) {
    var target = 'scale';
    var sensitivity = 50;
    var max = 50;

    // ---- live preview: the lead dot sweeps, the driven square reacts ---------
    var LEADY = 24, TX = 80, TY = 60;
    var leadTrack = svg('line', { x1: 20, y1: LEADY, x2: 140, y2: LEADY, stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.6' });
    var leadDot = svg('circle', { cx: 80, cy: LEADY, r: 5, fill: 'var(--rb-accent)' });
    var driveRect = svg('rect', { x: -11, y: -11, width: 22, height: 22, rx: 3, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' });
    var driveG = svg('g', { transform: 'translate(' + TX + ',' + TY + ')' }, [driveRect]);
    var stage = svg('svg', { viewBox: '0 0 160 90', width: '100%', height: 90 }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      leadTrack, leadDot, driveG
    ]);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);

    // amt = min(speed * sensitivity, max), the same shape as the rig's
    // Math.min(sp * sens / 1000, max) with the lead's speed normalised to 0..1.
    var sim = R.ui.miniSim({ el: previewHost, draw: function (t) {
      var w = 2.4;
      leadDot.setAttribute('cx', (80 + Math.sin(t * w) * 52).toFixed(1));
      var vel = Math.cos(t * w); // signed, |vel| in 0..1
      var amt = Math.min(Math.abs(vel) * sensitivity, max);
      var scale = 1, rot = 0, op = 0.85;
      if (target === 'scale') scale = 1 + amt / 150;
      else if (target === 'rotation') rot = amt * (vel >= 0 ? 1 : -1);
      else op = Math.max(0.06, 0.85 * (1 - amt / 100));
      driveG.setAttribute('transform', 'translate(' + TX + ',' + TY + ') rotate(' + rot.toFixed(1) + ') scale(' + scale.toFixed(3) + ')');
      driveRect.setAttribute('fill-opacity', op.toFixed(2));
    } });

    var targetCtl = ui.segmented([
      { value: 'scale', label: 'Scale' },
      { value: 'rotation', label: 'Rotation' },
      { value: 'opacity', label: 'Opacity' }
    ], { value: target, onChange: function (v) { target = v; } });

    var sensSlider = ui.slider({ label: 'Sensitivity', min: 0, max: 200, step: 1, value: sensitivity,
      format: function (v) { return Math.round(v); }, onInput: function (v) { sensitivity = v; } });
    var maxSlider = ui.slider({ label: 'Max', min: 0, max: 200, step: 1, value: max,
      format: function (v) { return Math.round(v); }, onInput: function (v) { max = v; } });

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
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function syncButtons(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.selectedLayerCount >= 2);
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); syncButtons(sel); syncRig(); });
    scopeText.textContent = describe(ctx.getSelection());
    syncButtons(ctx.getSelection());

    // ---- rig read-back: selecting rigged targets loads their values ---------
    var riggedCount = 0, rigSig = null, rigBusy = false;
    function syncRig() {
      applyBtn.textContent = riggedCount > 0 ? 'Update' : 'Apply';
      if (riggedCount > 0) scopeText.textContent = 'Kinetic on ' + riggedCount + ' layer' + (riggedCount === 1 ? '' : 's');
    }
    function readRig(sel) {
      if (!sel || !sel.hasComp || !sel.selectedLayerCount) { riggedCount = 0; rigSig = null; syncRig(); return; }
      var sig = (sel.layers || []).map(function (l) { return l.index + ':' + l.name + ':' + l.effectCount; }).join('|');
      if (sig === rigSig || rigBusy) return;
      rigBusy = true;
      ctx.invoke('rig.read', { tag: 'kinetic', sliders: ['Kinetic Sensitivity', 'Kinetic Max'] })
        .then(function (r) {
          rigBusy = false;
          rigSig = sig;
          riggedCount = (r && r.rigged) || 0;
          if (riggedCount > 0 && r.values) {
            applyState({ sensitivity: r.values['Kinetic Sensitivity'], max: r.values['Kinetic Max'] });
          }
          syncRig();
        })
        .catch(function () { rigBusy = false; });
    }

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
    }

    return {
      presets: {
        toolId: 'kinetic',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return kineticSvg(st, (opts && opts.height) || 34); },
        defaults: KINETIC_DEFAULTS
      },
      // Selecting already-driven layers loads their Kinetic back into the tool
      // (the shell only fires this for the visible tool, so no host spam).
      selectionRead: {
        matches: function (sel) { return !!(sel && sel.hasComp); },
        apply: function (res, sel) { readRig(sel); }
      },
      destroy: function () { sim.destroy(); off(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select a source layer plus targets';
    return (sel.selectedLayerCount - 1) + ' target' + (sel.selectedLayerCount - 1 === 1 ? '' : 's');
  }
})(window.Rebound = window.Rebound || {});
