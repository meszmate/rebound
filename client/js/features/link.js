/*
 * Rebound — Link tool.
 * A quick pick-whip: parents the selected layers to one chosen layer (either the
 * last or first in the selection). Unlink clears parenting on the selection.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'link',
    title: 'Link',
    group: 'Transform',
    order: 4,
    keywords: ['link', 'parent', 'pick whip', 'pickwhip', 'unlink', 'unparent', 'attach'],
    mount: mount
  });

  function mount(ctx) {
    var target = 'last';

    var targetCtl = ui.segmented([
      { value: 'last', label: 'Last selected', title: 'Parent the others to the last selected layer' },
      { value: 'first', label: 'First selected', title: 'Parent the others to the first selected layer' }
    ], { value: target, onChange: function (v) { target = v; } });

    var unlinkBtn = el('button.rb-btn', { onclick: doUnlink, title: 'Clear parenting on the selected layers' }, ['Unlink']);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Parents the selected layers to one chosen layer so it drives them all, or clears their parenting.' }),
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