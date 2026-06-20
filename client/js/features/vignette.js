/*
 * Rebound, Vignette tool.
 * Drops a non-rendering-free black adjustment layer that darkens the edges of
 * the composition with a feathered elliptical hole. Amount drives the layer
 * opacity, Feather softens the falloff, and Scale sizes the clear center.
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

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 100, step: 1, value: amount,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { amount = v; } });
    var featherSlider = ui.slider({ label: 'Feather', min: 0, max: 300, step: 1, value: feather,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { feather = v; } });
    var scaleSlider = ui.slider({ label: 'Scale', min: 50, max: 150, step: 1, value: scale,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { scale = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds a black adjustment layer that darkens the edges through a feathered elliptical hole. Amount sets the strength, Feather softens the falloff, Scale sizes the clear center.' }),
      amountSlider.el,
      featherSlider.el,
      scaleSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('vignette.apply', { amount: amount, feather: feather, scale: scale })
        .then(function () { ctx.toast('Added vignette', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add vignette', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Adds to the active composition';
  }
})(window.Rebound = window.Rebound || {});