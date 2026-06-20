/*
 * Rebound — Drift tool.
 * Adds organic random motion (smooth or stepped) to any property via a wiggle
 * expression rig with a per-layer seed.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'drift',
    title: 'Drift',
    group: 'Physics',
    order: 1,
    keywords: ['drift', 'wiggle', 'random', 'noise', 'organic', 'jitter'],
    mount: mount
  });

  function mount(ctx) {
    var type = 'smooth';
    var amount = 20;
    var frequency = 2;

    var typeCtl = ui.segmented([
      { value: 'smooth', label: 'Smooth' },
      { value: 'hold', label: 'Hold' }
    ], { value: type, onChange: function (v) { type = v; } });

    var amountSlider = ui.slider({ label: 'Amount', min: 0, max: 200, step: 1, value: amount,
      format: function (v) { return Math.round(v); }, onInput: function (v) { amount = v; } });
    var freqSlider = ui.slider({ label: 'Frequency', min: 0.1, max: 12, step: 0.1, value: frequency,
      format: function (v) { return R.units.round(v, 1) + '/s'; }, onInput: function (v) { frequency = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds living, random motion to the selected properties. Amount is in the property’s own units (px, °, %).' }),
      ui.row('Type', typeCtl.el),
      amountSlider.el,
      freqSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.properties.length ? sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies') : 'Select properties')
        : 'Open a composition';
    });

    function doApply() {
      ctx.invoke('drift.apply', { type: type, amount: amount, frequency: frequency })
        .then(function (res) { ctx.toast('Drift on ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Drift', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('drift.remove', {})
        .then(function (res) { ctx.toast('Removed Drift from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'info' }); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    return { destroy: off };
  }
})(window.Rebound = window.Rebound || {});
