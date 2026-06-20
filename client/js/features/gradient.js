/*
 * Rebound, Gradient tool.
 * Adds a gradient fill to selected shape layers. Choose a linear or radial
 * ramp; each shape group in the selection gets a gradient fill with a visible
 * horizontal ramp. AE's default black-to-white stops are left in place.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'gradient',
    title: 'Gradient',
    group: 'Color',
    order: 3,
    keywords: ['gradient', 'ramp', 'fill', 'linear', 'radial', 'blend', 'shape'],
    mount: mount
  });

  function mount(ctx) {
    var type = 'linear';

    var typeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'A straight gradient ramp' },
      { value: 'radial', label: 'Radial', title: 'A circular gradient ramp' }
    ], { value: type, onChange: function (v) { type = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds a gradient fill to every shape group in the selected shape layers, with a visible horizontal ramp. Non-shape layers are skipped.' }),
      ui.row('Type', typeCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('gradient.apply', { type: type })
        .then(function (res) {
          if (!res.applied) {
            ctx.toast('No shape layers to fill', { kind: 'info' });
          } else {
            ctx.toast('Filled ' + res.applied + ' shape layer' + (res.applied === 1 ? '' : 's')
              + (res.skipped ? ' (' + res.skipped + ' skipped)' : ''), { kind: 'success' });
          }
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not add gradient', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select shape layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
