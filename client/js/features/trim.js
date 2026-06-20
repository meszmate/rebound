/*
 * Rebound — Trim tool.
 * Trims each selected layer's in/out points to the span of its keyframes,
 * with optional frame padding on either end. Non-destructive to keyframes.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'trim',
    title: 'Trim',
    group: 'Timing',
    order: 1,
    keywords: ['trim', 'in', 'out', 'keyframes', 'duration', 'timing', 'crop'],
    mount: mount
  });

  function mount(ctx) {
    var trimIn = true;
    var trimOut = true;
    var paddingFrames = 0;

    var inToggle = ui.toggle({ label: 'Trim in point', value: trimIn,
      onChange: function (v) { trimIn = v; } });
    var outToggle = ui.toggle({ label: 'Trim out point', value: trimOut,
      onChange: function (v) { trimOut = v; } });
    var padField = ui.numberField({ label: 'Padding', value: paddingFrames, step: 1, decimals: 0,
      suffix: 'fr', width: '110px', onChange: function (v) { paddingFrames = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Sets each layer\'s in and out points to span its keyframes, plus padding. Layers with no keyframes are left alone.' }),
      inToggle.el,
      outToggle.el,
      ui.row('Padding', padField.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('trim.apply', { trimIn: trimIn, trimOut: trimOut, paddingFrames: paddingFrames })
        .then(function (res) {
          var msg = 'Trimmed ' + res.trimmed + ' layer' + (res.trimmed === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) {
            msg += ', skipped ' + res.skipped.length + ' with no keyframes';
          }
          ctx.toast(msg, { kind: res.trimmed ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not trim', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to trim';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
