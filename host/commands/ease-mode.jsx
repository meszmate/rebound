/*
 * Rebound host, ease apply-mode dispatcher.
 *
 * A single command an action/tile/keybind can call to apply an overshooting
 * curve EITHER as baked keyframes OR as a live remap expression, chosen at call
 * time by args.mode. The caller supplies both datasets (points for the bake,
 * factors for the expression) so flipping the mode needs no recompute on the
 * host. It just forwards to the existing ease.bakeSparse / ease.remap commands,
 * so there is one source of truth for each behavior.
 */
(function () {
  var R = $.__rebound;

  function applyMode(args) {
    var cmds = R.commands;
    if (args && args.mode === 'expression') {
      if (!cmds['ease.remap']) throw new Error('ease.remap is not available.');
      return cmds['ease.remap'].fn({ factors: args.factors });
    }
    if (!cmds['ease.bakeSparse']) throw new Error('ease.bakeSparse is not available.');
    return cmds['ease.bakeSparse'].fn({ points: args.points, handleLength: args.handleLength });
  }

  R.register('ease.applyMode', applyMode, 'Rebound: Ease');
})();
