/*
 * Rebound — Lean tool.
 * Tilts a layer into its motion: rotation reacts to the layer's own horizontal
 * velocity via a marker-guarded expression backed by Amount + Smoothing sliders.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'lean',
    title: 'Lean',
    group: 'Physics',
    order: 5,
    keywords: ['lean', 'tilt', 'banking', 'velocity', 'rotation', 'motion', 'physics'],
    mount: mount
  });

  function mount(ctx) {
    var amount = 8;
    var smoothing = 4;

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 45, step: 0.5, value: amount,
      format: function (v) { return R.units.round(v, 1) + '°'; }, onInput: function (v) { amount = v; } });
    var smoothSlider = ui.slider({ label: 'Smoothing', min: 0, max: 30, step: 1, value: smoothing,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { smoothing = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Tilts each layer into its own motion — rotation reacts to horizontal velocity. Amount is degrees per 1000 px/s.' }),
      amountSlider.el,
      smoothSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

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

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});