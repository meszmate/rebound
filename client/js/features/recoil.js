/*
 * Rebound, Recoil tool.
 * Adds velocity-driven elastic overshoot to keyframed properties via a live,
 * art-directable expression rig (Overshoot / Bounce / Friction sliders).
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'recoil',
    title: 'Recoil',
    group: 'Physics',
    order: 0,
    keywords: ['recoil', 'overshoot', 'bounce', 'elastic', 'spring', 'follow through'],
    mount: mount
  });

  function mount(ctx) {
    var overshoot = 60;
    var bounce = 2;
    var friction = 6;
    var eachKey = true;

    // Preview: synthesize a representative overshoot spring from the sliders so
    // the motion is visible before applying (scale pops the overshoot best).
    function previewCurve() {
      return {
        type: 'spring',
        response: R.units.clamp(2 / bounce, 0.2, 1.3),
        bounce: R.units.clamp(overshoot / 150, 0, 0.75),
        velocity: 0
      };
    }
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, { getCurve: previewCurve, property: 'position', sample: 'shape' });

    var halfLife = el('span.rb-chip', { text: '' });
    function refreshChip() {
      var hl = friction > 0 ? Math.log(2) / friction : 0;
      halfLife.textContent = 'Half-life ' + R.units.round(hl, 2) + 's';
      preview.setReadout('Overshoot ' + Math.round(overshoot) + '% · half-life ' + R.units.round(hl, 2) + 's');
    }

    var overshootSlider = ui.slider({ label: 'Overshoot', min: 0, max: 200, step: 1, value: overshoot,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { overshoot = v; refreshChip(); } });
    var bounceSlider = ui.slider({ label: 'Bounce', min: 0.5, max: 8, step: 0.1, value: bounce,
      onInput: function (v) { bounce = v; refreshChip(); } });
    var frictionSlider = ui.slider({ label: 'Friction', min: 0.5, max: 20, step: 0.1, value: friction,
      onInput: function (v) { friction = v; refreshChip(); } });
    var eachKeyToggle = ui.toggle({ label: 'After every keyframe', value: eachKey,
      title: 'On: overshoot fires after every keyframe the value passes. Off: only after the final keyframe.',
      onChange: function (v) { eachKey = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      el('div.rb-faint', { text: 'Adds elastic overshoot after a keyframe, scaled by the incoming velocity. Non-destructive, your keyframes stay.' }),
      overshootSlider.el,
      bounceSlider.el,
      frictionSlider.el,
      eachKeyToggle.el,
      el('div.rb-row', null, [halfLife])
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
      ctx.invoke('recoil.apply', { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: eachKey })
        .then(function (res) { ctx.toast('Recoil on ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Recoil', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('recoil.remove', {})
        .then(function (res) { ctx.toast('Removed Recoil from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'info' }); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: eachKey };
    }
    function applyState(s) {
      if (!s) return;
      if (s.overshoot != null) { overshoot = s.overshoot; overshootSlider.set(s.overshoot); }
      if (s.bounce != null) { bounce = s.bounce; bounceSlider.set(s.bounce); }
      if (s.friction != null) { friction = s.friction; frictionSlider.set(s.friction); }
      if (s.eachKey != null) { eachKey = s.eachKey; eachKeyToggle.set(s.eachKey); }
      refreshChip();
    }

    refreshChip();
    return {
      presets: {
        toolId: 'recoil',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Snappy', state: { overshoot: 80, bounce: 4, friction: 10, eachKey: true } },
          { name: 'Soft Settle', state: { overshoot: 40, bounce: 1.5, friction: 5, eachKey: false } },
          { name: 'Big Overshoot', state: { overshoot: 160, bounce: 3, friction: 4, eachKey: true } },
          { name: 'Tight Recoil', state: { overshoot: 50, bounce: 6, friction: 14, eachKey: false } }
        ]
      },
      destroy: function () { off(); preview.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
