/*
 * Rebound host, Composition (edit the active comp's settings in place).
 *
 * Reads the active composition's frame rate, duration, width, and height
 * (comp.info), and writes any of them back (comp.apply) when provided and
 * greater than zero. comp.info is read-only and carries no undo label.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  function num(v) {
    return (v == null || isNaN(v)) ? 0 : v;
  }

  // Read-only: report the active comp's current settings for pre-fill.
  function info() {
    var comp = util.activeComp();
    return {
      name: comp.name,
      frameRate: comp.frameRate,
      duration: comp.duration,
      width: comp.width,
      height: comp.height
    };
  }

  // Write back any provided setting greater than zero.
  function apply(args) {
    var comp = util.activeComp();

    var frameRate = num(args.frameRate);
    var duration = num(args.duration);
    var width = num(args.width);
    var height = num(args.height);

    if (frameRate > 0) comp.frameRate = frameRate;
    if (duration > 0) comp.duration = duration;
    if (width > 0) comp.width = Math.round(width);
    if (height > 0) comp.height = Math.round(height);

    return { ok: true };
  }

  R.register('comp.info', info);
  R.register('comp.apply', apply, 'Rebound: Composition Settings');
})();
