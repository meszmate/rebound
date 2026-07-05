/*
 * Rebound, AutoCrop tool.
 * Masks each selected layer to its visible content bounds, with an optional
 * margin, so the transparent border is clipped away. Non-destructive: it adds a
 * named rectangular mask that Remove can clear. A live preview shows the crop
 * rectangle growing with the margin.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  function autocropSvg(padding, h) {
    var W = 160, H = 100;
    var m = Math.max(0, Math.min(18, (padding || 0) * 0.6));
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    // The layer's full frame (faint) and a content blob inside it.
    kids.push(svg('rect', { x: 10, y: 10, width: W - 20, height: H - 20, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0.6' }));
    var cx = W / 2, cy = H / 2, cw = 56, ch = 40;
    kids.push(svg('rect', { x: (cx - cw / 2).toFixed(1), y: (cy - ch / 2).toFixed(1), width: cw, height: ch, rx: 4, fill: 'var(--rb-accent)', 'fill-opacity': '0.82' }));
    // The crop rectangle, content bounds grown by the margin.
    kids.push(svg('rect', { x: (cx - cw / 2 - m).toFixed(1), y: (cy - ch / 2 - m).toFixed(1), width: (cw + 2 * m).toFixed(1), height: (ch + 2 * m).toFixed(1), rx: 3, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }));
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'autocrop',
    title: 'Auto Crop',
    group: 'Transform',
    order: 5,
    // One-click Home tile: the tool's primary apply with its defaults.
    quick: {
      desc: 'Mask each selected layer to its visible content bounds with no margin.',
      method: 'autocrop.apply',
      args: { padding: 0, extents: false }
    },
    keywords: ['autocrop', 'crop', 'trim', 'bounds', 'content', 'mask', 'fit'],
    mount: mount
  });

  function mount(ctx) {
    var padding = 0;
    var extents = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(autocropSvg(padding, 110)); }

    var padField = ui.numberField({ label: 'Margin', value: padding, min: 0, step: 1, decimals: 0, suffix: 'px', width: '120px',
      onChange: function (v) { padding = v; renderPreview(); } });
    var extentsToggle = ui.toggle({ label: 'Include masks & effects', value: extents,
      title: 'Measure the bounds grown to include masks, strokes, and effects rather than the raw layer geometry.',
      onChange: function (v) { extents = v; } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Masks each selected layer to its visible content bounds, clipping the transparent border. Removing the mask restores the full layer.' }),
      previewHost,
      ui.row('Margin', padField.el),
      extentsToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn', { title: 'Remove the Rebound crop mask', onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Crop']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('autocrop.apply', { padding: padding, extents: extents })
        .then(function (res) {
          ctx.toast('Cropped ' + res.cropped + ' layer' + (res.cropped === 1 ? '' : 's'), { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not crop', { kind: 'error' }); });
    }

    function doRemove() {
      ctx.invoke('autocrop.remove', {})
        .then(function (res) { ctx.toast('Removed crop from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not remove crop', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select one or more layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
