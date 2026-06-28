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

  // Command modules are independent of each other, so a broken one must NOT abort
  // the whole bootstrap (which would silently leave every command after it
  // unregistered -> "none of the features work"). Isolate each; collect failures.
  var loadErrors = [];
  function loadCmd(relative) {
    try {
      load(relative);
    } catch (e) {
      loadErrors.push(relative + ': ' + ((e && e.message) ? e.message : String(e)));
    }
  }

  // Order matters: JSON polyfill, then the RPC core, then shared utils, then
  // each command module registers itself.
  load('lib/json.jsx');
  load('lib/core.jsx');
  // Publish resolved paths so modules can read bundled assets at runtime
  // (e.g. the gradient .ffx preset templates under host/assets/).
  try { $.__rebound.paths = { host: dir, root: extRoot }; } catch (ePaths) {}
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

  loadCmd('commands/system.jsx');
  loadCmd('commands/ease.jsx');
  loadCmd('commands/ease-remap.jsx');
  loadCmd('commands/ease-mode.jsx');
  loadCmd('commands/spring.jsx');
  loadCmd('commands/anchor.jsx');
  loadCmd('commands/align.jsx');
  loadCmd('commands/recoil.jsx');
  loadCmd('commands/drift.jsx');
  loadCmd('commands/bounce.jsx');
  loadCmd('commands/multiply.jsx');
  loadCmd('commands/radial.jsx');
  loadCmd('commands/flip.jsx');
  loadCmd('commands/stagger.jsx');
  loadCmd('commands/trim.jsx');
  loadCmd('commands/arrange.jsx');
  loadCmd('commands/keys.jsx');
  loadCmd('commands/motion.jsx');
  loadCmd('commands/follow.jsx');
  loadCmd('commands/comp.jsx');
  loadCmd('commands/fade.jsx');
  loadCmd('commands/trimpaths.jsx');
  loadCmd('commands/shapes.jsx');
  loadCmd('commands/grids.jsx');
  loadCmd('commands/color.jsx');
  loadCmd('commands/vignette.jsx');
  loadCmd('commands/reset.jsx');
  loadCmd('commands/echo.jsx');
  loadCmd('commands/sequence.jsx');
  loadCmd('commands/smooth.jsx');
  loadCmd('commands/nullify.jsx');
  loadCmd('commands/lean.jsx');
  loadCmd('commands/tags.jsx');
  loadCmd('commands/precompose.jsx');
  loadCmd('commands/velocity.jsx');
  loadCmd('commands/copyease.jsx');
  loadCmd('commands/retime.jsx');
  loadCmd('commands/clone.jsx');
  loadCmd('commands/expressions.jsx');
  loadCmd('commands/scripts.jsx');
  loadCmd('commands/rename.jsx');
  loadCmd('commands/squash.jsx');
  loadCmd('commands/throw.jsx');
  loadCmd('commands/pathfollow.jsx');
  loadCmd('commands/pins.jsx');
  loadCmd('commands/pinrig.jsx');
  loadCmd('commands/backdrop.jsx');
  loadCmd('commands/autocrop.jsx');
  loadCmd('commands/scatter.jsx');
  loadCmd('commands/bake.jsx');
  loadCmd('commands/kinetic.jsx');
  loadCmd('commands/separate.jsx');
  loadCmd('commands/break.jsx');
  loadCmd('commands/reverse.jsx');
  loadCmd('commands/demo.jsx');
  loadCmd('commands/link.jsx');
  loadCmd('commands/stroke.jsx');
  loadCmd('commands/textbreak.jsx');
  loadCmd('commands/gradient.jsx');

  // Import / receive (rebuild a design from another app as native AE layers).
  // build.jsx defines the importer namespace + walk; the rest add builders and
  // the transform / paint / effect helpers they use.
  loadCmd('commands/import/build.jsx');
  loadCmd('commands/import/transform.jsx');
  loadCmd('commands/import/effect.jsx');
  loadCmd('commands/import/layerstyle.jsx');
  loadCmd('commands/import/paint.jsx');
  loadCmd('commands/import/geometry.jsx');
  loadCmd('commands/import/shape.jsx');
  loadCmd('commands/import/mask.jsx');
  loadCmd('commands/import/image.jsx');
  loadCmd('commands/import/text.jsx');
  loadCmd('commands/import/adjust.jsx');
  loadCmd('commands/import/fonts.jsx');

  $.__rebound.loadErrors = loadErrors;
  $.__rebound.loaded = true;
})();
