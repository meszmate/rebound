/*
 * Rebound — Align & Distribute tool.
 * Per-direction align buttons (left / center / right and top / middle / bottom)
 * relative to the composition or the selection bounds; distribute spreads three
 * or more layers evenly or by a fixed gap.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var ICON = {
    left: '<line x1="4.5" y1="4" x2="4.5" y2="20" stroke="currentColor" stroke-width="1.6"/><rect x="6.5" y="7" width="12" height="3.6" rx="1" fill="currentColor"/><rect x="6.5" y="13.4" width="7.5" height="3.6" rx="1" fill="currentColor"/>',
    centerH: '<line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1.6"/><rect x="6" y="7" width="12" height="3.6" rx="1" fill="currentColor"/><rect x="8.25" y="13.4" width="7.5" height="3.6" rx="1" fill="currentColor"/>',
    right: '<line x1="19.5" y1="4" x2="19.5" y2="20" stroke="currentColor" stroke-width="1.6"/><rect x="5.5" y="7" width="12" height="3.6" rx="1" fill="currentColor"/><rect x="10" y="13.4" width="7.5" height="3.6" rx="1" fill="currentColor"/>',
    top: '<line x1="4" y1="4.5" x2="20" y2="4.5" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="6.5" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="6.5" width="3.6" height="7.5" rx="1" fill="currentColor"/>',
    middleV: '<line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="6" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="8.25" width="3.6" height="7.5" rx="1" fill="currentColor"/>',
    bottom: '<line x1="4" y1="19.5" x2="20" y2="19.5" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="5.5" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="10" width="3.6" height="7.5" rx="1" fill="currentColor"/>'
  };

  R.tools.register({
    id: 'align',
    title: 'Align',
    group: 'Layout',
    order: 0,
    keywords: ['align', 'distribute', 'arrange', 'center', 'layout', 'spread', 'left', 'right', 'top', 'bottom'],
    mount: mountAlign
  });

  function iconBtn(inner, title, onClick) {
    var b = el('button', { type: 'button', title: title, 'aria-label': title, onclick: onClick });
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="none">' + inner + '</svg>';
    return b;
  }

  function mountAlign(ctx) {
    var relativeTo = 'comp';
    var group = false;

    var hBar = el('div.rb-iconbar', null, [
      iconBtn(ICON.left, 'Align left', function () { doAlign({ gx: 0, axes: 'x' }); }),
      iconBtn(ICON.centerH, 'Align horizontal center', function () { doAlign({ gx: 0.5, axes: 'x' }); }),
      iconBtn(ICON.right, 'Align right', function () { doAlign({ gx: 1, axes: 'x' }); })
    ]);
    var vBar = el('div.rb-iconbar', null, [
      iconBtn(ICON.top, 'Align top', function () { doAlign({ gy: 0, axes: 'y' }); }),
      iconBtn(ICON.middleV, 'Align vertical center', function () { doAlign({ gy: 0.5, axes: 'y' }); }),
      iconBtn(ICON.bottom, 'Align bottom', function () { doAlign({ gy: 1, axes: 'y' }); })
    ]);

    var relCtl = ui.segmented([
      { value: 'comp', label: 'Composition' },
      { value: 'selection', label: 'Selection' }
    ], { value: relativeTo, onChange: function (v) { relativeTo = v; } });

    var groupToggle = ui.toggle({ label: 'Move selection as a group', value: group,
      onChange: function (v) { group = v; } });

    var gapField = ui.numberField({ label: 'Gap', value: 0, step: 1, decimals: 0, suffix: 'px', width: '110px' });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-section-label', { text: 'Align to' }),
      relCtl.el,
      el('div.rb-row.rb-wrap', { style: { gap: '10px' } }, [hBar, vBar]),
      groupToggle.el,
      el('div.rb-section-label', { text: 'Distribute' }),
      el('div.rb-row.rb-wrap', null, [
        el('button.rb-btn', { onclick: function () { distribute('x', 'auto'); } }, ['Horizontal']),
        el('button.rb-btn', { onclick: function () { distribute('y', 'auto'); } }, ['Vertical'])
      ]),
      el('div.rb-row.rb-wrap', null, [
        gapField.el,
        el('button.rb-btn.is-ghost', { onclick: function () { distribute('x', 'gap'); } }, ['H by gap']),
        el('button.rb-btn.is-ghost', { onclick: function () { distribute('y', 'gap'); } }, ['V by gap'])
      ])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doAlign(opts) {
      var args = {
        gx: opts.gx != null ? opts.gx : null,
        gy: opts.gy != null ? opts.gy : null,
        axes: opts.axes, relativeTo: relativeTo, mode: group ? 'group' : 'each'
      };
      ctx.invoke('align.layers', args)
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
})(window.Rebound = window.Rebound || {});
