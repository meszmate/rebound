/*
 * Rebound, Nullify tool.
 * Drops a control null at the selection and (optionally) parents the selected
 * layers to it, so one handle drives the whole group. The null lands at the
 * selection's center or at the first layer's anchor.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var LAYERS = [[44, 32], [98, 28], [70, 66]];
  // Layer rects plus a null crosshair that sits at the selection center or the
  // first layer; when Parent is on, connectors run from each layer to the null.
  function nullifySvg(state, h) {
    var W = 160, H = 100;
    var np;
    if (state.position === 'first') np = LAYERS[0];
    else {
      var sx = 0, sy = 0;
      for (var i = 0; i < LAYERS.length; i++) { sx += LAYERS[i][0]; sy += LAYERS[i][1]; }
      np = [sx / LAYERS.length, sy / LAYERS.length];
    }
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (state.parent) {
      LAYERS.forEach(function (l) { kids.push(svg('line', { x1: l[0], y1: l[1], x2: np[0].toFixed(1), y2: np[1].toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1, opacity: '0.5' })); });
    }
    LAYERS.forEach(function (l) { kids.push(svg('rect', { x: l[0] - 16, y: l[1] - 9, width: 32, height: 18, rx: 2, fill: 'var(--rb-text-faint)', 'fill-opacity': '0.55' })); });
    kids.push(svg('rect', { x: (np[0] - 7).toFixed(1), y: (np[1] - 7).toFixed(1), width: 14, height: 14, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }));
    kids.push(svg('line', { x1: (np[0] - 11).toFixed(1), y1: np[1].toFixed(1), x2: (np[0] + 11).toFixed(1), y2: np[1].toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
    kids.push(svg('line', { x1: np[0].toFixed(1), y1: (np[1] - 11).toFixed(1), x2: np[0].toFixed(1), y2: (np[1] + 11).toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'nullify',
    title: 'Nullify',
    group: 'Transform',
    order: 2,
    keywords: ['null', 'nullify', 'control', 'parent', 'rig', 'handle', 'group'],
    mount: mount
  });

  function mount(ctx) {
    var position = 'center';
    var parent = true;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(nullifySvg({ position: position, parent: parent }, 100)); }

    var positionCtl = ui.segmented([
      { value: 'center', label: 'Selection center', title: 'Place the null at the average of the selected layers' },
      { value: 'first', label: 'First layer anchor', title: 'Place the null at the first selected layer' }
    ], { value: position, onChange: function (v) { position = v; renderPreview(); } });

    var parentToggle = ui.toggle({ label: 'Parent layers', value: parent,
      onChange: function (v) { parent = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Creates a control null at the selection so one handle can drive every selected layer.' }),
      previewHost,
      ui.row('Position', positionCtl.el),
      parentToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('nullify.apply', { position: position, parent: parent })
        .then(function (res) {
          var msg = parent
            ? 'Parented ' + res.parented + ' layer' + (res.parented === 1 ? '' : 's') + ' to a null'
            : 'Created a control null';
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