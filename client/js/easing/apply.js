/*
 * Rebound, shared easing-apply helper.
 *
 * Applies an overshooting/oscillating curve (spring, recoil, bounce, elastic
 * presets) to the selected keyframes, honoring the global "Apply as" setting:
 *   - 'keys' (default): bake a FEW editable keyframes at the curve's turning
 *     points, so the motion is visible and editable in the Graph Editor, with a
 *     handful of keys instead of one per frame.
 *   - 'expression': set one clean remap expression (no extra keyframes; the
 *     Graph Editor will not draw it, since AE only graphs keyframes).
 * Monotonic curves should apply as native temporal ease, not through here.
 */
;(function (R) {
  'use strict';

  R.easing = R.easing || {};

  // modeOverride ('keys' | 'expression') wins over the global Settings choice,
  // so a tool/tile/keybind can force a mode; omit it to follow Settings.
  R.easing.applyCurve = function (ctx, curveDef, label, modeOverride) {
    var s = (ctx.store && ctx.store.get) ? (ctx.store.get().settings || {}) : {};
    var mode = (modeOverride === 'expression' || modeOverride === 'keys') ? modeOverride : s.applyMode;
    var expr = mode === 'expression';
    var method = expr ? 'ease.remap' : 'ease.bakeSparse';
    var handleLength = (s.handleLength > 0) ? s.handleLength : 45;
    var args = expr
      ? { factors: R.easing.sampler.bakeFactors(curveDef, 256) }
      : { points: R.easing.sampler.sparseSamples(curveDef), handleLength: handleLength };
    return ctx.invoke(method, args)
      .then(function (res) {
        var n = (res && res.applied != null) ? res.applied : (res ? res.properties : 0);
        ctx.toast(label + ' on ' + n + ' propert' + (n === 1 ? 'y' : 'ies'), { kind: 'success' });
        ctx.refreshSelection();
      })
      .catch(function (err) {
        ctx.toast((err && err.message) || ('Could not apply ' + label), { kind: 'error' });
      });
  };

  // The universal "undo my easing" action, shared by every easing tool so the
  // behaviour and wording are identical everywhere. ease.reset (host) clears any
  // Rebound remap/overshoot expression AND linearizes the selected keyframes —
  // the honest baseline, since AE keeps no history of the pre-ease handles.
  R.easing.removeFromSelection = function (ctx) {
    return ctx.invoke('ease.reset', {})
      .then(function (res) {
        var n = res && res.changed;
        if (n === 0) ctx.toast('Nothing to remove — select eased keyframes', { kind: 'info' });
        else ctx.toast('Removed easing', { kind: 'success' });
        ctx.refreshSelection();
        return res;
      })
      .catch(function (err) {
        ctx.toast((err && err.message) || 'Could not remove easing', { kind: 'error' });
      });
  };

  // A footer Remove button wired to removeFromSelection, so tools add one line
  // and get a consistent control. Returns the <button> element.
  R.easing.removeButton = function (ctx, opts) {
    opts = opts || {};
    return R.dom.el('button.rb-btn.is-ghost', {
      title: opts.title || 'Remove easing from the selected keyframes (clears any Rebound expression + linearizes)',
      onclick: function () { R.easing.removeFromSelection(ctx); }
    }, [opts.label || 'Remove']);
  };
})(window.Rebound = window.Rebound || {});
