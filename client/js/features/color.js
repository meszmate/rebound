/*
 * Rebound, Color tool.
 * Sets the fill color of selected layers from a swatch palette or from Hue and
 * Lightness sliders. Shape layers recolor every fill, solids recolor their
 * source, and any other layer gets a Fill effect. Colors are sent as 0..1 RGB.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var PALETTE = [
    '#f4453a', '#f5910b', '#f7d000', '#54c245',
    '#1fa6e0', '#3a52d6', '#9b3fd6', '#f0f1f5'
  ];

  // A large sample shape recolored with the current color. The fill follows the
  // color when the target is Fill or Both, the stroke follows it when the target
  // is Stroke or Both, and a small hue strip plus the swatch sit underneath so
  // hue, saturation, lightness, hex, and the target all drive the preview.
  function colorSvg(state, h) {
    var rgb = hslToRgb(state.hue, state.saturation / 100, state.lightness / 100);
    var css = rgbCss(rgb);
    var target = state.target;
    var fillCss = (target === 'fill' || target === 'both') ? css : 'none';
    var hasStroke = (target === 'stroke' || target === 'both');
    var hueOnly = rgbCss(hslToRgb(state.hue, 1, 0.5));
    var kids = [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('rect', { x: 34, y: 22, width: 92, height: 46, rx: 8, fill: fillCss, stroke: hasStroke ? css : 'none', 'stroke-width': hasStroke ? 4 : 0 }),
      svg('rect', { x: 34, y: 76, width: 92, height: 6, rx: 3, fill: hueOnly, opacity: '0.85' }),
      svg('circle', { cx: 22, cy: 45, r: 9, fill: css, stroke: 'var(--rb-border)', 'stroke-width': 1 })
    ];
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  function rgbCss(rgb) {
    return 'rgb(' + Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255) + ')';
  }

  R.tools.register({
    id: 'color',
    title: 'Color',
    group: 'Color',
    order: 0,
    keywords: ['color', 'colour', 'fill', 'tint', 'swatch', 'palette', 'hue', 'recolor'],
    mount: mount
  });

  function mount(ctx) {
    var hue = 210;
    var saturation = 100;
    var lightness = 55;
    var target = 'fill';

    function currentRgb() { return hslToRgb(hue, saturation / 100, lightness / 100); }
    function currentState() { return { hue: hue, saturation: saturation, lightness: lightness, target: target }; }

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(colorSvg(currentState(), 90)); }

    var swatchRow = el('div.rb-row.rb-wrap');
    for (var i = 0; i < PALETTE.length; i++) {
      swatchRow.appendChild(makeSwatch(PALETTE[i]));
    }

    var applyBtn = el('button.rb-btn.is-icon', {
      title: 'Apply the slider color',
      onclick: function () { apply(currentRgb()); }
    });
    paint(applyBtn, currentRgb());

    // Native picker: pick any color, load it into the sliders, and refresh the
    // preview so the chosen color drives the sample shape.
    var hexInput = el('input.rb-color-input', { type: 'color', value: '#1fa6e0',
      title: 'Pick any color to load it into the sliders',
      onchange: function (e) { setFromHex(e.target.value); } });

    var hueSlider = ui.slider({ label: 'Hue', min: 0, max: 360, step: 1, value: hue,
      format: function (v) { return Math.round(v) + '°'; },
      onInput: function (v) { hue = v; updatePreview(); } });
    var satSlider = ui.slider({ label: 'Saturation', min: 0, max: 100, step: 1, value: saturation,
      format: function (v) { return Math.round(v) + '%'; },
      onInput: function (v) { saturation = v; updatePreview(); } });
    var lightSlider = ui.slider({ label: 'Lightness', min: 0, max: 100, step: 1, value: lightness,
      format: function (v) { return Math.round(v) + '%'; },
      onInput: function (v) { lightness = v; updatePreview(); } });

    var targetCtl = ui.segmented([
      { value: 'fill', label: 'Fill', title: 'Recolor fills' },
      { value: 'stroke', label: 'Stroke', title: 'Recolor strokes (shape layers)' },
      { value: 'both', label: 'Both', title: 'Recolor fills and strokes' }
    ], { value: target, onChange: function (v) { target = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Sets the color of selected layers. Click a swatch, dial in Hue, Saturation, and Lightness, or pick any color. Stroke targets apply to shape layers.' }),
      previewHost,
      swatchRow,
      hueSlider.el,
      satSlider.el,
      lightSlider.el,
      el('div.rb-section-label', { text: 'Target' }),
      targetCtl.el,
      el('div.rb-row', null, [applyBtn, el('span.rb-faint.rb-grow', { text: 'Slider color' }), hexInput])
    ]));

    function updatePreview() {
      paint(applyBtn, currentRgb());
      renderPreview();
    }

    function setFromHex(hex) {
      var hsl = rgbToHsl(hexToRgb(hex));
      hue = hsl[0]; saturation = hsl[1]; lightness = hsl[2];
      hueSlider.set(hue); satSlider.set(saturation); lightSlider.set(lightness);
      updatePreview();
    }

    function makeSwatch(hex) {
      var rgb = hexToRgb(hex);
      var b = el('button.rb-btn.is-icon', { title: 'Set ' + hex });
      b.style.background = hex;
      b.style.borderColor = hex;
      b.addEventListener('click', function () { apply(rgb); });
      return b;
    }

    function paint(node, rgb) {
      var css = rgbCss(rgb);
      node.style.background = css;
      node.style.borderColor = css;
    }

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn', { title: 'Read the selected layer colour into the sliders', onclick: doRead }, ['Read']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    // Scan the selected layer's current colour into the sliders, so you tune the
    // existing colour instead of dialing one from scratch.
    function doRead() {
      ctx.invoke('color.read', {})
        .then(function (res) {
          if (!res || !res.found) { ctx.toast('Select a layer with a colour to read', { kind: 'error' }); return; }
          var hsl = rgbToHsl(res.rgb);
          hue = hsl[0]; saturation = hsl[1]; lightness = hsl[2];
          hueSlider.set(hue); satSlider.set(saturation); lightSlider.set(lightness);
          if (res.target) { target = res.target; targetCtl.set(res.target); }
          updatePreview();
          ctx.toast('Read colour from ' + (res.layerName || 'layer'), { kind: 'info' });
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not read colour', { kind: 'error' }); });
    }

    function apply(rgb) {
      ctx.invoke('color.apply', { rgb: rgb, target: target })
        .then(function (res) {
          if (!res.colored) {
            ctx.toast('No layers were colored', { kind: 'info' });
          } else {
            ctx.toast('Colored ' + res.colored + ' layer' + (res.colored === 1 ? '' : 's'), { kind: 'success' });
          }
          if (res.skipped && res.skipped.length) {
            ctx.toast('Skipped ' + res.skipped.length + ' layer' + (res.skipped.length === 1 ? '' : 's'), { kind: 'info' });
          }
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not set color', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  // Hex string ('#rrggbb') to 0..1 RGB triplet.
  function hexToRgb(hex) {
    var h = hex.charAt(0) === '#' ? hex.substring(1) : hex;
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return [r / 255, g / 255, b / 255];
  }

  // HSL (h 0..360, s/l 0..1) to a 0..1 RGB triplet.
  function hslToRgb(h, s, l) {
    h = (h % 360) / 360;
    if (s === 0) return [l, l, l];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
  }

  // 0..1 RGB triplet to HSL (h 0..360, s/l 0..100) for loading the sliders.
  function rgbToHsl(rgb) {
    var r = rgb[0], g = rgb[1], b = rgb[2];
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = h / 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to color';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});