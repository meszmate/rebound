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

    var raised = mix(bg, toward, 0.075);
    var sunken = mix(bg, away, 0.24);
    // Raw "r,g,b" triplets so the CSS can build translucent tints with rgba() —
    // AE's CEF Chromium does NOT support color-mix(), so any color-mix() silently
    // drops the whole declaration (invisible backgrounds, missing focus rings).
    // rgba(var(--x-rgb), a) renders everywhere.
    function tri(a) { return clamp255(a[0]) + ',' + clamp255(a[1]) + ',' + clamp255(a[2]); }

    return {
      isDark: dark,
      bg: rgb(bg[0], bg[1], bg[2]),
      bgRaised: rgb.apply(null, raised),
      bgSunken: rgb.apply(null, sunken),
      border: rgb.apply(null, mix(bg, toward, 0.13)),
      borderStrong: rgb.apply(null, mix(bg, toward, 0.26)),
      control: rgb.apply(null, mix(bg, toward, 0.11)),
      controlHover: rgb.apply(null, mix(bg, toward, 0.2)),
      text: dark ? 'rgb(225,227,231)' : 'rgb(28,30,34)',
      textMuted: dark ? 'rgb(150,154,162)' : 'rgb(96,100,108)',
      textFaint: dark ? 'rgb(110,114,122)' : 'rgb(140,144,152)',
      accent: rgb(accent[0], accent[1], accent[2]),
      accentText: luma(accent) > 150 ? 'rgb(20,20,22)' : 'rgb(255,255,255)',
      danger: 'rgb(229,83,75)',
      warning: 'rgb(232,168,56)',
      success: 'rgb(92,184,120)',
      accentRgb: tri(accent),
      bgRgb: tri(bg),
      bgRaisedRgb: tri(raised),
      bgSunkenRgb: tri(sunken),
      successRgb: '92,184,120'
    };
  }

  // A readable "ink" for marks drawn directly on the accent: a lighter shade of
  // the accent on a dark/saturated accent, a darker shade on a light one. Keeps
  // the hue (it is the same colour, just lighter or darker), never pure white.
  function accentInk(accent) {
    var r, g, b, m;
    if ((m = /^#?([0-9a-fA-F]{6})$/.exec(String(accent || '').trim()))) {
      var n = parseInt(m[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else if ((m = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(String(accent || '')))) {
      r = +m[1]; g = +m[2]; b = +m[3];
    } else { return 'rgba(255,255,255,0.9)'; }
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // Lighten the accent by default; only darken when it is genuinely light
    // (near-white), so on the dark UI the marks read as a lighter shade.
    var light = lum > 0.78;
    var t = 0.32, tc = light ? 0 : 255; // gently toward black / white, so it blends
    function mx(c) { return Math.round(c + (tc - c) * t); }
    return 'rgb(' + mx(r) + ',' + mx(g) + ',' + mx(b) + ')';
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
    set('--rb-accent-ink', accentInk(p.accent));
    set('--rb-danger', p.danger);
    set('--rb-warning', p.warning);
    set('--rb-success', p.success);
    // Raw triplets for rgba() tints (CEF has no color-mix()).
    set('--rb-accent-rgb', p.accentRgb);
    set('--rb-bg-rgb', p.bgRgb);
    set('--rb-bg-raised-rgb', p.bgRaisedRgb);
    set('--rb-bg-sunken-rgb', p.bgSunkenRgb);
    set('--rb-success-rgb', p.successRgb);
    if (fontSize) set('--rb-font-size', fontSize + 'px');
    root.setAttribute('data-theme', p.isDark ? 'dark' : 'light');
  }

  var defaultAccent = [84, 150, 250]; // Rebound blue (a touch more vivid)
  var accentOverride = null;
  var bgOverride = null;        // [r,g,b] custom base background, else host/auto
  var forcedMode = 'auto';      // auto | dark | light
  var userOverrides = {};       // { '<css-var-suffix>': '<color>' } fine-tune layer

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }

  function readSkin() {
    var bg = [30, 31, 35]; // refined default dark base (slightly cool); host overrides
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

  // The base background the palette is generated from: a user custom colour wins,
  // then a forced dark/light default, else the host skin (auto).
  function baseBg(skin) {
    if (bgOverride) return bgOverride;
    if (forcedMode === 'light') return [236, 237, 240];
    if (forcedMode === 'dark') return [30, 31, 35];
    return skin.bg;
  }

  // Layer the user's fine-tune colour overrides on top of the generated palette.
  function applyOverrides() {
    var root = document.documentElement;
    for (var k in userOverrides) {
      if (userOverrides.hasOwnProperty(k) && userOverrides[k]) root.style.setProperty('--rb-' + k, userOverrides[k]);
    }
  }

  function refresh() {
    var skin = readSkin();
    var palette = buildPalette(baseBg(skin), accentOverride || defaultAccent);
    applyPalette(palette, skin.fontSize);
    applyOverrides();
    if (R.bus) R.bus.emit('theme:changed', palette);
    return palette;
  }

  function setAccent(rgbTriplet) {
    accentOverride = rgbTriplet;
    return refresh();
  }

  // Apply a whole appearance settings object (accent, base background, mode, and
  // fine-tune overrides) at once. Used on boot and on live settings changes.
  function applyFromSettings(s) {
    s = s || {};
    accentOverride = s.accent ? (hexToRgb(s.accent) || null) : null;
    bgOverride = s.themeBg ? (hexToRgb(s.themeBg) || null) : null;
    forcedMode = s.themeMode || 'auto';
    userOverrides = s.colorOverrides || {};
    return refresh();
  }

  function init() {
    applyFromSettings(R.disk ? R.disk.read('settings', {}) : {});
    try {
      if (R.bridge && R.bridge.cs) {
        R.bridge.cs.addEventListener(THEME_EVENT, function () { refresh(); });
      }
    } catch (e) {
      if (R.log) R.log.warn('Theme: could not subscribe to host theme changes', e);
    }
    return refresh();
  }

  R.theme = {
    init: init,
    refresh: refresh,
    setAccent: setAccent,
    applyFromSettings: applyFromSettings,
    buildPalette: buildPalette,
    hexToRgb: hexToRgb
  };
})(window.Rebound = window.Rebound || {});
