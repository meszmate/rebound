/*
 * Rebound, Recoil tool.
 * Velocity-driven overshoot (the classic Apple-style follow-through): after the
 * keyframe a property arrives on, it keeps moving in the arrival direction, then
 * oscillates back and settles, scaled by how fast it arrived. One behaviour, no
 * modes. Apply bakes that exact motion as a few editable keyframes; "As
 * expression" drops the same thing as a live, keyframe-free rig.
 *
 * The motion is, verbatim, the canonical overshoot expression:
 *   v = velocityAtTime(key.time - frameDuration/10);
 *   value + v * amp * sin(2*PI*freq*t) / exp(decay*t)
 * Overshoot = amp*100 (how much of the arrival velocity carries past the
 * target), Bounce = freq (wobble speed), Friction = decay (how fast it settles).
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  R.tools.register({
    id: 'recoil',
    title: 'Recoil',
    group: 'Physics',
    order: 0,
    keywords: ['recoil', 'overshoot', 'bounce', 'elastic', 'spring', 'follow through', 'apple', 'settle'],
    mount: mount
  });

  // A FAITHFUL preview of the applied expression, not an approximation. We model
  // a representative move that eases into the target and arrives with a real
  // velocity v, then add exactly the expression's tail:
  //   value(t) = base(t) + v * amp * sin(2*PI*freq*t) * exp(-decay*t)
  // The base is a u^2 ease-in so it arrives at a defined speed (a smoothstep
  // would arrive at zero speed -> no recoil, which is why the old preview lied).
  // This is the same math host/commands/recoil.jsx bakes, so preview == result.
  function overshootPreview(overshoot, freq, decay) {
    var amp = Math.max(0, overshoot) / 100;
    var dec = Math.max(0.4, decay);
    var riseSec = 0.32;                                    // representative move time
    var settleSec = clamp(Math.log(140) / dec, 0.3, 2.0);  // until the tail ~ 0
    var total = riseSec + settleSec;
    var v = 2 / riseSec;                                   // arrival velocity of u^2
    return function (t) {
      var s = t * total;
      if (s <= 0) return 0;
      if (s < riseSec) { var u = s / riseSec; return u * u; }
      var tau = s - riseSec;
      return 1 + v * amp * Math.sin(2 * Math.PI * freq * tau) * Math.exp(-dec * tau);
    };
  }

  function mount(ctx) {
    // The reference Apple-style follow-through: amp 0.06, freq 1.8, decay 5. One
    // gentle overshoot that settles in ~0.7s (half-life ln2/5 = 0.14s).
    var overshoot = 6;
    var bounce = 1.8;
    var friction = 5;

    function previewCurve() {
      return { type: 'fn', fn: overshootPreview(overshoot, bounce, friction) };
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
      el('div.rb-faint', { text: 'Overshoot past the keyframe, scaled by how fast the property arrives. Apply bakes editable keys; "As expression" is the live, keyframe-free rig.' }),
      overshootSlider.el,
      bounceSlider.el,
      frictionSlider.el,
      el('div.rb-row', null, [halfLife])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('span.rb-spacer'));
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove, title: 'Remove easing from the selected keyframes' }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn', { onclick: doApplyExpr, title: 'Apply as a live expression instead of baked keyframes' }, ['As expression']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApplyKeys }, ['Apply recoil']));

    // Read what is currently applied on the selected keyframes, so you can see
    // it before you change or remove it.
    function describeSel(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      if ((sel.totalSelectedKeys || 0) < 2) return 'Select 2+ keyframes';
      var base = sel.totalSelectedKeys + ' keys · ' + sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies');
      var props = sel.properties || [];
      for (var i = 0; i < props.length; i++) {
        if ((props[i].selectedKeys || []).length >= 2 && props[i].currentEase && R.ui.curveName) {
          base += ' · ' + R.ui.curveName(props[i].currentEase.curve); break;
        }
      }
      return base;
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describeSel(sel); });
    scopeText.textContent = describeSel(ctx.getSelection());

    function num(x) { return String(Math.round(x * 10000) / 10000); }

    // The EXACT overshoot expression (the form you hand-write), with the current
    // slider values baked in as amp / freq / decay. Applied verbatim via
    // expressions.apply, so "As expression" is identical to pasting it by hand.
    // Defaults (Overshoot 6 / Bounce 1.8 / Friction 5) reproduce the reference.
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

    // Remove easing from the selected keyframes (clears Rebound expressions and
    // sets the selected keys back to linear), so you can start clean.
    function doRemove() {
      ctx.invoke('ease.reset', {})
        .then(function () { ctx.toast('Removed easing', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(fail);
    }

    // Bake the velocity-driven follow-through past the arrival key as a few
    // editable keyframes (the host fits true tangents so the keys hug the math).
    function doApplyKeys() {
      ctx.invoke('recoil.bake', { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: false })
        .then(function (res) { finish(res, 'baked'); }).catch(fail);
    }
    // Keyframe-free: the EXACT velocity overshoot expression, verbatim.
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
          return overshootPreview(s.overshoot, s.bounce, s.friction);
        },
        // Buttery feels. Damping zeta = friction/(2*PI*bounce): ~0.4 = a couple of
        // soft settles, ~0.7 = a single gentle overshoot.
        defaults: [
          { name: 'Apple', state: { overshoot: 6, bounce: 1.8, friction: 5 } },
          { name: 'Subtle', state: { overshoot: 4, bounce: 1.6, friction: 7 } },
          { name: 'Snappy', state: { overshoot: 9, bounce: 2.4, friction: 8 } },
          { name: 'Big Overshoot', state: { overshoot: 18, bounce: 1.6, friction: 3.5 } }
        ]
      },
      destroy: function () { off(); preview.destroy(); editor.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
