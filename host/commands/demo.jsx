/*
 * Rebound host — Demo (build a practice composition to try the tools).
 *
 * Creates a fresh 1280x720 composition, drops in a single shape layer named
 * "Ball" with a centered anchor, and sets two Position keyframes — at the
 * left third at t=0 and the right third at t=1s — so there is a simple move to
 * ease, spring, or otherwise experiment on. Opens the new comp in a viewer.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;

  var ROOT = 'ADBE Root Vectors Group';
  var GROUP = 'ADBE Vector Group';
  var GROUP_CONTENTS = 'ADBE Vectors Group';
  var ELLIPSE = 'ADBE Vector Shape - Ellipse';
  var ELLIPSE_SIZE = 'ADBE Vector Ellipse Size';
  var FILL = 'ADBE Vector Graphic - Fill';

  // Move the layer's anchor to the middle of its own bounds so its position
  // handle lands on the visual center of the ball.
  function centerAnchor(layer, time) {
    try {
      var rect = layer.sourceRectAtTime(time, false);
      var tr = layer.property(M.transform);
      tr.property(M.anchor).setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
    } catch (e) {}
  }

  function apply(args) {
    var comp = app.project.items.addComp('Rebound Demo', 1280, 720, 1, 5, 30);

    var layer = comp.layers.addShape();
    layer.name = 'Ball';

    var root = layer.property(ROOT);
    var group = root.addProperty(GROUP);
    var contents = group.property(GROUP_CONTENTS);

    var ell = contents.addProperty(ELLIPSE);
    ell.property(ELLIPSE_SIZE).setValue([160, 160]);
    contents.addProperty(FILL);

    centerAnchor(layer, 0);

    // Two Position keyframes: left third at t=0, right third at t=1s.
    var pos = layer.property(M.transform).property(M.position);
    var midY = comp.height / 2;
    pos.setValueAtTime(0, [comp.width / 3, midY]);
    pos.setValueAtTime(1, [comp.width * 2 / 3, midY]);

    try { comp.openInViewer(); } catch (e) {}

    return { ok: true };
  }

  R.register('demo.apply', apply, 'Rebound: Build Demo Comp');
})();