/*
 * Rebound, Flip tool.
 * Mirrors selected layers across an axis by negating scale, optionally
 * reflecting each layer's position about the selection's bounding-box center.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // An asymmetric glyph and its mirror across the chosen axis, so the flip is
  // obvious. Used by the live preview and the preset tiles.
  function fGlyph(cx, cy, sx, sy, op) {
    return svg('g', { transform: 'translate(' + cx + ',' + cy + ') scale(' + sx + ',' + sy + ')', opacity: op == null ? '1' : String(op) }, [
      svg('text', { x: 0, y: 0, 'font-size': 46, 'font-weight': 800, fill: 'var(--rb-accent)', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, ['F'])
    ]);
  }
  function flipSvg(axis, h) {
    axis = axis || 'horizontal';
    var W = 160, H = 100;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (axis === 'horizontal' || axis === 'both') kids.push(svg('line', { x1: 80, y1: 6, x2: 80, y2: H - 6, stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    if (axis === 'vertical' || axis === 'both') kids.push(svg('line', { x1: 6, y1: 50, x2: W - 6, y2: 50, stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    var orig, mir;
    if (axis === 'vertical') { orig = [80, 32, 1, 1]; mir = [80, 72, 1, -1]; }
    else if (axis === 'both') { orig = [50, 32, 1, 1]; mir = [110, 72, -1, -1]; }
    else { orig = [50, 50, 1, 1]; mir = [110, 50, -1, 1]; }
    kids.push(fGlyph(orig[0], orig[1], orig[2], orig[3], 1));
    kids.push(fGlyph(mir[0], mir[1], mir[2], mir[3], 0.7));
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var FLIP_DEFAULTS = [
    { name: 'Horizontal', state: { axis: 'horizontal', pivot: 'anchor' } },
    { name: 'Vertical', state: { axis: 'vertical', pivot: 'anchor' } },
    { name: 'Both', state: { axis: 'both', pivot: 'anchor' } },
    { name: 'Mirror across selection', state: { axis: 'horizontal', pivot: 'selection' } }
  ];
  R.toolPresets.declare('flip', { defaults: FLIP_DEFAULTS });

  R.tools.register({
    id: 'flip',
    title: 'Flip',
    group: 'Layout',
    order: 1,
    // One-click Home tile: the tool's primary apply with its defaults; the
    // per-tile customizer can retarget the axis.
    quick: {
      desc: 'Flip the selected layers horizontally in place about each layer anchor.',
      method: 'flip.apply',
      args: { axis: 'horizontal', pivot: 'anchor' },
      config: [{ arg: 'axis', label: 'Axis', type: 'select', options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
        { value: 'both', label: 'Both' }
      ] }]
    },
    keywords: ['flip', 'mirror', 'reflect', 'reverse', 'horizontal', 'vertical'],
    mount: mount
  });

  function mount(ctx) {
    var axis = 'horizontal';
    var pivot = 'anchor';

    // Live minimap of the real selection (shared helper from align.js); the
    // illustrative sample is the fallback when nothing is selected.
    var map = R.layoutPreview.create(ctx, { height: 104 });
    var fallback = el('div');
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [map.el, fallback]);
    function renderPreview() {
      R.dom.clear(fallback);
      if (!map.hasData()) fallback.appendChild(flipSvg(axis, 104));
    }
    map.onChange(function (d) { fallback.style.display = d ? 'none' : ''; renderPreview(); });

    // Hover targets mirroring the host: 'selection' reflects each box across
    // the union centre (a constant translation) while the mirror itself shows
    // as the box squashing through scale -1; 'anchor' flips in place.
    function flipDeltas() {
      var d = map.data();
      if (!d) return null;
      var doX = axis === 'horizontal' || axis === 'both';
      var doY = axis === 'vertical' || axis === 'both';
      var out = [];
      var u = R.layoutPreview.unionOf(d.boxes);
      var cx = u.x + u.w / 2;
      var cy = u.y + u.h / 2;
      for (var i = 0; i < d.boxes.length; i++) {
        var b = d.boxes[i];
        var t = { sx: doX ? -1 : 1, sy: doY ? -1 : 1 };
        if (pivot === 'selection') {
          t.dx = doX ? 2 * (cx - (b.x + b.w / 2)) : 0;
          t.dy = doY ? 2 * (cy - (b.y + b.h / 2)) : 0;
        }
        out.push(t);
      }
      return out;
    }

    var axisCtl = ui.segmented([
      { value: 'horizontal', label: 'Horizontal', title: 'Mirror left to right' },
      { value: 'vertical', label: 'Vertical', title: 'Mirror top to bottom' },
      { value: 'both', label: 'Both', title: 'Mirror on both axes' }
    ], { value: axis, onChange: function (v) { axis = v; renderPreview(); } });

    var pivotCtl = ui.segmented([
      { value: 'anchor', label: 'Anchor', title: 'Flip in place about each layer anchor' },
      { value: 'selection', label: 'Selection center', title: 'Reflect across the selection bounds' }
    ], { value: pivot, onChange: function (v) { pivot = v; } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Mirrors selected layers by negating scale. Selection center also reflects each layer across the combined bounds.' }),
      previewHost,
      ui.row('Axis', axisCtl.el),
      ui.row('Pivot', pivotCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    applyBtn.addEventListener('mouseenter', function () { map.preview(flipDeltas()); });
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
      ctx.invoke('flip.apply', { axis: axis, pivot: pivot })
        .then(function (res) {
          ctx.toast('Flipped ' + res.flipped + ' layer' + (res.flipped === 1 ? '' : 's')
            + (res.skipped.length ? ' (' + res.skipped.length + ' skipped)' : ''), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not flip', { kind: 'error' }); });
    }

    function applyState(s) {
      if (!s) return;
      if (s.axis != null) { axis = s.axis; axisCtl.set(s.axis); }
      if (s.pivot != null) { pivot = s.pivot; pivotCtl.set(s.pivot); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'flip',
        get: function () { return { axis: axis, pivot: pivot }; },
        set: applyState,
        thumbFor: function (st, opts) { return flipSvg(st.axis, (opts && opts.height) || 38); },
        defaults: FLIP_DEFAULTS
      },
      destroy: function () { off(); map.destroy(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to flip';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
