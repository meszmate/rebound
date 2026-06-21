/*
 * Rebound host, Expressions (apply a code snippet to the selection).
 *
 * expressions.apply writes the given expression onto every selected property
 * that can hold one, tagged with the "// Rebound" marker so expressions.remove
 * can strip ours later without touching a user's own expressions. Applying is an
 * explicit user action, so it overwrites an existing expression on that property
 * (the marker still lets Remove clean it up).
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var rig = R.rig;

  function selectedProps() {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var out = [];
    for (var i = 0; i < props.length; i++) {
      if (props[i] instanceof Property) out.push(props[i]);
    }
    return out;
  }

  function apply(args) {
    var code = args.code;
    if (!code || !code.length) throw new Error('No expression to apply.');
    var list = selectedProps();
    if (!list.length) throw new Error('Select a property to apply the expression to.');

    var body = rig.MARKER + '\n' + code;
    var applied = 0, skipped = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.canSetExpression) { skipped.push(p.name); continue; }
      try { p.expression = body; applied++; }
      catch (e) { skipped.push(p.name); }
    }
    if (!applied) throw new Error('None of the selected properties can hold an expression.');
    return { applied: applied, skipped: skipped };
  }

  function remove() {
    var list = selectedProps();
    var cleared = 0;
    for (var i = 0; i < list.length; i++) {
      if (rig.clearExpression(list[i])) cleared++;
    }
    if (!cleared) throw new Error('No Rebound expression on the selected properties.');
    return { cleared: cleared };
  }

  R.register('expressions.apply', apply, 'Rebound: Apply Expression');
  R.register('expressions.remove', remove, 'Rebound: Remove Expression');
})();
