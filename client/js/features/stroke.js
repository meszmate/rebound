/*
 * Rebound, Stroke tool.
 * Adds or updates a stroke on selected shape layers. Pick a width, any color
 * (shared themed picker + quick swatches), a cap, and an optional dash pattern,
 * then apply, or remove every stroke. Colors are sent as 0..1 RGB.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Quick one-click swatches beside the full picker.
  var QUICK = ['#1a1c20', '#f4453a', '#f7d000', '#1fa6e0', '#f0f1f5'];

  // A sample shape outlined with the live stroke width, color, cap, and dash.
  // The real px width is mapped onto a clamped on-screen width so it always
  // reads.
  function strokeSvg(state, h) {
    var raw = state.width == null ? 4 : state.width;
    var sw = Math.max(1, Math.min(8, raw / 2 + 1));
    var attrs = {
      x: 30, y: 24, width: 100, height: 42, rx: 10,
      fill: 'none',
      stroke: state.hex || 'var(--rb-accent)',
      'stroke-width': sw,
      'stroke-linejoin': 'round',
      'stroke-linecap': state.cap === 'round' ? 'round' : 'butt'
    };
    if (state.dash) attrs['stroke-dasharray'] = state.dash;
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('rect', attrs)
    ]);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var STROKE_DEFAULTS = [
    { name: 'Thin ink', state: { width: 2, hex: '#1a1c20' } },
    { name: 'Bold red', state: { width: 8, hex: '#f4453a' } },
    { name: 'Sky line', state: { width: 4, hex: '#1fa6e0' } },
    { name: 'Heavy violet', state: { width: 12, hex: '#9b3fd6' } }
  ];
  R.toolPresets.declare('stroke', { defaults: STROKE_DEFAULTS });

  R.tools.register({
    id: 'stroke',
    title: 'Stroke',
    group: 'Color',
    order: 2,
    quick: {
      desc: 'Add a 4 px near-black stroke to the selected shape layers.',
      method: 'stroke.apply',
      args: { rgb: [26 / 255, 28 / 255, 32 / 255], width: 4 }
    },
    keywords: ['stroke', 'outline', 'border', 'shape', 'line', 'color', 'width'],
    mount: mount
  });

  function mount(ctx) {
    var width = 4;
    var activeHex = QUICK[0];
    var rgb = hexToRgb(activeHex);
    var cap = 'butt';
    var dashed = false;
    var dash = 10;
    var gap = 10;

    function previewDash() {
      if (!dashed) return null;
      return Math.max(1, dash / 2 + 1) + ' ' + Math.max(1, gap / 2 + 1);
    }
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(strokeSvg({ width: width, hex: activeHex, cap: cap, dash: previewDash() }, 90)); }

    var widthField = ui.numberField({ label: 'Width', value: width, min: 0, step: 1, decimals: 0, suffix: 'px', width: '110px',
      onChange: function (v) { width = v; renderPreview(); } });

    // The shared themed picker (any color) plus a small quick-swatch row.
    var picker = ui.colorPicker({
      value: activeHex,
      storageKey: 'stroke-colors',
      title: 'Pick any stroke color',
      onChange: function (c) { activeHex = c.hex; rgb = [c.r, c.g, c.b]; renderPreview(); }
    });
    var swatchRow = el('div.rb-row.rb-wrap');
    for (var i = 0; i < QUICK.length; i++) {
      swatchRow.appendChild(makeSwatch(QUICK[i]));
    }

    function setHex(hex) {
      activeHex = hex;
      rgb = hexToRgb(hex);
      picker.set(hex);
      renderPreview();
    }

    function makeSwatch(hex) {
      var b = el('button.rb-btn.is-icon', { title: 'Stroke ' + hex });
      b.style.background = hex;
      b.style.borderColor = hex;
      b.addEventListener('click', function () { setHex(hex); });
      return b;
    }

    var capCtl = ui.segmented([
      { value: 'butt', label: 'Butt', title: 'Flat line ends' },
      { value: 'round', label: 'Round', title: 'Rounded line ends' }
    ], { value: cap, onChange: function (v) { cap = v; renderPreview(); } });

    var dashField = ui.numberField({ label: 'Dash', value: dash, min: 0, step: 1, decimals: 0, suffix: 'px', width: '100px',
      onChange: function (v) { dash = v; renderPreview(); } });
    var gapField = ui.numberField({ label: 'Gap', value: gap, min: 0, step: 1, decimals: 0, suffix: 'px', width: '100px',
      onChange: function (v) { gap = v; renderPreview(); } });
    var dashRow = el('div.rb-row.rb-wrap', null, [dashField.el, gapField.el]);
    function syncDashRow() { dashRow.style.display = dashed ? '' : 'none'; }
    var dashTog = ui.toggle({ label: 'Dashed', value: dashed,
      title: 'Draw the stroke as dashes instead of a solid line.',
      onChange: function (v) { dashed = v; syncDashRow(); renderPreview(); } });
    syncDashRow();

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds or updates a stroke on selected shape layers. Pick a width, a color, a cap, and an optional dash pattern, then apply, or remove every stroke.' }),
      previewHost,
      widthField.el,
      ui.row('Color', el('div.rb-row.rb-wrap', null, [picker.el, swatchRow])),
      ui.row('Cap', capCtl.el),
      dashTog.el,
      dashRow,
      el('div.rb-row.rb-wrap', null, [
        el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove stroke'])
      ])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn', { title: 'Read the selected shape stroke into the fields', onclick: doRead }, ['Read']));
    ctx.footer.appendChild(applyBtn);

    // Apply only makes sense with a shape layer in the selection.
    function setEnabled(sel) {
      var ok = !!(sel && sel.hasComp && sel.selectedLayerCount &&
        (!sel.layerKinds || sel.layerKinds.indexOf('shape') !== -1));
      applyBtn.disabled = !ok;
      applyBtn.classList.toggle('is-disabled', !ok);
    }

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); setEnabled(sel); });
    var initSel = ctx.getSelection();
    scopeText.textContent = describe(initSel);
    setEnabled(initSel);

    // Scan the selected shape layer's current stroke (width + colour) into the
    // fields, so you tweak the existing stroke instead of rebuilding it.
    function doRead() {
      ctx.invoke('stroke.read', {})
        .then(function (res) {
          if (!res || !res.found) { ctx.toast('Select a shape layer with a stroke to read', { kind: 'error' }); return; }
          applyState(readState(res));
          ctx.toast('Read stroke from ' + (res.layerName || 'layer'), { kind: 'info' });
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not read stroke', { kind: 'error' }); });
    }

    // Host read result -> panel state (cap/dash are optional on older reads).
    function readState(res) {
      return {
        width: res.width,
        hex: rgb01ToHex(res.rgb),
        cap: res.cap,
        dashed: res.dashed,
        dash: res.dash,
        gap: res.gap
      };
    }

    function doApply() {
      ctx.invoke('stroke.apply', { rgb: rgb, width: width, cap: cap, dashed: dashed, dash: dash, gap: gap })
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
      return { width: width, hex: activeHex, cap: cap, dashed: dashed, dash: dash, gap: gap };
    }
    function applyState(s) {
      if (!s) return;
      if (s.width != null) { width = s.width; widthField.set(s.width); }
      if (s.hex != null) { activeHex = s.hex; rgb = hexToRgb(s.hex); picker.set(s.hex); }
      if (s.cap != null) { cap = s.cap === 'round' ? 'round' : 'butt'; capCtl.set(cap); }
      if (s.dashed != null) { dashed = !!s.dashed; dashTog.set(dashed); }
      if (s.dash != null) { dash = s.dash; dashField.set(s.dash); }
      if (s.gap != null) { gap = s.gap; gapField.set(s.gap); }
      syncDashRow();
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
        defaults: STROKE_DEFAULTS
      },
      // Selecting a stroked shape loads its current stroke into the fields.
      selectionRead: {
        matches: function (sel) { return !!(sel && sel.selectedLayerCount); },
        method: 'stroke.read',
        apply: function (res) { if (res && res.found) applyState(readState(res)); }
      },
      destroy: function () { off(); picker.destroy(); }
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