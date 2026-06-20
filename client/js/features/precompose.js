/*
 * Rebound, Precompose tool.
 * Nests the selected layers into a brand-new composition. Optionally moves all
 * attributes into the new comp and opens it once created.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'precompose',
    title: 'Precompose',
    group: 'Layout',
    order: 5,
    keywords: ['precompose', 'precomp', 'nest', 'group', 'composition', 'collapse', 'wrap'],
    mount: mount
  });

  function mount(ctx) {
    var name = 'Precomp';
    var moveAttributes = true;
    var open = false;

    var nameInput = el('input', {
      type: 'text',
      value: name,
      placeholder: 'Precomp',
      'aria-label': 'New composition name',
      oninput: function () { name = this.value; }
    });
    var nameField = el('div.rb-field', null, [nameInput]);

    var moveToggle = ui.toggle({ label: 'Move all attributes', value: moveAttributes,
      onChange: function (v) { moveAttributes = v; } });
    var openToggle = ui.toggle({ label: 'Open new comp', value: open,
      onChange: function (v) { open = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Nests the selected layers into a new composition. Move all attributes keeps transforms, masks, and effects on the nested comp.' }),
      ui.row('Name', nameField),
      moveToggle.el,
      openToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('precompose.apply', { name: name, moveAttributes: moveAttributes, open: open })
        .then(function (res) { ctx.toast('Precomposed into ' + res.name, { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not precompose', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to precompose';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
