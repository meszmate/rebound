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

  // Between-keys curve: a damped elastic that rises from the first keyframe,
  // overshoots the second, oscillates, and settles to EXACTLY the second
  // keyframe by its time (a normalized 0 -> 1 curve). Overshoot is how far past
  // the target the first peak goes, Bounce the wobble count, Friction the decay.
  function elasticBetween(overshoot, bounce, friction) {
    var amp = 1 + Math.max(0, overshoot) / 100;
    return R.easing.penner.elasticOutWith(amp, bounce, friction);
  }

  function mount(ctx) {
    // Default to "between": select 2 keyframes, Apply -> the move overshoots the
    // second keyframe and settles ON it (same clip length), which is what most
    // people expect. "After key" (follow-through past the last key) is opt-in.
    var mode = 'between'; // between (settle on key 2) | after (follow-through)
    // Defaults match the reference Apple-style expression exactly:
    // amp 0.04 (Overshoot 4%), freq 1.8 (Bounce), decay 4 (Friction). So
    // "As expression" emits that expression verbatim out of the box.
    var overshoot = 4;
    var bounce = 1.8;
    var friction = 4;

    function previewCurve() {
      return mode === 'between'
        ? { type: 'fn', fn: elasticBetween(overshoot, bounce, friction) }
        : { type: 'fn', fn: followPreview(overshoot, bounce, friction) };
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

    var modeCtl = ui.segmented([
      { value: 'after', label: 'After key' },
      { value: 'between', label: 'Between keys' }
    ], { value: mode, onChange: function (v) { mode = v; refreshMode(); refreshChip(); } });

    var hint = el('div.rb-faint', { text: '' });
    function refreshMode() {
      hint.textContent = mode === 'between'
        ? 'Reshapes the move between your two keyframes so it overshoots the target and settles exactly on the second keyframe (same clip length). Apply bakes editable keys; "As expression" uses a keyframe-free remap.'
        : 'Adds Apple-style overshoot AFTER the last keyframe, scaled by how fast it arrives (extends past it). Apply bakes editable keys; "As expression" drops the exact velocity expression.';
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
      el('div.rb-section-label', { text: 'Where' }),
      modeCtl.el,
      hint,
      overshootSlider.el,
      bounceSlider.el,
      frictionSlider.el,
      el('div.rb-row', null, [halfLife])
    ]));
    refreshMode();

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

    // Remove easing from the selected keyframes (clears Rebound expressions and
    // sets the selected keys back to linear), so you can start clean.
    function doRemove() {
      ctx.invoke('ease.reset', {})
        .then(function () { ctx.toast('Removed easing', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(fail);
    }

    function settingsHL() {
      var s = (ctx.store && ctx.store.get) ? (ctx.store.get().settings || {}) : {};
      return (s.handleLength > 0) ? s.handleLength : 45;
    }

    // Bake editable keyframes that match the curve. After: velocity-driven
    // follow-through past the last key. Between: overshoot the target and settle
    // on the second selected key (baked between the pair).
    function doApplyKeys() {
      if (mode === 'between') {
        var curve = { type: 'fn', fn: elasticBetween(overshoot, bounce, friction) };
        ctx.invoke('ease.bakeSparse', { points: R.easing.sampler.sparseSamples(curve), handleLength: settingsHL() })
          .then(function (res) { finish(res, 'baked'); }).catch(fail);
      } else {
        ctx.invoke('recoil.bake', { overshoot: overshoot, bounce: bounce, friction: friction, eachKey: false })
          .then(function (res) { finish(res, 'baked'); }).catch(fail);
      }
    }
    // Keyframe-free. After: the EXACT velocity overshoot expression, verbatim.
    // Between: a between-keyframe remap expression of the same elastic curve.
    function doApplyExpr() {
      if (mode === 'between') {
        var curve = { type: 'fn', fn: elasticBetween(overshoot, bounce, friction) };
        ctx.invoke('ease.remap', { factors: R.easing.sampler.bakeFactors(curve, 256) })
          .then(function (res) { finish(res, 'expression'); }).catch(fail);
      } else {
        ctx.invoke('expressions.apply', { code: recoilExpression() })
          .then(function (res) { finish(res, 'expression'); }).catch(fail);
      }
    }

    function getState() {
      return { mode: mode, overshoot: overshoot, bounce: bounce, friction: friction };
    }
    function applyState(s) {
      if (!s) return;
      if (s.mode === 'after' || s.mode === 'between') { mode = s.mode; modeCtl.set(mode); refreshMode(); }
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
          return s.mode === 'between'
            ? elasticBetween(s.overshoot, s.bounce, s.friction)
            : followPreview(s.overshoot, s.bounce, s.friction);
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
