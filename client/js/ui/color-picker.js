/*
 * Rebound, custom color picker (R.ui.colorPicker).
 * A real picker: a saturation/value square, a hue strip, an optional alpha
 * strip, a hex field, and recent swatches. No native <input type=color> (CEP's
 * is unreliable and unthemeable). Returns { r, g, b } in 0..1 for AE setValue,
 * plus hex and a. Shared by Pin Rig and any tool that needs full theming.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el, on = R.dom.on;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, s, v];
  }
  function hx2(n) { var s = Math.round(n).toString(16); return s.length < 2 ? '0' + s : s; }
  function rgbToHex(r, g, b) { return '#' + hx2(r) + hx2(g) + hx2(b); }
  function hexToRgb(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(('' + hex).trim()); if (!m) return null; var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function colorPicker(opts) {
    opts = opts || {};
    var state = { h: 200, s: 0.7, v: 1, a: 1 };
    function setFromHex(hex) { var rgb = hexToRgb(hex); if (!rgb) return false; var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]); state.h = hsv[0]; state.s = hsv[1]; state.v = hsv[2]; return true; }
    if (opts.value) { if (typeof opts.value === 'string') setFromHex(opts.value); else if (opts.value.hex) { setFromHex(opts.value.hex); if (opts.value.a != null) state.a = opts.value.a; } }

    var sv = el('div.rb-cp-sv'); var svThumb = el('div.rb-cp-sv-thumb'); sv.appendChild(svThumb);
    var hue = el('div.rb-cp-hue'); var hueThumb = el('div.rb-cp-hue-thumb'); hue.appendChild(hueThumb);
    var alphaEl = opts.alpha ? el('div.rb-cp-alpha') : null;
    var alphaThumb = opts.alpha ? el('div.rb-cp-alpha-thumb') : null; if (alphaEl) alphaEl.appendChild(alphaThumb);
    var hexInput = el('input.rb-cp-hex', { type: 'text', spellcheck: 'false', 'aria-label': 'Hex color' });
    var recentsRow = el('div.rb-cp-recents');
    var popKids = [sv, hue]; if (alphaEl) popKids.push(alphaEl); popKids.push(el('div.rb-cp-row', null, [hexInput]), recentsRow);
    var pop = el('div.rb-cp-pop', null, popKids); pop.style.display = 'none';
    var swatch = el('span.rb-cp-swatch'); var trigText = el('span.rb-cp-hex-text');
    var trigger = el('button.rb-cp-trigger', { type: 'button', title: opts.title || 'Pick a color', onclick: toggle }, [swatch, trigText]);
    var root = el('div.rb-cp', null, [trigger, pop]);

    function rgb() { return hsvToRgb(state.h, state.s, state.v); }
    function hex() { var c = rgb(); return rgbToHex(c[0], c[1], c[2]); }
    function emit() { var c = rgb(); if (opts.onChange) opts.onChange({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, hex: hex(), a: state.a }); }
    function paint() {
      var hxv = hex();
      swatch.style.background = hxv; if (opts.alpha) swatch.style.opacity = state.a;
      trigText.textContent = hxv;
      sv.style.background = 'linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,hsl(' + Math.round(state.h) + ',100%,50%))';
      svThumb.style.left = (state.s * 100) + '%'; svThumb.style.top = ((1 - state.v) * 100) + '%'; svThumb.style.background = hxv;
      hueThumb.style.left = ((state.h / 360) * 100) + '%';
      if (alphaEl) { alphaEl.style.backgroundImage = 'linear-gradient(to right, rgba(0,0,0,0), ' + hxv + ')'; alphaThumb.style.left = (state.a * 100) + '%'; }
      if (document.activeElement !== hexInput) hexInput.value = hxv;
    }
    function dragSV(e) { var r = sv.getBoundingClientRect(); state.s = clamp((e.clientX - r.left) / r.width, 0, 1); state.v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); paint(); emit(); }
    function dragHue(e) { var r = hue.getBoundingClientRect(); state.h = clamp((e.clientX - r.left) / r.width, 0, 1) * 360; paint(); emit(); }
    function dragAlpha(e) { var r = alphaEl.getBoundingClientRect(); state.a = clamp((e.clientX - r.left) / r.width, 0, 1); paint(); emit(); }
    function bindDrag(elm, handler) {
      on(elm, 'pointerdown', function (e) {
        e.preventDefault(); handler(e);
        var mv = function (ev) { handler(ev); };
        var up = function () { document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); pushRecent(hex()); };
        document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true);
      });
    }
    bindDrag(sv, dragSV); bindDrag(hue, dragHue); if (alphaEl) bindDrag(alphaEl, dragAlpha);
    on(hexInput, 'input', function () { if (setFromHex(hexInput.value)) { paint(); emit(); } });
    on(hexInput, 'change', function () { pushRecent(hex()); });

    var skey = opts.storageKey || 'colorpicker-recents';
    function recents() { try { return (R.disk.read(skey, { items: [] }).items) || []; } catch (e) { return []; } }
    function pushRecent(hxv) { var items = recents().filter(function (x) { return x !== hxv; }); items.unshift(hxv); items = items.slice(0, 8); try { R.disk.write(skey, { items: items }); } catch (e) { /* storage may be unavailable */ } renderRecents(); }
    function renderRecents() { R.dom.clear(recentsRow); recents().forEach(function (hxv) { recentsRow.appendChild(el('button.rb-cp-recent', { type: 'button', title: hxv, style: { background: hxv }, onclick: function () { setFromHex(hxv); paint(); emit(); } })); }); }
    renderRecents();

    var open = false;
    function toggle() { open = !open; pop.style.display = open ? '' : 'none'; if (open) paint(); }
    function onDocDown(e) { if (open && !root.contains(e.target)) { open = false; pop.style.display = 'none'; } }
    document.addEventListener('pointerdown', onDocDown, true);

    paint();
    return {
      el: root,
      get: function () { var c = rgb(); return { r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, hex: hex(), a: state.a }; },
      set: function (v) { if (typeof v === 'string') setFromHex(v); else if (v && v.hex) { setFromHex(v.hex); if (v.a != null) state.a = v.a; } paint(); },
      destroy: function () { document.removeEventListener('pointerdown', onDocDown, true); }
    };
  }

  R.ui = R.ui || {};
  R.ui.colorPicker = colorPicker;
  R.ui.colorUtil = { hsvToRgb: hsvToRgb, rgbToHsv: rgbToHsv, rgbToHex: rgbToHex, hexToRgb: hexToRgb };
})(window.Rebound = window.Rebound || {});
