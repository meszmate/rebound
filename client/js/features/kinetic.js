/*
 * Rebound — Kinetic tool.
 * Drives every selected layer except the first from the first layer's motion:
 * the faster the lead moves, the more the chosen transform property reacts,
 * via a marker-guarded expression backed by per-layer Slider Controls.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'kinetic',
    title: 'Kinetic',
    group: 'Physics',
    order: 6,
    keywords: ['kinetic', 'motion', 'velocity', 'speed', 'react', 'energy', 'drive'],
    mount: mount
  });

  function mount(ctx) {
    var target = 'scale';
    var sensitivity = 50;
    var max = 50;

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
      ui.row('Target', targetCtl.el),
      sensSlider.el,
      maxSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('kinetic.apply', { target: target, sensitivity: sensitivity, max: max })
        .then(function (res) { ctx.toast(res.applied + ' layer' + (res.applied === 1 ? '' : 's') + ' driven', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Kinetic', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('kinetic.remove', {})
        .then(function (res) { ctx.toast('Removed Kinetic from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select a source layer plus targets';
    return (sel.selectedLayerCount - 1) + ' target' + (sel.selectedLayerCount - 1 === 1 ? '' : 's');
  }
})(window.Rebound = window.Rebound || {});
