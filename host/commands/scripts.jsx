/*
 * Rebound host, run a user script (ExtendScript) on demand.
 *
 * scripts.run evaluates the given ExtendScript string inside one undo group, so a
 * snippet the user saved in the Script manager applies as a single undoable step.
 * Running scripts is an explicit user action (they wrote/pasted the code), the
 * same model KBar and Motion Tools Pro use.
 */
(function () {
  var R = $.__rebound;

  function run(args) {
    var code = args && args.code;
    if (!code || !('' + code).length) throw new Error('No script to run.');
    var label = (args && args.label) ? ('' + args.label) : 'Run Script';

    R.beginUndo('Rebound: ' + label);
    var result;
    try {
      result = eval('' + code);
    } catch (e) {
      R.endUndo();
      throw new Error((e && e.message) ? e.message : ('Script error: ' + e));
    }
    R.endUndo();

    var out = (result === undefined || result === null) ? '' : ('' + result);
    return { ok: true, result: out };
  }

  R.register('scripts.run', run);
})();
