/*
 * Rebound host, expression-rig helpers.
 *
 * Shared by tools that drive properties with a generated, art-directable
 * expression backed by Slider Control effects on the layer. Controls are
 * reused by name so several properties on one layer share a single rig. Our
 * expressions carry a "// Rebound" marker so we can safely replace our own and
 * never clobber a user's existing expression.
 */
$.__rebound = $.__rebound || {};
$.__rebound.rig = (function () {
  var MARKER = '// Rebound';

  function effectParade(layer) {
    return layer.property('ADBE Effect Parade');
  }

  function findByName(layer, name) {
    var fx = effectParade(layer);
    if (!fx) return null;
    for (var i = 1; i <= fx.numProperties; i++) {
      if (fx.property(i).name === name) return fx.property(i);
    }
    return null;
  }

  // Add (or reuse) a named Slider Control on the layer and set its value.
  // Reused controls get the new value too, so re-applying a rig with changed
  // panel settings actually changes the rig (a keyframed control is left alone).
  function ensureSlider(layer, name, value) {
    var existing = findByName(layer, name);
    if (existing) {
      var sp = existing.property(1);
      if (sp && sp.numKeys === 0 && !(sp.expressionEnabled && sp.expression !== '')) sp.setValue(value);
      return existing;
    }
    var fx = effectParade(layer);
    if (!fx) throw new Error(layer.name + ' cannot hold expression controls.');
    var ctrl = fx.addProperty('ADBE Slider Control');
    ctrl.name = name;
    ctrl.property(1).setValue(value);
    return ctrl;
  }

  // Add (or reuse) a named Checkbox Control.
  function ensureCheckbox(layer, name, value) {
    var existing = findByName(layer, name);
    if (existing) {
      var cp = existing.property(1);
      if (cp && cp.numKeys === 0 && !(cp.expressionEnabled && cp.expression !== '')) cp.setValue(value ? 1 : 0);
      return existing;
    }
    var fx = effectParade(layer);
    if (!fx) throw new Error(layer.name + ' cannot hold expression controls.');
    var ctrl = fx.addProperty('ADBE Checkbox Control');
    ctrl.name = name;
    ctrl.property(1).setValue(value ? 1 : 0);
    return ctrl;
  }

  // Set an expression, but only if the property has none or already carries our
  // marker. Returns true if written, false if skipped to protect user code.
  // An optional tag names the tool ("// Rebound:lean") so each tool's Remove
  // clears only its own rig instead of any Rebound expression on the property.
  function setExpression(prop, body, tag) {
    if (!prop.canSetExpression) return false;
    var marked = (tag ? MARKER + ':' + tag : MARKER) + '\n' + body;
    // A disabled user expression is still the user's code: check the text, not
    // just expressionEnabled, so parked expressions are never overwritten.
    var current = prop.expression || '';
    if (current && current !== '' && current.indexOf(MARKER) === -1) {
      return false; // user expression present, don't touch
    }
    prop.expression = marked;
    return true;
  }

  // Remove our expression from a property (leaves user expressions alone).
  // With a tag, only that tool's expression is cleared, plus legacy Rebound
  // expressions carrying the bare marker with no tool tag (written before tags
  // existed) so old rigs stay removable.
  function clearExpression(prop, tag) {
    if (!(prop.expressionEnabled && prop.expression && prop.expression.indexOf(MARKER) !== -1)) {
      return false;
    }
    if (tag) {
      var mine = prop.expression.indexOf(MARKER + ':' + tag + '\n') !== -1;
      var legacy = prop.expression.indexOf(MARKER + ':') === -1;
      if (!mine && !legacy) return false; // another Rebound tool's rig: leave it
    }
    prop.expression = '';
    return true;
  }

  // Delete a tool's named Slider/Checkbox controls from the layer so Remove
  // doesn't leave dead effects behind. Returns how many were removed.
  function removeControls(layer, names) {
    var removed = 0;
    for (var i = 0; i < names.length; i++) {
      var ctrl = findByName(layer, names[i]);
      if (ctrl) {
        try { ctrl.remove(); removed++; } catch (e) {}
      }
    }
    return removed;
  }

  return {
    MARKER: MARKER,
    findByName: findByName,
    ensureSlider: ensureSlider,
    ensureCheckbox: ensureCheckbox,
    setExpression: setExpression,
    clearExpression: clearExpression,
    removeControls: removeControls
  };
})();
