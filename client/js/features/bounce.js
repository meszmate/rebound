/*
 * Rebound, Bounce tool.
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
    var eachKey = false;

    // Preview: a settling rebound synthesized from the rig parameters.
    function previewCurve() {
      return {
        type: 'spring',
        response: R.units.clamp(2 / gravity, 0.3, 1.3),
        bounce: R.units.clamp(elasticity * 0.75, 0, 0.75)
      };
    }
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, { getCurve: previewCurve, property: 'position', sample: 'shape' });
    function updateReadout() {
      preview.setReadout('Elasticity ' + Math.round(elasticity * 100) + '% · gravity ' + R.units.round(gravity, 1));
    }

    var elasticitySlider = ui.slider({ label: 'Elasticity', min: 0, max: 1, step: 0.01, value: elasticity,
      format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { elasticity = v; updateReadout(); } });
    var gravitySlider = ui.slider({ label: 'Gravity', min: 0.5, max: 20, step: 0.1, value: gravity,
      onInput: function (v) { gravity = v; updateReadout(); } });
    var bouncesField = ui.numberField({ label: 'Max bounces', value: maxBounces, min: 1, max: 24, step: 1, decimals: 0,
      width: '100%', onChange: function (v) { maxBounces = v; } });
    var eachKeyToggle = ui.toggle({ label: 'After every keyframe', value: eachKey,
      title: 'On: the value rebounds after every keyframe it passes. Off: only after the final keyframe (a single ball drop).',
      onChange: function (v) { eachKey = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      el('div.rb-faint', { text: 'Rebounds the value off its target after a keyframe, each bounce smaller. Non-destructive, your keyframes stay.' }),
      elasticitySlider.el,
      gravitySlider.el,
      bouncesField.el,
      eachKeyToggle.el
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
      ctx.invoke('bounce.apply', { elasticity: elasticity, gravity: gravity, maxBounces: maxBounces, eachKey: eachKey })
        .then(function (res) { ctx.toast('Bounce on ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Bounce', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('bounce.remove', {})
        .then(function (res) { ctx.toast('Removed Bounce from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'info' }); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { elasticity: elasticity, gravity: gravity, maxBounces: maxBounces, eachKey: eachKey };
    }
    function applyState(s) {
      if (!s) return;
      if (s.elasticity != null) { elasticity = s.elasticity; elasticitySlider.set(s.elasticity); }
      if (s.gravity != null) { gravity = s.gravity; gravitySlider.set(s.gravity); }
      if (s.maxBounces != null) { maxBounces = s.maxBounces; bouncesField.set(s.maxBounces); }
      if (s.eachKey != null) { eachKey = s.eachKey; eachKeyToggle.set(s.eachKey); }
      updateReadout();
    }

    updateReadout();
    return {
      presets: {
        toolId: 'bounce',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Rubber Ball', state: { elasticity: 0.8, gravity: 6, maxBounces: 6, eachKey: false } },
          { name: 'Heavy Drop', state: { elasticity: 0.4, gravity: 12, maxBounces: 3, eachKey: false } },
          { name: 'Floaty', state: { elasticity: 0.9, gravity: 2, maxBounces: 8, eachKey: false } },
          { name: 'Every Key', state: { elasticity: 0.6, gravity: 5, maxBounces: 4, eachKey: true } }
        ]
      },
      destroy: function () { off(); preview.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
