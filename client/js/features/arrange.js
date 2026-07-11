/*
 * Rebound, Arrange tool.
 * Packs the selected layers into a tidy grid. Choose a column count (or let it
 * pick a near-square layout), the horizontal and vertical gaps between cells,
 * the fill order (layer stacking vs. current on-screen position) and whether
 * each layer sits at its cell's top-left or centre.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Varied sample sizes so cell alignment reads at a glance: with 'start' the
  // boxes hug their cell's top-left, with 'center' they float centred.
  var SAMPLE_SIZES = [
    [0.95, 0.62], [0.66, 0.9], [1, 0.72], [0.55, 0.55],
    [0.8, 1], [0.62, 0.68], [0.9, 0.58], [0.72, 0.82]
  ];

  // A sample grid of cells laid out the way the settings would pack them, for
  // the live preview and the preset tiles.
  function arrangeSvg(state, h) {
    var W = 160, H = 100, n = 8, pad = 8;
    var cols = state.columns > 0 ? Math.min(n, Math.round(state.columns)) : Math.max(1, Math.round(Math.sqrt(n)));
    var rows = Math.ceil(n / cols);
    var gx = Math.min(20, (state.gapX || 0) * 0.3), gy = Math.min(20, (state.gapY || 0) * 0.3);
    var cellW = Math.max(2, (W - 2 * pad - (cols - 1) * gx) / cols);
    var cellH = Math.max(2, (H - 2 * pad - (rows - 1) * gy) / rows);
    var center = state.cellAlign === 'center';
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var i = 0; i < n; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      var bw = Math.max(2, cellW * SAMPLE_SIZES[i][0]);
      var bh = Math.max(2, cellH * SAMPLE_SIZES[i][1]);
      var x = pad + c * (cellW + gx);
      var y = pad + r * (cellH + gy);
      if (center) { x += (cellW - bw) / 2; y += (cellH - bh) / 2; }
      kids.push(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
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
    // One-click Home tile: the tool's primary apply with its defaults.
    quick: {
      desc: 'Pack the selected layers into an automatic near-square grid with 16 px gaps.',
      method: 'arrange.apply',
      args: { columns: 0, gapX: 16, gapY: 16 }
    },
    keywords: ['arrange', 'grid', 'tile', 'pack', 'layout', 'columns', 'rows', 'order', 'cell'],
    mount: mount
  });

  function mount(ctx) {
    var columns = 0;
    var gapX = 16;
    var gapY = 16;
    var order = 'layer';
    var cellAlign = 'start';

    // Live minimap of the real selection (shared helper from align.js); the
    // illustrative sample is the fallback when nothing is selected. Hovering
    // Apply animates the real boxes into their computed grid cells.
    var map = R.layoutPreview.create(ctx, { height: 110 });
    var fallback = el('div');
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [map.el, fallback]);
    function renderPreview() {
      R.dom.clear(fallback);
      if (!map.hasData()) fallback.appendChild(arrangeSvg({ columns: columns, gapX: gapX, gapY: gapY, cellAlign: cellAlign }, 110));
    }
    map.onChange(function (d) { fallback.style.display = d ? 'none' : ''; renderPreview(); });

    // Grid targets, mirroring the host math exactly: cell = largest box +
    // gaps, origin at the union's top-left, fill order by stacking or by
    // on-screen position (row bands, then left to right), each layer seated
    // at its cell's top-left or centred in the content area.
    function gridDeltas() {
      var d = map.data();
      if (!d) return null;
      var boxes = d.boxes;
      var n = boxes.length;
      if (!n) return null;
      var cols = columns > 0 ? Math.round(columns) : Math.ceil(Math.sqrt(n));
      if (cols > n) cols = n;
      var maxW = 0, maxH = 0, i;
      for (i = 0; i < n; i++) {
        if (boxes[i].w > maxW) maxW = boxes[i].w;
        if (boxes[i].h > maxH) maxH = boxes[i].h;
      }
      var cellW = maxW + gapX;
      var cellH = maxH + gapY;
      var u = R.layoutPreview.unionOf(boxes);
      var idx = [];
      for (i = 0; i < n; i++) idx.push(i);
      if (order === 'position') {
        var bandH = cellH > 0 ? cellH : 1;
        idx.sort(function (a, b) {
          var ra = Math.round((boxes[a].y - u.y) / bandH);
          var rb = Math.round((boxes[b].y - u.y) / bandH);
          if (ra !== rb) return ra - rb;
          return boxes[a].x - boxes[b].x;
        });
      }
      var out = [];
      for (i = 0; i < n; i++) out.push({});
      for (var j = 0; j < n; j++) {
        var b = boxes[idx[j]];
        var targetX = u.x + (j % cols) * cellW;
        var targetY = u.y + Math.floor(j / cols) * cellH;
        if (cellAlign === 'center') {
          targetX += (maxW - b.w) / 2;
          targetY += (maxH - b.h) / 2;
        }
        out[idx[j]] = { dx: targetX - b.x, dy: targetY - b.y };
      }
      return out;
    }

    var columnsField = ui.numberField({ label: 'Columns', value: columns, min: 0, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { columns = v; renderPreview(); } });
    var gapXField = ui.numberField({ label: 'Gap X', value: gapX, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gapX = v; renderPreview(); } });
    var gapYField = ui.numberField({ label: 'Gap Y', value: gapY, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gapY = v; renderPreview(); } });

    var orderCtl = ui.segmented([
      { value: 'layer', label: 'Layer order', title: 'Fill the grid in layer stacking order' },
      { value: 'position', label: 'Position', title: 'Fill the grid by where the layers already sit on screen (rows top to bottom, then left to right)' }
    ], { value: order, onChange: function (v) { order = v; } });

    var cellAlignCtl = ui.segmented([
      { value: 'start', label: 'Top left', title: 'Seat each layer at the top-left corner of its cell' },
      { value: 'center', label: 'Centered', title: 'Seat each layer in the middle of its cell' }
    ], { value: cellAlign, onChange: function (v) { cellAlign = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Lays out the selected layers in a grid by their bounding boxes. Set Columns to 0 for an automatic near-square layout.' }),
      previewHost,
      columnsField.el,
      gapXField.el,
      gapYField.el,
      ui.row('Order', orderCtl.el),
      ui.row('In cell', cellAlignCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    applyBtn.addEventListener('mouseenter', function () { map.preview(gridDeltas()); });
    applyBtn.addEventListener('mouseleave', function () { map.rest(); });
    ctx.footer.appendChild(applyBtn);

    function syncEnabled(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.selectedLayerCount);
    }
    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = describe(sel);
      syncEnabled(sel);
      map.refresh();
    });
    scopeText.textContent = describe(ctx.getSelection());
    syncEnabled(ctx.getSelection());

    function doApply() {
      ctx.invoke('arrange.apply', { columns: columns, gapX: gapX, gapY: gapY, order: order, cellAlign: cellAlign })
        .then(function (res) { ctx.toast('Arranged ' + res.arranged + ' layer' + (res.arranged === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not arrange', { kind: 'error' }); });
    }

    function getState() {
      return { columns: columns, gapX: gapX, gapY: gapY, order: order, cellAlign: cellAlign };
    }

    function applyState(s) {
      if (!s) return;
      if (s.columns != null) { columns = s.columns; columnsField.set(s.columns); }
      if (s.gapX != null) { gapX = s.gapX; gapXField.set(s.gapX); }
      if (s.gapY != null) { gapY = s.gapY; gapYField.set(s.gapY); }
      if (s.order != null) { order = s.order; orderCtl.set(s.order); }
      if (s.cellAlign != null) { cellAlign = s.cellAlign; cellAlignCtl.set(s.cellAlign); }
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
      destroy: function () { off(); map.destroy(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to arrange';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
