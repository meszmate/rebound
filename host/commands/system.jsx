/*
 * Rebound host, system commands.
 * Connectivity, host environment, and a structured summary of the current
 * selection that the panel's reactive store reads from.
 */
(function () {
  var R = $.__rebound;
  var util = R.util;

  R.register('system.ping', function () {
    return { pong: true, version: R.version, time: (new Date()).getTime() };
  });

  R.register('system.env', function () {
    return {
      appName: app.appName,
      appVersion: app.version,
      buildName: app.buildName,
      language: app.isoLanguage,
      hostVersion: app.version,
      projectPath: app.project && app.project.file ? app.project.file.fsName : null
    };
  });

  // A compact, panel-friendly snapshot of what is selected right now.
  R.register('system.selectionSummary', function () {
    var out = {
      hasComp: false,
      compName: null,
      frameRate: 0,
      duration: 0,
      time: 0,
      selectedLayerCount: 0,
      totalSelectedKeys: 0,
      properties: []
    };

    var item = app.project ? app.project.activeItem : null;
    if (!util.isComp(item)) {
      return out;
    }

    out.hasComp = true;
    out.compName = item.name;
    out.frameRate = item.frameRate;
    out.duration = item.duration;
    out.time = item.time;
    out.selectedLayerCount = item.selectedLayers.length;

    var props = item.selectedProperties;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      // Skip property groups; we only summarise leaf, keyframable properties.
      if (!(p instanceof Property)) {
        continue;
      }
      if (p.propertyValueType === PropertyValueType.NO_VALUE) {
        continue;
      }

      var layer = util.layerOfProperty(p);
      var selKeys = p.selectedKeys; // array of 1-based key indices
      out.totalSelectedKeys += selKeys.length;

      out.properties.push({
        layerIndex: layer.index,
        layerName: layer.name,
        matchName: p.matchName,
        name: p.name,
        canVaryOverTime: p.canVaryOverTime,
        isTimeVarying: p.isTimeVarying,
        numKeys: p.numKeys,
        selectedKeys: selKeys,
        dimensions: util.dimensionsOf(p),
        isSpatial: util.isSpatial(p),
        hasExpression: p.canSetExpression ? p.expressionEnabled : false,
        dimensionsSeparated: p.dimensionsSeparated === true
      });
    }

    return out;
  });
})();
