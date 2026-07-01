/*
 * Rebound host, import self-audit.
 *
 * After a build, reconcile what the IR intended against what the import actually
 * produced, so a silent loss of layers surfaces to the user instead of passing as
 * a clean import. This is the in-AE half of the 1:1 guarantee: the exporter and
 * the host build logic are unit-tested in CI; this runs on the user's machine
 * (the only place After Effects exists) and confirms nothing vanished.
 *
 * Pure and side-effect free: it only reads the counts the importer already keeps,
 * so it can never affect the import.
 */
(function () {
  var R = $.__rebound;

  // Count the layers an IR document is EXPECTED to yield: every visible node,
  // recursively. A merged icon counts as ONE (its child vectors ride the single
  // shape layer); an invisible node counts as zero (the host skips it too). This
  // mirrors the host's own build rules so expected == intended.
  function countExpected(nodes) {
    var n = 0;
    if (!nodes) return 0;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || node.visible === false) continue;
      n++;
      if (node.children && node.children.length && !node.merged) n += countExpected(node.children);
    }
    return n;
  }

  // Reconcile intent vs result. Every source node should become either a built
  // layer or an explicit skip; a NET deficit (accounted < expected) means layers
  // silently vanished — a real fidelity bug worth surfacing. Container / chrome /
  // background layers only ADD to the built count, so they can only push the tally
  // OVER expected, never under: a deficit is therefore a true signal, not noise.
  function reconcile(expected, report) {
    var built = (report.layersBuilt || 0) + (report.framesBuilt || 0);
    var skipped = (report.skipped && report.skipped.length) || 0;
    var accounted = built + skipped;
    var missing = expected - accounted;
    if (missing < 0) missing = 0;
    return {
      expected: expected,
      built: built,
      skipped: skipped,
      accounted: accounted,
      missing: missing,
      ok: missing === 0
    };
  }

  // Run the reconciliation for an IR document + its build report. Guarded by the
  // caller; returns a compact plain-data summary safe to serialise to the panel.
  function run(ir, report) {
    var frames = (ir && ir.document && ir.document.frames) || [];
    return reconcile(countExpected(frames), report);
  }

  R.importer.audit = { countExpected: countExpected, reconcile: reconcile, run: run };
})();
