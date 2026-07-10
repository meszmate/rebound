/*
 * Rebound, Follow tool.
 * Makes every selected layer except the first trail the first layer's position
 * by a fixed delay, driven by a marker-guarded expression backed by a per-layer
 * Slider Control. Cascade adds another delay step to each successive follower.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A lead bar plus three followers. Each follower is offset by the delay; with
  // Cascade on the offset compounds down the chain (a staircase), off they share
  // one delay (parallel trail).
  function followSvg(state, h) {
    var W = 160, H = 100, pad = 8, n = 4, rowH = (H - 2 * pad) / n, barH = Math.max(6, rowH - 4), bw = 72;
    var d = Math.max(0, Math.min(60, state.delayFrames || 0)) * 1.4;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var r = 0; r < n; r++) {
      var off = r === 0 ? 0 : (state.cascade ? r * d : d);
      var x = pad + off, w = bw;
      if (x + w > W - pad) w = (W - pad) - x;
      if (w < 6) w = 6;
      var y = pad + r * rowH + (rowH - barH) / 2;
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
    keywords: ['follow', 'follow through', 'trail', 'delay', 'lag', 'chain', 'cascade', 'lead'],
    mount: mount
  });

  function mount(ctx) {
    var delayFrames = 4;
    var cascade = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(followSvg({ delayFrames: delayFrames, cascade: cascade }, 100)); }

    var delaySlider = ui.slider({ label: 'Delay', min: 0, max: 60, step: 1, value: delayFrames,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { delayFrames = v; renderPreview(); } });
    var cascadeToggle = ui.toggle({ label: 'Cascade delay down the chain', value: cascade,
      onChange: function (v) { cascade = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Makes every selected layer except the first trail the first layer’s position by the delay below. Cascade adds another delay step to each layer down the selection.' }),
      previewHost,
      delaySlider.el,
      cascadeToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('follow.apply', { delayFrames: delayFrames, cascade: cascade })
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
      return { delayFrames: delayFrames, cascade: cascade };
    }
    function applyState(s) {
      if (!s) return;
      if (s.delayFrames != null) { delayFrames = s.delayFrames; delaySlider.set(s.delayFrames); }
      if (s.cascade != null) { cascade = s.cascade; cascadeToggle.set(s.cascade); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'follow',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return followSvg(st, (opts && opts.height) || 38); },
        defaults: FOLLOW_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select a lead layer plus followers';
    return (sel.selectedLayerCount - 1) + ' follower' + (sel.selectedLayerCount - 1 === 1 ? '' : 's');
  }
})(window.Rebound = window.Rebound || {});