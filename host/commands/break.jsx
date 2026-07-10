/*
 * Rebound host, Break (split a multi-group shape layer).
 *
 * For every selected shape layer (one that owns an 'ADBE Root Vectors Group'),
 * we read how many top-level 'ADBE Vector Group' children it has, then make one
 * duplicate of the source per group. On each duplicate we walk the root vectors
 * group from the last child down to 1 and remove every shape group whose
 * original position is not the target index, leaving a single group. The group
 * count is captured before any duplicating, and pruning matches the original
 * child order so each duplicate keeps the right group. Non-shape layers are
 * skipped and their names returned.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var ROOT = 'ADBE Root Vectors Group';
  var GROUP = 'ADBE Vector Group';

  // The 1-based positions (within the root vectors group) of each top-level
  // shape group, in document order, plus each group's display name.
  function shapeGroups(layer) {
    var root = layer.property(ROOT);
    var list = [];
    for (var i = 1; i <= root.numProperties; i++) {
      var child = root.property(i);
      if (child.matchName === GROUP) {
        list.push({ position: i, name: child.name });
      }
    }
    return list;
  }

  // On a freshly duplicated layer, remove every top-level shape group except the
  // one whose original position is keepPosition. Walk from the last child down
  // so removing earlier ones never shifts an index we still need to test.
  function pruneToGroup(layer, keepPosition) {
    var root = layer.property(ROOT);
    for (var i = root.numProperties; i >= 1; i--) {
      var child = root.property(i);
      if (child.matchName === GROUP && i !== keepPosition) {
        child.remove();
      }
    }
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) {
      throw new Error('Select one or more shape layers.');
    }

    var deleteOriginal = !!(args && args.deleteOriginal);
    var created = 0;
    var skipped = [];

    for (var i = 0; i < layers.length; i++) {
      var source = layers[i];
      var root = null;
      try {
        root = source.property(ROOT);
      } catch (e) {
        root = null;
      }
      if (!root) {
        skipped.push(source.name + ' (not a shape layer)');
        continue;
      }

      // Capture the group layout before any duplicating mutates the project.
      var groups = shapeGroups(source);
      if (!groups.length) {
        skipped.push(source.name + ' (no groups)');
        continue;
      }
      // One group has nothing to split; duplicating it would just clone the
      // layer and report a bogus success.
      if (groups.length < 2) {
        skipped.push(source.name + ' (single group)');
        continue;
      }

      for (var g = 0; g < groups.length; g++) {
        var dup = source.duplicate();
        pruneToGroup(dup, groups[g].position);
        dup.name = groups[g].name;
        created++;
      }

      if (deleteOriginal) {
        source.remove();
      }
    }

    return { created: created, skipped: skipped };
  }

  R.register('break.apply', apply, 'Rebound: Break');
})();