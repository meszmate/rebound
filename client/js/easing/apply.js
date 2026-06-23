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
})(window.Rebound = window.Rebound || {});
