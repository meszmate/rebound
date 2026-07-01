/*
 * Rebound, Break tool.
 * Splits a multi-group shape layer into one shape layer per top-level group,
 * so each group can be animated and ordered on its own. Optionally removes the
 * original after the split.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // One shape layer with three groups fanning into three separate layers. The
  // source fades when Delete original is on.
  function breakSvg(state, h) {
    var W = 160, H = 90, srcOp = state.deleteOriginal ? 0.3 : 1, i;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('rect', { x: 10, y: 22, width: 46, height: 46, rx: 3, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.2, opacity: srcOp, 'stroke-dasharray': state.deleteOriginal ? '3 3' : null }));
    for (i = 0; i < 3; i++) kids.push(svg('rect', { x: 15, y: 28 + i * 13, width: 36, height: 9, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.7', opacity: srcOp }));
    kids.push(svg('path', { d: 'M62 45 L78 45 M73 41 L79 45 L73 49', fill: 'none', stroke: 'var(--rb-text-muted)', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    for (i = 0; i < 3; i++) {
      var y = 16 + i * 22;
      kids.push(svg('rect', { x: 90, y: y, width: 58, height: 17, rx: 3, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
      kids.push(svg('rect', { x: 95, y: y + 5, width: 30, height: 7, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.75' }));
    }
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'break',
    title: 'Break',
    group: 'Shapes',
    order: 2,
    keywords: ['break', 'split', 'separate', 'explode', 'group', 'shape', 'ungroup', 'apart'],
    mount: mount
  });

  function mount(ctx) {
    var deleteOriginal = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(breakSvg({ deleteOriginal: deleteOriginal }, 90)); }

    var deleteToggle = ui.toggle({
      label: 'Delete original',
      value: deleteOriginal,
      onChange: function (v) { deleteOriginal = v; renderPreview(); }
    });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'A shape layer can hold several groups under "Contents" (each shape you drew). Break makes one new shape layer per top-level group, keeping its look, so you can animate, reorder, or parent each shape on its own. A layer with only one group has nothing to split.' }),
      previewHost,
      deleteToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('break.apply', { deleteOriginal: deleteOriginal })
        .then(function (res) {
          if (!res.created) {
            ctx.toast('No shape layers to break', { kind: 'error' });
            return;
          }
          var msg = 'Broke into ' + res.created + ' layer' + (res.created === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) {
            msg += ' · skipped ' + res.skipped.length + ' incompatible layer' + (res.skipped.length === 1 ? '' : 's');
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not break layer', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select shape layers to break';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});