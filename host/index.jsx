/*
 * Rebound host entry point.
 *
 * Loaded two ways (either is sufficient; both are idempotent):
 *   1. Declared as <ScriptPath> in CSXS/manifest.xml, auto-loaded by AE.
 *   2. Explicitly bootstrapped by the panel bridge, which sets
 *      $.__rebound_root to the extension folder before evaluating this file.
 *
 * It locates its own folder and evaluates each host module in dependency order.
 */
(function () {
  // Strip trailing slashes/backslashes without a regex literal: some
  // ExtendScript builds mis-tokenize a "/" inside a regex character class
  // (/[\\/]+$/), which aborts the whole bootstrap with a syntax error.
  function stripTrailingSeparators(p) {
    var s = String(p);
    while (s.length) {
      var last = s.charAt(s.length - 1);
      if (last !== '/' && last !== '\\') break;
      s = s.substring(0, s.length - 1);
    }
    return s;
  }

  function hostDir() {
    // Prefer the root the panel handed us (most reliable under CEP).
    if (typeof $.__rebound_root === 'string' && $.__rebound_root.length) {
      return stripTrailingSeparators($.__rebound_root) + '/host';
    }
    // Otherwise derive it from this file's own location.
    if ($.fileName) {
      return File($.fileName).parent.fsName;
    }
    throw new Error('Rebound: cannot determine host directory.');
  }

  var dir = hostDir();

  // The extension root is the parent of the host folder; shared/ lives there.
  var extRoot = (function () {
    try { return File(dir).parent.fsName; } catch (e) { return dir + '/..'; }
  })();

  function load(relative) {
    var f = new File(dir + '/' + relative);
    if (!f.exists) {
      throw new Error('Rebound host file missing: ' + relative);
    }
    $.evalFile(f);
  }

  function loadAbs(absPath) {
    var f = new File(absPath);
    if (!f.exists) {
      throw new Error('Rebound host file missing: ' + absPath);
    }
    $.evalFile(f);
  }

  // Order matters: JSON polyfill, then the RPC core, then shared utils, then
  // each command module registers itself.
  load('lib/json.jsx');
  load('lib/core.jsx');
  load('lib/util.jsx');
  load('lib/rig.jsx');

  // Shared, app-agnostic IR libraries (the same files the panel and the
  // exporters use), then the host-side handle onto them.
  loadAbs(extRoot + '/shared/lib/normalize.js');
  loadAbs(extRoot + '/shared/lib/bezier.js');
  loadAbs(extRoot + '/shared/lib/validate.js');
  loadAbs(extRoot + '/shared/lib/grad.js');
  loadAbs(extRoot + '/shared/lib/effects.js');
  load('lib/ir.jsx');
  load('lib/grad.jsx');

  load('commands/system.jsx');
  load('commands/ease.jsx');
  load('commands/ease-remap.jsx');
  load('commands/spring.jsx');
  load('commands/anchor.jsx');
  load('commands/align.jsx');
  load('commands/recoil.jsx');
  load('commands/drift.jsx');
  load('commands/bounce.jsx');
  load('commands/multiply.jsx');
  load('commands/radial.jsx');
  load('commands/flip.jsx');
  load('commands/stagger.jsx');
  load('commands/trim.jsx');
  load('commands/arrange.jsx');
  load('commands/keys.jsx');
  load('commands/motion.jsx');
  load('commands/follow.jsx');
  load('commands/comp.jsx');
  load('commands/fade.jsx');
  load('commands/trimpaths.jsx');
  load('commands/shapes.jsx');
  load('commands/grids.jsx');
  load('commands/color.jsx');
  load('commands/vignette.jsx');
  load('commands/reset.jsx');
  load('commands/echo.jsx');
  load('commands/sequence.jsx');
  load('commands/smooth.jsx');
  load('commands/nullify.jsx');
  load('commands/lean.jsx');
  load('commands/tags.jsx');
  load('commands/precompose.jsx');
  load('commands/velocity.jsx');
  load('commands/copyease.jsx');
  load('commands/retime.jsx');
  load('commands/clone.jsx');
  load('commands/expressions.jsx');
  load('commands/scripts.jsx');
  load('commands/rename.jsx');
  load('commands/squash.jsx');
  load('commands/throw.jsx');
  load('commands/pathfollow.jsx');
  load('commands/pins.jsx');
  load('commands/pinrig.jsx');
  load('commands/backdrop.jsx');
  load('commands/autocrop.jsx');
  load('commands/scatter.jsx');
  load('commands/bake.jsx');
  load('commands/kinetic.jsx');
  load('commands/separate.jsx');
  load('commands/break.jsx');
  load('commands/reverse.jsx');
  load('commands/demo.jsx');
  load('commands/link.jsx');
  load('commands/stroke.jsx');
  load('commands/textbreak.jsx');
  load('commands/gradient.jsx');

  // Import / receive (rebuild a design from another app as native AE layers).
  // build.jsx defines the importer namespace + walk; the rest add builders and
  // the transform / paint / effect helpers they use.
  load('commands/import/build.jsx');
  load('commands/import/transform.jsx');
  load('commands/import/effect.jsx');
  load('commands/import/layerstyle.jsx');
  load('commands/import/paint.jsx');
  load('commands/import/geometry.jsx');
  load('commands/import/shape.jsx');
  load('commands/import/mask.jsx');
  load('commands/import/image.jsx');
  load('commands/import/text.jsx');
  load('commands/import/fonts.jsx');

  $.__rebound.loaded = true;
})();
