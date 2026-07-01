/*
 * Rebound shared, IR validation.
 *
 * A targeted validator (not a general JSON Schema engine) so it stays small and
 * fast enough to run in the ExtendScript host as well as the panel, Node, and
 * the Figma sandbox. It checks the invariants the importer relies on and, just
 * as importantly, separates hard errors (cannot build) from warnings (will
 * build with reduced fidelity) so the UI can surface them honestly.
 *
 * validate(ir) -> { valid, errors:[...], warnings:[...], counts:{...} }
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.ReboundValidate = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUPPORTED_MAJOR = 1;

  var NODE_TYPES = {
    FRAME: 1, GROUP: 1, RECTANGLE: 1, ELLIPSE: 1, POLYGON: 1, STAR: 1,
    LINE: 1, VECTOR: 1, TEXT: 1, BOOLEAN: 1, IMAGE: 1, ADJUSTMENT: 1
  };

  var SOURCE_APPS = {
    figma: 1, illustrator: 1, sketch: 1, xd: 1, photoshop: 1, svg: 1
  };

  function isArray(x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  }
  function isObject(x) {
    return x && typeof x === 'object' && !isArray(x);
  }

  // Parse "1.2.3" -> { major, minor, patch } or null.
  function parseVersion(v) {
    if (typeof v !== 'string') return null;
    var m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return null;
    return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
  }

  function checkVersion(irVersion) {
    var parsed = parseVersion(irVersion);
    if (!parsed) return { ok: false, reason: 'missing-or-malformed' };
    if (parsed.major !== SUPPORTED_MAJOR) return { ok: false, reason: 'major-mismatch', major: parsed.major };
    return { ok: true, version: parsed };
  }

  function validate(ir) {
    var errors = [];
    var warnings = [];
    var counts = { frames: 0, nodes: 0, text: 0, images: 0, gradients: 0 };

    if (!isObject(ir)) {
      return { valid: false, errors: ['IR is not an object.'], warnings: warnings, counts: counts };
    }

    var ver = checkVersion(ir.irVersion);
    if (!ver.ok) {
      if (ver.reason === 'major-mismatch') {
        errors.push('IR version ' + ir.irVersion + ' is not supported by this importer (needs ' + SUPPORTED_MAJOR + '.x). Update Rebound or the exporter.');
      } else {
        errors.push('Missing or malformed irVersion.');
      }
    }

    if (!isObject(ir.source)) {
      errors.push('Missing source.');
    } else if (!ir.source.app) {
      errors.push('Missing source.app.');
    } else if (!SOURCE_APPS[ir.source.app]) {
      warnings.push('Unknown source app "' + ir.source.app + '"; importing anyway.');
    }

    if (!isObject(ir.document)) {
      errors.push('Missing document.');
      return { valid: errors.length === 0, errors: errors, warnings: warnings, counts: counts };
    }
    if (!isArray(ir.document.frames)) {
      errors.push('document.frames must be an array.');
      return { valid: errors.length === 0, errors: errors, warnings: warnings, counts: counts };
    }
    if (ir.document.frames.length === 0) {
      warnings.push('No frames to import (empty selection?).');
    }

    var assets = isObject(ir.document.assets) ? ir.document.assets : {};

    for (var f = 0; f < ir.document.frames.length; f++) {
      var frame = ir.document.frames[f];
      counts.frames++;
      var label = 'frame[' + f + ']' + (frame && frame.name ? ' "' + frame.name + '"' : '');
      if (!isObject(frame)) { errors.push(label + ' is not an object.'); continue; }
      if (typeof frame.width !== 'number' || typeof frame.height !== 'number') {
        errors.push(label + ' is missing a numeric width/height.');
      }
      if (!isArray(frame.children)) {
        errors.push(label + ' is missing a children array.');
        continue;
      }
      validateNodes(frame.children, label, errors, warnings, counts, assets);
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings, counts: counts };
  }

  function validateNodes(nodes, parentLabel, errors, warnings, counts, assets) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var label = parentLabel + ' > node[' + i + ']' + (node && node.name ? ' "' + node.name + '"' : '');
      if (!isObject(node)) { errors.push(label + ' is not an object.'); continue; }
      counts.nodes++;
      if (!node.type || !NODE_TYPES[node.type]) {
        warnings.push(label + ' has unsupported type "' + node.type + '"; it will be skipped.');
        continue;
      }
      if (!node.id) warnings.push(label + ' is missing an id.');
      if (typeof node.name !== 'string') warnings.push(label + ' is missing a name.');

      if (node.type === 'TEXT') {
        counts.text++;
        if (!isObject(node.text) || typeof node.text.characters !== 'string') {
          errors.push(label + ' is a TEXT node without text.characters.');
        }
      }
      if (node.type === 'IMAGE') {
        counts.images++;
        if (node.imageHash && !assets[node.imageHash]) {
          warnings.push(label + ' references image "' + node.imageHash + '" not present in document.assets.');
        }
      }
      if (isArray(node.fills)) {
        for (var p = 0; p < node.fills.length; p++) {
          var paint = node.fills[p];
          if (paint && typeof paint.type === 'string' && paint.type.indexOf('GRADIENT') === 0) counts.gradients++;
          if (paint && paint.type === 'IMAGE' && paint.imageHash && !assets[paint.imageHash]) {
            warnings.push(label + ' has an image fill missing from document.assets.');
          }
        }
      }
      if (isArray(node.children) && node.children.length) {
        validateNodes(node.children, label, errors, warnings, counts, assets);
      }
    }
  }

  return {
    SUPPORTED_MAJOR: SUPPORTED_MAJOR,
    NODE_TYPES: NODE_TYPES,
    parseVersion: parseVersion,
    checkVersion: checkVersion,
    validate: validate
  };
});
