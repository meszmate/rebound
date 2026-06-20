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
  var ui = R.ui;

  // Eight swatches mapping to After Effects label indices 1..8. Colors are for
  // the panel preview only; the host applies the index, so AE owns the truth.
  var LABELS = [
    { index: 1, color: '#d96a6a', title: 'Red' },
    { index: 2, color: '#e0b34d', title: 'Yellow' },
    { index: 3, color: '#9ad0e6', title: 'Aqua' },
    { index: 4, color: '#e3a9d6', title: 'Pink' },
    { index: 5, color: '#b8a9e0', title: 'Lavender' },
    { index: 6, color: '#e0c2a3', title: 'Peach' },
    { index: 7, color: '#a9d6c4', title: 'Sea Foam' },
    { index: 8, color: '#7d9ad6', title: 'Blue' }
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

    var input = el('input', {
      type: 'text',
      value: '',
      placeholder: 'tag-name',
      'aria-label': 'Tag name',
      oninput: function () { tag = input.value; }
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
    }

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Tags layers with a reusable name kept in the project. Stamp a tag onto the selected layers, then select everything that carries it.' }),
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