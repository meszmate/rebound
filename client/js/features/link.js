/*
 * Rebound, Link tool.
 * A quick pick-whip: parents the selected layers to one chosen layer (either the
 * last or first in the selection). Unlink clears parenting on the selection.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Three layer chips; the Target picks which becomes the parent (highlighted),
  // and the others arrow into it.
  function linkSvg(state, h) {
    var W = 160, H = 80;
    var chips = [[34, 38, 'A'], [80, 38, 'B'], [126, 38, 'C']];
    var pidx = state.target === 'first' ? 0 : 2;
    var p = chips[pidx];
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    chips.forEach(function (c, i) {
      if (i === pidx) return;
      kids.push(svg('path', { d: 'M' + c[0] + ' ' + (c[1] - 13) + ' Q' + ((c[0] + p[0]) / 2) + ' ' + (c[1] - 30) + ' ' + p[0] + ' ' + (p[1] - 13), fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4, opacity: '0.7' }));
    });
    chips.forEach(function (c, i) {
      var parent = i === pidx;
      kids.push(svg('rect', { x: c[0] - 16, y: c[1] - 12, width: 32, height: 24, rx: 3, fill: parent ? 'var(--rb-accent)' : 'var(--rb-text-faint)', 'fill-opacity': parent ? '0.95' : '0.5' }));
      kids.push(svg('text', { x: c[0], y: c[1] + 4, 'font-size': 10, 'text-anchor': 'middle', 'font-weight': 700, fill: parent ? '#fff' : 'var(--rb-text)' }, [c[2]]));
    });
    kids.push(svg('text', { x: p[0], y: p[1] + 24, 'font-size': 8, 'text-anchor': 'middle', fill: 'var(--rb-text-faint)' }, ['parent']));
    return svg('svg', { viewBox: '0 0 160 80', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'link',
    title: 'Link',
    group: 'Transform',
    order: 4,
    quick: {
      desc: 'Parent the selected layers to the last selected layer.',
      method: 'link.apply',
      args: { target: 'last' },
      config: [{ arg: 'target', label: 'Target', type: 'select', options: [
        { value: 'last', label: 'Last selected' },
        { value: 'first', label: 'First selected' }
      ] }]
    },
    keywords: ['link', 'parent', 'pick whip', 'pickwhip', 'unlink', 'unparent', 'attach'],
    mount: mount
  });

  function mount(ctx) {
    var target = 'last';

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(linkSvg({ target: target }, 80)); }

    var targetCtl = ui.segmented([
      { value: 'last', label: 'Last selected', title: 'Parent the others to the last selected layer' },
      { value: 'first', label: 'First selected', title: 'Parent the others to the first selected layer' }
    ], { value: target, onChange: function (v) { target = v; renderPreview(); } });

    var unlinkBtn = el('button.rb-btn', { onclick: doUnlink, title: 'Clear parenting on the selected layers' }, ['Unlink']);

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Parents the selected layers to one chosen layer so it drives them all, or clears their parenting.' }),
      previewHost,
      ui.row('Target', targetCtl.el),
      el('div.rb-row.rb-wrap', null, [unlinkBtn])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('link.apply', { target: target })
        .then(function (res) { ctx.toast('Linked ' + res.linked + ' layer' + (res.linked === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not link', { kind: 'error' }); });
    }

    function doUnlink() {
      ctx.invoke('link.unlink', {})
        .then(function (res) {
          ctx.toast('Unlinked ' + res.unlinked + ' layer' + (res.unlinked === 1 ? '' : 's'),
            { kind: res.unlinked ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not unlink', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to link';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});