/*
 * Rebound, host theme sync.
 *
 * Reads After Effects' panel skin once at boot and again whenever the host
 * theme changes, then drives CSS custom properties on :root. Only the reliably
 * populated AppSkinInfo fields (panel background colour + base font size) are
 * trusted; brightness (dark vs light) is derived with a luma < 128 heuristic,
 * and the rest of the palette is computed from there. Outside the host it
 * falls back to a sensible dark theme so the panel is still styleable in a
 * plain browser during development.
 */
;(function (R) {
  'use strict';

  var THEME_EVENT = 'com.adobe.csxs.events.ThemeColorChanged';

  function clamp255(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  function rgb(r, g, b) {
    return 'rgb(' + clamp255(r) + ',' + clamp255(g) + ',' + clamp255(b) + ')';
  }

  function mix(c, target, amount) {
    return [
      c[0] + (target - c[0]) * amount,
      c[1] + (target - c[1]) * amount,
      c[2] + (target - c[2]) * amount
    ];
  }

  function luma(c) {
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  }

  // Build a full palette from a single background colour + accent.
  function buildPalette(bg, accent) {
    var dark = luma(bg) < 128;
    var toward = dark ? 255 : 0; // lighten on dark themes, darken on light
    var away = dark ? 0 : 255;

    return {
      isDark: dark,
      bg: rgb(bg[0], bg[1], bg[2]),
      bgRaised: rgb.apply(null, mix(bg, toward, 0.06)),
      bgSunken: rgb.apply(null, mix(bg, away, 0.18)),
      border: rgb.apply(null, mix(bg, toward, 0.16)),
      borderStrong: rgb.apply(null, mix(bg, toward, 0.28)),
      control: rgb.apply(null, mix(bg, toward, 0.12)),
      controlHover: rgb.apply(null, mix(bg, toward, 0.2)),
      text: dark ? 'rgb(225,227,231)' : 'rgb(28,30,34)',
      textMuted: dark ? 'rgb(150,154,162)' : 'rgb(96,100,108)',
      textFaint: dark ? 'rgb(110,114,122)' : 'rgb(140,144,152)',
      accent: rgb(accent[0], accent[1], accent[2]),
      accentText: luma(accent) > 150 ? 'rgb(20,20,22)' : 'rgb(255,255,255)',
      danger: 'rgb(229,83,75)',
      warning: 'rgb(232,168,56)',
      success: 'rgb(92,184,120)'
    };
  }

  function applyPalette(p, fontSize) {
    var root = document.documentElement;
    function set(name, value) { root.style.setProperty(name, value); }
    set('--rb-bg', p.bg);
    set('--rb-bg-raised', p.bgRaised);
    set('--rb-bg-sunken', p.bgSunken);
    set('--rb-border', p.border);
    set('--rb-border-strong', p.borderStrong);
    set('--rb-control', p.control);
    set('--rb-control-hover', p.controlHover);
    set('--rb-text', p.text);
    set('--rb-text-muted', p.textMuted);
    set('--rb-text-faint', p.textFaint);
    set('--rb-accent', p.accent);
    set('--rb-accent-text', p.accentText);
    set('--rb-danger', p.danger);
    set('--rb-warning', p.warning);
    set('--rb-success', p.success);
    if (fontSize) set('--rb-font-size', fontSize + 'px');
    root.setAttribute('data-theme', p.isDark ? 'dark' : 'light');
  }

  var defaultAccent = [73, 144, 226]; // Rebound blue
  var accentOverride = null;

  function readSkin() {
    var bg = [43, 43, 43];
    var fontSize = 11;
    try {
      var env = R.bridge && R.bridge.cs ? R.bridge.cs.getHostEnvironment() : null;
      if (env && env.appSkinInfo) {
        var c = env.appSkinInfo.panelBackgroundColor.color; // 0..255 floats
        bg = [c.red, c.green, c.blue];
        if (env.appSkinInfo.baseFontSize) fontSize = env.appSkinInfo.baseFontSize;
      }
    } catch (e) {
      if (R.log) R.log.warn('Theme: could not read host skin, using defaults', e);
    }
    return { bg: bg, fontSize: fontSize };
  }

  function refresh() {
    var skin = readSkin();
    var palette = buildPalette(skin.bg, accentOverride || defaultAccent);
    applyPalette(palette, skin.fontSize);
    if (R.bus) R.bus.emit('theme:changed', palette);
    return palette;
  }

  function setAccent(rgbTriplet) {
    accentOverride = rgbTriplet;
    return refresh();
  }

  function init() {
    var palette = refresh();
    try {
      if (R.bridge && R.bridge.cs) {
        R.bridge.cs.addEventListener(THEME_EVENT, function () { refresh(); });
      }
    } catch (e) {
      if (R.log) R.log.warn('Theme: could not subscribe to host theme changes', e);
    }
    return palette;
  }

  R.theme = {
    init: init,
    refresh: refresh,
    setAccent: setAccent,
    buildPalette: buildPalette
  };
})(window.Rebound = window.Rebound || {});
