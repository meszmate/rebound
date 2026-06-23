/*
 * Rebound, Recoil tool.
 * Velocity-driven overshoot (the classic Apple-style follow-through): after a
 * keyframe lands, the property keeps moving in the arrival direction then
 * oscillates back and settles, scaled by how fast it arrived. Apply bakes that
 * motion as a few editable keyframes; "As expression" drops the live rig.
 *
 * Overshoot = amp (how much of the arrival velocity carries past the target),
 * Bounce = frequency, Friction = decay. These map 1:1 to the expression
 * value + v * (overshoot/100) * sin(2*PI*bounce*t) / exp(friction*t).
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
    keywords: ['recoil', 'overshoot', 'bounce', 'elastic', 'spring', 'follow through', 'apple', 'settle'],
    mount: mount
  });

  // A faithful, subtle preview of the real follow-through: a smooth rise to the
  // target, then a damped oscillation whose amplitude is the actual velocity-
  // driven overshoot (small, Apple-like), not a giant elastic. The post-rise
  // amplitude is amp scaled by a representative arrival velocity (1 / riseSec).
  function followPreview(overshoot, freq, decay) {
    var amp = Math.max(0, overshoot) / 100;
    var rise = 0.34;          // fraction of the timeline spent reaching the mark
    var riseSec = 0.34;       // representative rise seconds -> arrival velocity
    var oamp = amp / riseSec; // overshoot as a fraction of the move
    var dec = Math.max(0.4, decay);
    var win = R.easing.overshoot.autoDuration(dec); // settle seconds after arrival
    return function (t) {
      if (t <= 0) return 0;
      if (t < rise) { var u = t / rise; return u * u * (3 - 2 * u); }
      var tau = (t - rise) / (1 - rise) * win;
      return 1 + oamp * Math.sin(2 * Math.PI * freq * tau) * Math.exp(-dec * tau);
    };
  }

  function mount(ctx) {
    // Defaults match the reference Apple-style expression exactly:
    // amp 0.04 (Overshoot 4%), freq 1.8 (Bounce), decay 4 (Friction). So
    // "As expression" emits that expression verbatim out of the box.
    var overshoot = 4;
    var bounce = 1.8;
    var friction = 4;

    function previewCurve() {
      return { type: 'fn', fn: followPreview(overshoot, bounce, friction) };
    }
    var editorHost = el('div');
    var editor = ui.CurveEditor(editorHost, { value: previewCurve(), allowOvershoot: true });
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, { getCurve: previewCurve, property: 'position', sample: 'shape', duration: 1300 });

    var halfLife = el('span.rb-chip', { text: '' });
    function refreshChip() {
      var hl = friction > 0 ? Math.log(2) / friction : 0;
      editor.setCurve(previewCurve());
      halfLife.textContent = 'Half-life ' + R.units.round(hl, 2) + 's';
      preview.setReadout('Overshoot ' + R.units.round(overshoot, 1) + '% · half-life ' + R.units.round(hl, 2) + 's');
    }

    var overshootSlider = ui.slider({ label: 'Overshoot', min: 0, max: 40, step: 0.5, value: overshoot,
      format: function (v) { return R.units.round(v, 1) + '%'; }, onInput: function (v) { overshoot = v; refreshChip(); } });
    var bounceSlider = ui.slider({ label: 'Bounce', min: 0.5, max: 8, step: 0.1, value: bounce,
      onInput: function (v) { bounce = v; refreshChip(); } });
    var frictionSlider = ui.slider({ label: 'Friction', min: 0.5, max: 20, step: 0.1, value: friction,
      onInput: function (v) { friction = v; refreshChip(); } });
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      editorHost,
      el('div.rb-faint', { text: 'Select 2+ keyframes. Recoil adds Apple-style overshoot AFTER the last keyframe, scaled by how fast it arrives. Apply bakes a few editable keyframes that match the curve; "As expression" drops the live, keyframe-free rig instead.' }),
      overshootSlider.el,
      bounceSlider.el,
      frictionSlider.el,
      el('div.rb-row', null, [halfLife])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('span.rb-spacer'));
    ctx.footer.appendChild(el('button.rb-btn', { onclick: doApplyExpr, title: 'Apply as a live expression instead of baked keyframes' }, ['As expression']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApplyKeys }, ['Apply recoil']));

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.totalSelectedKeys >= 2 ? sel.totalSelectedKeys + ' keys · ' + sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies') : 'Select 2+ keyframes')
        : 'Open a composition';
    });
    scopeText.textContent = '';

    function num(x) { return String(Math.round(x * 10000) / 10000); }

    // The EXACT overshoot expression (the form the user hand-writes), with the
    // current slider values baked in as amp / freq / decay. Applied verbatim via
    // expressions.apply, so "As expression" is identical to pasting it by hand
    // (set Overshoot 4 / Bounce 1.8 / Friction 4 to match the reference exactly).
    function recoilExpression() {
      return [
        'n = 0;',
        'if (numKeys > 0) {',
        '  n = nearestKey(time).index;',
        '  if (key(n).time > time) { n--; }',
        '}',
        't = (n == 0) ? 0 : time - key(n).time;',
        'if (n > 0) {',
        '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
        '  amp = ' + num(overshoot / 100) + '; freq = ' + num(bounce) + '; decay = ' + num(friction) + ';',
        '  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);',
        '} else { value; }'
      ].join('\n');
    }

    function finish(res, kind) {
      var n = (res && res.applied != null) ? res.applied : 0;
      ctx.toast('Recoil (' + kind + ') on ' + n + ' propert' + (n === 1 ? 'y' : 'ies'), { kind: 'success' });
      if (res && res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
      ctx.refreshSelection();
    }
    function fail(err) { ctx.toast((err && err.message) || 'Could not apply Recoil', { kind: 'error' }); }

    // Bake the follow-through as a few editable keyframes that match the curve.
    function doApplyKeys() {
      ctx.invoke('recoil.bake', { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: false })
        .then(function (res) { finish(res, 'baked'); }).catch(fail);
    }
    // Apply the EXACT overshoot expression, verbatim and keyframe-free.
    function doApplyExpr() {
      ctx.invoke('expressions.apply', { code: recoilExpression() })
        .then(function (res) { finish(res, 'expression'); }).catch(fail);
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
          return followPreview(s.overshoot, s.bounce, s.friction);
        },
        defaults: [
          { name: 'Apple', state: { overshoot: 4, bounce: 1.8, friction: 4 } },
          { name: 'Subtle', state: { overshoot: 6, bounce: 1.6, friction: 5 } },
          { name: 'Snappy', state: { overshoot: 10, bounce: 2.4, friction: 6 } },
          { name: 'Big Overshoot', state: { overshoot: 22, bounce: 2, friction: 4 } }
        ]
      },
      destroy: function () { off(); preview.destroy(); editor.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
