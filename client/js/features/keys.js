/*
 * Rebound — Keyframe utilities.
 * Quick interpolation-type setters for the selected keyframes.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  R.tools.register({
    id: 'keys',
    title: 'Keyframes',
    group: 'Timing',
    order: 2,
    keywords: ['keyframe', 'interpolation', 'linear', 'hold', 'easy ease', 'bezier'],
    mount: mount,
    commands: [
      { id: 'easyEase', title: 'Easy ease selected keys', run: function (ctx) { set(ctx, 'easyEase'); } }
    ]
  });

  var TYPES = [
    { type: 'linear', label: 'Linear' },
    { type: 'easyEase', label: 'Easy Ease' },
    { type: 'hold', label: 'Hold' },
    { type: 'bezier', label: 'Bezier' }
  ];

  function mount(ctx) {
    var row = el('div.rb-row.rb-wrap', null, TYPES.map(function (t) {
      return el('button.rb-btn', { onclick: function () { set(ctx, t.type); } }, [t.label]);
    }));

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Set the interpolation of the selected keyframes.' }),
      row
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.totalSelectedKeys ? sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected' : 'Select keyframes')
        : 'Open a composition';
    });
    return { destroy: off };
  }

  function set(ctx, type) {
    ctx.invoke('keys.setInterp', { type: type })
      .then(function (res) { ctx.toast('Set ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' }); })
      .catch(function (err) { ctx.toast(err.message || 'Could not set keyframes', { kind: 'error' }); });
  }
})(window.Rebound = window.Rebound || {});
