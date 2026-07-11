/*
 * Rebound, Text Break tool.
 * Splits a text layer into separate text layers per line, word, character, or a
 * custom set of pieces you choose. Each piece keeps its EXACT original position
 * (the broken text looks identical), and is an independent, animatable layer.
 * Box (paragraph) text is supported in Lines mode (the host detects the visual
 * wrap lines); other modes skip it because a lone piece would re-justify inside
 * the box. The host leaves the created pieces selected, so a follow-up Stagger
 * or Sequence acts on them immediately.
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
  // The sample text split into chips the way the chosen mode would split it. In
  // every mode the chips stay where the letters were, the way the real break
  // keeps each piece in place.
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
      } else { // words + custom
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
    // One-click Home tile: the tool's primary apply with its defaults; the
    // per-tile customizer can retarget the mode (words/characters/lines).
    quick: {
      desc: 'Break the selected text layer into per-word layers (positions kept).',
      method: 'textbreak.apply',
      args: { mode: 'words', deleteOriginal: false, position: true },
      config: [{ arg: 'mode', label: 'Break into', type: 'select', options: [
        { value: 'words', label: 'Words' },
        { value: 'characters', label: 'Characters' },
        { value: 'lines', label: 'Lines' }
      ] }]
    },
    keywords: ['text', 'break', 'split', 'lines', 'words', 'characters', 'letters', 'explode', 'custom', 'kinetic'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'words';
    var deleteOriginal = false;
    var keepPositions = true;
    var loaded = false; // whether the custom field has been filled from selection

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(tbSvg(mode, 76)); }

    var modeCtl = ui.segmented([
      { value: 'lines', label: 'Lines', title: 'One layer per line of text' },
      { value: 'words', label: 'Words', title: 'One layer per word' },
      { value: 'characters', label: 'Characters', title: 'One layer per non-space character' },
      { value: 'custom', label: 'Custom', title: 'Choose where to cut with the | marker' }
    ], { value: mode, onChange: function (v) { mode = v; syncMode(); renderPreview(); } });

    // Custom: an editable copy of the layer's text where you insert "|" to pick
    // exactly where the cuts go (e.g. "Hello World|Foo" keeps the first two words
    // together and splits off the third).
    var customField = el('textarea', { spellcheck: 'false', placeholder: 'Load the selected text, then put | where you want each cut.', style: {
      width: '100%', minHeight: '54px', resize: 'vertical', boxSizing: 'border-box',
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '12px', lineHeight: '1.4',
      color: 'var(--rb-text)', background: 'var(--rb-bg-sunken)', border: '1px solid var(--rb-border)',
      borderRadius: 'var(--rb-radius-2)', padding: '6px' } });
    var loadBtn = el('button.rb-btn', { onclick: loadText }, ['Load selected text']);
    var customBox = el('div.rb-col.rb-hidden', { style: { gap: '6px' } }, [
      el('div.rb-faint', { text: 'Insert | where you want a cut. Keep the words themselves unchanged so each piece keeps its exact position.' }),
      customField,
      el('div.rb-row', null, [loadBtn])
    ]);

    function syncMode() {
      customBox.classList.toggle('rb-hidden', mode !== 'custom');
      if (mode === 'custom' && !loaded) loadText();
    }

    function loadText() {
      ctx.invoke('textbreak.read', {})
        .then(function (res) {
          var texts = (res && res.texts) || [];
          if (!texts.length) { ctx.toast('Select a text layer first', { kind: 'info' }); return; }
          customField.value = texts[0].text;
          loaded = true;
        })
        .catch(function () {});
    }

    var deleteToggle = ui.toggle({ label: 'Delete original', value: deleteOriginal,
      onChange: function (v) { deleteOriginal = v; } });
    var posToggle = ui.toggle({ label: 'Keep exact positions', value: keepPositions,
      onChange: function (v) { keepPositions = v; } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Splits each selected text layer into separate, animatable layers. With "Keep exact positions" on, every piece stays exactly where it was, so the result looks identical to the original. Box (paragraph) text splits by its visual wrap lines in Lines mode; Words, Characters, and Custom skip it, since a lone piece would re-justify inside the box.' }),
      previewHost,
      ui.row('Mode', modeCtl.el),
      customBox,
      posToggle.el,
      deleteToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function canApply(sel) { return !!(sel && sel.hasComp && sel.selectedLayerCount); }
    function sync(sel) {
      scopeText.textContent = describe(sel);
      applyBtn.disabled = !canApply(sel);
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function doApply() {
      var args = { mode: mode, deleteOriginal: deleteOriginal, position: keepPositions };
      if (mode === 'custom') {
        var raw = customField.value || '';
        if (raw.indexOf('|') === -1) { ctx.toast('Add | marks where you want to cut', { kind: 'error' }); return; }
        args.pieces = raw.split('|');
      }
      ctx.invoke('textbreak.apply', args)
        .then(function (res) {
          var skips = (res.skipped && res.skipped.length) ? res.skipped : null;
          if (!res.created) {
            if (skips) {
              ctx.toast('Nothing broken · skipped ' + skips.join(', '), { kind: 'info' });
            } else {
              ctx.toast('No text layers to break', { kind: 'error' });
            }
            return;
          }
          // The host selected every created piece, so the next tool (Stagger,
          // Sequence) acts on them with no extra clicking.
          var n = res.selected != null ? res.selected : res.created;
          var msg = n + ' piece' + (n === 1 ? '' : 's') + ' selected · ready to stagger';
          if (skips) {
            msg += ' · skipped ' + skips.join(', ');
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
