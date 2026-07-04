/*
 * Rebound, tool preset registry.
 *
 * Makes every tool's presets pinnable to the Home board WITHOUT the tool ever
 * having been opened. Tools declare their built-in presets at load (module
 * scope, not inside mount), and this registry turns each one — plus every
 * user-saved preset on disk (presets:<toolId>) — into a Home action:
 *
 *   - declared with applyBuild (the curve/physics family: Spring, Bounce,
 *     Recoil): kind 'apply', one click bakes that exact preset onto the
 *     selected keyframes, with a Keyframes/Expression per-tile choice.
 *   - everything else: kind 'open' carrying presetState — one click opens the
 *     tool WITH that preset loaded into its controls (via the tool's own
 *     presets.set), so "pin any preset of any tool" works universally.
 *
 * The gallery inside each tool and these actions share the same identity
 * (toolpreset-<toolId>-<slug(name)>), so the gallery's "Add to Home" pin, the
 * Add browser, and keyboard shortcuts all resolve to the same action.
 */
;(function (R) {
  'use strict';

  var registry = {}; // toolId -> spec

  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function asCurve(c) { return (typeof c === 'function') ? { type: 'fn', fn: c } : c; }

  // spec:
  //   defaults    [{name, state}] built-in presets (module-level, load-safe)
  //   previewFor? (state) -> curve def / fn — must be pure (no mount state);
  //               gives the pinned tile and browser card a real curve thumbnail
  //   applyBuild? (state, args) -> {method, args} — one-click apply
  //   modes?      true adds the Keyframes/Expression per-tile choice (applyBuild
  //               receives the picked mode in args.mode)
  //   describe?   (preset) -> the card/tooltip line for this preset
  //   skip?       [names] left out of the catalog (e.g. already a curated tile)
  function declare(toolId, spec) {
    registry[toolId] = spec || {};
  }

  function get(toolId) { return registry[toolId] || null; }

  function userPresets(toolId) {
    try {
      var d = R.disk.read('presets:' + toolId, null);
      return (d && d.items) ? d.items : [];
    } catch (e) { return []; }
  }

  function toolTitle(toolId) {
    var t = R.tools && R.tools.get && R.tools.get(toolId);
    return (t && t.title) || toolId;
  }

  function handleLength() {
    var s = (R.disk && R.disk.read) ? (R.disk.read('settings', {}) || {}) : {};
    return (s.handleLength > 0) ? s.handleLength : 45;
  }

  // The one shared state->host mapping for curve-family presets, mirroring
  // R.easing.applyCurve: bake a few editable keyframes, or one clean remap
  // expression. Kept here so Spring/Bounce/Recoil pins apply byte-for-byte the
  // same motion as the tool's own Apply button.
  function curveApplyBuild(curveDef, mode) {
    return (mode === 'expression')
      ? { method: 'ease.remap', args: { factors: R.easing.sampler.bakeFactors(curveDef, 256) } }
      : { method: 'ease.bakeSparse', args: { points: R.easing.sampler.sparseSamples(curveDef), handleLength: handleLength() } };
  }

  var MODES = [{ value: 'keys', label: 'Keyframes' }, { value: 'expression', label: 'Expression' }];

  function actionFor(toolId, spec, p) {
    var title = toolTitle(toolId);
    var a = {
      id: 'toolpreset-' + toolId + '-' + slugify(p.name),
      label: title + ': ' + p.name,
      toolId: toolId,
      group: 'Presets',
      presetName: p.name
    };
    if (spec && spec.previewFor) {
      try {
        var c = asCurve(spec.previewFor(p.state));
        if (c) { a.display = 'visual'; a.curveDef = c; }
      } catch (e) { /* name-only */ }
    }
    if (spec && spec.applyBuild) {
      var build = spec.applyBuild;
      var st = p.state;
      a.kind = 'apply';
      a.desc = (spec.describe && spec.describe(p)) ||
        ('One click applies the ' + p.name + ' ' + title.toLowerCase() + ' to the selected keyframes.');
      if (spec.modes) {
        a.config = [{ arg: 'mode', label: 'Apply as', type: 'select', options: MODES }];
        a.args = { mode: 'keys' };
      }
      a.build = function (args) { return build(st, args || {}); };
    } else {
      a.kind = 'open';
      a.presetState = p.state;
      a.desc = (spec && spec.describe && spec.describe(p)) ||
        ('Opens ' + title + ' with the ' + p.name + ' preset loaded, ready to apply.');
    }
    return a;
  }

  // Every pinnable preset action: declared built-ins first (in declaration
  // order), then user-saved presets for EVERY registered tool — so a preset you
  // saved in any tool is pinnable even if that tool never declared defaults.
  function actions() {
    var out = [];
    var seen = {};
    function push(a) { if (!seen[a.id]) { seen[a.id] = 1; out.push(a); } }

    Object.keys(registry).forEach(function (toolId) {
      var spec = registry[toolId];
      var skip = spec.skip || [];
      (spec.defaults || []).forEach(function (p) {
        if (skip.indexOf(p.name) === -1) push(actionFor(toolId, spec, p));
      });
    });

    ((R.tools && R.tools.list && R.tools.list()) || []).forEach(function (t) {
      userPresets(t.id).forEach(function (p) {
        push(actionFor(t.id, registry[t.id] || null, p));
      });
    });

    return out;
  }

  // The action id the in-tool gallery uses to pin a preset, kept in one place so
  // the gallery and the catalog can never drift apart.
  function actionIdFor(toolId, presetName) {
    return 'toolpreset-' + toolId + '-' + slugify(presetName);
  }

  R.toolPresets = {
    declare: declare,
    get: get,
    actions: actions,
    actionIdFor: actionIdFor,
    userPresets: userPresets,
    curveApplyBuild: curveApplyBuild,
    slugify: slugify
  };
})(window.Rebound = window.Rebound || {});
