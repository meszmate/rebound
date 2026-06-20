/*
 * Rebound, settings / preferences panel (second extension).
 * Reads and writes the same versioned settings file the main panel uses, and
 * broadcasts changes over a CEP event so the main panel updates live.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var SETTINGS_EVENT = 'com.meszmate.rebound.settingsChanged';
  var SCHEMA_VERSION = 1;

  var DEFAULTS = {
    schemaVersion: SCHEMA_VERSION,
    themeMode: 'auto', // auto | dark | light
    accent: '#4990e2',
    autoApply: false,
    applyMode: 'keys', // keys | expression
    overshootMode: 'bake', // bake | expression
    defaultUnits: 'frames', // frames | seconds
    showUnitsOverlay: true
  };

  function load() {
    var saved = R.disk.read('settings', {}) || {};
    var out = {};
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) out[k] = DEFAULTS[k];
    for (var s in saved) if (saved.hasOwnProperty(s)) out[s] = saved[s];
    out.schemaVersion = SCHEMA_VERSION;
    return out;
  }

  function persist(settings) {
    R.disk.write('settings', settings);
    broadcast(settings);
  }

  function broadcast(settings) {
    try {
      if (R.bridge.cs && typeof CSEvent !== 'undefined') {
        var ev = new CSEvent(SETTINGS_EVENT, 'APPLICATION');
        ev.data = JSON.stringify(settings);
        R.bridge.cs.dispatchEvent(ev);
      }
    } catch (e) {
      R.log.warn('Could not broadcast settings change', e);
    }
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [73, 144, 226];
  }

  function applyTheme(settings) {
    R.theme.setAccent(hexToRgb(settings.accent));
  }

  function boot() {
    R.theme.init();
    var settings = load();
    applyTheme(settings);

    var app = document.getElementById('rb-app');
    R.dom.clear(app);

    var body = el('div.rb-tool-host');
    app.appendChild(el('div.rb-header', null, [
      el('div.rb-logo', null, [el('span.rb-logo-mark', { text: '◗' }), 'Settings'])
    ]));
    app.appendChild(body);

    function update(patch) {
      for (var k in patch) if (patch.hasOwnProperty(k)) settings[k] = patch[k];
      persist(settings);
    }

    // Theme
    body.appendChild(section('Appearance', [
      ui.row('Theme', ui.segmented([
        { value: 'auto', label: 'Auto' },
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' }
      ], { value: settings.themeMode, onChange: function (v) { update({ themeMode: v }); } }).el),
      ui.row('Accent', accentPicker(settings.accent, function (hex) {
        update({ accent: hex });
        applyTheme(settings);
      }))
    ]));

    // Easing defaults
    body.appendChild(section('Easing', [
      ui.toggle({ label: 'Auto-apply curve edits to the selection', value: settings.autoApply,
        onChange: function (v) { update({ autoApply: v }); } }).el,
      ui.row('Apply as', ui.segmented([
        { value: 'keys', label: 'Keyframes' },
        { value: 'expression', label: 'Expression' }
      ], { value: settings.applyMode, onChange: function (v) { update({ applyMode: v }); } }).el),
      ui.row('Overshoot', ui.segmented([
        { value: 'bake', label: 'Bake' },
        { value: 'expression', label: 'Expression' }
      ], { value: settings.overshootMode, onChange: function (v) { update({ overshootMode: v }); } }).el)
    ]));

    // Units
    body.appendChild(section('Units', [
      ui.row('Default time', ui.segmented([
        { value: 'frames', label: 'Frames' },
        { value: 'seconds', label: 'Seconds' }
      ], { value: settings.defaultUnits, onChange: function (v) { update({ defaultUnits: v }); } }).el),
      ui.toggle({ label: 'Show real-unit overlay on the curve editor', value: settings.showUnitsOverlay,
        onChange: function (v) { update({ showUnitsOverlay: v }); } }).el
    ]));

    // Data
    body.appendChild(section('Data', [
      el('div.rb-faint', { text: R.disk.available
        ? 'Presets and settings are stored in your user data folder.'
        : 'Running without file access, settings are kept in this session only.' })
    ]));
  }

  function section(title, children) {
    return el('div.rb-card', { style: { marginBottom: '12px' } }, [
      el('div.rb-section-label', { text: title }),
      el('div.rb-col', null, children)
    ]);
  }

  function accentPicker(current, onPick) {
    var swatches = ['#4990e2', '#7c5cff', '#22b07d', '#e8a838', '#e5534b', '#e06cc4'];
    var row = el('div.rb-row', null, swatches.map(function (hex) {
      return el('button.rb-btn.is-icon', {
        style: { background: hex, borderColor: hex === current ? 'var(--rb-text)' : hex },
        title: hex,
        onclick: function () {
          onPick(hex);
          R.dom.qsa('button', row).forEach(function (b) { b.style.borderColor = b.title; });
          this.style.borderColor = 'var(--rb-text)';
        }
      }, ['']);
    }));
    return row;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Rebound = window.Rebound || {});
