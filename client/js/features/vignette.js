/*
 * Rebound, Vignette tool.
 * Drops a black solid that darkens the edges of the composition through a
 * feathered elliptical hole. Amount drives the layer opacity, Feather softens
 * the falloff, and Scale sizes the clear center. Replace existing swaps the
 * earlier Vignette layer instead of stacking a new one.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'vignette',
    title: 'Vignette',
    group: 'Generators',
    order: 2,
    keywords: ['vignette', 'darken', 'edges', 'falloff', 'adjustment', 'mask', 'feather', 'corners'],
    mount: mount
  });

  function mount(ctx) {
    var amount = 60;
    var feather = 150;
    var scale = 100;
    var replace = true;

    // Live preview: a sample frame with a radial vignette overlay that darkens,
    // softens, and resizes exactly as the three sliders change.
    var overlay = el('div', { style: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none' } });
    var frame = el('div', {
      style: {
        position: 'relative', height: '132px', borderRadius: 'var(--rb-radius-2)',
        overflow: 'hidden', border: '1px solid var(--rb-border)',
        background: 'linear-gradient(160deg, #7c8aa8 0%, #4a5872 55%, #2c3242 100%)'
      }
    }, [
      el('div', { style: { position: 'absolute', right: '20%', top: '18%', width: '54px', height: '54px', borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #f6e3b0, #e7b964)' } }),
      el('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%', background: 'linear-gradient(180deg, rgba(20,26,34,0.1), rgba(16,20,28,0.7))' } }),
      overlay
    ]);
    function updatePreview() { overlay.style.background = vigGradient(amount, feather, scale); }

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 100, step: 1, value: amount,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { amount = v; updatePreview(); } });
    var featherSlider = ui.slider({ label: 'Feather', min: 0, max: 300, step: 1, value: feather,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { feather = v; updatePreview(); } });
    var scaleSlider = ui.slider({ label: 'Scale', min: 50, max: 150, step: 1, value: scale,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { scale = v; updatePreview(); } });
    var replaceToggle = ui.toggle({ label: 'Replace existing', value: replace,
      title: 'Swap the earlier Vignette layer instead of stacking a new one on every apply.',
      onChange: function (v) { replace = v; } });

    updatePreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Darkens the edges of the frame through a soft elliptical hole, to draw the eye to the centre. Amount sets the strength, Feather softens the falloff, Scale sizes the clear centre.' }),
      frame,
      amountSlider.el,
      featherSlider.el,
      scaleSlider.el,
      replaceToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('vignette.apply', { amount: amount, feather: feather, scale: scale, replace: replace })
        .then(function () { ctx.toast('Added vignette', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add vignette', { kind: 'error' }); });
    }

    function getState() {
      return { amount: amount, feather: feather, scale: scale };
    }
    function applyState(s) {
      if (!s) return;
      if (s.amount != null) { amount = s.amount; amountSlider.set(s.amount); }
      if (s.feather != null) { feather = s.feather; featherSlider.set(s.feather); }
      if (s.scale != null) { scale = s.scale; scaleSlider.set(s.scale); }
      updatePreview();
    }

    return {
      presets: {
        toolId: 'vignette',
        get: getState,
        set: applyState,
        thumbFor: function (state, opts) { return vigSwatch(state, (opts && opts.height) || 38); },
        defaults: [
          { name: 'Subtle', state: { amount: 35, feather: 200, scale: 120 } },
          { name: 'Heavy', state: { amount: 85, feather: 100, scale: 80 } },
          { name: 'Wide', state: { amount: 50, feather: 250, scale: 140 } },
          { name: 'Tight', state: { amount: 70, feather: 80, scale: 70 } }
        ]
      },
      destroy: off
    };
  }

  // The vignette overlay gradient for a given state (shared by the live preview
  // and the preset thumbnails).
  function vigGradient(amount, feather, scale) {
    var a = (amount / 100).toFixed(3);
    var clearPct = 22 + (scale - 50) / 100 * 48;        // bigger scale = larger clear centre
    var edge = Math.min(112, clearPct + 14 + (feather / 300) * 52); // feather widens the falloff
    return 'radial-gradient(ellipse at center, rgba(0,0,0,0) ' +
      clearPct.toFixed(0) + '%, rgba(0,0,0,' + a + ') ' + edge.toFixed(0) + '%)';
  }
  // A small framed swatch of a preset, for the gallery tiles and Save dialog.
  function vigSwatch(state, h) {
    return el('div', { style: { position: 'relative', height: h + 'px', borderRadius: 'var(--rb-radius-1)', overflow: 'hidden', background: 'linear-gradient(160deg, #7c8aa8 0%, #4a5872 55%, #2c3242 100%)' } }, [
      el('div', { style: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, background: vigGradient(state.amount == null ? 60 : state.amount, state.feather == null ? 150 : state.feather, state.scale == null ? 100 : state.scale) } })
    ]);
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Adds to the active composition';
  }
})(window.Rebound = window.Rebound || {});