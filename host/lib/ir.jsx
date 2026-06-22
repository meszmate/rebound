/*
 * Rebound host, IR access.
 *
 * Thin host-side handle onto the shared, app-agnostic IR libraries that were
 * evaluated into the global scope just before this file (normalise, bezier,
 * validate). Keeping the shared logic in one place means the exporters, the
 * panel, and this host all agree on colour, geometry, and validation rules.
 */
$.__rebound = $.__rebound || {};
$.__rebound.ir = (function () {
  var G = $.global;

  function need(name) {
    if (!G[name]) {
      throw new Error('Rebound IR library "' + name + '" was not loaded.');
    }
    return G[name];
  }

  var N = need('ReboundNormalize');
  var B = need('ReboundBezier');
  var V = need('ReboundValidate');

  return {
    N: N,
    B: B,
    V: V,
    validate: function (ir) { return V.validate(ir); }
  };
})();
