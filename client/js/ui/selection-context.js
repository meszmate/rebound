/*
 * Rebound, selection context classifier.
 * Turns a selection summary (from system.selectionSummary) into one context
 * type id, most specific wins: keyframes over a property, a property over its
 * layer, a single layer by its kind, then multi-same / multi-mixed, then none.
 * Pure and synchronous so the shell can call it on every selection change.
 */
;(function (R) {
  'use strict';

  function segmentProps(props) {
    var out = [];
    for (var i = 0; i < props.length; i++) {
      if ((props[i].selectedKeys || []).length >= 2) out.push(props[i]);
    }
    return out;
  }

  function allSame(arr) {
    if (!arr.length) return false;
    for (var i = 1; i < arr.length; i++) if (arr[i] !== arr[0]) return false;
    return true;
  }

  // Returns a context id string. Layer single-selection ids are 'layer-<kind>'.
  function classify(sel) {
    if (!sel || !sel.hasComp) return 'none';

    var props = sel.properties || [];
    var segs = segmentProps(props);

    // Keyframes are the most specific and the core easing job.
    if (segs.length === 1) return 'keyframes-segment';
    if (segs.length > 1) return 'keyframes-multi';
    if ((sel.totalSelectedKeys || 0) === 1) return 'single-keyframe';
    if ((sel.totalSelectedKeys || 0) >= 2) return 'keyframes-multi';

    // A property selected with no keyframes yet.
    if (props.length >= 1) {
      for (var i = 0; i < props.length; i++) {
        if (props[i].canVaryOverTime) return 'property-no-keys';
      }
    }

    var n = sel.selectedLayerCount || 0;
    if (n === 1) return 'layer-' + (sel.layerKind || 'av');
    if (n >= 2) return allSame(sel.layerKinds || []) ? 'multi-same' : 'multi-mixed';
    return 'none';
  }

  // The first selected property that carries a usable segment ease, or null.
  function segmentProperty(sel) {
    var props = (sel && sel.properties) || [];
    for (var i = 0; i < props.length; i++) {
      if ((props[i].selectedKeys || []).length >= 2 && props[i].currentEase) return props[i];
    }
    return null;
  }

  R.selectionContext = {
    classify: classify,
    segmentProperty: segmentProperty
  };
})(window.Rebound = window.Rebound || {});
