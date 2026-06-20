/*
 * Rebound, Sequence tool.
 * Lines the selected layers up end-to-end in time so each one begins when the
 * previous ends, with an overlap control (negative leaves gaps, positive
 * overlaps) and an optional trim-to-fit that clips each layer to its slot.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'sequence',
    title: 'Sequence',
    group: 'Timing',
    order: 4,
    keywords: ['sequence', 'end to end', 'chain', 'overlap', 'timing', 'order', 'butt'],
    mount: mount
  });

  function mount(ctx) {
    var order = 'selection';
    var overlapFrames = 0;
    var trim = false;

    var orderSeg = ui.segmented([
      { value: 'selection', label: 'Selection', title: 'Use the order the layers were selected in' },
      { value: 'topdown', label: 'Top-down', title: 'Order by stacking order, top layer first' },
      { value: 'reverse', label: 'Reverse', title: 'Reverse the selection order' }
    ], { value: order, onChange: function (v) { order = v; } });

    var overlapSlider = ui.slider({ label: 'Overlap', min: -30, max: 30, step: 1, value: overlapFrames,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { overlapFrames = v; } });
    var trimToggle = ui.toggle({ label: 'Trim to fit', value: trim,
      onChange: function (v) { trim = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Shifts whole layers in time so each starts when the one before it ends. Negative overlap leaves gaps; positive overlaps the layers.' }),
      ui.row('Order', orderSeg.el),
      overlapSlider.el,
      trimToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('sequence.apply', { order: order, overlapFrames: overlapFrames, trim: trim })
        .then(function (res) { ctx.toast('Sequenced ' + res.sequenced + ' layer' + (res.sequenced === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not sequence', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select two or more layers to sequence';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});