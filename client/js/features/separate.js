/*
 * Rebound — Separate tool.
 * Toggles Separate Dimensions on the selected layers' Position so each axis can
 * be keyed or expressed on its own. Separate splits Position into X/Y(/Z); Join
 * recombines them back into a single Position property.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  R.tools.register({
    id: 'separate',
    title: 'Separate',
    group: 'Transform',
    order: 3,
    keywords: ['separate', 'dimensions', 'position', 'split', 'join', 'combine', 'xyz', 'axis'],
    mount: mount
  });

  function mount(ctx) {
    var separateBtn = el('button.rb-btn', { onclick: function () { run(true); } }, ['Separate']);
    var joinBtn = el('button.rb-btn', { onclick: function () { run(false); } }, ['Join']);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Splits each selected layer’s Position into separate X/Y(/Z) values, or joins them back into one.' }),
      el('div.rb-row.rb-wrap', null, [separateBtn, joinBtn])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function run(separate) {
      ctx.invoke('separate.apply', { separate: separate })
        .then(function (res) {
          ctx.toast((separate ? 'Separated ' : 'Joined ') + res.changed + ' layer' + (res.changed === 1 ? '' : 's'),
            { kind: res.changed ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not change dimensions', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});