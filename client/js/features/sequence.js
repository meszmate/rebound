/*
 * Rebound, Sequence tool.
 * Lines the selected layers up end-to-end in time so each one begins when the
 * previous ends, with an overlap control (negative leaves gaps, positive
 * overlaps) and an optional trim-to-fit that clips each layer to its slot.
 * The preview chains the REAL selection when layers are selected (truncated
 * names, real relative durations, via R.timingBars from the Stagger tool) and
 * plays a sweeping playhead that lights each bar as it starts; four canned
 * bars stand in when nothing is selected.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var LABELS = ['A', 'B', 'C', 'D'];
  // Layer bars chained end-to-end: overlap slides each next bar left (overlap)
  // or right (gap); Trim clips each bar where the next one starts. Live bars
  // ({ name, stack, durFrac } from R.timingBars.layerBars) carry real names
  // and relative durations; `animate` adds the shared playable sweep.
  function seqSvg(state, h) {
    var W = 160, H = 100, pad = 8;
    var tb = R.timingBars;
    var live = !!(state.bars && state.bars.length);
    var bars, i;
    if (live) {
      bars = state.bars.slice();
      if (state.order === 'topdown') bars.sort(function (a, b) { return a.stack - b.stack; });
      else if (state.order === 'reverse') bars.reverse();
    } else {
      bars = [];
      var idx = (state.order === 'reverse') ? [3, 2, 1, 0] : [0, 1, 2, 3];
      for (i = 0; i < 4; i++) bars.push({ name: LABELS[idx[i]], durFrac: 1 });
    }
    var n = bars.length;
    var gutter = live ? 36 : 0;
    var x0 = pad + gutter, x1 = W - pad;
    var rowH = (H - 2 * pad) / n, barH = Math.max(6, Math.min(14, rowH - 4));
    var ov = Math.max(-30, Math.min(30, state.overlapFrames || 0));

    // Chain the bars (each starts where the previous ends minus the overlap),
    // then scale the whole chain down if it runs past the box.
    var starts = [], widths = [], cursor = 0, extent = 1;
    for (i = 0; i < n; i++) {
      var w = live ? Math.max(14, 46 * (bars[i].durFrac || 1)) : 46;
      var slot = w - ov; if (slot < 6) slot = 6;
      starts.push(cursor); widths.push(w);
      if (cursor + w > extent) extent = cursor + w;
      cursor += slot;
    }
    var scale = Math.min(1, (x1 - x0) / extent);

    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (i = 0; i < n; i++) {
      var x = x0 + starts[i] * scale;
      var bw = widths[i] * scale;
      // Trim clips a bar where the next one starts (the host only ever clips
      // outPoints, never extends them).
      if (state.trim && i < n - 1) {
        var next = x0 + starts[i + 1] * scale;
        if (next > x && next < x + bw) bw = next - x;
      }
      if (bw < 5) bw = 5;
      var y = pad + i * rowH + (rowH - barH) / 2;
      var bar = svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: barH.toFixed(1), rx: 2,
        fill: 'var(--rb-accent)', 'fill-opacity': state.animate ? '0.3' : (state.trim ? '0.9' : '0.7') });
      if (state.animate && tb) bar.appendChild(tb.lightUp((x - x0) / (x1 - x0)));
      kids.push(bar);
      if (live) {
        kids.push(svg('text', { x: pad, y: (y + barH / 2 + 2.5).toFixed(1), 'font-size': 6.5, fill: 'var(--rb-text-faint)' }, [bars[i].name]));
      } else {
        kids.push(svg('text', { x: (x + 5).toFixed(1), y: (y + barH - 3).toFixed(1), 'font-size': 8, 'font-weight': 700, fill: '#fff', opacity: '0.9' }, [bars[i].name]));
      }
    }
    if (state.animate && tb) kids.push(tb.sweepLine(x0, x1, H));
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var SEQUENCE_DEFAULTS = [
    { name: 'Butt joined', state: { order: 'selection', overlapFrames: 0, trim: false } },
    { name: 'Crossfade', state: { order: 'selection', overlapFrames: 12, trim: false } },
    { name: 'Spaced out', state: { order: 'selection', overlapFrames: -10, trim: false } },
    { name: 'Top-down trim', state: { order: 'topdown', overlapFrames: 0, trim: true } }
  ];
  R.toolPresets.declare('sequence', { defaults: SEQUENCE_DEFAULTS });

  R.tools.register({
    id: 'sequence',
    title: 'Sequence',
    group: 'Timing',
    order: 4,
    quick: {
      desc: 'Line the selected layers up end to end in time, each starting when the previous ends.',
      method: 'sequence.apply',
      args: { order: 'selection', overlapFrames: 0, trim: false },
      config: [{ arg: 'order', label: 'Order', type: 'select', options: [
        { value: 'selection', label: 'Selection' },
        { value: 'topdown', label: 'Top-down' },
        { value: 'reverse', label: 'Reverse' }
      ] }]
    },
    keywords: ['sequence', 'end to end', 'chain', 'overlap', 'timing', 'order', 'butt'],
    mount: mount
  });

  function mount(ctx) {
    var order = 'selection';
    var overlapFrames = 0;
    var trim = false;
    var lastSel = ctx.getSelection();

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() {
      R.dom.clear(previewHost);
      var bars = R.timingBars ? R.timingBars.layerBars(lastSel, 5) : null;
      previewHost.appendChild(seqSvg({ order: order, overlapFrames: overlapFrames, trim: trim, bars: bars, animate: true }, 100));
    }

    var orderSeg = ui.segmented([
      { value: 'selection', label: 'Selection', title: 'Use the order the layers were selected in' },
      { value: 'topdown', label: 'Top-down', title: 'Order by stacking order, top layer first' },
      { value: 'reverse', label: 'Reverse', title: 'Reverse the selection order' }
    ], { value: order, onChange: function (v) { order = v; renderPreview(); } });

    var overlapSlider = ui.slider({ label: 'Overlap', min: -30, max: 30, step: 1, value: overlapFrames,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { overlapFrames = v; renderPreview(); } });
    var trimToggle = ui.toggle({ label: 'Trim to fit', value: trim,
      onChange: function (v) { trim = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Shifts whole layers in time so each starts when the one before it ends. Negative overlap leaves gaps; positive overlaps the layers.' }),
      previewHost,
      ui.row('Order', orderSeg.el),
      overlapSlider.el,
      trimToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function canApply(sel) { return !!(sel && sel.hasComp && sel.selectedLayerCount >= 2); }
    function sync(sel) {
      lastSel = sel;
      scopeText.textContent = describe(sel);
      applyBtn.disabled = !canApply(sel);
      renderPreview();
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function doApply() {
      ctx.invoke('sequence.apply', { order: order, overlapFrames: overlapFrames, trim: trim })
        .then(function (res) { ctx.toast('Sequenced ' + res.sequenced + ' layer' + (res.sequenced === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not sequence', { kind: 'error' }); });
    }

    function getState() {
      return { order: order, overlapFrames: overlapFrames, trim: trim };
    }
    function applyState(s) {
      if (!s) return;
      if (s.order != null) { order = s.order; orderSeg.set(s.order); }
      if (s.overlapFrames != null) { overlapFrames = s.overlapFrames; overlapSlider.set(s.overlapFrames); }
      if (s.trim != null) { trim = s.trim; trimToggle.set(s.trim); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'sequence',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return seqSvg(st, (opts && opts.height) || 38); },
        defaults: SEQUENCE_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select two or more layers to sequence';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});