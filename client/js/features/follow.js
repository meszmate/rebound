/*
 * Rebound, Follow tool.
 * Makes every selected layer except the first trail the first layer by a fixed
 * delay, driven by a marker-guarded expression backed by a per-layer Slider
 * Control. Cascade adds another delay step to each successive follower, and
 * Position / Rotation / Scale choose which properties trail. The preview
 * animates the chase: the lead bar sweeps and the followers ride its past
 * positions at the configured delay, live against the sliders.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var FW = 160, FH = 100, PAD = 8, ROWS = 4, BW = 44;

  // Static thumbnail for preset tiles: a lead bar plus three followers offset
  // by the delay (cascade compounds it down the chain).
  function followSvg(state, h) {
    var rowH = (FH - 2 * PAD) / ROWS, barH = Math.max(6, rowH - 4), bw = 72;
    var d = Math.max(0, Math.min(60, state.delayFrames || 0)) * 1.4;
    var kids = [svg('rect', { x: 1, y: 1, width: FW - 2, height: FH - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var r = 0; r < ROWS; r++) {
      var off = r === 0 ? 0 : (state.cascade ? r * d : d);
      var x = PAD + off, w = bw;
      if (x + w > FW - PAD) w = (FW - PAD) - x;
      if (w < 6) w = 6;
      var y = PAD + r * rowH + (rowH - barH) / 2;
      kids.push(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: barH.toFixed(1), rx: 2,
        fill: 'var(--rb-accent)', 'fill-opacity': r === 0 ? '0.95' : String(Math.max(0.35, 0.75 - r * 0.13)) }));
    }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var FOLLOW_DEFAULTS = [
    { name: 'Tight Trail', state: { delayFrames: 2, cascade: false } },
    { name: 'Loose Trail', state: { delayFrames: 8, cascade: false } },
    { name: 'Cascade', state: { delayFrames: 3, cascade: true } },
    { name: 'Long Cascade', state: { delayFrames: 6, cascade: true } }
  ];
  R.toolPresets.declare('follow', { defaults: FOLLOW_DEFAULTS });

  R.tools.register({
    id: 'follow',
    title: 'Follow',
    group: 'Physics',
    order: 4,
    quick: {
      desc: 'Make each selected layer trail the first layer by a four frame delay.',
      method: 'follow.apply',
      args: { delayFrames: 4, cascade: false }
    },
    keywords: ['follow', 'follow through', 'trail', 'delay', 'lag', 'chain', 'cascade', 'lead', 'rotation', 'scale'],
    mount: mount
  });

  function mount(ctx) {
    var st = { delayFrames: 4, cascade: false, position: true, rotation: false, scale: false };

    // ---- live preview: the followers chase the lead's past ------------------
    var rowH = (FH - 2 * PAD) / ROWS, barH = Math.max(6, rowH - 4);
    var bars = [];
    var kids = [svg('rect', { x: 1, y: 1, width: FW - 2, height: FH - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var r = 0; r < ROWS; r++) {
      var y = PAD + r * rowH + (rowH - barH) / 2;
      var bar = svg('rect', { x: PAD, y: y.toFixed(1), width: BW, height: barH.toFixed(1), rx: 2,
        fill: 'var(--rb-accent)', 'fill-opacity': r === 0 ? '0.95' : String(Math.max(0.35, 0.75 - r * 0.13)) });
      bars.push(bar);
      kids.push(bar);
    }
    var stage = svg('svg', { viewBox: '0 0 160 100', width: '100%', height: 100 }, kids);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);

    // The lead's position over time; followers sample it delaySec in the past,
    // exactly what the generated valueAtTime(time - d) expression does.
    function leadX(t) { return PAD + (0.5 - 0.5 * Math.cos(t * 1.7)) * (FW - 2 * PAD - BW); }
    var sim = R.ui.miniSim({ el: previewHost, draw: function (t) {
      for (var i = 0; i < bars.length; i++) {
        var steps = i === 0 ? 0 : (st.cascade ? i : 1);
        var dsec = st.delayFrames / 30 * steps;
        bars[i].setAttribute('x', leadX(t - dsec).toFixed(1));
      }
    } });

    // ---- controls ------------------------------------------------------------
    var delaySlider = ui.slider({ label: 'Delay', min: 0, max: 60, step: 1, value: st.delayFrames,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { st.delayFrames = v; } });
    var cascadeToggle = ui.toggle({ label: 'Cascade delay down the chain', value: st.cascade,
      onChange: function (v) { st.cascade = v; } });
    var posTog = ui.toggle({ label: 'Position', value: st.position, onChange: function (v) { st.position = v; } });
    var rotTog = ui.toggle({ label: 'Rotation', value: st.rotation, onChange: function (v) { st.rotation = v; } });
    var scaleTog = ui.toggle({ label: 'Scale', value: st.scale, onChange: function (v) { st.scale = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Makes every selected layer except the first trail the first layer by the delay below. Cascade adds another delay step to each layer down the selection.' }),
      previewHost,
      delaySlider.el,
      cascadeToggle.el,
      el('div.rb-section-label', { text: 'What trails' }),
      posTog.el, rotTog.el, scaleTog.el
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

    // ---- rig read-back: selecting rigged followers loads the shared delay ---
    var riggedCount = 0, rigSig = null, rigBusy = false;
    function syncRig() {
      applyBtn.textContent = riggedCount > 0 ? 'Update' : 'Apply';
      if (riggedCount > 0) scopeText.textContent = 'Follow on ' + riggedCount + ' layer' + (riggedCount === 1 ? '' : 's');
    }
    function readRig(sel) {
      if (!sel || !sel.hasComp || !sel.selectedLayerCount) { riggedCount = 0; rigSig = null; syncRig(); return; }
      var sig = (sel.layers || []).map(function (l) { return l.index + ':' + l.name + ':' + l.effectCount; }).join('|');
      if (sig === rigSig || rigBusy) return;
      rigBusy = true;
      ctx.invoke('rig.read', { tag: 'follow', sliders: ['Follow Delay'] })
        .then(function (r) {
          rigBusy = false;
          rigSig = sig;
          riggedCount = (r && r.rigged) || 0;
          if (riggedCount > 0 && r.values && r.values['Follow Delay'] != null) {
            applyState({ delayFrames: r.values['Follow Delay'] });
          }
          syncRig();
        })
        .catch(function () { rigBusy = false; });
    }

    function doApply() {
      if (!st.position && !st.rotation && !st.scale) {
        ctx.toast('Choose at least one property to follow', { kind: 'warn' });
        return;
      }
      ctx.invoke('follow.apply', { delayFrames: st.delayFrames, cascade: st.cascade, position: st.position, rotation: st.rotation, scale: st.scale })
        .then(function (res) {
          ctx.toast(res.applied + ' layer' + (res.applied === 1 ? '' : 's') + ' following', { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Follow', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('follow.remove', {})
        .then(function (res) { ctx.toast('Removed Follow from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { delayFrames: st.delayFrames, cascade: st.cascade, position: st.position, rotation: st.rotation, scale: st.scale };
    }
    function applyState(s) {
      if (!s) return;
      if (s.delayFrames != null) { st.delayFrames = s.delayFrames; delaySlider.set(s.delayFrames); }
      if (s.cascade != null) { st.cascade = s.cascade; cascadeToggle.set(s.cascade); }
      if (s.position != null) { st.position = s.position; posTog.set(s.position); }
      if (s.rotation != null) { st.rotation = s.rotation; rotTog.set(s.rotation); }
      if (s.scale != null) { st.scale = s.scale; scaleTog.set(s.scale); }
    }

    return {
      presets: {
        toolId: 'follow',
        get: getState,
        set: applyState,
        thumbFor: function (state, opts) { return followSvg(state, (opts && opts.height) || 38); },
        defaults: FOLLOW_DEFAULTS
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
    if (sel.selectedLayerCount < 2) return 'Select a lead layer plus followers';
    return (sel.selectedLayerCount - 1) + ' follower' + (sel.selectedLayerCount - 1 === 1 ? '' : 's');
  }
})(window.Rebound = window.Rebound || {});
