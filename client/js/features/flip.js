/*
 * Rebound — Flip tool.
 * Mirrors selected layers across an axis by negating scale, optionally
 * reflecting each layer's position about the selection's bounding-box center.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'flip',
    title: 'Flip',
    group: 'Layout',
    order: 1,
    keywords: ['flip', 'mirror', 'reflect', 'reverse', 'horizontal', 'vertical'],
    mount: mount
  });

  function mount(ctx) {
    var axis = 'horizontal';
    var pivot = 'anchor';

    var axisCtl = ui.segmented([
      { value: 'horizontal', label: 'Horizontal', title: 'Mirror left to right' },
      { value: 'vertical', label: 'Vertical', title: 'Mirror top to bottom' },
      { value: 'both', label: 'Both', title: 'Mirror on both axes' }
    ], { value: axis, onChange: function (v) { axis = v; } });

    var pivotCtl = ui.segmented([
      { value: 'anchor', label: 'Anchor', title: 'Flip in place about each layer anchor' },
      { value: 'selection', label: 'Selection center', title: 'Reflect across the selection bounds' }
    ], { value: pivot, onChange: function (v) { pivot = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Mirrors selected layers by negating scale. Selection center also reflects each layer across the combined bounds.' }),
      ui.row('Axis', axisCtl.el),
      ui.row('Pivot', pivotCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('flip.apply', { axis: axis, pivot: pivot })
        .then(function (res) {
          ctx.toast('Flipped ' + res.flipped + ' layer' + (res.flipped === 1 ? '' : 's')
            + (res.skipped.length ? ' (' + res.skipped.length + ' skipped)' : ''), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not flip', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to flip';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
