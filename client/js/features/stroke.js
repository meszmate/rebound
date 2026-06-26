/*
 * Rebound, Stroke tool.
 * Adds or updates a stroke on selected shape layers. Pick a width and a color
 * swatch and apply, or remove every stroke. Colors are sent as 0..1 RGB.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var PALETTE = [
    '#f4453a', '#f5910b', '#f7d000', '#54c245',
    '#1fa6e0', '#3a52d6', '#9b3fd6', '#1a1c20'
  ];

  // A sample shape outlined with the live stroke width, color, and dash. The
  // real px width is mapped onto a clamped on-screen width so it always reads.
  function strokeSvg(state, h) {
    var raw = state.width == null ? 4 : state.width;
    var sw = Math.max(1, Math.min(8, raw / 2 + 1));
    var attrs = {
      x: 30, y: 24, width: 100, height: 42, rx: 10,
      fill: 'none',
      stroke: state.hex || 'var(--rb-accent)',
      'stroke-width': sw,
      'stroke-linejoin': 'round'
    };
    if (state.dash) attrs['stroke-dasharray'] = state.dash;
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('rect', attrs)
    ]);
  }

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

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(strokeSvg({ width: width, hex: activeHex }, 90)); }

    var widthField = ui.numberField({ label: 'Width', value: width, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { width = v; renderPreview(); } });

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
      b.addEventListener('click', function () { activeHex = hex; rgb = hexToRgb(hex); setActive(hex); renderPreview(); });
      swatches.push({ hex: hex, el: b });
      return b;
    }

    function setActive(hex) {
      for (var k = 0; k < swatches.length; k++) {
        swatches[k].el.classList.toggle('is-active', swatches[k].hex === hex);
      }
    }

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds or updates a stroke on selected shape layers. Pick a width and a color, then apply, or remove every stroke.' }),
      previewHost,
      widthField.el,
      ui.row('Color', swatchRow),
      el('div.rb-row.rb-wrap', null, [
        el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove stroke'])
      ])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn', { title: 'Read the selected shape stroke into the fields', onclick: doRead }, ['Read']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    // Scan the selected shape layer's current stroke (width + colour) into the
    // fields, so you tweak the existing stroke instead of rebuilding it.
    function doRead() {
      ctx.invoke('stroke.read', {})
        .then(function (res) {
          if (!res || !res.found) { ctx.toast('Select a shape layer with a stroke to read', { kind: 'error' }); return; }
          applyState({ width: res.width, hex: rgb01ToHex(res.rgb) });
          ctx.toast('Read stroke from ' + (res.layerName || 'layer'), { kind: 'info' });
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not read stroke', { kind: 'error' }); });
    }

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
      renderPreview();
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
      // Selecting a stroked shape loads its current stroke into the fields.
      selectionRead: {
        matches: function (sel) { return !!(sel && sel.selectedLayerCount); },
        method: 'stroke.read',
        apply: function (res) { if (res && res.found) applyState({ width: res.width, hex: rgb01ToHex(res.rgb) }); }
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
  // 0..1 RGB triplet (from the host) back to '#rrggbb'.
  function rgb01ToHex(c) {
    function h(v) { var x = Math.max(0, Math.min(255, Math.round((v || 0) * 255))).toString(16); return x.length < 2 ? '0' + x : x; }
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select shape layers to stroke';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});