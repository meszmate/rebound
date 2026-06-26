/*
 * Rebound host, Echo (optical echo/trail via the built-in Echo effect).
 *
 * For each selected AV layer, adds (or reuses) an Echo effect on its Effect
 * Parade and sets Echo Time, Number Of Echoes, and Decay. Effect and its
 * controls are addressed by matchName / property name with an index fallback
 * (matchNames for the inner controls are not stable), and keyframed or
 * expression-driven controls are left untouched. Non-AV layers are skipped.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var ECHO = 'ADBE Echo';
  var P_ECHO_TIME = 'Echo Time (seconds)';
  var P_NUM_ECHOES = 'Number Of Echoes';
  var P_DECAY = 'Decay';
  var I_ECHO_TIME = 1;
  var I_NUM_ECHOES = 2;
  var I_DECAY = 4;

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  // True when a property can be safely overwritten with a static value.
  function isStatic(prop) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    return true;
  }

  function effectParade(layer) {
    return layer.property('ADBE Effect Parade');
  }

  // Find an existing Echo effect on the layer (by matchName), or null.
  function findEcho(layer) {
    var fx = effectParade(layer);
    if (!fx) return null;
    for (var i = 1; i <= fx.numProperties; i++) {
      var e = fx.property(i);
      if (e.matchName === ECHO) return e;
    }
    return null;
  }

  // Resolve a control on the effect, preferring its display name and falling
  // back to the property index when the name lookup misses.
  function control(effect, name, index) {
    var prop = null;
    try { prop = effect.property(name); } catch (err) { prop = null; }
    if (!prop) {
      try { prop = effect.property(index); } catch (err2) { prop = null; }
    }
    return prop;
  }

  function setStatic(prop, value) {
    if (isStatic(prop)) prop.setValue(value);
  }

  function apply(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) throw new Error('Select one or more layers to echo.');

    var echoTime = clamp(num(args.echoTime, -0.05), -1, 0);
    var numEchoes = Math.round(clamp(num(args.numEchoes, 8), 1, 30));
    var decay = clamp(num(args.decay, 0.7), 0, 1);

    var applied = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;

      var fx = effectParade(layer);
      if (!fx) continue;

      var effect = findEcho(layer);
      if (!effect) effect = fx.addProperty(ECHO);

      setStatic(control(effect, P_ECHO_TIME, I_ECHO_TIME), echoTime);
      setStatic(control(effect, P_NUM_ECHOES, I_NUM_ECHOES), numEchoes);
      setStatic(control(effect, P_DECAY, I_DECAY), decay);

      applied++;
    }

    if (!applied) throw new Error('Select one or more layers that can hold effects.');
    return { applied: applied };
  }

  R.register('echo.apply', apply, 'Rebound: Echo');
})();
