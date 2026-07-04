/*
 * Rebound, Grids tool.
 * Drops a non-rendering guide-overlay shape layer: rule-of-thirds, golden-ratio,
 * a real N-column (and optional N-row) layout with margin + gutter, or the
 * broadcast safe rectangles. A live preview shows the grid; line width, a centre
 * crosshair, and the guide color are settable.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var COLORS = [
    { value: 'cyan', label: 'Cyan', rgb: [0, 0.85, 1] },
    { value: 'magenta', label: 'Magenta', rgb: [1, 0.2, 0.8] },
    { value: 'white', label: 'White', rgb: [1, 1, 1] },
    { value: 'black', label: 'Black', rgb: [0, 0, 0] }
  ];
  function rgbFor(name) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].value === name) return COLORS[i].rgb; return COLORS[0].rgb; }
  function colorCss(name) { var c = rgbFor(name); return 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'; }

  // Vertical social-video safe insets {left, top, right, bottom} as fractions.
  var SOCIAL = {
    tiktok: { l: 0.04, t: 0.06, r: 0.12, b: 0.20 },
    reels: { l: 0.04, t: 0.07, r: 0.14, b: 0.22 },
    shorts: { l: 0.04, t: 0.06, r: 0.12, b: 0.15 }
  };

  // The grid as an SVG over a sample frame, for the live preview and the tiles.
  function gridSvg(state, h) {
    var W = 160, H = 100, kids = [];
    var col = colorCss(state.colorName || 'cyan');
    var lw = Math.max(0.7, Math.min(2.6, (state.lineWidth == null ? 2 : state.lineWidth) * 0.7));
    kids.push(svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: '#44474e', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }));
    function vline(fx) { var x = (fx * W).toFixed(1); kids.push(svg('line', { x1: x, y1: 1, x2: x, y2: H - 1, stroke: col, 'stroke-width': lw })); }
    function hline(fy) { var y = (fy * H).toFixed(1); kids.push(svg('line', { x1: 1, y1: y, x2: W - 1, y2: y, stroke: col, 'stroke-width': lw })); }
    var preset = state.preset || 'thirds';
    if (preset === 'columns') {
      var fx = W / 1920, fy = H / 1080;
      var count = Math.max(1, Math.min(24, Math.round(state.count || 12)));
      var gx = (state.gutter || 0) * fx, mx = (state.margin || 0) * fx;
      var usable = W - 2 * mx - (count - 1) * gx, colW = usable / count;
      if (colW > 0.4) { for (var i = 0; i < count; i++) { var lx = mx + i * (colW + gx); vline(lx / W); vline((lx + colW) / W); } }
      var rows = Math.max(0, Math.min(24, Math.round(state.rows || 0)));
      if (rows >= 1) {
        var gy = (state.gutter || 0) * fy, my = (state.margin || 0) * fy;
        var usableH = H - 2 * my - (rows - 1) * gy, rowH = usableH / rows;
        if (rowH > 0.4) { for (var j = 0; j < rows; j++) { var ly = my + j * (rowH + gy); hline(ly / H); hline((ly + rowH) / H); } }
      }
    } else if (preset === 'safe') {
      [0.05, 0.10].forEach(function (ins) { kids.push(svg('rect', { x: (ins * W).toFixed(1), y: (ins * H).toFixed(1), width: ((1 - 2 * ins) * W).toFixed(1), height: ((1 - 2 * ins) * H).toFixed(1), fill: 'none', stroke: col, 'stroke-width': lw })); });
    } else if (preset === 'social') {
      var p = SOCIAL[state.platform] || SOCIAL.tiktok;
      kids.push(svg('rect', { x: (p.l * W).toFixed(1), y: (p.t * H).toFixed(1), width: ((1 - p.l - p.r) * W).toFixed(1), height: ((1 - p.t - p.b) * H).toFixed(1), fill: 'none', stroke: col, 'stroke-width': lw }));
    } else {
      var fr = preset === 'golden' ? [0.382, 0.618] : [1 / 3, 2 / 3];
      fr.forEach(function (v) { vline(v); hline(v); });
    }
    if (state.crosshair) { vline(0.5); hline(0.5); }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var GRIDS_DEFAULTS = [
    { name: 'Thirds', state: { preset: 'thirds', count: 12, rows: 0, gutter: 20, margin: 0, lineWidth: 2, crosshair: false, colorName: 'cyan' } },
    { name: '12-col', state: { preset: 'columns', count: 12, rows: 0, gutter: 20, margin: 60, lineWidth: 2, crosshair: false, colorName: 'magenta' } },
    { name: 'Modular 6x4', state: { preset: 'columns', count: 6, rows: 4, gutter: 24, margin: 48, lineWidth: 2, crosshair: false, colorName: 'cyan' } },
    { name: 'Golden', state: { preset: 'golden', count: 12, rows: 0, gutter: 20, margin: 0, lineWidth: 2, crosshair: true, colorName: 'white' } },
    { name: 'Title-safe', state: { preset: 'safe', count: 12, rows: 0, gutter: 20, margin: 0, lineWidth: 2, crosshair: false, colorName: 'white' } },
    { name: 'TikTok safe', state: { preset: 'social', platform: 'tiktok', count: 12, rows: 0, gutter: 20, margin: 0, lineWidth: 2, crosshair: false, colorName: 'magenta' } },
    { name: 'Reels safe', state: { preset: 'social', platform: 'reels', count: 12, rows: 0, gutter: 20, margin: 0, lineWidth: 2, crosshair: false, colorName: 'magenta' } }
  ];
  R.toolPresets.declare('grids', { defaults: GRIDS_DEFAULTS });

  R.tools.register({
    id: 'grids',
    title: 'Grids',
    group: 'Layout',
    order: 4,
    keywords: ['grid', 'grids', 'guides', 'thirds', 'golden', 'ratio', 'columns', 'rows', 'gutter', 'overlay', 'layout', 'crosshair'],
    mount: mount
  });

  function mount(ctx) {
    var preset = 'thirds';
    var count = 12;
    var rows = 0;
    var gutter = 20;
    var margin = 0;
    var lineWidth = 2;
    var crosshair = false;
    var colorName = 'cyan';
    var platform = 'tiktok';
    var replace = true;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function state() { return { preset: preset, count: count, rows: rows, gutter: gutter, margin: margin, lineWidth: lineWidth, crosshair: crosshair, colorName: colorName, platform: platform }; }
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(gridSvg(state(), 120)); }

    var presetCtl = ui.segmented([
      { value: 'thirds', label: 'Thirds', title: 'Lines at one third and two thirds' },
      { value: 'golden', label: 'Golden', title: 'Lines at the golden-ratio divisions' },
      { value: 'columns', label: 'Columns', title: 'A real design column / row grid with margin and gutter' },
      { value: 'safe', label: 'Safe', title: 'Broadcast action-safe and title-safe rectangles' },
      { value: 'social', label: 'Social', title: 'Vertical social-video safe area, clear of the platform UI' }
    ], { value: preset, onChange: function (v) { preset = v; syncRows(); renderPreview(); } });

    var platformCtl = ui.segmented([
      { value: 'tiktok', label: 'TikTok', title: 'TikTok safe area' },
      { value: 'reels', label: 'Reels', title: 'Instagram Reels safe area' },
      { value: 'shorts', label: 'Shorts', title: 'YouTube Shorts safe area' }
    ], { value: platform, onChange: function (v) { platform = v; renderPreview(); } });
    var platformRow = ui.row('Platform', platformCtl.el);

    var countField = ui.numberField({ label: 'Columns', value: count, min: 1, max: 100, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { count = v; renderPreview(); } });
    var rowsField = ui.numberField({ label: 'Rows', value: rows, min: 0, max: 100, step: 1, decimals: 0, width: '110px',
      title: '0 = columns only. Above 0 draws horizontal divisions too, for a modular grid.', onChange: function (v) { rows = v; renderPreview(); } });
    var gutterField = ui.numberField({ label: 'Gutter', value: gutter, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { gutter = v; renderPreview(); } });
    var marginField = ui.numberField({ label: 'Margin', value: margin, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { margin = v; renderPreview(); } });

    var columnsRows = el('div.rb-col', null, [
      ui.row('Columns', countField.el),
      ui.row('Rows', rowsField.el),
      ui.row('Gutter', gutterField.el),
      ui.row('Margin', marginField.el)
    ]);

    var widthField = ui.numberField({ label: 'Line width', value: lineWidth, min: 1, max: 12, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { lineWidth = v; renderPreview(); } });
    var crosshairToggle = ui.toggle({ label: 'Center crosshair', value: crosshair,
      title: 'Add a line through the exact centre of the frame.', onChange: function (v) { crosshair = v; renderPreview(); } });

    var colorCtl = ui.segmented(COLORS.map(function (c) {
      return { value: c.value, label: c.label, title: 'Draw the guides in ' + c.label.toLowerCase() };
    }), { value: colorName, onChange: function (v) { colorName = v; renderPreview(); } });

    var replaceToggle = ui.toggle({ label: 'Replace existing', value: replace,
      title: 'Swap the earlier Guides layer instead of stacking a new one on every apply.',
      onChange: function (v) { replace = v; } });

    function syncRows() {
      columnsRows.style.display = preset === 'columns' ? '' : 'none';
      platformRow.style.display = preset === 'social' ? '' : 'none';
    }
    syncRows();
    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds a non-rendering guide layer over the composition. Columns draws a real design grid (margin + gutter, and rows for a modular grid); Safe draws the action-safe and title-safe rectangles.' }),
      previewHost,
      ui.row('Preset', presetCtl.el),
      columnsRows,
      platformRow,
      ui.row('Line width', widthField.el),
      crosshairToggle.el,
      ui.row('Color', colorCtl.el),
      replaceToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { title: 'Create real AE ruler guides (snap with View > Snap to Guides)', onclick: doGuides }, ['To guides']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    ctx.body.appendChild(el('div.rb-faint', { text: 'Apply draws a non-rendering guide layer (tracks/keyframes, full color control). To guides makes real comp ruler guides instead. They snap (View > Snap to Guides) but are comp-level and uncolored.' }));
    ctx.body.appendChild(el('div.rb-row', null, [el('button.rb-btn.is-ghost', { onclick: doClearGuides }, ['Clear ruler guides'])]));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function gridArgs() { return { preset: preset, count: count, rows: rows, gutter: gutter, margin: margin, lineWidth: lineWidth, crosshair: crosshair, color: rgbFor(colorName), platform: platform, replace: replace }; }
    function doApply() {
      ctx.invoke('grids.apply', gridArgs())
        .then(function () { ctx.toast('Added guide layer', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add grids', { kind: 'error' }); });
    }
    function doGuides() {
      ctx.invoke('grids.toGuides', gridArgs())
        .then(function (res) { ctx.toast('Added ' + (res ? res.added : 0) + ' ruler guide' + (res && res.added === 1 ? '' : 's'), { kind: 'success' }); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add ruler guides', { kind: 'error' }); });
    }
    function doClearGuides() {
      ctx.invoke('grids.clearGuides', {})
        .then(function (res) { ctx.toast('Cleared ' + (res ? res.removed : 0) + ' ruler guide' + (res && res.removed === 1 ? '' : 's'), { kind: 'info' }); })
        .catch(function (err) { ctx.toast(err.message || 'Could not clear guides', { kind: 'error' }); });
    }

    function getState() { return { preset: preset, count: count, rows: rows, gutter: gutter, margin: margin, lineWidth: lineWidth, crosshair: crosshair, colorName: colorName, platform: platform }; }
    function applyState(s) {
      if (!s) return;
      if (s.preset != null) { preset = s.preset; presetCtl.set(s.preset); }
      if (s.count != null) { count = s.count; countField.set(s.count); }
      if (s.rows != null) { rows = s.rows; rowsField.set(s.rows); }
      if (s.gutter != null) { gutter = s.gutter; gutterField.set(s.gutter); }
      if (s.margin != null) { margin = s.margin; marginField.set(s.margin); }
      if (s.lineWidth != null) { lineWidth = s.lineWidth; widthField.set(s.lineWidth); }
      if (s.crosshair != null) { crosshair = s.crosshair; crosshairToggle.set(s.crosshair); }
      if (s.colorName != null) { colorName = s.colorName; colorCtl.set(s.colorName); }
      if (s.platform != null) { platform = s.platform; platformCtl.set(s.platform); }
      syncRows();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'grids',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return gridSvg(st, (opts && opts.height) || 38); },
        defaults: GRIDS_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Guides into ' + sel.compName;
  }
})(window.Rebound = window.Rebound || {});
