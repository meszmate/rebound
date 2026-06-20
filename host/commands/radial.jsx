/*
 * Rebound host — Radial (duplicate each layer into a ring of copies).
 *
 * For each selected AVLayer, captures its base position as the ring center,
 * then creates 'count' duplicates. Copy k (0..count-1) is placed at
 *   angle = startAngle + arc * k / (arc >= 360 ? count : count - 1)
 *   position = base + [cos(angle) * radius, sin(angle) * radius]
 * (angle in degrees, converted to radians for the trig). With Orient on, each
 * copy's rotation is also advanced by its angle so it faces outward. Only
 * static (non-keyframed, non-expression) transforms are written; originals are
 * left untouched.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  var DEG2RAD = Math.PI / 180;

  // True when a property can be safely overwritten with a static value.
  function isStatic(prop) {
    if (!prop) return false;
    if (prop.numKeys > 0) return false;
    if (prop.expressionEnabled && prop.expression !== '') return false;
    return true;
  }

  function setPosition(layer, x, y) {
    var pos = layer.property(M.transform).property(M.position);
    if (!isStatic(pos)) return;
    var v = pos.value;
    var nv = [x, y];
    if (v.length > 2) nv.push(v[2]);
    pos.setValue(nv);
  }

  function offsetRotation(layer, deg) {
    if (deg === 0) return;
    var rot = layer.property(M.transform).property(M.rotation);
    if (!isStatic(rot)) return;
    rot.setValue(rot.value + deg);
  }

  function num(v, fallback) {
    return (v == null || isNaN(v)) ? fallback : v;
  }

  function radial(args) {
    var comp = util.activeComp();
    var sources = comp.selectedLayers;
    if (!sources.length) throw new Error('Select one or more layers to array.');

    var count = Math.round(num(args.count, 8));
    if (count < 2) count = 2;
    if (count > 60) count = 60;

    var radius = num(args.radius, 200);
    var startAngle = num(args.startAngle, 0);
    var arc = num(args.arc, 360);
    var orient = !!args.orient;

    // A full circle's last copy overlaps the first, so spread across 'count'
    // steps; a partial arc reaches its end, so spread across count - 1.
    var divisor = arc >= 360 ? count : (count - 1);
    if (divisor < 1) divisor = 1;

    // Snapshot the source list first; duplicating mutates the layer collection.
    var originals = [];
    for (var i = 0; i < sources.length; i++) {
      if (sources[i] instanceof AVLayer) originals.push(sources[i]);
    }
    if (!originals.length) throw new Error('Select one or more layers to array.');

    var created = 0;
    for (var s = 0; s < originals.length; s++) {
      var src = originals[s];

      // Capture the base position as the ring center before duplicating.
      var basePos = src.property(M.transform).property(M.position).value;
      var cx = basePos[0];
      var cy = basePos[1];

      for (var k = 0; k < count; k++) {
        var angle = startAngle + arc * k / divisor;
        var rad = angle * DEG2RAD;
        var copy = src.duplicate();
        setPosition(copy, cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
        if (orient) offsetRotation(copy, angle);
        created++;
      }
    }

    return { created: created };
  }

  R.register('radial.apply', radial, 'Rebound: Radial');
})();