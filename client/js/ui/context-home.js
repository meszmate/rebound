/*
 * Rebound, Context Home.
 * A calm landing surface that reacts to the selection: a readout band showing
 * what is currently applied (the live ease curve on selected keyframes, a type
 * pill and quiet badges for layers), and one row of ranked, one-click actions
 * for that specific selection. Stays state-first and never bluffs: mixed and
 * empty selections are shown honestly, not faked.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  // Ranked tool ids per context type (real tool ids). Layer kinds without an
  // explicit entry fall back to the generic av-layer set.
  var ACTIONS = {
    'keyframes-segment': ['ease', 'velocity', 'smooth', 'copyease'],
    'keyframes-multi': ['ease', 'smooth', 'keys', 'bake'],
    'single-keyframe': ['velocity', 'keys', 'copyease', 'ease'],
    'property-no-keys': ['keys', 'ease', 'spring', 'separate'],
    'layer-shape': ['color', 'stroke', 'trimpaths', 'break'],
    'layer-text': ['textbreak', 'color', 'motion', 'stagger'],
    'layer-null': ['link', 'nullify', 'anchor', 'drift'],
    'layer-adjustment': ['color', 'vignette', 'echo', 'anchor'],
    'layer-camera': ['motion', 'drift', 'follow', 'keys'],
    'layer-light': ['motion', 'drift', 'follow', 'keys'],
    'layer-av': ['anchor', 'motion', 'drift', 'echo'],
    'multi-same': ['align', 'stagger', 'sequence', 'arrange'],
    'multi-mixed': ['align', 'arrange', 'stagger', 'link']
  };

  var KIND_LABEL = {
    shape: 'Shape', text: 'Text', solid: 'Solid', 'null': 'Null',
    adjustment: 'Adjustment', camera: 'Camera', light: 'Light',
    precomp: 'Precomp', footage: 'Footage', still: 'Still', audio: 'Audio', av: 'Layer'
  };

  function actionsFor(typeId) {
    if (ACTIONS[typeId]) return ACTIONS[typeId];
    if (typeId.indexOf('layer-') === 0) return ACTIONS['layer-av'];
    return [];
  }

  function badge(text) { return el('span.rb-ctx-badge', { text: text }); }
  function pill(text) { return el('span.rb-ctx-pill', { text: text }); }

  function swatch(rgb) {
    var s = el('span.rb-ctx-swatch');
    if (rgb && rgb.length >= 3) {
      s.style.background = 'rgb(' + Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255) + ')';
    }
    return s;
  }

  function pct(v) { return Math.round(v) + '%'; }

  function layerBadges(layer) {
    var out = [];
    if (layer.hasParent && layer.parentName) out.push(badge('parent ' + layer.parentName));
    if (layer.effectCount) out.push(badge(layer.effectCount + ' fx'));
    if (layer.transformHasExpression) out.push(badge('expr'));
    if (layer.isGuide) out.push(badge('guide'));
    if (layer.threeD) out.push(badge('3D'));
    return out;
  }

  function kids(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) if (arr[i]) out.push(arr[i]);
    return out;
  }

  // A non-curve readout block (a pill plus optional sub line and badges).
  function plain(title, sub, extras) {
    return el('div.rb-ctx-plain', null, kids([
      pill(title),
      sub ? el('div.rb-ctx-sub', { text: sub }) : null
    ].concat(extras || [])));
  }

  function keyframeReadout(sel) {
    var prop = R.selectionContext.segmentProperty(sel) || (sel.properties && sel.properties[0]);
    var ce = prop && prop.currentEase;
    var path = prop ? (prop.layerName + ' › ' + prop.name) : '';
    var hold = prop && (prop.interpInType === 'HOLD' || prop.interpOutType === 'HOLD');
    var linear = prop && prop.interpInType === 'LINEAR' && prop.interpOutType === 'LINEAR';

    var chipEl, name, sub;
    if (!ce) {
      chipEl = R.ui.flatChip();
      name = 'No ease'; sub = '';
    } else if (hold) {
      chipEl = R.ui.curveChip(ce.curve, { dashed: true, dim: true });
      name = 'Hold'; sub = '';
    } else if (linear) {
      chipEl = R.ui.curveChip(ce.curve, { dashed: true });
      name = 'Linear'; sub = 'In ' + pct(ce.inInfluence) + ' · Out ' + pct(ce.outInfluence);
    } else {
      chipEl = R.ui.curveChip(ce.curve);
      name = R.ui.curveName(ce.curve);
      sub = 'In ' + pct(ce.inInfluence) + ' · Out ' + pct(ce.outInfluence);
    }

    return el('div.rb-ctx-row', null, [
      el('div.rb-ctx-curve', null, [chipEl]),
      el('div.rb-ctx-meta', null, kids([
        el('div.rb-ctx-name', { text: name }),
        sub ? el('div.rb-ctx-sub', { text: sub }) : null,
        path ? el('div.rb-ctx-path', { text: path }) : null
      ]))
    ]);
  }

  function layerReadout(sel) {
    var L = (sel.layers && sel.layers[0]) || {};
    var kind = sel.layerKind || 'av';
    var label = KIND_LABEL[kind] || 'Layer';
    var meta = [pill(label)];
    var ks = L.kindState || {};
    if (kind === 'solid' && ks.color) meta.push(swatch(ks.color));
    if (kind === 'shape') {
      if (ks.hasFill) meta.push(badge('fill'));
      if (ks.hasStroke) meta.push(badge('stroke'));
    }
    if (kind === 'light' && ks.lightType) meta.push(badge(ks.lightType));
    if (kind === 'text' && ks.animated) meta.push(badge('animators'));
    meta = meta.concat(layerBadges(L));

    return el('div.rb-ctx-plain', null, kids([
      L.name ? el('div.rb-ctx-name', { text: L.name }) : null,
      el('div.rb-ctx-badges', null, meta)
    ]));
  }

  function renderReadout(typeId, sel) {
    if (typeId === 'keyframes-segment') return keyframeReadout(sel);

    if (typeId === 'keyframes-multi') {
      var props = sel.properties || [];
      var keyed = 0, expr = false;
      for (var i = 0; i < props.length; i++) {
        if ((props[i].selectedKeys || []).length) keyed++;
        if (props[i].hasExpression) expr = true;
      }
      return plain('Mixed easing',
        sel.totalSelectedKeys + ' keys · ' + keyed + ' propert' + (keyed === 1 ? 'y' : 'ies'),
        expr ? [badge('expr')] : []);
    }

    if (typeId === 'single-keyframe') {
      var p0 = sel.properties && sel.properties[0];
      return plain('Single keyframe', p0 ? (p0.layerName + ' › ' + p0.name) : '');
    }

    if (typeId === 'property-no-keys') {
      var pp = sel.properties && sel.properties[0];
      var ex = [];
      if (pp && pp.hasExpression) ex.push(badge('expr'));
      if (pp && pp.dimensionsSeparated) ex.push(badge('separated'));
      return plain('Not animated', pp ? (pp.layerName + ' › ' + pp.name) : '', ex);
    }

    if (typeId.indexOf('layer-') === 0) return layerReadout(sel);

    if (typeId === 'multi-same') {
      var kind = (sel.layerKinds && sel.layerKinds[0]) || 'av';
      var label = (KIND_LABEL[kind] || 'Layer').toLowerCase();
      return el('div.rb-ctx-plain', null, [
        el('div.rb-ctx-name', { text: sel.selectedLayerCount + ' ' + label + (sel.selectedLayerCount === 1 ? '' : 's') })
      ]);
    }

    if (typeId === 'multi-mixed') {
      var tally = {};
      (sel.layerKinds || []).forEach(function (k) { tally[k] = (tally[k] || 0) + 1; });
      var parts = [];
      for (var k in tally) {
        if (tally.hasOwnProperty(k)) parts.push(tally[k] + ' ' + k);
      }
      return el('div.rb-ctx-plain', null, kids([
        el('div.rb-ctx-name', { text: sel.selectedLayerCount + ' layers · mixed' }),
        parts.length ? el('div.rb-ctx-sub', { text: parts.join(' · ') }) : null
      ]));
    }

    // none
    var msg = (sel && sel.hasComp) ? 'Nothing selected' : 'No composition open';
    return el('div.rb-ctx-empty', { text: msg });
  }

  // Create the Context Home region. A single, compact readout that reflects the
  // selection (the live ease on keyframes, a quiet line for layers) and nothing
  // more: no tool suggestions, kept deliberately small. opts.openTool is accepted
  // for API compatibility but unused.
  function create(opts) {
    var bandBody = el('div.rb-ctx-readout');
    var root = el('div.rb-ctxhome.is-compact', null, [
      el('div.rb-ctx-band', null, [bandBody])
    ]);
    var lastType = null;

    function update(sel) {
      var typeId = R.selectionContext.classify(sel);

      R.dom.clear(bandBody);
      bandBody.appendChild(renderReadout(typeId, sel));

      root.classList.toggle('is-empty', typeId === 'none');
      // A gentle fade only when the context actually changed.
      if (typeId !== lastType) {
        root.classList.remove('rb-ctx-enter');
        void root.offsetWidth;
        root.classList.add('rb-ctx-enter');
        lastType = typeId;
      }
    }

    return { el: root, update: update };
  }

  R.contextHome = { create: create };
})(window.Rebound = window.Rebound || {});
