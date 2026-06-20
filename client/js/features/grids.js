/*
 * Rebound — Grids tool.
 * Drops a non-rendering guide-overlay shape layer of composition grid lines:
 * rule-of-thirds, golden-ratio, or an N-column layout with a gutter.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'grids',
    title: 'Grids',
    group: 'Layout',
    order: 4,
    keywords: ['grid', 'grids', 'guides', 'thirds', 'golden', 'ratio', 'columns', 'gutter', 'overlay', 'layout'],
    mount: mount
  });

  function mount(ctx) {
    var preset = 'thirds';
    var count = 12;
    var gutter = 20;

    var presetCtl = ui.segmented([
      { value: 'thirds', label: 'Thirds', title: 'Lines at one third and two thirds' },
      { value: 'golden', label: 'Golden', title: 'Lines at the golden-ratio divisions' },
      { value: 'columns', label: 'Columns', title: 'Even vertical column bands' }
    ], { value: preset, onChange: function (v) { preset = v; syncColumns(); } });

    var countField = ui.numberField({ label: 'Count', value: count, min: 1, max: 100, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { count = v; } });
    var gutterField = ui.numberField({ label: 'Gutter', value: gutter, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gutter = v; } });

    var columnsRows = el('div.rb-col', null, [
      ui.row('Count', countField.el),
      ui.row('Gutter', gutterField.el)
    ]);

    function syncColumns() {
      columnsRows.style.display = preset === 'columns' ? '' : 'none';
    }
    syncColumns();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds a non-rendering guide layer of grid lines over the composition. Columns draws even vertical bands with a gutter.' }),
      ui.row('Preset', presetCtl.el),
      columnsRows
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('grids.apply', { preset: preset, count: count, gutter: gutter })
        .then(function () { ctx.toast('Added guide layer', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add grids', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Guides into ' + sel.compName;
  }
})(window.Rebound = window.Rebound || {});
