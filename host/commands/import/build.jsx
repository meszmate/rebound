/*
 * Rebound host, import builder (entry).
 *
 * Walks a Rebound IR document and reconstructs it as native After Effects
 * layers inside a single undo group. Each frame becomes a CompItem; if a
 * composition is active, the frame comps are dropped into it as precomp layers,
 * otherwise they are left in the project for the user to place.
 *
 * This is the Phase 1 skeleton: it stands up the whole bridge (transport ->
 * validate -> build -> report) and renders solid rectangles and frame
 * backgrounds end to end. Later phases register richer node builders on
 * $.__rebound.importer; this entry dispatches to whatever is registered and
 * records anything it cannot yet build in the fidelity report.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  // Shared namespace later phases extend with node builders, keyed by IR type.
  R.importer = R.importer || {};
  var builders = R.importer.builders || (R.importer.builders = {});

  // ---- report --------------------------------------------------------------

  function newReport() {
    return {
      framesBuilt: 0,
      layersBuilt: 0,
      skipped: [],      // { name, type, reason }
      approximated: [], // { name, detail }
      missingFonts: [], // family names
      warnings: [],
      errors: [],
      placedInComp: false
    };
  }

  function note(report, list, entry) {
    // Cap the lists so a huge document cannot produce a runaway report.
    if (report[list].length < 500) report[list].push(entry);
  }

  // ---- helpers (shared with later phases via R.importer) -------------------

  function colorToAE(c) { return R.ir.N.colorToAE(c); }

  function firstVisible(paints, type) {
    if (!paints) return null;
    for (var i = 0; i < paints.length; i++) {
      var p = paints[i];
      if (!p || p.visible === false) continue;
      if (!type || p.type === type) return p;
    }
    return null;
  }

  function uniformRadius(radii) {
    if (!radii) return 0;
    var tl = radii.topLeft || 0, tr = radii.topRight || 0, br = radii.bottomRight || 0, bl = radii.bottomLeft || 0;
    if (tl === tr && tr === br && br === bl) return tl;
    return tl; // non-uniform corners are refined in a later phase
  }

  // Place a shape layer's content origin at the node's top-left so a node at
  // (x,y) with size (w,h) lands exactly there in comp space.
  function positionAxisAligned(layer, node, w, h) {
    var t = node.transform || {};
    var cx = (t.x || 0) + w / 2;
    var cy = (t.y || 0) + h / 2;
    var tr = layer.property(util.MATCH.transform);
    tr.property(util.MATCH.anchor).setValue([0, 0]);
    tr.property(util.MATCH.position).setValue([cx, cy]);
    if (typeof node.opacity === 'number' && node.opacity < 1) {
      tr.property(util.MATCH.opacity).setValue(node.opacity * 100);
    }
  }

  R.importer.util = {
    colorToAE: colorToAE,
    firstVisible: firstVisible,
    uniformRadius: uniformRadius,
    positionAxisAligned: positionAxisAligned,
    note: note
  };

  // ---- minimal builders (Phase 1: rectangle + solid fill) ------------------

  function addSolidFill(contents, paints, report, name) {
    var fill = contents.addProperty('ADBE Vector Graphic - Fill');
    var solid = firstVisible(paints, 'SOLID');
    if (solid && solid.color) {
      fill.property('ADBE Vector Fill Color').setValue(colorToAE(solid.color));
      if (typeof solid.opacity === 'number' && solid.opacity < 1) {
        fill.property('ADBE Vector Fill Opacity').setValue(solid.opacity * 100);
      }
    } else {
      var other = firstVisible(paints, null);
      if (other) note(report, 'approximated', { name: name, detail: other.type + ' fill rendered as a flat colour (refined in a later build)' });
      fill.property('ADBE Vector Fill Color').setValue([0.5, 0.5, 0.5]);
    }
    return fill;
  }

  function buildRectangle(comp, node, report) {
    var t = node.transform || {};
    var rectPrim = node.primitive && node.primitive.rect;
    var w = t.width || (rectPrim && rectPrim.size ? rectPrim.size[0] : 100);
    var h = t.height || (rectPrim && rectPrim.size ? rectPrim.size[1] : 100);

    var layer = comp.layers.addShape();
    layer.name = node.name || 'Rectangle';
    var contents = layer.property('ADBE Root Vectors Group')
      .addProperty('ADBE Vector Group')
      .property('ADBE Vectors Group');

    var rect = contents.addProperty('ADBE Vector Shape - Rect');
    rect.property('ADBE Vector Rect Size').setValue([w, h]);
    var round = uniformRadius(node.cornerRadii);
    if (round) rect.property('ADBE Vector Rect Roundness').setValue(round);

    addSolidFill(contents, node.fills, report, node.name);
    positionAxisAligned(layer, node, w, h);
    report.layersBuilt++;
    return layer;
  }

  builders.RECTANGLE = buildRectangle;

  // ---- node + frame walk ---------------------------------------------------

  function buildNode(comp, node, report) {
    if (!node || node.visible === false) return;
    var builder = builders[node.type];
    if (builder) {
      try {
        builder(comp, node, report);
      } catch (e) {
        note(report, 'skipped', { name: node.name, type: node.type, reason: (e && e.message) || 'build failed' });
      }
      return;
    }
    note(report, 'skipped', { name: node.name, type: node.type, reason: 'not yet supported by this build' });
    // Still descend into containers so their children are not lost.
    if (node.children && node.children.length) {
      for (var i = 0; i < node.children.length; i++) buildNode(comp, node.children[i], report);
    }
  }

  function buildFrameBackground(comp, frame) {
    var bg = firstVisible(frame.background, 'SOLID');
    if (!bg || !bg.color) return;
    comp.layers.addSolid(colorToAE(bg.color), (frame.name || 'Frame') + ' BG', comp.width, comp.height, comp.pixelAspect, comp.duration);
  }

  function buildFrame(target, frame, report) {
    var fps = target ? target.frameRate : 30;
    var dur = target ? target.duration : 10;
    var par = target ? target.pixelAspect : 1;
    var w = Math.max(1, Math.round(frame.width || 100));
    var h = Math.max(1, Math.round(frame.height || 100));

    var comp = app.project.items.addComp(frame.name || 'Frame', w, h, par, dur, fps);
    if (frame.background && frame.background.length) buildFrameBackground(comp, frame);

    var children = frame.children || [];
    for (var i = 0; i < children.length; i++) buildNode(comp, children[i], report);

    report.framesBuilt++;

    if (target) {
      target.layers.add(comp);
      report.placedInComp = true;
    }
    return comp;
  }

  function build(ir) {
    var check = R.ir.validate(ir);
    var report = newReport();
    report.warnings = check.warnings || [];
    if (!check.valid) {
      var err = new Error((check.errors || ['Invalid IR.']).join('\n'));
      throw err;
    }

    var active = app.project ? app.project.activeItem : null;
    var target = (active && util.isComp(active)) ? active : null;

    var frames = ir.document.frames;
    for (var i = 0; i < frames.length; i++) {
      buildFrame(target, frames[i], report);
    }
    return report;
  }

  R.importer.build = build;
  R.register('import.build', build, 'Rebound: Import');
})();
