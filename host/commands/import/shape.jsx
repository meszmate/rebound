/*
 * Rebound host, import shapes.
 *
 * Builds vector geometry as native After Effects shape layers, keeping it
 * editable wherever possible:
 *   - RECTANGLE / ELLIPSE / POLYGON / STAR -> parametric primitives
 *   - LINE / VECTOR -> bezier paths (relative tangents, AE Shape() convention)
 *   - compound paths -> sub-paths in one group with an even-odd fill rule
 *   - BOOLEAN -> operand geometry in one group joined by Merge Paths
 *
 * Geometry is built in node-local space (origin at the node's top-left) and the
 * layer is placed at the node's position, so the result lands exactly where the
 * source did. Paints are added by host/commands/import/paint.jsx.
 */
(function () {
  var R = $.__rebound;
  var util = R.importer.util;
  var paint = R.importer.paint;

  var GROUP = 'ADBE Vector Group';
  var CONTENTS = 'ADBE Vectors Group';
  var ROOT = 'ADBE Root Vectors Group';

  function labelFor(type) {
    switch (type) {
      case 'RECTANGLE': return 'Rectangle';
      case 'ELLIPSE': return 'Ellipse';
      case 'POLYGON': return 'Polygon';
      case 'STAR': return 'Star';
      case 'LINE': return 'Line';
      case 'VECTOR': return 'Path';
      case 'BOOLEAN': return 'Boolean';
      default: return 'Shape';
    }
  }

  function sizeOf(node) {
    var t = node.transform || {};
    var rp = node.primitive && node.primitive.rect;
    var w = (rp && rp.size && rp.size[0]) || t.width || 100;
    var h = (rp && rp.size && rp.size[1]) || t.height || 100;
    return [w, h];
  }

  // ---- geometry (added into a contents collection at a local offset) -------

  function addRect(contents, node, offset) {
    var sz = sizeOf(node);
    var rect = contents.addProperty('ADBE Vector Shape - Rect');
    rect.property('ADBE Vector Rect Size').setValue([sz[0], sz[1]]);
    rect.property('ADBE Vector Rect Position').setValue([offset[0] + sz[0] / 2, offset[1] + sz[1] / 2]);
    var rp = node.primitive && node.primitive.rect;
    var round = util.uniformRadius(node.cornerRadii) || (rp && rp.roundness) || 0;
    if (round) { try { rect.property('ADBE Vector Rect Roundness').setValue(round); } catch (e) {} }
    return 1;
  }

  function addEllipse(contents, node, offset) {
    var sz = sizeOf(node);
    var ell = contents.addProperty('ADBE Vector Shape - Ellipse');
    ell.property('ADBE Vector Ellipse Size').setValue([sz[0], sz[1]]);
    ell.property('ADBE Vector Ellipse Position').setValue([offset[0] + sz[0] / 2, offset[1] + sz[1] / 2]);
    return 1;
  }

  function addStar(contents, node, offset) {
    var sz = sizeOf(node);
    var ps = (node.primitive && node.primitive.polystar) || {};
    var star = contents.addProperty('ADBE Vector Shape - Star');
    try { star.property('ADBE Vector Star Type').setValue(ps.starType === 'POLYGON' ? 2 : 1); } catch (e) {}
    try { star.property('ADBE Vector Star Points').setValue(ps.points || 5); } catch (e2) {}
    try { star.property('ADBE Vector Star Position').setValue([offset[0] + sz[0] / 2, offset[1] + sz[1] / 2]); } catch (e3) {}
    var outer = ps.outerRadius || Math.min(sz[0], sz[1]) / 2;
    try { star.property('ADBE Vector Star Outer Radius').setValue(outer); } catch (e4) {}
    if (ps.starType !== 'POLYGON') {
      try { star.property('ADBE Vector Star Inner Radius').setValue(ps.innerRadius || outer * 0.5); } catch (e5) {}
    }
    if (ps.rotation) { try { star.property('ADBE Vector Star Rotation').setValue(ps.rotation); } catch (e6) {} }
    return 1;
  }

  function addPaths(contents, node, offset) {
    var paths = node.paths || [];
    var added = 0;
    for (var i = 0; i < paths.length; i++) {
      var sp = paths[i];
      var verts = sp.vertices || [];
      if (!verts.length) continue;
      var shape = new Shape();
      var vv = [], it = [], ot = [];
      for (var j = 0; j < verts.length; j++) {
        var v = verts[j];
        vv.push([v.x + offset[0], v.y + offset[1]]);
        it.push(v.inTangent || [0, 0]);
        ot.push(v.outTangent || [0, 0]);
      }
      shape.vertices = vv;
      shape.inTangents = it;
      shape.outTangents = ot;
      shape.closed = !!sp.closed;
      var grp = contents.addProperty('ADBE Vector Shape - Group');
      grp.property('ADBE Vector Shape').setValue(shape);
      added++;
    }
    return added;
  }

  // Dispatch the right geometry for a node at a local offset. Returns the number
  // of primitives / paths added.
  function addGeometry(contents, node, offset) {
    offset = offset || [0, 0];
    var type = node.type;
    if (type === 'RECTANGLE' || (node.primitive && node.primitive.rect)) return addRect(contents, node, offset);
    if (type === 'ELLIPSE' && !(node.primitive && node.primitive.ellipse && node.primitive.ellipse.arc)) return addEllipse(contents, node, offset);
    if ((type === 'POLYGON' || type === 'STAR') && node.primitive && node.primitive.polystar) return addStar(contents, node, offset);
    if (node.paths && node.paths.length) return addPaths(contents, node, offset);
    if (type === 'ELLIPSE') return addEllipse(contents, node, offset);
    return 0;
  }
  R.importer.addGeometry = addGeometry;

  // ---- builders ------------------------------------------------------------

  function freshShapeLayer(comp, node) {
    var layer = comp.layers.addShape();
    layer.name = node.name || labelFor(node.type);
    var contents = layer.property(ROOT).addProperty(GROUP).property(CONTENTS);
    return { layer: layer, contents: contents };
  }

  function buildShapeNode(comp, node, report) {
    var sl = freshShapeLayer(comp, node);
    var count = addGeometry(sl.contents, node, [0, 0]);
    if (!count) {
      util.note(report, 'skipped', { name: node.name, type: node.type, reason: 'no geometry to build' });
      sl.layer.remove();
      return;
    }
    // Stroke before fill so the stroke paints on top, like the source.
    paint.applyStroke(sl.contents, node, report);
    paint.applyFills(sl.contents, node, report);
    util.placeLocal(sl.layer, node);
    report.layersBuilt++;
  }

  function mergeType(op) {
    if (op === 'UNION') return 2;       // Add
    if (op === 'SUBTRACT') return 3;    // Subtract
    if (op === 'INTERSECT') return 4;   // Intersect
    if (op === 'EXCLUDE') return 5;     // Exclude Intersections
    return 1;                           // Merge
  }

  function buildBoolean(comp, node, report) {
    var sl = freshShapeLayer(comp, node);
    var t = node.transform || {};
    var bx = t.x || 0, by = t.y || 0;
    var kids = node.children || [];
    var built = 0;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (!c || c.visible === false) continue;
      var ct = c.transform || {};
      built += addGeometry(sl.contents, c, [(ct.x || 0) - bx, (ct.y || 0) - by]);
    }
    if (!built && node.paths && node.paths.length) built = addGeometry(sl.contents, node, [0, 0]);
    if (!built) {
      util.note(report, 'skipped', { name: node.name, type: 'BOOLEAN', reason: 'no operands to merge' });
      sl.layer.remove();
      return;
    }
    var merge = sl.contents.addProperty('ADBE Vector Filter - Merge');
    var boolOp = node['boolean'] && node['boolean'].op; // 'boolean' is reserved in ES3
    try { merge.property('ADBE Vector Merge Type').setValue(mergeType(boolOp)); } catch (e) {}
    paint.applyStroke(sl.contents, node, report);
    paint.applyFills(sl.contents, node, report);
    util.placeLocal(sl.layer, node);
    report.layersBuilt++;
  }

  var builders = R.importer.builders;
  builders.RECTANGLE = buildShapeNode;
  builders.ELLIPSE = buildShapeNode;
  builders.POLYGON = buildShapeNode;
  builders.STAR = buildShapeNode;
  builders.LINE = buildShapeNode;
  builders.VECTOR = buildShapeNode;
  builders.BOOLEAN = buildBoolean;

  R.importer.buildShapeNode = buildShapeNode;
})();
