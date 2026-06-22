/*
 * Rebound, Tags tool.
 * Marks layers with reusable name tags and selects by them. A tag name plus an
 * optional label color is stamped into each selected layer's comment as a
 * #token; a separate action selects every layer in the comp carrying that
 * token, and Clear strips the tokens back out. Tags ride inside the project.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A mock layer row stamped with the label color and the #tag token.
  function tagsSvg(state, h) {
    var W = 160, H = 56, color = state.color || null;
    var name = (state.tag || '').replace(/^[#\s]+/, '').replace(/\s+$/, '') || 'tag-name';
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('rect', { x: 10, y: 18, width: W - 20, height: 20, rx: 3, fill: 'var(--rb-bg-raised, var(--rb-bg))', stroke: 'var(--rb-border-strong)', 'stroke-width': 1 }));
    kids.push(svg('rect', { x: 14, y: 22, width: 12, height: 12, rx: 2, fill: color || 'var(--rb-text-faint)', 'fill-opacity': color ? '1' : '0.4' }));
    kids.push(svg('text', { x: 32, y: 32, 'font-size': 10, fill: 'var(--rb-text)' }, ['Layer  ']));
    kids.push(svg('text', { x: 72, y: 32, 'font-size': 10, 'font-weight': 700, fill: 'var(--rb-accent)' }, ['#' + name]));
    return svg('svg', { viewBox: '0 0 160 56', width: '100%', height: h }, kids);
  }

  // The sixteen After Effects label indices 1..16. Colors are for the panel
  // preview only; the host applies the index, so AE owns the truth.
  var LABELS = [
    { index: 1, color: '#d96a6a', title: 'Red' },
    { index: 2, color: '#e0b34d', title: 'Yellow' },
    { index: 3, color: '#9ad0e6', title: 'Aqua' },
    { index: 4, color: '#e3a9d6', title: 'Pink' },
    { index: 5, color: '#b8a9e0', title: 'Lavender' },
    { index: 6, color: '#e0c2a3', title: 'Peach' },
    { index: 7, color: '#a9d6c4', title: 'Sea Foam' },
    { index: 8, color: '#7d9ad6', title: 'Blue' },
    { index: 9, color: '#5ea15e', title: 'Green' },
    { index: 10, color: '#8b6fc4', title: 'Purple' },
    { index: 11, color: '#d98a3d', title: 'Orange' },
    { index: 12, color: '#8f6f4f', title: 'Brown' },
    { index: 13, color: '#c94f9c', title: 'Fuchsia' },
    { index: 14, color: '#4aa7b8', title: 'Cyan' },
    { index: 15, color: '#c4ad8a', title: 'Sandstone' },
    { index: 16, color: '#3f6f4f', title: 'Dark Green' }
  ];

  R.tools.register({
    id: 'tags',
    title: 'Tags',
    group: 'Organization',
    order: 0,
    keywords: ['tag', 'tags', 'label', 'color', 'select', 'group', 'organize', 'comment'],
    mount: mount
  });

  function mount(ctx) {
    var tag = '';
    var label = 0;

    // Widget: type a tag name, then click a label colour to stamp that #tag + label
    // onto the selected layers in one go. Select-by-tag and Clear live in the full
    // tool, via the widget's open control.
    if (ctx.widget) {
      var wInput = el('input', { type: 'text', placeholder: 'tag-name', 'aria-label': 'Tag name', value: '',
        oninput: function () { tag = wInput.value; } });
      var wField = el('div.rb-field', null, [el('span.rb-suffix', { text: '#', style: { paddingLeft: '8px', paddingRight: '4px' } }), wInput]);
      var grid = el('div.rb-wgt-pick', { style: { gridTemplateColumns: 'repeat(8, 1fr)', gridAutoRows: '1fr' } });
      LABELS.forEach(function (def) {
        var sw = el('button.rb-wgt-swatch', { type: 'button', title: def.title + ' label', style: { background: def.color } });
        sw.addEventListener('click', function () {
          var name = clean();
          if (!name) { ctx.toast('Enter a tag name', { kind: 'error' }); wInput.focus(); return; }
          ctx.invoke('tags.apply', { tag: name, label: def.index })
            .then(function (res) { ctx.toast('Tagged ' + res.tagged + ' layer' + (res.tagged === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
            .catch(function (err) { ctx.toast(err.message || 'Could not tag', { kind: 'error' }); });
        });
        grid.appendChild(sw);
      });
      ctx.body.appendChild(el('div.rb-wgt', null, [el('div.rb-wgt-pickhead', null, [wField]), grid]));
      return { destroy: function () {} };
    }

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function colorFor(idx) { for (var i = 0; i < LABELS.length; i++) if (LABELS[i].index === idx) return LABELS[i].color; return null; }
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(tagsSvg({ tag: tag, color: colorFor(label) }, 56)); }

    var input = el('input', {
      type: 'text',
      value: '',
      placeholder: 'tag-name',
      'aria-label': 'Tag name',
      oninput: function () { tag = input.value; renderPreview(); }
    });
    var tagField = el('div.rb-field', null, [
      el('span.rb-suffix', { text: '#', style: { paddingLeft: '8px', paddingRight: '4px' } }),
      input
    ]);

    var swatches = {};
    var swatchRow = el('div.rb-row.rb-wrap');
    for (var i = 0; i < LABELS.length; i++) {
      swatchRow.appendChild(makeSwatch(LABELS[i]));
    }

    function makeSwatch(def) {
      var b = el('button.rb-btn.is-icon', { title: def.title + ' label' });
      b.style.background = def.color;
      b.style.borderColor = def.color;
      b.addEventListener('click', function () { setLabel(def.index); });
      swatches[def.index] = b;
      return b;
    }

    function setLabel(index) {
      label = (label === index) ? 0 : index;
      for (var k in swatches) {
        if (swatches.hasOwnProperty(k)) {
          swatches[k].classList.toggle('is-active', Number(k) === label);
        }
      }
      renderPreview();
    }

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Tags layers with a reusable name kept in the project. Stamp a tag onto the selected layers, then select everything that carries it.' }),
      previewHost,
      ui.row('Tag', tagField),
      ui.row('Label', swatchRow),
      el('div.rb-row.rb-wrap', null, [
        el('button.rb-btn', { onclick: doApply }, ['Apply tag']),
        el('button.rb-btn', { onclick: doSelect }, ['Select by tag']),
        el('button.rb-btn.is-ghost', { onclick: doClear }, ['Clear tags'])
      ])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function clean() {
      return ('' + tag).replace(/^[#\s]+/, '').replace(/\s+$/, '');
    }

    function doApply() {
      var name = clean();
      if (!name) { ctx.toast('Enter a tag name', { kind: 'error' }); return; }
      ctx.invoke('tags.apply', { tag: name, label: label })
        .then(function (res) { ctx.toast('Tagged ' + res.tagged + ' layer' + (res.tagged === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not tag', { kind: 'error' }); });
    }

    function doSelect() {
      var name = clean();
      if (!name) { ctx.toast('Enter a tag name', { kind: 'error' }); return; }
      ctx.invoke('tags.select', { tag: name })
        .then(function (res) {
          if (!res.selected) {
            ctx.toast('No layers tagged #' + name, { kind: 'info' });
          } else {
            ctx.toast('Selected ' + res.selected + ' layer' + (res.selected === 1 ? '' : 's'), { kind: 'success' });
          }
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not select', { kind: 'error' }); });
    }

    function doClear() {
      ctx.invoke('tags.clear', {})
        .then(function (res) { ctx.toast('Cleared tags from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not clear tags', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to tag';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});