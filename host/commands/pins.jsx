/*
 * Rebound host, Puppet Rig.
 *
 * Native Puppet pins cannot be created by script (addProperty only makes an empty
 * shell; the mesh solver owns the vertex data). So this tool does what Duik /
 * PuppetTools do: the artist places pins with the Puppet Tool, then this BINDS
 * each existing pin to a controller null via the universal expression
 *   L = thisComp.layer("<null>"); L.toWorld(L.anchorPoint);
 * Animate the nulls, the mesh follows. Also makes slider-control rigs and links
 * properties to a slider (expression rigging). Marker-guarded; Unbind clears only
 * our pin expressions.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;
  var M = util.MATCH;
  var rig = R.rig;

  var PUPPET = 'ADBE FreePin3';
  var PIN_POS = 'ADBE FreePin3 PosPin Position';

  function escapeName(name) {
    var s = '' + name, out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\') out += '\\\\';
      else if (ch === '"') out += '\\"';
      else out += ch;
    }
    return out;
  }

  function readPos(tg, t0) {
    var pos = tg.property(M.position);
    var sep = false; try { sep = pos.dimensionsSeparated; } catch (e) { sep = false; }
    if (sep) return [tg.property(M.positionX).valueAtTime(t0, false), tg.property(M.positionY).valueAtTime(t0, false)];
    var v = pos.valueAtTime(t0, false);
    return (v instanceof Array) ? v : [v, 0];
  }

  function layerToComp(pt, ref, t0) {
    var tg = ref.property(M.transform);
    var anchor = tg.property(M.anchor).valueAtTime(t0, false);
    var pos = readPos(tg, t0);
    var scale = tg.property(M.scale).valueAtTime(t0, false);
    var rot = tg.property(M.rotation).valueAtTime(t0, false);
    var lx = (pt[0] - anchor[0]) * (scale[0] / 100);
    var ly = (pt[1] - anchor[1]) * (scale[1] / 100);
    var r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [pos[0] + (lx * c - ly * s), pos[1] + (lx * s + ly * c)];
  }

  function findPuppet(layer) {
    var fx = layer.property('ADBE Effect Parade');
    if (!fx) return null;
    for (var i = 1; i <= fx.numProperties; i++) {
      if (fx.property(i).matchName === PUPPET) return fx.property(i);
    }
    return null;
  }

  // Recursively collect each pin's Position property. Version-tolerant: it keys
  // off the stable PosPin Position matchName rather than the fragile group chain.
  function collectPins(group, out, depth) {
    if (depth > 8) return;
    for (var i = 1; i <= group.numProperties; i++) {
      var p = group.property(i);
      var pos = null;
      try { pos = p.property(PIN_POS); } catch (e) { pos = null; }
      if (pos) { out.push(pos); continue; }
      var n = 0; try { n = p.numProperties; } catch (e2) { n = 0; }
      if (n > 0) collectPins(p, out, depth + 1);
    }
  }

  function makeController(comp, style, size, label, name, compPt) {
    var lay;
    if (style === 'dot') {
      lay = comp.layers.addShape();
      var cont = lay.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group').property('ADBE Vectors Group');
      var ell = cont.addProperty('ADBE Vector Shape - Ellipse');
      ell.property('ADBE Vector Ellipse Size').setValue([size, size]);
      var fill = cont.addProperty('ADBE Vector Graphic - Fill');
      fill.property('ADBE Vector Fill Color').setValue([0.36, 0.55, 1, 1]);
    } else {
      lay = comp.layers.addNull();
    }
    lay.name = name;
    lay.property(M.transform).property(M.position).setValue(compPt);
    try { if (label) lay.label = label; } catch (e) {}
    return lay;
  }

  function bind(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select a layer that has Puppet pins.');
    var t0 = comp.time;
    var style = args.style === 'null' ? 'null' : 'dot';
    var size = args.size != null ? Math.max(4, args.size) : 28;
    var label = args.label != null ? args.label : 9;

    var bound = 0, nulls = 0, skipped = [];
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) { skipped.push(layer.name + ' (camera/light)'); continue; }
      var pup = findPuppet(layer);
      if (!pup) { skipped.push(layer.name + ' (no Puppet pins; place them with the Puppet Tool first)'); continue; }
      var pins = []; collectPins(pup, pins, 0);
      if (!pins.length) { skipped.push(layer.name + ' (no pins found)'); continue; }
      for (var p = 0; p < pins.length; p++) {
        var pinPos = pins[p];
        var compPt = layerToComp(pinPos.valueAtTime(t0, false), layer, t0);
        var ctrl = makeController(comp, style, size, label, layer.name + ' Pin ' + (p + 1), compPt);
        nulls++;
        var expr = 'L = thisComp.layer("' + escapeName(ctrl.name) + '");\nL.toWorld(L.anchorPoint);';
        if (rig.setExpression(pinPos, expr)) bound++;
      }
    }
    if (!nulls) throw new Error('No Puppet pins to bind. ' + (skipped.length ? skipped.join('; ') : ''));
    return { bound: bound, nulls: nulls, skipped: skipped };
  }

  function unbind() {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select the rigged layer(s).');
    var cleared = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
      var pup = findPuppet(layer);
      if (!pup) continue;
      var pins = []; collectPins(pup, pins, 0);
      for (var p = 0; p < pins.length; p++) if (rig.clearExpression(pins[p])) cleared++;
    }
    return { cleared: cleared };
  }

  function slider(args) {
    var comp = util.activeComp();
    var layers = comp.selectedLayers;
    if (!layers.length) throw new Error('Select a layer to add the control to.');
    var name = (args.name != null && ('' + args.name).length) ? ('' + args.name) : 'Control';
    var value = args.value != null ? args.value : 0;
    var added = 0;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
      rig.ensureSlider(layer, name, value);
      added++;
    }
    return { added: added, name: name };
  }

  // Link the selected 1D properties to a Slider on their own layer (one slider
  // drives many properties). Multi-dimensional properties are skipped.
  function link(args) {
    var comp = util.activeComp();
    var props = comp.selectedProperties;
    var name = (args.name != null && ('' + args.name).length) ? ('' + args.name) : 'Control';
    var linked = 0, skipped = [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!(p instanceof Property) || !p.canSetExpression) continue;
      if (util.dimensionsOf(p) !== 1) { skipped.push(p.name + ' (needs a 1D property)'); continue; }
      var expr = 'effect("' + escapeName(name) + '")("Slider");';
      if (rig.setExpression(p, expr)) linked++;
      else skipped.push(p.name + ' (has an expression)');
    }
    if (!linked && !skipped.length) throw new Error('Select one or more 1D properties (Rotation, Opacity, a Slider) to link.');
    return { linked: linked, skipped: skipped };
  }

  R.register('pins.bind', bind, 'Rebound: Bind Pins');
  R.register('pins.unbind', unbind, 'Rebound: Unbind Pins');
  R.register('pins.slider', slider, 'Rebound: Add Slider');
  R.register('pins.link', link, 'Rebound: Link to Slider');
})();
