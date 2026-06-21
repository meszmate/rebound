/*
 * Rebound, Appearance customizer.
 *
 * A live theme editor the user opens from the Home: pick a whole-theme preset,
 * a light/dark mode, an accent and a base background colour (the rest of the
 * palette is generated cohesively), and fine-tune individual surface/text colours
 * if they want. Everything applies instantly and persists to the shared settings
 * file (and broadcasts so the Settings panel and other instances stay in sync).
 *
 * R.appearance.open()
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var SETTINGS_EVENT = 'com.meszmate.rebound.settingsChanged';

  // Whole-theme starting points: a base background + an accent + a mode.
  var PRESETS = [
    { name: 'Midnight', bg: '#1e1f23', accent: '#5496fa', mode: 'dark' },
    { name: 'Graphite', bg: '#26272b', accent: '#9aa6bd', mode: 'dark' },
    { name: 'Ink', bg: '#161719', accent: '#7c5cff', mode: 'dark' },
    { name: 'Forest', bg: '#1a201c', accent: '#39c07a', mode: 'dark' },
    { name: 'Ember', bg: '#221a17', accent: '#ef7a43', mode: 'dark' },
    { name: 'Rose', bg: '#231a1f', accent: '#e06cc4', mode: 'dark' },
    { name: 'Slate', bg: '#1c2026', accent: '#46b3c9', mode: 'dark' },
    { name: 'Daylight', bg: '#eceef2', accent: '#2f6fed', mode: 'light' }
  ];

  // Fine-tune targets (CSS var suffix + label) shown under "Advanced".
  var ADVANCED = [
    { key: 'bg-raised', label: 'Surface' },
    { key: 'bg-sunken', label: 'Sunken' },
    { key: 'border', label: 'Border' },
    { key: 'text', label: 'Text' },
    { key: 'text-muted', label: 'Muted text' }
  ];

  function loadSettings() { return R.disk.read('settings', {}) || {}; }
  function broadcast(s) {
    try {
      if (R.bridge && R.bridge.cs && typeof CSEvent !== 'undefined') {
        var ev = new CSEvent(SETTINGS_EVENT, 'APPLICATION');
        ev.data = JSON.stringify(s);
        R.bridge.cs.dispatchEvent(ev);
      }
    } catch (e) { /* not in host */ }
  }
  function cssVarHex(suffix) { return rgbToHex(window.getComputedStyle(document.documentElement).getPropertyValue('--rb-' + suffix).trim()); }
  function rgbToHex(str) {
    if (/^#[0-9a-fA-F]{6}$/.test(str)) return str;
    var m = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(str || '');
    if (!m) return '#000000';
    function h(n) { var v = Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16); return v.length < 2 ? '0' + v : v; }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }

  function open() {
    if (!R.ui.modal) return;
    var s = loadSettings();
    s.colorOverrides = s.colorOverrides || {};
    var fields = []; // { key, swatch, hex, get } for syncing after preset/reset

    function apply() { R.disk.write('settings', s); broadcast(s); R.theme.applyFromSettings(s); }
    function syncFields() { fields.forEach(function (f) { var v = f.get(); f.swatch.value = v; f.hex.value = v; }); }

    // A swatch + hex pair bound to a getter/setter.
    function colorField(label, get, set, onClear) {
      var swatch = el('input.rb-appe-color', { type: 'color', value: get() });
      var hex = el('input.rb-appe-hex', { type: 'text', spellcheck: 'false', value: get() });
      swatch.addEventListener('input', function () { hex.value = swatch.value; set(swatch.value); });
      hex.addEventListener('input', function () { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { swatch.value = hex.value; set(hex.value); } });
      fields.push({ swatch: swatch, hex: hex, get: get });
      var kids = [swatch, hex];
      if (onClear) kids.push(el('button.rb-appe-clear', { type: 'button', title: 'Use the generated default', onclick: function () { onClear(); syncFields(); } }, ['Auto']));
      return R.ui.row(label, el('div.rb-appe-cf', null, kids));
    }

    // Presets
    var presets = el('div.rb-appe-presets', null, PRESETS.map(function (p) {
      return el('button.rb-appe-preset', {
        type: 'button', title: p.name, style: 'background:' + p.bg,
        onclick: function () { s.themeBg = p.bg; s.accent = p.accent; s.themeMode = p.mode; s.colorOverrides = {}; apply(); modeCtl.set(p.mode); syncFields(); }
      }, [
        el('span.rb-appe-dot', { style: 'background:' + p.accent }),
        el('span.rb-appe-pname', { text: p.name })
      ]);
    }));

    // Mode
    var modeCtl = R.ui.segmented([
      { value: 'auto', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }
    ], { value: s.themeMode || 'auto', onChange: function (v) { s.themeMode = v; apply(); syncFields(); } });

    // Accent + base background
    var accentField = colorField('Accent',
      function () { return s.accent || cssVarHex('accent'); },
      function (hex) { s.accent = hex; apply(); });
    var bgField = colorField('Background',
      function () { return s.themeBg || cssVarHex('bg'); },
      function (hex) { s.themeBg = hex; apply(); syncFields(); },
      function () { delete s.themeBg; apply(); });

    // Advanced fine-tune
    var advWrap = el('div.rb-appe-adv', null, ADVANCED.map(function (a) {
      return colorField(a.label,
        function () { return s.colorOverrides[a.key] || cssVarHex(a.key); },
        function (hex) { s.colorOverrides[a.key] = hex; apply(); },
        function () { delete s.colorOverrides[a.key]; apply(); });
    }));
    var advToggle = el('button.rb-appe-advtoggle', { type: 'button', onclick: function () {
      var on = advWrap.classList.toggle('is-open');
      advToggle.textContent = (on ? '▾ ' : '▸ ') + 'Fine-tune colours';
    } }, ['▸ Fine-tune colours']);

    var body = el('div.rb-appe', null, [
      el('div.rb-section-label', { text: 'Theme' }),
      presets,
      R.ui.row('Mode', modeCtl.el),
      accentField,
      bgField,
      el('div.rb-appe-advsec', null, [advToggle, advWrap])
    ]);

    var resetBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () {
      delete s.accent; delete s.themeBg; s.themeMode = 'auto'; s.colorOverrides = {};
      apply(); modeCtl.set('auto'); syncFields();
    } }, ['Reset to default']);
    var doneBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { handle.close('confirm'); } }, ['Done']);
    var handle = R.ui.modal({ title: 'Appearance', width: 400, className: 'rb-modal-home', body: body, footer: [resetBtn, doneBtn] });
  }

  R.appearance = { open: open };
})(window.Rebound = window.Rebound || {});
