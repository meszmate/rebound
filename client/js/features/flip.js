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
    keywords: ['flip', 'mirror', 'reflect', 'reverse', 'horizontal', 'vertical'],
    mount: mount
  });

  function mount(ctx) {
    var axis = 'horizontal';
    var pivot = 'anchor';

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(flipSvg(axis, 104)); }

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
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

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
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to flip';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
