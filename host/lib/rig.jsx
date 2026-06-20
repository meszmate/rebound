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
  function ensureSlider(layer, name, value) {
    var existing = findByName(layer, name);
    if (existing) return existing;
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
    if (existing) return existing;
    var fx = effectParade(layer);
    if (!fx) throw new Error(layer.name + ' cannot hold expression controls.');
    var ctrl = fx.addProperty('ADBE Checkbox Control');
    ctrl.name = name;
    ctrl.property(1).setValue(value ? 1 : 0);
    return ctrl;
  }

  // Set an expression, but only if the property has none or already carries our
  // marker. Returns true if written, false if skipped to protect user code.
  function setExpression(prop, body) {
    if (!prop.canSetExpression) return false;
    var marked = MARKER + '\n' + body;
    var current = prop.expressionEnabled ? prop.expression : '';
    if (current && current !== '' && current.indexOf(MARKER) === -1) {
      return false; // user expression present, don't touch
    }
    prop.expression = marked;
    return true;
  }

  // Remove our expression from a property (leaves user expressions alone).
  function clearExpression(prop) {
    if (prop.expressionEnabled && prop.expression && prop.expression.indexOf(MARKER) !== -1) {
      prop.expression = '';
      return true;
    }
    return false;
  }

  return {
    MARKER: MARKER,
    findByName: findByName,
    ensureSlider: ensureSlider,
    ensureCheckbox: ensureCheckbox,
    setExpression: setExpression,
    clearExpression: clearExpression
  };
})();
