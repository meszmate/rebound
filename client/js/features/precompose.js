/*
 * Rebound, Precompose tool.
 * Nests the selected layers into a brand-new composition. Optionally moves all
 * attributes into the new comp and opens it once created.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A few layers gathered into one nested comp. The transform badge (T) sits
  // inside the nested comp when Move all attributes is on, or stays on the outer
  // nested layer when off, so the toggle's effect is visible.
  function precompSvg(state, h) {
    var move = !(state && state.moveAttributes === false);
    var kids = [];
    var i;
    for (i = 0; i < 3; i++) kids.push(svg('rect', { x: 10, y: 16 + i * 16, width: 40, height: 12, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
    kids.push(svg('path', { d: 'M60 40 L80 40', stroke: 'var(--rb-text-muted)', 'stroke-width': 2 }));
    kids.push(svg('path', { d: 'M75 35 L81 40 L75 45', fill: 'none', stroke: 'var(--rb-text-muted)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    kids.push(svg('rect', { x: 92, y: 12, width: 58, height: 56, rx: 3, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }));
    for (i = 0; i < 3; i++) kids.push(svg('rect', { x: 100, y: 20 + i * 14, width: 42, height: 9, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.5' }));
    var bx = move ? 138 : 70, by = move ? 60 : 22;
    kids.push(svg('circle', { cx: bx, cy: by, r: 7, fill: 'var(--rb-accent)' }));
    kids.push(svg('text', { x: bx, y: by + 3, 'font-size': 8, 'text-anchor': 'middle', 'font-weight': 700, fill: '#fff' }, ['T']));
    return svg('svg', { viewBox: '0 0 160 80', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'precompose',
    title: 'Precompose',
    group: 'Layout',
    order: 5,
    keywords: ['precompose', 'precomp', 'nest', 'group', 'composition', 'collapse', 'wrap'],
    mount: mount
  });

  function mount(ctx) {
    var name = 'Precomp';
    var moveAttributes = true;
    var open = false;

    var nameInput = el('input', {
      type: 'text',
      value: name,
      placeholder: 'Precomp',
      'aria-label': 'New composition name',
      oninput: function () { name = this.value; }
    });
    var nameField = el('div.rb-field', null, [nameInput]);

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '8px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(precompSvg({ moveAttributes: moveAttributes }, 80)); }

    var moveToggle = ui.toggle({ label: 'Move all attributes', value: moveAttributes,
      onChange: function (v) { moveAttributes = v; renderPreview(); } });
    var openToggle = ui.toggle({ label: 'Open new comp', value: open,
      onChange: function (v) { open = v; } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Nests the selected layers into a new composition. Move all attributes keeps transforms, masks, and effects on the nested comp.' }),
      previewHost,
      ui.row('Name', nameField),
      moveToggle.el,
      openToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('precompose.apply', { name: name, moveAttributes: moveAttributes, open: open })
        .then(function (res) { ctx.toast('Precomposed into ' + res.name, { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not precompose', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to precompose';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
