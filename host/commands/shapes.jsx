/*
 * Rebound host, Shapes (insert parametric shape primitives).
 *
 * Creates a shape layer, builds a single shape group inside its Root Vectors
 * Group, adds the requested primitive addressed by matchName, and adds a Fill
 * (a Stroke for the line, which is a real two-point open path so Trim Paths
 * write-ons trace the line itself instead of a filled rectangle's outline).
 * The layer is centered on the comp and named after the primitive kind.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  var ROOT = 'ADBE Root Vectors Group';
  var GROUP = 'ADBE Vector Group';
  var GROUP_CONTENTS = 'ADBE Vectors Group';
  var RECT = 'ADBE Vector Shape - Rect';
  var ELLIPSE = 'ADBE Vector Shape - Ellipse';
  var STAR = 'ADBE Vector Shape - Star';
  var PATH_GROUP = 'ADBE Vector Shape - Group';
  var PATH = 'ADBE Vector Shape';
  var FILL = 'ADBE Vector Graphic - Fill';
  var STROKE = 'ADBE Vector Graphic - Stroke';
  var STROKE_WIDTH = 'ADBE Vector Stroke Width';
  var RECT_SIZE = 'ADBE Vector Rect Size';
  var RECT_ROUNDNESS = 'ADBE Vector Rect Roundness';
  var ELLIPSE_SIZE = 'ADBE Vector Ellipse Size';
  var STAR_TYPE = 'ADBE Vector Star Type';
  var STAR_OUTER = 'ADBE Vector Star Outer Radius';
  var STAR_INNER = 'ADBE Vector Star Inner Radius';

  // Title-cased display name for a primitive kind.
  function labelFor(kind) {
    switch (kind) {
      case 'rectangle': return 'Rectangle';
      case 'rounded': return 'Rounded Rectangle';
      case 'ellipse': return 'Ellipse';
      case 'polygon': return 'Polygon';
      case 'star': return 'Star';
      case 'line': return 'Line';
      default: return 'Shape';
    }
  }

  // Add the requested primitive into a shape group's contents collection.
  function addPrimitive(contents, kind) {
    if (kind === 'ellipse') {
      var ell = contents.addProperty(ELLIPSE);
      ell.property(ELLIPSE_SIZE).setValue([200, 200]);
      return;
    }
    if (kind === 'polygon' || kind === 'star') {
      var star = contents.addProperty(STAR);
      star.property(STAR_TYPE).setValue(kind === 'polygon' ? 2 : 1);
      // Explicit, consistent sizing (the tool otherwise inherits whatever the
      // last-used star tool left behind): 100px outer radius, and for the star
      // the usual half-radius inner points.
      star.property(STAR_OUTER).setValue(100);
      if (kind === 'star') star.property(STAR_INNER).setValue(50);
      return;
    }
    if (kind === 'line') {
      // A real two-point open path, not a thin filled rectangle, so a Trim
      // Paths write-on draws along the line instead of around a rect outline.
      var pathGroup = contents.addProperty(PATH_GROUP);
      var line = new Shape();
      line.vertices = [[-100, 0], [100, 0]];
      line.inTangents = [[0, 0], [0, 0]];
      line.outTangents = [[0, 0], [0, 0]];
      line.closed = false;
      pathGroup.property(PATH).setValue(line);
      return;
    }
    // rectangle, rounded, both rectangles.
    var rect = contents.addProperty(RECT);
    rect.property(RECT_SIZE).setValue([200, 200]);
    if (kind === 'rounded') {
      rect.property(RECT_ROUNDNESS).setValue(24);
    }
  }

  function add(args) {
    var comp = util.activeComp();
    var kind = args && args.kind ? args.kind : 'rectangle';

    var layer = comp.layers.addShape();
    layer.name = labelFor(kind);

    var root = layer.property(ROOT);
    var group = root.addProperty(GROUP);
    var contents = group.property(GROUP_CONTENTS);

    addPrimitive(contents, kind);
    if (kind === 'line') {
      var stroke = contents.addProperty(STROKE);
      stroke.property(STROKE_WIDTH).setValue(6);
    } else {
      contents.addProperty(FILL);
    }

    var pos = layer.property(util.MATCH.transform).property(util.MATCH.position);
    pos.setValue([comp.width / 2, comp.height / 2]);

    return { created: 1, kind: kind };
  }

  R.register('shapes.add', add, 'Rebound: Add Shape');
})();
