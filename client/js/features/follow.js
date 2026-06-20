/*
 * Rebound — Follow tool.
 * Makes every selected layer except the first trail the first layer's position
 * by a fixed delay, driven by a marker-guarded expression backed by a per-layer
 * Slider Control. Cascade adds another delay step to each successive follower.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'follow',
    title: 'Follow',
    group: 'Physics',
    order: 4,
    keywords: ['follow', 'follow through', 'trail', 'delay', 'lag', 'chain', 'cascade', 'lead'],
    mount: mount
  });

  function mount(ctx) {
    var delayFrames = 4;
    var cascade = false;

    var delaySlider = ui.slider({ label: 'Delay', min: 0, max: 60, step: 1, value: delayFrames,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { delayFrames = v; } });
    var cascadeToggle = ui.toggle({ label: 'Cascade delay down the chain', value: cascade,
      onChange: function (v) { cascade = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Makes every selected layer except the first trail the first layer’s position by the delay below. Cascade adds another delay step to each layer down the selection.' }),
      delaySlider.el,
      cascadeToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('follow.apply', { delayFrames: delayFrames, cascade: cascade })
        .then(function (res) { ctx.toast(res.applied + ' layer' + (res.applied === 1 ? '' : 's') + ' following', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Follow', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('follow.remove', {})
        .then(function (res) { ctx.toast('Removed Follow from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (sel.selectedLayerCount < 2) return 'Select a lead layer plus followers';
    return (sel.selectedLayerCount - 1) + ' follower' + (sel.selectedLayerCount - 1 === 1 ? '' : 's');
  }
})(window.Rebound = window.Rebound || {});