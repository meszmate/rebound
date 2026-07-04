/*
 * Rebound, Sequence tool.
 * Lines the selected layers up end-to-end in time so each one begins when the
 * previous ends, with an overlap control (negative leaves gaps, positive
 * overlaps) and an optional trim-to-fit that clips each layer to its slot.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var LABELS = ['A', 'B', 'C', 'D'];
  // Four layer bars chained end-to-end: overlap slides each next bar left
  // (overlap) or right (gap); Trim clips each bar to its slot so they tile.
  function seqSvg(state, h) {
    var W = 160, H = 100, pad = 8, n = 4;
    var rowH = (H - 2 * pad) / n, barH = Math.max(6, rowH - 4), bw = 46;
    var ov = Math.max(-30, Math.min(30, state.overlapFrames || 0));
    var slot = bw - ov; if (slot < 6) slot = 6;
    var idx = (state.order === 'reverse') ? [3, 2, 1, 0] : [0, 1, 2, 3];
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (var r = 0; r < n; r++) {
      var start = pad + r * slot;
      var w = state.trim ? slot : bw;
      var y = pad + r * rowH + (rowH - barH) / 2;
      if (start + w > W - pad) w = (W - pad) - start;
      if (w < 5) w = 5;
      kids.push(svg('rect', { x: start.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: barH.toFixed(1), rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': state.trim ? '0.9' : '0.7' }));
      kids.push(svg('text', { x: (start + 5).toFixed(1), y: (y + barH - 3).toFixed(1), 'font-size': 8, 'font-weight': 700, fill: '#fff', opacity: '0.9' }, [LABELS[idx[r]]]));
    }
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
    keywords: ['sequence', 'end to end', 'chain', 'overlap', 'timing', 'order', 'butt'],
    mount: mount
  });

  function mount(ctx) {
    var order = 'selection';
    var overlapFrames = 0;
    var trim = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(seqSvg({ order: order, overlapFrames: overlapFrames, trim: trim }, 100)); }

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
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

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