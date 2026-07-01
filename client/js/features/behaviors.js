/*
 * Rebound, motion behaviors tool.
 * Browse-and-apply animation behaviors (entrances / exits / emphasis). Each
 * builds real, editable keyframes with real eases on the selected layers via the
 * pure client/js/behaviors/library.js spec + host behavior.apply.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'behaviors',
    title: 'Behaviors',
    group: 'Timing',
    order: 8,
    keywords: ['behavior', 'animation', 'preset', 'entrance', 'exit', 'in', 'out', 'fade', 'slide', 'pop', 'pulse', 'emphasis', 'transition'],
    mount: mountBehaviors
  });

  var CATS = [
    { key: 'in', label: 'Entrances' },
    { key: 'out', label: 'Exits' },
    { key: 'emphasis', label: 'Emphasis' }
  ];

  function mountBehaviors(ctx) {
    var lib = R.behaviors;
    var durFrames = 20, distance = 200, direction = 'left', amount = 15;

    function controls() { return { durFrames: durFrames, distance: distance, direction: direction, amount: amount }; }

    var durSlider = ui.slider({ label: 'Duration', min: 4, max: 90, step: 1, value: durFrames,
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { durFrames = Math.round(v); } });
    var distSlider = ui.slider({ label: 'Distance', min: 20, max: 1000, step: 10, value: distance,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { distance = Math.round(v); } });
    var amtSlider = ui.slider({ label: 'Overshoot', min: 0, max: 60, step: 1, value: amount,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { amount = Math.round(v); } });
    var dirCtl = ui.segmented([
      { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
      { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }
    ], { value: direction, onChange: function (v) { direction = v; } });

    function applyBehavior(b) {
      var spec = lib.build(b.id, controls());
      if (!spec) return;
      ctx.invoke('behavior.apply', spec)
        .then(function (res) {
          ctx.toast(b.name + ' → ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast((err && err.message) || 'Could not apply behavior', { kind: 'error' }); });
    }

    function tile(b) {
      var node = el('button.rb-btn.rb-behavior-tile', { title: b.desc, onclick: function () { applyBehavior(b); } }, [
        el('span.rb-behavior-name', { text: b.name }),
        el('span.rb-behavior-desc', { text: b.desc })
      ]);
      return node;
    }

    var body = [
      el('div.rb-faint', { text: 'Drop a ready-made animation on the selected layers — clean keyframes you can hand-tune, starting at the playhead.' }),
      el('div.rb-section-label', { text: 'Controls' }),
      durSlider.el, distSlider.el, amtSlider.el,
      ui.row('Direction', dirCtl.el)
    ];
    CATS.forEach(function (cat) {
      var items = lib.BEHAVIORS.filter(function (b) { return b.category === cat.key; });
      if (!items.length) return;
      body.push(el('div.rb-section-label', { text: cat.label }));
      body.push(el('div.rb-behavior-grid', null, items.map(tile)));
    });
    ctx.body.appendChild(el('div.rb-col', null, body));

    var status = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(status);
    function describe(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      var n = sel.selectedLayerCount || 0;
      return n ? (n + ' layer' + (n === 1 ? '' : 's') + ' — click a behavior') : 'Select a layer';
    }
    var off = ctx.onSelection(function (sel) { status.textContent = describe(sel); });
    status.textContent = describe(ctx.getSelection());

    return { destroy: function () { off(); } };
  }
})(window.Rebound = window.Rebound || {});
