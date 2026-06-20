/*
 * Rebound — Align & Distribute tool.
 * A 9-point pad aligns selected layers (to the comp or the selection bounds);
 * distribute spreads three or more layers evenly or by a fixed gap.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var POINTS = [
    [0, 0], [0.5, 0], [1, 0],
    [0, 0.5], [0.5, 0.5], [1, 0.5],
    [0, 1], [0.5, 1], [1, 1]
  ];

  R.tools.register({
    id: 'align',
    title: 'Align',
    group: 'Layout',
    order: 0,
    keywords: ['align', 'distribute', 'arrange', 'center', 'layout', 'spread'],
    mount: mountAlign
  });

  function mountAlign(ctx) {
    var relativeTo = 'comp';
    var group = false;

    var pad = el('div.rb-anchor-grid');
    POINTS.forEach(function (pt) {
      pad.appendChild(el('button', {
        title: 'Align ' + labelFor(pt),
        onclick: function () { doAlign(pt[0], pt[1]); }
      }));
    });

    var relCtl = ui.segmented([
      { value: 'comp', label: 'Composition' },
      { value: 'selection', label: 'Selection' }
    ], { value: relativeTo, onChange: function (v) { relativeTo = v; } });

    var groupToggle = ui.toggle({ label: 'Move selection as a group', value: group,
      onChange: function (v) { group = v; } });

    var gapField = ui.numberField({ label: 'Gap', value: 0, step: 1, decimals: 0, suffix: 'px', width: '110px' });

    var distRow = el('div.rb-row.rb-wrap', null, [
      el('button.rb-btn', { onclick: function () { distribute('x', 'auto'); } }, ['Distribute H']),
      el('button.rb-btn', { onclick: function () { distribute('y', 'auto'); } }, ['Distribute V']),
      gapField.el,
      el('button.rb-btn.is-ghost', { onclick: function () { distribute('x', 'gap'); } }, ['H gap']),
      el('button.rb-btn.is-ghost', { onclick: function () { distribute('y', 'gap'); } }, ['V gap'])
    ]);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-section-label', { text: 'Align' }),
      el('div.rb-row', null, [pad, el('div.rb-col.rb-grow', null, [relCtl.el, groupToggle.el])]),
      el('div.rb-section-label', { text: 'Distribute' }),
      distRow
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doAlign(gx, gy) {
      ctx.invoke('align.layers', { gx: gx, gy: gy, axes: 'both', relativeTo: relativeTo, mode: group ? 'group' : 'each' })
        .then(function (res) { ctx.toast('Aligned ' + res.moved + ' layer' + (res.moved === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not align', { kind: 'error' }); });
    }

    function distribute(axis, mode) {
      ctx.invoke('align.distribute', { axis: axis, mode: mode, gap: gapField.get() })
        .then(function (res) { ctx.toast('Distributed ' + res.moved + ' layers' + (mode === 'auto' ? ' (gap ' + res.gap + 'px)' : ''), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not distribute', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to align';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }

  function labelFor(pt) {
    var ny = pt[1] === 0 ? 'top' : pt[1] === 1 ? 'bottom' : 'middle';
    var nx = pt[0] === 0 ? 'left' : pt[0] === 1 ? 'right' : 'center';
    return ny + ' ' + nx;
  }
})(window.Rebound = window.Rebound || {});
