/*
 * Rebound — Reverse tool.
 * Reverses the selected keyframes in time, mirroring them within their own
 * span: a key originally at one end of the range lands at the other, with its
 * value preserved and its ease and interpolation direction swapped.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  R.tools.register({
    id: 'reverse',
    title: 'Reverse',
    group: 'Timing',
    order: 5,
    keywords: ['reverse', 'mirror', 'flip', 'invert', 'keyframe', 'time', 'timing', 'reorder'],
    mount: mount
  });

  function mount(ctx) {
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Mirrors the selected keyframes within their own span, so the animation plays back in reverse. Select at least two keyframes on a property; with none selected, the whole property is reversed.' })
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('reverse.apply', {})
        .then(function (res) { ctx.toast('Reversed ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: res.keys ? 'success' : 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not reverse', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes to reverse';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
