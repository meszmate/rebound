/*
 * Rebound, Text Break tool.
 * Splits a text layer into separate text layers per line, word, or character,
 * leaving the pieces stacked at the source position for the user to reposition.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var SAMPLE = [['MOVE'], ['IT', 'FAST']];
  function chip(x, y, w, t) {
    return svg('g', null, [
      svg('rect', { x: x.toFixed(1), y: y, width: w.toFixed(1), height: 18, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }),
      svg('text', { x: (x + w / 2).toFixed(1), y: y + 13, 'font-size': 9, 'font-weight': 700, 'text-anchor': 'middle', fill: '#fff' }, [t])
    ]);
  }
  // The sample text split into chips the way the chosen mode would split it.
  function tbSvg(mode, h) {
    var W = 160, H = 76, pad = 10;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    var y = pad + 4;
    SAMPLE.forEach(function (words) {
      var x = pad + 4;
      if (mode === 'lines') {
        var text = words.join(' '); kids.push(chip(x, y, text.length * 8 + 10, text));
      } else if (mode === 'characters') {
        words.forEach(function (wd) { for (var c = 0; c < wd.length; c++) { kids.push(chip(x, y, 13, wd.charAt(c))); x += 16; } x += 6; });
      } else {
        words.forEach(function (wd) { var w = wd.length * 8 + 8; kids.push(chip(x, y, w, wd)); x += w + 5; });
      }
      y += 26;
    });
    return svg('svg', { viewBox: '0 0 160 76', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'textbreak',
    title: 'Text Break',
    group: 'Shapes',
    order: 3,
    keywords: ['text', 'break', 'split', 'lines', 'words', 'characters', 'letters', 'explode'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'lines';
    var deleteOriginal = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(tbSvg(mode, 76)); }

    var modeCtl = ui.segmented([
      { value: 'lines', label: 'Lines', title: 'One layer per line of text' },
      { value: 'words', label: 'Words', title: 'One layer per word' },
      { value: 'characters', label: 'Characters', title: 'One layer per non-space character' }
    ], { value: mode, onChange: function (v) { mode = v; renderPreview(); } });

    var deleteToggle = ui.toggle({
      label: 'Delete original',
      value: deleteOriginal,
      onChange: function (v) { deleteOriginal = v; }
    });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Splits each selected text layer into separate text layers. New layers stay stacked at the source position for you to reposition.' }),
      previewHost,
      ui.row('Mode', modeCtl.el),
      deleteToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('textbreak.apply', { mode: mode, deleteOriginal: deleteOriginal })
        .then(function (res) {
          if (!res.created) {
            ctx.toast('No text layers to break', { kind: 'error' });
            return;
          }
          var msg = 'Broke into ' + res.created + ' layer' + (res.created === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) {
            msg += ' · skipped ' + res.skipped.length + ' non-text layer' + (res.skipped.length === 1 ? '' : 's');
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not break text', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select text layers to break';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});