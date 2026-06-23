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

  // Clean elastic settle: a configurable Penner elastic-out that overshoots the
  // target, oscillates, and resolves cleanly to exactly the target (the decay
  // envelope drives the tail to ~0, so it never snaps at the end). Overshoot
  // sets how far past the target the first peak goes, Bounce the number of
  // wobbles, Friction how fast it settles.
  function elasticFor(overshoot, bounce, friction) {
    var amp = 1 + R.units.clamp(overshoot / 100, 0.05, 2);
    var osc = R.units.clamp(bounce, 1, 8);
    var damp = R.units.clamp(friction * 0.9 + 2.5, 3, 16);
    return R.easing.penner.elasticOutWith(amp, osc, damp);
  }

  function mount(ctx) {
    var overshoot = 60;
    var bounce = 2;
    var friction = 6;

    // Preview the REAL recoil motion: a quick move to the mark, then a
    // velocity-driven damped OSCILLATION around it (several wobbles that decay),
    // which is what the rig's sin/exp expression produces. This is distinct from
    // Spring's single smooth overshoot. Driven live by the sliders.
    function previewCurve() {
      return { type: 'fn', fn: elasticFor(overshoot, bounce, friction) };
    }
    // The recoil shape as a read-only graph, the same way Spring shows its shape.
    var editorHost = el('div');
    var editor = ui.CurveEditor(editorHost, { value: previewCurve(), allowOvershoot: true });
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, { getCurve: previewCurve, property: 'position', sample: 'shape', duration: 1300 });

    var halfLife = el('span.rb-chip', { text: '' });
    function refreshChip() {
      var hl = friction > 0 ? Math.log(2) / friction : 0;
      editor.setCurve(previewCurve());
      halfLife.textContent = 'Half-life ' + R.units.round(hl, 2) + 's';
      preview.setReadout('Overshoot ' + Math.round(overshoot) + '% · half-life ' + R.units.round(hl, 2) + 's');
    }

    var overshootSlider = ui.slider({ label: 'Overshoot', min: 0, max: 200, step: 1, value: overshoot,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { overshoot = v; refreshChip(); } });
    var bounceSlider = ui.slider({ label: 'Bounce', min: 0.5, max: 8, step: 0.1, value: bounce,
      onInput: function (v) { bounce = v; refreshChip(); } });
    var frictionSlider = ui.slider({ label: 'Friction', min: 0.5, max: 20, step: 0.1, value: friction,
      onInput: function (v) { friction = v; refreshChip(); } });
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      editorHost,
      el('div.rb-faint', { text: 'Select 2+ keyframes. Recoil adds velocity-driven overshoot AFTER the last keyframe (it keeps moving, then settles), scaled by how fast it arrives. By default it bakes a few editable keyframes at each peak; set Apply as → Expression in Settings for the live, keyframe-free rig.' }),
      overshootSlider.el,
      bounceSlider.el,
      frictionSlider.el,
      el('div.rb-row', null, [halfLife])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply recoil']));

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.totalSelectedKeys >= 2 ? sel.totalSelectedKeys + ' keys · ' + sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies') : 'Select 2+ keyframes')
        : 'Open a composition';
    });
    scopeText.textContent = '';

    function doApply() {
      // Recoil is velocity-driven follow-through AFTER the keyframe (the classic
      // overshoot expression). 'Keyframes' bakes that motion at its exact
      // peaks/valleys; 'Expression' (Settings > Apply as) drops the live rig.
      var s = (ctx.store && ctx.store.get) ? (ctx.store.get().settings || {}) : {};
      var asExpr = s.applyMode === 'expression';
      var handleLength = (s.handleLength > 0) ? s.handleLength : 80;
      var rigArgs = { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: false };
      var method = asExpr ? 'recoil.apply' : 'recoil.bake';
      var args = asExpr ? rigArgs
        : { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: false, handleLength: handleLength };
      ctx.invoke(method, args)
        .then(function (res) {
          var n = (res && res.applied != null) ? res.applied : 0;
          ctx.toast('Recoil on ' + n + ' propert' + (n === 1 ? 'y' : 'ies'), { kind: 'success' });
          if (res && res.skipped && res.skipped.length) {
            ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          }
          ctx.refreshSelection();
        })
        .catch(function (err) {
          ctx.toast((err && err.message) || 'Could not apply Recoil', { kind: 'error' });
        });
    }

    function getState() {
      return { overshoot: overshoot, bounce: bounce, friction: friction };
    }
    function applyState(s) {
      if (!s) return;
      if (s.overshoot != null) { overshoot = s.overshoot; overshootSlider.set(s.overshoot); }
      if (s.bounce != null) { bounce = s.bounce; bounceSlider.set(s.bounce); }
      if (s.friction != null) { friction = s.friction; frictionSlider.set(s.friction); }
      refreshChip();
    }

    refreshChip();
    return {
      presets: {
        toolId: 'recoil',
        get: getState,
        set: applyState,
        previewFor: function (s) {
          return elasticFor(s.overshoot, s.bounce, s.friction);
        },
        defaults: [
          { name: 'Snappy', state: { overshoot: 80, bounce: 4, friction: 10 } },
          { name: 'Soft Settle', state: { overshoot: 40, bounce: 1.5, friction: 5 } },
          { name: 'Big Overshoot', state: { overshoot: 160, bounce: 3, friction: 4 } },
          { name: 'Tight Recoil', state: { overshoot: 50, bounce: 6, friction: 14 } }
        ]
      },
      destroy: function () { off(); preview.destroy(); editor.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
