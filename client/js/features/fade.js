/*
 * Rebound, Fade tool.
 * Adds opacity fade-in and/or fade-out keyframes to each selected layer,
 * with independent frame durations and toggles for each end.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // The opacity envelope of a fade over time: ramp up (in), hold, ramp down
  // (out), shaped by the frame counts and ease, for the preset thumbnails.
  function fadeThumb(state, h) {
    var W = 120, pad = 6, top = pad, bot = 40 - pad;
    var doIn = state.doIn !== false, doOut = state.doOut !== false;
    var inW = doIn ? Math.min(48, 8 + (state.inFrames == null ? 12 : state.inFrames) * 1.4) : 0;
    var outW = doOut ? Math.min(48, 8 + (state.outFrames == null ? 12 : state.outFrames) * 1.4) : 0;
    var x0 = pad, x1 = W - pad, span = x1 - x0 - 10;
    if (inW + outW > span && (inW + outW) > 0) { var sc = span / (inW + outW); inW *= sc; outW *= sc; }
    var smooth = state.ease !== 'linear';
    function ramp(xa, ya, xb, yb) {
      if (!smooth) return 'L' + xb.toFixed(1) + ' ' + yb;
      var cx = (xa + xb) / 2;
      return 'C' + cx.toFixed(1) + ' ' + ya + ' ' + cx.toFixed(1) + ' ' + yb + ' ' + xb.toFixed(1) + ' ' + yb;
    }
    var d = 'M' + x0 + ' ' + (doIn ? bot : top);
    if (doIn) d += ' ' + ramp(x0, bot, x0 + inW, top);
    d += ' L' + (doOut ? (x1 - outW) : x1).toFixed(1) + ' ' + top;
    if (doOut) d += ' ' + ramp(x1 - outW, top, x1, bot);
    d += ' L' + x1 + ' ' + bot + ' L' + x0 + ' ' + bot + ' Z';
    return svg('svg', { viewBox: '0 0 120 40', width: '100%', height: h }, [
      svg('path', { d: d, fill: 'var(--rb-accent)', 'fill-opacity': '0.35', stroke: 'var(--rb-accent)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' })
    ]);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var FADE_DEFAULTS = [
    { name: 'Quick', state: { doIn: true, doOut: true, inFrames: 6, outFrames: 6, ease: 'smooth' } },
    { name: 'Smooth', state: { doIn: true, doOut: true, inFrames: 12, outFrames: 12, ease: 'smooth' } },
    { name: 'Slow', state: { doIn: true, doOut: true, inFrames: 24, outFrames: 24, ease: 'smooth' } },
    { name: 'Linear cut', state: { doIn: true, doOut: true, inFrames: 8, outFrames: 8, ease: 'linear' } },
    { name: 'Fade in only', state: { doIn: true, doOut: false, inFrames: 16, outFrames: 12, ease: 'smooth' } }
  ];
  R.toolPresets.declare('fade', { defaults: FADE_DEFAULTS });

  R.tools.register({
    id: 'fade',
    title: 'Fade',
    group: 'Timing',
    order: 3,
    keywords: ['fade', 'opacity', 'in', 'out', 'dissolve', 'transition', 'timing'],
    mount: mount
  });

  function mount(ctx) {
    var doIn = true;
    var doOut = true;
    var inFrames = 12;
    var outFrames = 12;
    var ease = 'smooth';

    // Live opacity-over-time graph that reacts to the toggles, frames, and ease.
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '8px' } });
    function renderFade() { R.dom.clear(previewHost); previewHost.appendChild(fadeThumb({ doIn: doIn, doOut: doOut, inFrames: inFrames, outFrames: outFrames, ease: ease }, 72)); }

    var inToggle = ui.toggle({ label: 'Fade in', value: doIn,
      onChange: function (v) { doIn = v; renderFade(); } });
    var inField = ui.numberField({ label: 'Fade in', value: inFrames, min: 0, step: 1, decimals: 0,
      suffix: 'fr', width: '110px', onChange: function (v) { inFrames = v; renderFade(); } });
    var outToggle = ui.toggle({ label: 'Fade out', value: doOut,
      onChange: function (v) { doOut = v; renderFade(); } });
    var outField = ui.numberField({ label: 'Fade out', value: outFrames, min: 0, step: 1, decimals: 0,
      suffix: 'fr', width: '110px', onChange: function (v) { outFrames = v; renderFade(); } });
    var easeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'Constant-rate fade' },
      { value: 'smooth', label: 'Smooth', title: 'Ease the fade in and out' }
    ], { value: ease, onChange: function (v) { ease = v; renderFade(); } });

    renderFade();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Keyframes opacity from transparent up at the layer in point and back down at the out point. Layers with an opacity expression are skipped.' }),
      previewHost,
      inToggle.el,
      ui.row('Fade in', inField.el),
      outToggle.el,
      ui.row('Fade out', outField.el),
      ui.row('Ease', easeCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      if (!doIn && !doOut) {
        ctx.toast('Enable a fade in or fade out', { kind: 'info' });
        return;
      }
      ctx.invoke('fade.apply', { inFrames: inFrames, outFrames: outFrames, doIn: doIn, doOut: doOut, ease: ease })
        .then(function (res) {
          var msg = 'Faded ' + res.faded + ' layer' + (res.faded === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) msg += ' · skipped ' + res.skipped.length;
          ctx.toast(msg, { kind: res.faded ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not fade', { kind: 'error' }); });
    }

    function getState() {
      return { doIn: doIn, doOut: doOut, inFrames: inFrames, outFrames: outFrames, ease: ease };
    }
    function applyState(s) {
      if (!s) return;
      if (s.doIn != null) { doIn = s.doIn; inToggle.set(s.doIn); }
      if (s.doOut != null) { doOut = s.doOut; outToggle.set(s.doOut); }
      if (s.inFrames != null) { inFrames = s.inFrames; inField.set(s.inFrames); }
      if (s.outFrames != null) { outFrames = s.outFrames; outField.set(s.outFrames); }
      if (s.ease != null) { ease = s.ease; easeCtl.set(s.ease); }
      renderFade();
    }

    return {
      presets: {
        toolId: 'fade',
        get: getState,
        set: applyState,
        thumbFor: function (state, opts) { return fadeThumb(state, (opts && opts.height) || 38); },
        defaults: FADE_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to fade';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
