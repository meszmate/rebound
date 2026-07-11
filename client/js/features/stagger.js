/*
 * Rebound, Stagger tool.
 * Offsets selected layers in time so they cascade. Order them by stacking
 * position, reversed, by name, by label color, or a seeded shuffle, anchored
 * at the playhead or the earliest layer. The cascade span is a fixed interval
 * per layer or a total span the whole cascade fits into, distributed linearly
 * or with a cubic ease. A live, playable preview shows the REAL selection
 * (names, relative durations, label colors) when layers are selected, and
 * reacts to the interval, order, and distribution.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Sample layers (identity, stacking, name, label group) so the empty-state
  // preview can show how each order mode reshuffles the cascade.
  var SAMPLE = [
    { i: 0, stack: 0, name: 'C', label: 2, durFrac: 1 },
    { i: 1, stack: 1, name: 'A', label: 1, durFrac: 1 },
    { i: 2, stack: 2, name: 'E', label: 3, durFrac: 1 },
    { i: 3, stack: 3, name: 'B', label: 1, durFrac: 1 },
    { i: 4, stack: 4, name: 'D', label: 2, durFrac: 1 }
  ];

  // ---- Shared with the Sequence preview (via R.timingBars) ------------------

  // The AE label palette (indices 0-16, 0 = none), close enough for a preview.
  var LABEL_COLORS = ['#8a8a8a', '#b5484d', '#e2d34c', '#6ac9cf', '#e58ab5',
    '#a89bc9', '#e2a878', '#8cc9a2', '#5b8bd6', '#71bf57', '#8f5fbf',
    '#df7b3b', '#8c6d50', '#d34fa2', '#4fc3d3', '#cbb48a', '#41694f'];

  function labelColor(idx) {
    return LABEL_COLORS[(idx >= 0 && idx < LABEL_COLORS.length) ? idx : 0];
  }

  function truncate(s, n) {
    return s.length > n ? s.substring(0, n - 1) + '…' : s;
  }

  // Normalise the live selection (system.selectionSummary layers) into preview
  // bar specs: truncated name, stacking index, label, and duration relative to
  // the longest selected layer. Null when nothing is selected, so the canned
  // sample bars stay as the empty state.
  function layerBars(sel, max) {
    var layers = sel && sel.layers;
    if (!layers || !layers.length) return null;
    var n = Math.min(layers.length, max || 6);
    var bars = [], maxDur = 0, i;
    for (i = 0; i < n; i++) {
      var L = layers[i];
      var dur = (L.outPoint != null && L.inPoint != null) ? (L.outPoint - L.inPoint) : 0;
      if (!(dur > 0)) dur = 0;
      bars.push({
        i: i,
        stack: L.index != null ? L.index : i,
        name: truncate(String(L.name || ('Layer ' + (i + 1))), 9),
        label: L.label != null ? L.label : 0,
        dur: dur
      });
      if (dur > maxDur) maxDur = dur;
    }
    for (i = 0; i < n; i++) {
      bars[i].durFrac = (maxDur > 0 && bars[i].dur > 0) ? bars[i].dur / maxDur : 1;
    }
    return bars;
  }

  // A playhead line sweeping [x0, x1] on the shared 2.4s SMIL loop.
  function sweepLine(x0, x1, H) {
    var line = svg('line', { x1: x0, y1: 4, x2: x0, y2: H - 4,
      stroke: 'var(--rb-text-muted)', 'stroke-width': 1, opacity: '0.8' });
    line.appendChild(svg('animate', { attributeName: 'x1', values: x0 + ';' + x1, dur: '2.4s', repeatCount: 'indefinite' }));
    line.appendChild(svg('animate', { attributeName: 'x2', values: x0 + ';' + x1, dur: '2.4s', repeatCount: 'indefinite' }));
    return line;
  }

  // A fill-opacity animate that lights a bar up when the playhead reaches it
  // (u = the bar's start as a 0..1 fraction of the sweep).
  function lightUp(u) {
    var t1 = u; if (t1 < 0.001) t1 = 0.001; if (t1 > 0.92) t1 = 0.92;
    var t2 = t1 + 0.06;
    return svg('animate', { attributeName: 'fill-opacity',
      values: '0.3;0.3;0.95;0.95',
      keyTimes: '0;' + t1.toFixed(3) + ';' + t2.toFixed(3) + ';1',
      dur: '2.4s', repeatCount: 'indefinite' });
  }

  R.timingBars = { layerBars: layerBars, labelColor: labelColor, truncate: truncate, sweepLine: sweepLine, lightUp: lightUp };

  // ---- Cascade math (mirrors host/commands/stagger.jsx) ---------------------

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  // Returns rank-by-item: ranks[item.i] = cascade position of that item.
  function ranksFor(items, order, seed) {
    var arr = items.slice();
    arr.sort(function (a, b) { return a.stack - b.stack; });
    if (order === 'reverse') arr.reverse();
    else if (order === 'name') arr.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.stack - b.stack; });
    else if (order === 'label') arr.sort(function (a, b) { return (a.label - b.label) || (a.stack - b.stack); });
    else if (order === 'random') {
      var rng = makeRng(seed);
      for (var k = arr.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)); var t = arr[k]; arr[k] = arr[j]; arr[j] = t; }
    }
    var ranks = {};
    for (var r = 0; r < arr.length; r++) ranks[arr[r].i] = r;
    return ranks;
  }

  // The same cubic distribution curves the host applies, so the preview is
  // truthful: delay_k = span * f(k / (n-1)).
  function distributeFn(kind) {
    if (kind === 'in') return function (u) { return u * u * u; };
    if (kind === 'out') return function (u) { var v = 1 - u; return 1 - v * v * v; };
    if (kind === 'both') return function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
    return function (u) { return u; };
  }

  function staggerSvg(state, h) {
    var W = 160, H = 100, padX = 12, padY = 12;
    var bars = state.bars || SAMPLE;
    var live = !!state.bars;
    var n = bars.length;
    var ranks = ranksFor(bars, state.order || 'index', state.seed || 1);
    var f = distributeFn(state.distribute);
    var gutter = live ? 36 : 0;
    var x0 = padX + gutter;
    var x1 = W - padX;

    // Cascade width in px: interval mode spreads (n-1) capped steps (the
    // original look), span mode maps the whole span; both stay inside the box.
    var spanPx;
    if (state.mode === 'span') {
      spanPx = (state.spanFrames || 0) * 1.4;
    } else {
      spanPx = Math.min(20, (state.intervalFrames || 0) * 1.4) * Math.max(0, n - 1);
    }
    var maxSpan = (x1 - x0) - 30;
    if (maxSpan < 0) maxSpan = 0;
    if (spanPx > maxSpan) spanPx = maxSpan;

    var rowH = (H - 2 * padY) / n;
    var barH = Math.max(4, Math.min(12, rowH - 4));

    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var i = 0; i < n; i++) {
      var y = padY + i * rowH + (rowH - barH) / 2;
      var u = n > 1 ? ranks[bars[i].i] / (n - 1) : 0;
      var x = x0 + f(u) * spanPx;
      var barLen = live ? Math.max(10, 40 * (bars[i].durFrac || 1)) : 46;
      if (x + barLen > x1) barLen = x1 - x;
      if (barLen < 6) barLen = 6;
      var fill = (live && state.order === 'label') ? labelColor(bars[i].label) : 'var(--rb-accent)';
      var bar = svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: barLen.toFixed(1), height: barH.toFixed(1), rx: 2,
        fill: fill, 'fill-opacity': state.animate ? '0.3' : '0.85' });
      if (state.animate) bar.appendChild(lightUp((x - x0) / (x1 - x0)));
      kids.push(bar);
      if (live) {
        kids.push(svg('text', { x: padX, y: (y + barH / 2 + 2.5).toFixed(1), 'font-size': 6.5, fill: 'var(--rb-text-faint)' }, [bars[i].name]));
      }
    }
    if (state.animate) kids.push(sweepLine(x0, x1, H));
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var STAGGER_DEFAULTS = [
    { name: 'Tight cascade', state: { intervalFrames: 2, order: 'index', anchor: 'playhead' } },
    { name: 'Wide cascade', state: { intervalFrames: 8, order: 'index', anchor: 'first' } },
    { name: 'Reverse fan', state: { intervalFrames: 4, order: 'reverse', anchor: 'playhead' } },
    { name: 'Random scatter', state: { intervalFrames: 4, order: 'random', seed: 7, anchor: 'playhead' } },
    { name: 'By label', state: { intervalFrames: 5, order: 'label', anchor: 'first' } },
    { name: 'Eased span', state: { intervalFrames: 4, mode: 'span', spanFrames: 24, distribute: 'out', order: 'index', anchor: 'playhead' } }
  ];
  R.toolPresets.declare('stagger', { defaults: STAGGER_DEFAULTS });

  R.tools.register({
    id: 'stagger',
    title: 'Stagger',
    group: 'Timing',
    order: 0,
    quick: {
      desc: 'Cascade the selected layers in time, four frames apart from the playhead.',
      method: 'stagger.apply',
      args: { intervalFrames: 4, order: 'index', seed: 1, anchor: 'playhead' },
      config: [{ arg: 'order', label: 'Order', type: 'select', options: [
        { value: 'index', label: 'Top' },
        { value: 'reverse', label: 'Bottom' },
        { value: 'random', label: 'Random' },
        { value: 'name', label: 'Name' },
        { value: 'label', label: 'Label' }
      ] }]
    },
    keywords: ['stagger', 'offset', 'cascade', 'sequence', 'sequencer', 'delay', 'timing', 'random', 'order', 'label', 'span', 'distribute', 'ease'],
    mount: mount
  });

  function mount(ctx) {
    var intervalFrames = 4;
    var mode = 'interval';
    var spanFrames = 24;
    var distribute = 'linear';
    var order = 'index';
    var seed = 1;
    var anchor = 'playhead';
    var lastSel = ctx.getSelection();

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() {
      R.dom.clear(previewHost);
      previewHost.appendChild(staggerSvg({ intervalFrames: intervalFrames, mode: mode, spanFrames: spanFrames,
        distribute: distribute, order: order, seed: seed, bars: layerBars(lastSel, 6), animate: true }, 110));
    }

    var modeCtl = ui.segmented([
      { value: 'interval', label: 'Interval', title: 'A fixed delay between one layer and the next' },
      { value: 'span', label: 'Total span', title: 'The whole cascade fits into a total frame count' }
    ], { value: mode, onChange: function (v) { mode = v; syncMode(); renderPreview(); } });

    var intervalField = ui.numberField({ label: 'Interval', value: intervalFrames, min: 0, step: 1, decimals: 0, suffix: 'f', width: '110px',
      onChange: function (v) { intervalFrames = v; renderPreview(); } });
    var intervalRow = ui.row('Interval', intervalField.el);

    var spanField = ui.numberField({ label: 'Span', value: spanFrames, min: 0, step: 1, decimals: 0, suffix: 'f', width: '110px',
      title: 'The whole cascade, first to last layer, fits this many frames.',
      onChange: function (v) { spanFrames = v; renderPreview(); } });
    var spanRow = ui.row('Span', spanField.el);

    var distributeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'Even delays along the cascade' },
      { value: 'in', label: 'Ease In', title: 'Delays bunch at the start, then spread out' },
      { value: 'out', label: 'Ease Out', title: 'Delays spread out first, then bunch at the end' },
      { value: 'both', label: 'Ease Both', title: 'Bunch at both ends, spread in the middle' }
    ], { value: distribute, onChange: function (v) { distribute = v; renderPreview(); } });

    var orderCtl = ui.segmented([
      { value: 'index', label: 'Top', title: 'Cascade from the top layer down' },
      { value: 'reverse', label: 'Bottom', title: 'Cascade from the bottom layer up' },
      { value: 'random', label: 'Random', title: 'Shuffle the order with the seed below' },
      { value: 'name', label: 'Name', title: 'Order alphabetically by layer name' },
      { value: 'label', label: 'Label', title: 'Group by label color' }
    ], { value: order, onChange: function (v) { order = v; syncSeed(); renderPreview(); } });

    var seedField = ui.numberField({ label: 'Seed', value: seed, min: 1, step: 1, decimals: 0, width: '110px',
      title: 'Change for a different random order.', onChange: function (v) { seed = v; renderPreview(); } });
    var seedRow = ui.row('Seed', seedField.el);

    var anchorCtl = ui.segmented([
      { value: 'playhead', label: 'Playhead', title: 'Start the cascade at the current time' },
      { value: 'first', label: 'First layer', title: 'Start the cascade at the earliest layer' }
    ], { value: anchor, onChange: function (v) { anchor = v; } });

    function syncSeed() { seedRow.style.display = order === 'random' ? '' : 'none'; }
    function syncMode() {
      intervalRow.style.display = mode === 'interval' ? '' : 'none';
      spanRow.style.display = mode === 'span' ? '' : 'none';
    }
    syncSeed();
    syncMode();
    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Shifts whole layers in time so they begin one after another. Choose how the layers are ordered into the cascade and how the delays are distributed along it.' }),
      previewHost,
      ui.row('Mode', modeCtl.el),
      intervalRow,
      spanRow,
      ui.row('Distribute', distributeCtl.el),
      ui.row('Order', orderCtl.el),
      seedRow,
      ui.row('Anchor', anchorCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function canApply(sel) { return !!(sel && sel.hasComp && sel.selectedLayerCount); }
    function sync(sel) {
      lastSel = sel;
      scopeText.textContent = describe(sel);
      applyBtn.disabled = !canApply(sel);
      renderPreview();
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function doApply() {
      ctx.invoke('stagger.apply', { intervalFrames: intervalFrames, mode: mode, spanFrames: spanFrames,
        distribute: distribute, order: order, seed: seed, anchor: anchor })
        .then(function (res) { ctx.toast('Staggered ' + res.staggered + ' layer' + (res.staggered === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not stagger', { kind: 'error' }); });
    }

    function getState() { return { intervalFrames: intervalFrames, mode: mode, spanFrames: spanFrames, distribute: distribute, order: order, seed: seed, anchor: anchor }; }
    function applyState(s) {
      if (!s) return;
      if (s.intervalFrames != null) { intervalFrames = s.intervalFrames; intervalField.set(s.intervalFrames); }
      if (s.mode != null) { mode = s.mode; modeCtl.set(s.mode); }
      if (s.spanFrames != null) { spanFrames = s.spanFrames; spanField.set(s.spanFrames); }
      if (s.distribute != null) { distribute = s.distribute; distributeCtl.set(s.distribute); }
      // Back-compat with older presets that stored a reverse boolean.
      var ord = s.order != null ? s.order : (s.reverse ? 'reverse' : null);
      if (ord != null) { order = ord; orderCtl.set(ord); }
      if (s.seed != null) { seed = s.seed; seedField.set(s.seed); }
      if (s.anchor != null) { anchor = s.anchor; anchorCtl.set(s.anchor); }
      syncSeed();
      syncMode();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'stagger',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) {
          var o = st.order != null ? st.order : (st.reverse ? 'reverse' : 'index');
          return staggerSvg({ intervalFrames: st.intervalFrames, mode: st.mode, spanFrames: st.spanFrames,
            distribute: st.distribute, order: o, seed: st.seed || 1 }, (opts && opts.height) || 38);
        },
        defaults: STAGGER_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to stagger';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
