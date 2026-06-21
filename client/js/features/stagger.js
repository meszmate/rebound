/*
 * Rebound, Stagger tool.
 * Offsets selected layers in time so they cascade by a fixed interval. Order
 * them by stacking position, reversed, by name, by label color, or a seeded
 * shuffle, anchored at the playhead or the earliest layer. A live cascade
 * preview reacts to the interval and the order.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Sample layers (index, name, label group) so the preview can show how each
  // order mode reshuffles the cascade, not just the interval.
  var SAMPLE = [
    { i: 0, name: 'C', label: 2 },
    { i: 1, name: 'A', label: 1 },
    { i: 2, name: 'E', label: 3 },
    { i: 3, name: 'B', label: 1 },
    { i: 4, name: 'D', label: 2 }
  ];

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  // Returns rank-by-layer-index: ranks[i] = cascade position of sample layer i.
  function ranksFor(order, seed) {
    var arr = SAMPLE.slice();
    arr.sort(function (a, b) { return a.i - b.i; });
    if (order === 'reverse') arr.reverse();
    else if (order === 'name') arr.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : a.i - b.i; });
    else if (order === 'label') arr.sort(function (a, b) { return (a.label - b.label) || (a.i - b.i); });
    else if (order === 'random') {
      var rng = makeRng(seed);
      for (var k = arr.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)); var t = arr[k]; arr[k] = arr[j]; arr[j] = t; }
    }
    var ranks = {};
    for (var r = 0; r < arr.length; r++) ranks[arr[r].i] = r;
    return ranks;
  }

  function staggerSvg(state, h) {
    var W = 160, H = 100, padX = 12, padY = 12;
    var n = SAMPLE.length;
    var ranks = ranksFor(state.order || 'index', state.seed || 1);
    var step = Math.min(20, (state.intervalFrames || 0) * 1.4);
    var rowH = (H - 2 * padY) / n;
    var barH = Math.max(4, rowH - 4);
    var barLen = 46;

    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var i = 0; i < n; i++) {
      var y = padY + i * rowH + (rowH - barH) / 2;
      var x = padX + ranks[i] * step;
      if (x + barLen > W - padX) barLen = (W - padX) - x;
      kids.push(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: Math.max(8, barLen).toFixed(1), height: barH.toFixed(1), rx: 2,
        fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
    }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'stagger',
    title: 'Stagger',
    group: 'Timing',
    order: 0,
    keywords: ['stagger', 'offset', 'cascade', 'sequence', 'sequencer', 'delay', 'timing', 'random', 'order', 'label'],
    mount: mount
  });

  function mount(ctx) {
    var intervalFrames = 4;
    var order = 'index';
    var seed = 1;
    var anchor = 'playhead';

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(staggerSvg({ intervalFrames: intervalFrames, order: order, seed: seed }, 110)); }

    var intervalField = ui.numberField({ label: 'Interval', value: intervalFrames, min: 0, step: 1, decimals: 0, suffix: 'f', width: '110px',
      onChange: function (v) { intervalFrames = v; renderPreview(); } });

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
    syncSeed();
    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Shifts whole layers in time so they begin one after another. Choose how the layers are ordered into the cascade.' }),
      previewHost,
      ui.row('Interval', intervalField.el),
      ui.row('Order', orderCtl.el),
      seedRow,
      ui.row('Anchor', anchorCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('stagger.apply', { intervalFrames: intervalFrames, order: order, seed: seed, anchor: anchor })
        .then(function (res) { ctx.toast('Staggered ' + res.staggered + ' layer' + (res.staggered === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not stagger', { kind: 'error' }); });
    }

    function getState() { return { intervalFrames: intervalFrames, order: order, seed: seed, anchor: anchor }; }
    function applyState(s) {
      if (!s) return;
      if (s.intervalFrames != null) { intervalFrames = s.intervalFrames; intervalField.set(s.intervalFrames); }
      // Back-compat with older presets that stored a reverse boolean.
      var ord = s.order != null ? s.order : (s.reverse ? 'reverse' : null);
      if (ord != null) { order = ord; orderCtl.set(ord); }
      if (s.seed != null) { seed = s.seed; seedField.set(s.seed); }
      if (s.anchor != null) { anchor = s.anchor; anchorCtl.set(s.anchor); }
      syncSeed();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'stagger',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) {
          var o = st.order != null ? st.order : (st.reverse ? 'reverse' : 'index');
          return staggerSvg({ intervalFrames: st.intervalFrames, order: o, seed: st.seed || 1 }, (opts && opts.height) || 38);
        },
        defaults: [
          { name: 'Tight cascade', state: { intervalFrames: 2, order: 'index', anchor: 'playhead' } },
          { name: 'Wide cascade', state: { intervalFrames: 8, order: 'index', anchor: 'first' } },
          { name: 'Reverse fan', state: { intervalFrames: 4, order: 'reverse', anchor: 'playhead' } },
          { name: 'Random scatter', state: { intervalFrames: 4, order: 'random', seed: 7, anchor: 'playhead' } },
          { name: 'By label', state: { intervalFrames: 5, order: 'label', anchor: 'first' } }
        ]
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
