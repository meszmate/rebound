/*
 * Rebound, Stagger tool.
 * Offsets selected layers in time so they cascade by a fixed interval,
 * anchored at the playhead or the earliest layer, with an optional reverse.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'stagger',
    title: 'Stagger',
    group: 'Timing',
    order: 0,
    keywords: ['stagger', 'offset', 'cascade', 'sequence', 'delay', 'timing'],
    mount: mount
  });

  function mount(ctx) {
    var intervalFrames = 4;
    var reverse = false;
    var anchor = 'playhead';

    var intervalField = ui.numberField({ label: 'Interval', value: intervalFrames, min: 0, step: 1, decimals: 0, suffix: 'f', width: '110px',
      onChange: function (v) { intervalFrames = v; } });
    var reverseToggle = ui.toggle({ label: 'Reverse order', value: reverse,
      onChange: function (v) { reverse = v; } });
    var anchorCtl = ui.segmented([
      { value: 'playhead', label: 'Playhead', title: 'Start the cascade at the current time' },
      { value: 'first', label: 'First layer', title: 'Start the cascade at the earliest layer' }
    ], { value: anchor, onChange: function (v) { anchor = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Shifts whole layers in time so they begin one after another by the interval below.' }),
      intervalField.el,
      reverseToggle.el,
      ui.row('Anchor', anchorCtl.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('stagger.apply', { intervalFrames: intervalFrames, reverse: reverse, anchor: anchor })
        .then(function (res) { ctx.toast('Staggered ' + res.staggered + ' layer' + (res.staggered === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not stagger', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to stagger';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
