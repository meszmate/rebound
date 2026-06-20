/*
 * Rebound, Grids tool.
 * Drops a non-rendering guide-overlay shape layer of composition guide lines:
 * rule-of-thirds, golden-ratio, a real N-column layout (margin + gutter), or the
 * broadcast action-safe / title-safe rectangles. The guide color is settable so
 * the lines stay visible on any background.
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

  var COLORS = [
    { value: 'cyan', label: 'Cyan', rgb: [0, 0.85, 1] },
    { value: 'magenta', label: 'Magenta', rgb: [1, 0.2, 0.8] },
    { value: 'white', label: 'White', rgb: [1, 1, 1] },
    { value: 'black', label: 'Black', rgb: [0, 0, 0] }
  ];

  function rgbFor(name) {
    for (var i = 0; i < COLORS.length; i++) if (COLORS[i].value === name) return COLORS[i].rgb;
    return COLORS[0].rgb;
  }

  function mount(ctx) {
    var preset = 'thirds';
    var count = 12;
    var gutter = 20;
    var margin = 0;
    var colorName = 'cyan';

    var presetCtl = ui.segmented([
      { value: 'thirds', label: 'Thirds', title: 'Lines at one third and two thirds' },
      { value: 'golden', label: 'Golden', title: 'Lines at the golden-ratio divisions' },
      { value: 'columns', label: 'Columns', title: 'A real design column grid with margin and gutter' },
      { value: 'safe', label: 'Safe', title: 'Broadcast action-safe and title-safe rectangles' }
    ], { value: preset, onChange: function (v) { preset = v; syncColumns(); } });

    var countField = ui.numberField({ label: 'Count', value: count, min: 1, max: 100, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { count = v; } });
    var gutterField = ui.numberField({ label: 'Gutter', value: gutter, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gutter = v; } });
    var marginField = ui.numberField({ label: 'Margin', value: margin, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { margin = v; } });

    var columnsRows = el('div.rb-col', null, [
      ui.row('Count', countField.el),
      ui.row('Gutter', gutterField.el),
      ui.row('Margin', marginField.el)
    ]);

    var colorCtl = ui.segmented(COLORS.map(function (c) {
      return { value: c.value, label: c.label, title: 'Draw the guides in ' + c.label.toLowerCase() };
    }), { value: colorName, onChange: function (v) { colorName = v; } });

    function syncColumns() {
      columnsRows.style.display = preset === 'columns' ? '' : 'none';
    }
    syncColumns();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds a non-rendering guide layer over the composition. Columns draws a real design grid (margin + gutter); Safe draws the action-safe and title-safe rectangles.' }),
      ui.row('Preset', presetCtl.el),
      columnsRows,
      ui.row('Color', colorCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('grids.apply', { preset: preset, count: count, gutter: gutter, margin: margin, color: rgbFor(colorName) })
        .then(function () { ctx.toast('Added guide layer', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add grids', { kind: 'error' }); });
    }

    function getState() {
      return { preset: preset, count: count, gutter: gutter, margin: margin, colorName: colorName };
    }
    function applyState(s) {
      if (!s) return;
      if (s.preset != null) { preset = s.preset; presetCtl.set(s.preset); }
      if (s.count != null) { count = s.count; countField.set(s.count); }
      if (s.gutter != null) { gutter = s.gutter; gutterField.set(s.gutter); }
      if (s.margin != null) { margin = s.margin; marginField.set(s.margin); }
      if (s.colorName != null) { colorName = s.colorName; colorCtl.set(s.colorName); }
      syncColumns();
    }

    return {
      presets: {
        toolId: 'grids',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Thirds', state: { preset: 'thirds', count: 12, gutter: 20, margin: 0, colorName: 'cyan' } },
          { name: '12-col', state: { preset: 'columns', count: 12, gutter: 20, margin: 60, colorName: 'magenta' } },
          { name: 'Golden', state: { preset: 'golden', count: 12, gutter: 20, margin: 0, colorName: 'white' } },
          { name: 'Title-safe', state: { preset: 'safe', count: 12, gutter: 20, margin: 0, colorName: 'white' } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Guides into ' + sel.compName;
  }
})(window.Rebound = window.Rebound || {});
