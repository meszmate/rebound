/*
 * Rebound, Arrange tool.
 * Packs the selected layers into a tidy grid. Choose a column count (or let it
 * pick a near-square layout), plus the horizontal and vertical gaps between cells.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'arrange',
    title: 'Arrange',
    group: 'Layout',
    order: 2,
    keywords: ['arrange', 'grid', 'tile', 'pack', 'layout', 'columns', 'rows'],
    mount: mount
  });

  function mount(ctx) {
    var columns = 0;
    var gapX = 16;
    var gapY = 16;

    var columnsField = ui.numberField({ label: 'Columns', value: columns, min: 0, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { columns = v; } });
    var gapXField = ui.numberField({ label: 'Gap X', value: gapX, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gapX = v; } });
    var gapYField = ui.numberField({ label: 'Gap Y', value: gapY, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gapY = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Lays out the selected layers in a grid by their bounding boxes. Set Columns to 0 for an automatic near-square layout.' }),
      columnsField.el,
      gapXField.el,
      gapYField.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('arrange.apply', { columns: columns, gapX: gapX, gapY: gapY })
        .then(function (res) { ctx.toast('Arranged ' + res.arranged + ' layer' + (res.arranged === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not arrange', { kind: 'error' }); });
    }

    function getState() {
      return { columns: columns, gapX: gapX, gapY: gapY };
    }

    function applyState(s) {
      if (!s) return;
      if (s.columns != null) { columns = s.columns; columnsField.set(s.columns); }
      if (s.gapX != null) { gapX = s.gapX; gapXField.set(s.gapX); }
      if (s.gapY != null) { gapY = s.gapY; gapYField.set(s.gapY); }
    }

    return {
      presets: {
        toolId: 'arrange',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Auto square', state: { columns: 0, gapX: 16, gapY: 16 } },
          { name: 'Tight grid', state: { columns: 0, gapX: 4, gapY: 4 } },
          { name: 'Single row', state: { columns: 0, gapX: 24, gapY: 24 } },
          { name: 'Four columns', state: { columns: 4, gapX: 16, gapY: 16 } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to arrange';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
