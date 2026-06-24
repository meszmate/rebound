/*
 * Rebound, Recoil tool.
 * Contained overshoot between two keyframes (the classic Apple-style settle):
 * the property animates to the second keyframe, shoots PAST its value, then
 * oscillates back and settles EXACTLY on it, all within the keyframe span. One
 * behaviour, no modes. The overshoot is visible right where the move lands, not
 * tacked on after the last key.
 *
 * The curve is a damped-overshoot remap, 0 -> 1, normalised so the Overshoot %
 * slider is literal (how far past the destination the first peak goes). Apply
 * bakes a few editable keys (one per peak/valley); "As expression" drives the
 * same shape live with a single keyframe-free remap expression.
 * Overshoot = how far past, Bounce = wobble speed, Friction = how fast it damps.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  // The applied curve AND the preview, identical, so what you see is what lands.
  // Over u in [0,1]: a smooth rise reaches the target by u=R, then a damped
  // oscillation overshoots past it and settles back to EXACTLY 1 by u=1 (so the
  // remap lands on the second keyframe). The (1-tau) taper guarantees the settle
  // even at low friction; the 1/P normalisation makes the first peak == overshoot.
  //
  // The rise is a Hermite that HANDS OFF its slope to the oscillation at the
  // target, so the curve passes THROUGH the target at speed instead of easing to
  // a near-stop there and kicking back up (that "shoulder" looked wrong on the
  // graph). The overshoot peak / valley / settle are untouched, so the baked
  // keyframes -- which sit on those turning points -- animate exactly as before.
  function overshootCurve(overshoot, bounce, friction) {
    var O = Math.max(0, overshoot) / 100;
    var freq = Math.max(0.1, bounce);
    var dec = Math.max(0.1, friction);
    var R0 = 0.34; // the property reaches the target at 34% of the segment
    function wob(tau) { return Math.sin(2 * Math.PI * freq * tau) * Math.exp(-dec * tau) * (1 - tau); }
    var P = 1e-6;
    for (var i = 1; i <= 160; i++) { var w = wob(i / 160); if (w > P) P = w; }
    // Slope (in u) the oscillation leaves the target with: O * wob'(0)/P, where
    // wob'(0) = 2*PI*freq, rescaled from tau to u by 1/(1-R0).
    var mTarget = (O * 2 * Math.PI * freq / P) / (1 - R0);
    var k = R0 * mTarget;
    return function (u) {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      if (u < R0) {
        // Hermite (0,0,slope 0) -> (R0,1,slope mTarget): monotonic, reaches 1
        // moving at the overshoot's entry speed (no shoulder at the target).
        var s = u / R0;
        return (3 * s * s - 2 * s * s * s) + k * (s * s * s - s * s);
      }
      return 1 + O * wob((u - R0) / (1 - R0)) / P; // overshoot, settle to 1
    };
  }

  R.tools.register({
    id: 'recoil',
    title: 'Recoil',
    group: 'Physics',
    order: 0,
    keywords: ['recoil', 'overshoot', 'bounce', 'elastic', 'spring', 'follow through', 'apple', 'settle'],
    mount: mount
  });

  function mount(ctx) {
    // A clearly visible, buttery default: overshoot ~12% past, one gentle settle.
    var overshoot = 12;
    var bounce = 1.6;
    var friction = 5;

    function curve() { return { type: 'fn', fn: overshootCurve(overshoot, bounce, friction) }; }

    var editorHost = el('div');
    var editor = ui.CurveEditor(editorHost, { value: curve(), allowOvershoot: true });
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, { getCurve: curve, property: 'position', sample: 'shape', duration: 1300 });

    function refreshChip() {
      editor.setCurve(curve());
      preview.setReadout('Overshoot ' + R.units.round(overshoot, 1) + '% past · settles on the 2nd keyframe');
    }

    var overshootSlider = ui.slider({ label: 'Overshoot', min: 0, max: 60, step: 0.5, value: overshoot,
      format: function (v) { return R.units.round(v, 1) + '%'; }, onInput: function (v) { overshoot = v; refreshChip(); } });
    var bounceSlider = ui.slider({ label: 'Bounce', min: 0.5, max: 8, step: 0.1, value: bounce,
      onInput: function (v) { bounce = v; refreshChip(); } });
    var frictionSlider = ui.slider({ label: 'Friction', min: 0.5, max: 20, step: 0.1, value: friction,
      onInput: function (v) { friction = v; refreshChip(); } });
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      editorHost,
      el('div.rb-faint', { text: 'Select two (or more) keyframes. The move shoots past the destination and settles back on it, between the keys. Apply bakes editable keys; "As expression" is the live, keyframe-free remap.' }),
      overshootSlider.el,
      bounceSlider.el,
      frictionSlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('span.rb-spacer'));
    var removeBtn = el('button.rb-btn.is-ghost', { onclick: doRemove, title: 'Remove easing from the selected keyframes' }, ['Remove']);
    var exprBtn = el('button.rb-btn', { onclick: doApplyExpr, title: 'Apply as a live remap expression instead of baked keyframes' }, ['As expression']);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApplyKeys }, ['Apply recoil']);
    ctx.footer.appendChild(removeBtn);
    ctx.footer.appendChild(exprBtn);
    ctx.footer.appendChild(applyBtn);

    // Recoil overshoots BETWEEN keyframes, so a property needs at least two
    // selected keys (a move to overshoot). One key is nothing to recoil from.
    function canApply(sel) {
      if (!sel || !sel.hasComp) return false;
      var props = sel.properties || [];
      for (var i = 0; i < props.length; i++) {
        if ((props[i].selectedKeys || []).length >= 2) return true;
      }
      return false;
    }

    // Read what is currently applied on the selected keyframes, so you can see
    // it before you change or remove it.
    function describeSel(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      if (!canApply(sel)) {
        return (sel.totalSelectedKeys || 0) === 1
          ? 'Select 2+ keyframes (one is nothing to overshoot from)'
          : 'Select 2+ keyframes on a property';
      }
      var base = sel.totalSelectedKeys + ' keys · ' + sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies');
      var props = sel.properties || [];
      for (var i = 0; i < props.length; i++) {
        if ((props[i].selectedKeys || []).length >= 2 && props[i].currentEase && R.ui.curveName) {
          base += ' · ' + R.ui.curveName(props[i].currentEase.curve); break;
        }
      }
      return base;
    }
    function syncButtons(sel) {
      var ok = canApply(sel);
      applyBtn.disabled = !ok;
      exprBtn.disabled = !ok;
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describeSel(sel); syncButtons(sel); });
    scopeText.textContent = describeSel(ctx.getSelection());
    syncButtons(ctx.getSelection());

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

    // Bake the overshoot between the selected keyframes as a few editable keys
    // (one per peak/valley), settling exactly on the second keyframe.
    function doApplyKeys() {
      ctx.invoke('ease.bakeSparse', { points: R.easing.sampler.sparseSamples(curve()), handleLength: settingsHL() })
        .then(function (res) { finish(res, 'baked'); }).catch(fail);
    }
    // Keyframe-free: one remap expression that drives the same overshoot between
    // the keys, landing on each. The original keyframes stay; clean timeline.
    function doApplyExpr() {
      ctx.invoke('ease.remap', { factors: R.easing.sampler.bakeFactors(curve(), 256) })
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
          return overshootCurve(s.overshoot, s.bounce, s.friction);
        },
        // Buttery feels: a single gentle overshoot up to a bigger, springier one.
        defaults: [
          { name: 'Apple', state: { overshoot: 12, bounce: 1.6, friction: 5 } },
          { name: 'Subtle', state: { overshoot: 6, bounce: 1.5, friction: 6 } },
          { name: 'Snappy', state: { overshoot: 18, bounce: 2.2, friction: 6 } },
          { name: 'Big Overshoot', state: { overshoot: 32, bounce: 1.8, friction: 3.5 } }
        ]
      },
      destroy: function () { off(); preview.destroy(); editor.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
