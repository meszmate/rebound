/*
 * Rebound, Nullify tool.
 * Drops a control null at the selection and (optionally) parents the selected
 * layers to it, so one handle drives the whole group. The null lands at the
 * anchor average, the centre of the combined bounding boxes, or the first
 * layer's anchor; or switch to one null per layer, each named '<layer> Ctrl'.
 * Names auto-increment on the host so repeated applies never pile up
 * duplicates.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var LAYERS = [[44, 32], [98, 28], [70, 66]];

  function crosshair(kids, x, y, r) {
    kids.push(svg('rect', { x: (x - r * 0.64).toFixed(1), y: (y - r * 0.64).toFixed(1), width: (r * 1.28).toFixed(1), height: (r * 1.28).toFixed(1), fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }));
    kids.push(svg('line', { x1: (x - r).toFixed(1), y1: y.toFixed(1), x2: (x + r).toFixed(1), y2: y.toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
    kids.push(svg('line', { x1: x.toFixed(1), y1: (y - r).toFixed(1), x2: x.toFixed(1), y2: (y + r).toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
  }

  // Layer rects plus null crosshairs. One shared null sits at the anchor
  // average, the bounds centre, or the first layer; per-layer mode puts a
  // crosshair on every layer. When Parent is on, connectors run to the null.
  function nullifySvg(state, h) {
    var W = 160, H = 100;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    var i, l;

    if (state.mode === 'each') {
      // One control per layer: the crosshair sits right on each layer.
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        kids.push(svg('rect', { x: l[0] - 16, y: l[1] - 9, width: 32, height: 18, rx: 2, fill: 'var(--rb-text-faint)', 'fill-opacity': '0.55' }));
      }
      for (i = 0; i < LAYERS.length; i++) crosshair(kids, LAYERS[i][0], LAYERS[i][1], 8);
      return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
    }

    var np;
    if (state.position === 'first') {
      np = LAYERS[0];
    } else if (state.position === 'bounds') {
      // Middle of the union of the layer boxes (rects are 32x18 around each point).
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (i = 0; i < LAYERS.length; i++) {
        l = LAYERS[i];
        if (l[0] - 16 < minX) minX = l[0] - 16;
        if (l[1] - 9 < minY) minY = l[1] - 9;
        if (l[0] + 16 > maxX) maxX = l[0] + 16;
        if (l[1] + 9 > maxY) maxY = l[1] + 9;
      }
      np = [(minX + maxX) / 2, (minY + maxY) / 2];
    } else {
      var sx = 0, sy = 0;
      for (i = 0; i < LAYERS.length; i++) { sx += LAYERS[i][0]; sy += LAYERS[i][1]; }
      np = [sx / LAYERS.length, sy / LAYERS.length];
    }
    if (state.parent) {
      LAYERS.forEach(function (p) { kids.push(svg('line', { x1: p[0], y1: p[1], x2: np[0].toFixed(1), y2: np[1].toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1, opacity: '0.5' })); });
    }
    LAYERS.forEach(function (p) { kids.push(svg('rect', { x: p[0] - 16, y: p[1] - 9, width: 32, height: 18, rx: 2, fill: 'var(--rb-text-faint)', 'fill-opacity': '0.55' })); });
    crosshair(kids, np[0], np[1], 11);
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'nullify',
    title: 'Nullify',
    group: 'Transform',
    order: 2,
    keywords: ['null', 'nullify', 'control', 'parent', 'rig', 'handle', 'group', 'bounds', 'per layer'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'one';
    var position = 'center';
    var parent = true;
    var name = '';

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(nullifySvg({ mode: mode, position: position, parent: parent }, 100)); }

    var modeCtl = ui.segmented([
      { value: 'one', label: 'One null', title: 'A single control null for the whole selection' },
      { value: 'each', label: 'Per layer', title: 'One control null per selected layer, named after it and colour-matched' }
    ], { value: mode, onChange: function (v) { mode = v; syncMode(); renderPreview(); } });

    var positionCtl = ui.segmented([
      { value: 'center', label: 'Anchor average', title: 'Place the null at the average of the selected layer anchors' },
      { value: 'bounds', label: 'Bounds center', title: 'Place the null at the middle of the combined bounding boxes (the visual centre)' },
      { value: 'first', label: 'First layer', title: 'Place the null at the first selected layer' }
    ], { value: position, onChange: function (v) { position = v; renderPreview(); } });

    var parentToggle = ui.toggle({ label: 'Parent layers', value: parent,
      onChange: function (v) { parent = v; renderPreview(); } });

    var nameInput = el('input', {
      type: 'text',
      value: name,
      placeholder: 'Control',
      'aria-label': 'Null name',
      oninput: function () { name = this.value; }
    });
    var nameField = el('div.rb-field', null, [nameInput]);
    var positionRow = ui.row('Position', positionCtl.el);
    var nameRow = ui.row('Name', nameField);

    function syncMode() {
      // Per-layer nulls are placed on and named after their layer, so the
      // shared placement and name controls only apply to the single null.
      var each = mode === 'each';
      nameInput.disabled = each;
      nameInput.placeholder = each ? '<layer> Ctrl' : 'Control';
      positionRow.style.opacity = each ? '0.45' : '';
      positionRow.style.pointerEvents = each ? 'none' : '';
    }

    renderPreview();
    syncMode();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Creates a control null at the selection so one handle can drive every selected layer. Repeated applies auto-increment the name instead of stacking duplicates.' }),
      previewHost,
      ui.row('Mode', modeCtl.el),
      positionRow,
      nameRow,
      parentToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function syncEnabled(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.selectedLayerCount);
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); syncEnabled(sel); });
    scopeText.textContent = describe(ctx.getSelection());
    syncEnabled(ctx.getSelection());

    function doApply() {
      ctx.invoke('nullify.apply', {
        mode: mode === 'each' ? 'each' : 'one',
        position: position,
        parent: parent,
        name: name
      })
        .then(function (res) {
          res = res || {};
          var msg;
          if (mode === 'each') {
            msg = 'Created ' + res.created + ' control null' + (res.created === 1 ? '' : 's');
            if (parent) msg += ', each layer parented to its own';
          } else if (parent) {
            msg = 'Parented ' + res.parented + ' layer' + (res.parented === 1 ? '' : 's') + ' to a null';
          } else {
            msg = 'Created a control null';
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not create null', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to nullify';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
