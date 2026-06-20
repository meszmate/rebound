/*
 * Rebound — Break tool.
 * Splits a multi-group shape layer into one shape layer per top-level group,
 * so each group can be animated and ordered on its own. Optionally removes the
 * original after the split.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

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

    var deleteToggle = ui.toggle({
      label: 'Delete original',
      value: deleteOriginal,
      onChange: function (v) { deleteOriginal = v; }
    });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Splits each selected shape layer into one new shape layer per top-level group.' }),
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
            msg += ' · skipped ' + res.skipped.length + ' non-shape layer' + (res.skipped.length === 1 ? '' : 's');
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