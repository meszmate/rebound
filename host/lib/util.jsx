/*
 * Rebound host shared utilities.
 *
 * Locale safety: properties are always addressed by matchName (stable across
 * localized After Effects installs), never by display name.
 */
$.__rebound = $.__rebound || {};
$.__rebound.util = (function () {
  // Stable matchNames for the Transform group and common animatable properties.
  var MATCH = {
    transform: 'ADBE Transform Group',
    anchor: 'ADBE Anchor Point',
    position: 'ADBE Position',
    positionX: 'ADBE Position_0',
    positionY: 'ADBE Position_1',
    positionZ: 'ADBE Position_2',
    scale: 'ADBE Scale',
    rotation: 'ADBE Rotate Z',
    rotationX: 'ADBE Rotate X',
    rotationY: 'ADBE Rotate Y',
    orientation: 'ADBE Orientation',
    opacity: 'ADBE Opacity'
  };

  function isComp(item) {
    return item && item instanceof CompItem;
  }

  // Returns the active CompItem or throws a friendly error for the panel.
  function activeComp() {
    var item = app.project ? app.project.activeItem : null;
    if (!item) {
      throw new Error('Open a composition to use this tool.');
    }
    if (!isComp(item)) {
      throw new Error('The active item is not a composition.');
    }
    return item;
  }

  // The Layer that owns a Property (walk to the top of the property tree).
  function layerOfProperty(prop) {
    return prop.propertyGroup(prop.propertyDepth);
  }

  // Number of value components for a property (1/2/3 for scalars/vectors, 4 for color).
  function dimensionsOf(prop) {
    switch (prop.propertyValueType) {
      case PropertyValueType.ThreeD:
      case PropertyValueType.ThreeD_SPATIAL:
        return 3;
      case PropertyValueType.TwoD:
      case PropertyValueType.TwoD_SPATIAL:
        return 2;
      case PropertyValueType.COLOR:
        return 4;
      case PropertyValueType.OneD:
        return 1;
      default:
        return 0;
    }
  }

  function isSpatial(prop) {
    return prop.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
      prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
  }

  // Resolve a property on a layer from an array of matchNames, e.g.
  // ['ADBE Transform Group','ADBE Position'].
  function resolveProperty(layer, path) {
    var prop = layer;
    for (var i = 0; i < path.length; i++) {
      prop = prop.property(path[i]);
      if (!prop) {
        throw new Error('Property not found: ' + path.join(' > '));
      }
    }
    return prop;
  }

  // Find a layer in a comp by its index (1-based, matching AE).
  function layerByIndex(comp, index) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).index === index) {
        return comp.layer(i);
      }
    }
    throw new Error('Layer ' + index + ' not found.');
  }

  // Convert an RGB color from AE's 0..1 floats to a 0..255 triplet.
  function color255(c) {
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
  }

  // Make a keyframe a smooth, hand-editable CONTINUOUS bezier with LONG tangent
  // handles (the buttery feel): bezier interpolation (not auto, so the two
  // handles stay where set and are draggable in the Graph Editor), continuous
  // tangents through the point so the curve flows without a kink, then the
  // handles are lengthened by raising temporal-ease influence on both sides.
  // Keeps AE's continuous-computed speed and only stretches the influence.
  function smoothTemporalKey(prop, ki, influence) {
    influence = influence > 0 ? influence : 80;
    if (influence > 95) influence = 95; // leave headroom so beziers stay valid
    try { prop.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) {}
    try { prop.setTemporalAutoBezierAtKey(ki, false); } catch (e1) {}
    try { prop.setTemporalContinuousAtKey(ki, true); } catch (e2) {}
    try {
      var inE = prop.keyInTemporalEase(ki);
      var outE = prop.keyOutTemporalEase(ki);
      var nin = [];
      var nout = [];
      for (var d = 0; d < inE.length; d++) {
        nin.push(new KeyframeEase(inE[d].speed, influence));
        nout.push(new KeyframeEase(outE[d].speed, influence));
      }
      prop.setTemporalEaseAtKey(ki, nin, nout);
    } catch (e3) {}
  }

  // Remove every layer in the comp whose name matches, so a tool that drops a
  // named helper layer can replace it instead of piling up duplicates. Returns
  // the number removed. Highest index first so indices stay valid.
  function removeLayersNamed(comp, name) {
    var removed = 0;
    for (var i = comp.numLayers; i >= 1; i--) {
      var layer = comp.layer(i);
      if (layer.name === name) {
        layer.remove();
        removed++;
      }
    }
    return removed;
  }

  return {
    MATCH: MATCH,
    isComp: isComp,
    activeComp: activeComp,
    layerOfProperty: layerOfProperty,
    dimensionsOf: dimensionsOf,
    isSpatial: isSpatial,
    resolveProperty: resolveProperty,
    layerByIndex: layerByIndex,
    color255: color255,
    smoothTemporalKey: smoothTemporalKey,
    removeLayersNamed: removeLayersNamed
  };
})();
