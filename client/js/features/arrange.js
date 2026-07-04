/*
 * Rebound, Arrange tool.
 * Packs the selected layers into a tidy grid. Choose a column count (or let it
 * pick a near-square layout), plus the horizontal and vertical gaps between cells.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A sample grid of cells laid out the way the settings would pack them, for
  // the live preview and the preset tiles.
  function arrangeSvg(state, h) {
    var W = 160, H = 100, n = 8, pad = 8;
    var cols = state.columns > 0 ? Math.min(n, Math.round(state.columns)) : Math.max(1, Math.round(Math.sqrt(n)));
    var rows = Math.ceil(n / cols);
    var gx = Math.min(20, (state.gapX || 0) * 0.3), gy = Math.min(20, (state.gapY || 0) * 0.3);
    var cellW = Math.max(2, (W - 2 * pad - (cols - 1) * gx) / cols);
    var cellH = Math.max(2, (H - 2 * pad - (rows - 1) * gy) / rows);
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var i = 0; i < n; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      kids.push(svg('rect', { x: (pad + c * (cellW + gx)).toFixed(1), y: (pad + r * (cellH + gy)).toFixed(1), width: cellW.toFixed(1), height: cellH.toFixed(1), rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
    }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var ARRANGE_DEFAULTS = [
    { name: 'Auto square', state: { columns: 0, gapX: 16, gapY: 16 } },
    { name: 'Tight grid', state: { columns: 0, gapX: 4, gapY: 4 } },
    { name: 'Single row', state: { columns: 0, gapX: 24, gapY: 24 } },
    { name: 'Four columns', state: { columns: 4, gapX: 16, gapY: 16 } }
  ];
  R.toolPresets.declare('arrange', { defaults: ARRANGE_DEFAULTS });

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

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(arrangeSvg({ columns: columns, gapX: gapX, gapY: gapY }, 110)); }

    var columnsField = ui.numberField({ label: 'Columns', value: columns, min: 0, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { columns = v; renderPreview(); } });
    var gapXField = ui.numberField({ label: 'Gap X', value: gapX, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gapX = v; renderPreview(); } });
    var gapYField = ui.numberField({ label: 'Gap Y', value: gapY, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gapY = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Lays out the selected layers in a grid by their bounding boxes. Set Columns to 0 for an automatic near-square layout.' }),
      previewHost,
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
      renderPreview();
    }

    return {
      presets: {
        toolId: 'arrange',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return arrangeSvg(st, (opts && opts.height) || 38); },
        defaults: ARRANGE_DEFAULTS
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
