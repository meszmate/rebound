/*
 * Rebound, Gradient tool.
 * Adds a gradient fill to selected shape layers. Choose a linear or radial ramp
 * and the two end colors; each shape group in the selection gets a gradient fill
 * with a visible horizontal ramp running between the chosen colors.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  // '#rrggbb' to a 0..1 RGB triplet for the host.
  function hexToRgb01(hex) {
    var h = ('' + hex).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

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
    var startHex = '#1e63ff';
    var endHex = '#16e0c0';

    var typeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'A straight gradient ramp' },
      { value: 'radial', label: 'Radial', title: 'A circular gradient ramp' }
    ], { value: type, onChange: function (v) { type = v; } });

    var startInput = el('input.rb-color-input', { type: 'color', value: startHex,
      oninput: function (e) { startHex = e.target.value; } });
    var endInput = el('input.rb-color-input', { type: 'color', value: endHex,
      oninput: function (e) { endHex = e.target.value; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds a gradient fill to every shape group in the selected shape layers, running between the two chosen colors. Non-shape layers are skipped.' }),
      ui.row('Type', typeCtl.el),
      ui.row('Start', startInput),
      ui.row('End', endInput)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('gradient.apply', { type: type, startColor: hexToRgb01(startHex), endColor: hexToRgb01(endHex) })
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
