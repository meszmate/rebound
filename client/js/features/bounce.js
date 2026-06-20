/*
 * Rebound — Bounce tool.
 * Gravitational rebound on keyframed properties: after the last keyframe a
 * property passes, its value rebounds off the target like a ball, each bounce
 * smaller, driven by a live, art-directable expression rig.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'bounce',
    title: 'Bounce',
    group: 'Physics',
    order: 2,
    keywords: ['bounce', 'gravity', 'rebound', 'ball', 'elastic', 'physics', 'drop'],
    mount: mount
  });

  function mount(ctx) {
    var elasticity = 0.7;
    var gravity = 4;
    var maxBounces = 4;

    var elasticitySlider = ui.slider({ label: 'Elasticity', min: 0, max: 1, step: 0.01, value: elasticity,
      format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { elasticity = v; } });
    var gravitySlider = ui.slider({ label: 'Gravity', min: 0.5, max: 20, step: 0.1, value: gravity,
      onInput: function (v) { gravity = v; } });
    var bouncesField = ui.numberField({ label: 'Max bounces', value: maxBounces, min: 1, max: 24, step: 1, decimals: 0,
      width: '110px', onChange: function (v) { maxBounces = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Rebounds the value off its target after the last keyframe, each bounce smaller. Non-destructive — your keyframes stay.' }),
      elasticitySlider.el,
      gravitySlider.el,
      ui.row('Max bounces', bouncesField.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.totalSelectedKeys >= 2 ? sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies') : 'Select a keyframed property')
        : 'Open a composition';
    });
    scopeText.textContent = '';

    function doApply() {
      ctx.invoke('bounce.apply', { elasticity: elasticity, gravity: gravity, maxBounces: maxBounces })
        .then(function (res) { ctx.toast('Bounce on ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Bounce', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('bounce.remove', {})
        .then(function (res) { ctx.toast('Removed Bounce from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'info' }); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    return { destroy: off };
  }
})(window.Rebound = window.Rebound || {});
