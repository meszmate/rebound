/*
 * Rebound — Text Break tool.
 * Splits a text layer into separate text layers per line, word, or character,
 * leaving the pieces stacked at the source position for the user to reposition.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'textbreak',
    title: 'Text Break',
    group: 'Shapes',
    order: 3,
    keywords: ['text', 'break', 'split', 'lines', 'words', 'characters', 'letters', 'explode'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'lines';
    var deleteOriginal = false;

    var modeCtl = ui.segmented([
      { value: 'lines', label: 'Lines', title: 'One layer per line of text' },
      { value: 'words', label: 'Words', title: 'One layer per word' },
      { value: 'characters', label: 'Characters', title: 'One layer per non-space character' }
    ], { value: mode, onChange: function (v) { mode = v; } });

    var deleteToggle = ui.toggle({
      label: 'Delete original',
      value: deleteOriginal,
      onChange: function (v) { deleteOriginal = v; }
    });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Splits each selected text layer into separate text layers. New layers stay stacked at the source position for you to reposition.' }),
      ui.row('Mode', modeCtl.el),
      deleteToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('textbreak.apply', { mode: mode, deleteOriginal: deleteOriginal })
        .then(function (res) {
          if (!res.created) {
            ctx.toast('No text layers to break', { kind: 'error' });
            return;
          }
          var msg = 'Broke into ' + res.created + ' layer' + (res.created === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) {
            msg += ' · skipped ' + res.skipped.length + ' non-text layer' + (res.skipped.length === 1 ? '' : 's');
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not break text', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select text layers to break';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});