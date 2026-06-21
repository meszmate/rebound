/*
 * Rebound, Stroke tool.
 * Adds or updates a stroke on selected shape layers. Pick a width and a color
 * swatch and apply, or remove every stroke. Colors are sent as 0..1 RGB.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var PALETTE = [
    '#f4453a', '#f5910b', '#f7d000', '#54c245',
    '#1fa6e0', '#3a52d6', '#9b3fd6', '#1a1c20'
  ];

  R.tools.register({
    id: 'stroke',
    title: 'Stroke',
    group: 'Color',
    order: 2,
    keywords: ['stroke', 'outline', 'border', 'shape', 'line', 'color', 'width'],
    mount: mount
  });

  function mount(ctx) {
    var width = 4;
    var activeHex = PALETTE[7];
    var rgb = hexToRgb(activeHex);

    var widthField = ui.numberField({ label: 'Width', value: width, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { width = v; } });

    var swatches = [];
    var swatchRow = el('div.rb-row.rb-wrap');
    for (var i = 0; i < PALETTE.length; i++) {
      swatchRow.appendChild(makeSwatch(PALETTE[i]));
    }
    setActive(PALETTE[7]);

    function makeSwatch(hex) {
      var b = el('button.rb-btn.is-icon', { title: 'Stroke ' + hex });
      b.style.background = hex;
      b.style.borderColor = hex;
      b.addEventListener('click', function () { activeHex = hex; rgb = hexToRgb(hex); setActive(hex); });
      swatches.push({ hex: hex, el: b });
      return b;
    }

    function setActive(hex) {
      for (var k = 0; k < swatches.length; k++) {
        swatches[k].el.classList.toggle('is-active', swatches[k].hex === hex);
      }
    }

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds or updates a stroke on selected shape layers. Pick a width and a color, then apply, or remove every stroke.' }),
      widthField.el,
      ui.row('Color', swatchRow),
      el('div.rb-row.rb-wrap', null, [
        el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove stroke'])
      ])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('stroke.apply', { rgb: rgb, width: width })
        .then(function (res) {
          if (!res.stroked) {
            ctx.toast('No shape layers were stroked', { kind: 'info' });
          } else {
            ctx.toast('Stroked ' + res.stroked + ' layer' + (res.stroked === 1 ? '' : 's'), { kind: 'success' });
          }
          if (res.skipped && res.skipped.length) {
            ctx.toast('Skipped ' + res.skipped.length + ' layer' + (res.skipped.length === 1 ? '' : 's'), { kind: 'info' });
          }
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not add stroke', { kind: 'error' }); });
    }

    function doRemove() {
      ctx.invoke('stroke.remove', {})
        .then(function (res) { ctx.toast('Removed ' + res.removed + ' stroke' + (res.removed === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not remove stroke', { kind: 'error' }); });
    }

    function getState() {
      return { width: width, hex: activeHex };
    }
    function applyState(s) {
      if (!s) return;
      if (s.width != null) { width = s.width; widthField.set(s.width); }
      if (s.hex != null) { activeHex = s.hex; rgb = hexToRgb(s.hex); setActive(s.hex); }
    }

    return {
      presets: {
        toolId: 'stroke',
        get: getState,
        set: applyState,
        thumbFor: function (state, opts) {
          var w = Math.max(2, Math.min(16, state.width == null ? 4 : state.width));
          return R.dom.svg('svg', { viewBox: '0 0 120 40', width: '100%', height: (opts && opts.height) || 38 }, [
            R.dom.svg('line', { x1: 12, y1: 20, x2: 108, y2: 20, stroke: state.hex || '#888888', 'stroke-width': w, 'stroke-linecap': 'round' })
          ]);
        },
        defaults: [
          { name: 'Thin ink', state: { width: 2, hex: '#1a1c20' } },
          { name: 'Bold red', state: { width: 8, hex: '#f4453a' } },
          { name: 'Sky line', state: { width: 4, hex: '#1fa6e0' } },
          { name: 'Heavy violet', state: { width: 12, hex: '#9b3fd6' } }
        ]
      },
      destroy: off
    };
  }

  // Hex string ('#rrggbb') to 0..1 RGB triplet.
  function hexToRgb(hex) {
    var h = hex.charAt(0) === '#' ? hex.substring(1) : hex;
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return [r / 255, g / 255, b / 255];
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select shape layers to stroke';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});