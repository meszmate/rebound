/*
 * Rebound — Nullify tool.
 * Drops a control null at the selection and (optionally) parents the selected
 * layers to it, so one handle drives the whole group. The null lands at the
 * selection's center or at the first layer's anchor.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'nullify',
    title: 'Nullify',
    group: 'Transform',
    order: 2,
    keywords: ['null', 'nullify', 'control', 'parent', 'rig', 'handle', 'group'],
    mount: mount
  });

  function mount(ctx) {
    var position = 'center';
    var parent = true;

    var positionCtl = ui.segmented([
      { value: 'center', label: 'Selection center', title: 'Place the null at the average of the selected layers' },
      { value: 'first', label: 'First layer anchor', title: 'Place the null at the first selected layer' }
    ], { value: position, onChange: function (v) { position = v; } });

    var parentToggle = ui.toggle({ label: 'Parent layers', value: parent,
      onChange: function (v) { parent = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Creates a control null at the selection so one handle can drive every selected layer.' }),
      ui.row('Position', positionCtl.el),
      parentToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('nullify.apply', { position: position, parent: parent })
        .then(function (res) {
          var msg = parent
            ? 'Parented ' + res.parented + ' layer' + (res.parented === 1 ? '' : 's') + ' to a null'
            : 'Created a control null';
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not create null', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to nullify';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});