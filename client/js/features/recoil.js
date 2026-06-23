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

  // The recoil shape: a smooth move to the mark, then a decaying sine wobble
  // around it (freq full oscillations, amplitude amp, decaying at dec). This is
  // distinct from Spring's single smooth overshoot. The card demo replays the
  // same shape (duplicated there, since demos load before features).
  function makeRecoil(amp, freq, dec) {
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var riseT = 0.18;
      if (t < riseT) { var u = t / riseT; return u * u * (3 - 2 * u); }
      var sn = (t - riseT) / (1 - riseT);
      return 1 + amp * Math.sin(freq * sn * 2 * Math.PI) / Math.exp(dec * sn);
    };
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
      var amp = R.units.clamp(overshoot / 150, 0.08, 0.5);
      var freq = R.units.clamp(bounce, 1.2, 4);
      var dec = R.units.clamp(friction / 3, 0.8, 4);
      return { type: 'fn', fn: makeRecoil(amp, freq, dec) };
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
      el('div.rb-faint', { text: 'Select two or more keyframes; Recoil bakes elastic overshoot into the transition, settling onto the target. Undo reverts it.' }),
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
      var factors = R.easing.sampler.bakeFactors(previewCurve(), 256);
      ctx.invoke('bake.factors', { factors: factors })
        .then(function (res) { ctx.toast('Baked recoil onto ' + res.segments + ' segment' + (res.segments === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Recoil', { kind: 'error' }); });
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
          return makeRecoil(
            R.units.clamp(s.overshoot / 150, 0.08, 0.5),
            R.units.clamp(s.bounce, 1.2, 4),
            R.units.clamp(s.friction / 3, 0.8, 4)
          );
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
