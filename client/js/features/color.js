/*
 * Rebound — Color tool.
 * Sets the fill color of selected layers from a swatch palette or from Hue and
 * Lightness sliders. Shape layers recolor every fill, solids recolor their
 * source, and any other layer gets a Fill effect. Colors are sent as 0..1 RGB.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var PALETTE = [
    '#f4453a', '#f5910b', '#f7d000', '#54c245',
    '#1fa6e0', '#3a52d6', '#9b3fd6', '#f0f1f5'
  ];

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
    var lightness = 55;

    var swatchRow = el('div.rb-row.rb-wrap');
    for (var i = 0; i < PALETTE.length; i++) {
      swatchRow.appendChild(makeSwatch(PALETTE[i]));
    }

    var preview = el('button.rb-btn.is-icon', {
      title: 'Apply the slider color',
      onclick: function () { apply(hslToRgb(hue, 1, lightness / 100)); }
    });
    paint(preview, hslToRgb(hue, 1, lightness / 100));

    var hueSlider = ui.slider({ label: 'Hue', min: 0, max: 360, step: 1, value: hue,
      format: function (v) { return Math.round(v) + '°'; },
      onInput: function (v) { hue = v; updatePreview(); } });
    var lightSlider = ui.slider({ label: 'Lightness', min: 0, max: 100, step: 1, value: lightness,
      format: function (v) { return Math.round(v) + '%'; },
      onInput: function (v) { lightness = v; updatePreview(); } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Sets the color of selected layers. Click a swatch, or dial in a color with the Hue and Lightness sliders.' }),
      swatchRow,
      hueSlider.el,
      lightSlider.el,
      el('div.rb-row', null, [preview, el('span.rb-faint.rb-grow', { text: 'Slider color' })])
    ]));

    function updatePreview() {
      paint(preview, hslToRgb(hue, 1, lightness / 100));
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
      var css = 'rgb(' + Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255) + ')';
      node.style.background = css;
      node.style.borderColor = css;
    }

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function apply(rgb) {
      ctx.invoke('color.apply', { rgb: rgb })
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