/*
 * Rebound, settings: shared preferences module.
 *
 * Settings live INSIDE the main panel (opened in an in-panel modal) instead of
 * a separate window, so there is one Rebound surface, not two. Exposes
 * R.settings: DEFAULTS, load, persist, applyTheme, and buildBody() which returns
 * the form for the modal. The same versioned file the panel already reads.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var SETTINGS_EVENT = 'com.meszmate.rebound.settingsChanged';
  var SCHEMA_VERSION = 1;
  // Shown in the About block. Keep in sync with CSXS/manifest.xml
  // (ExtensionBundleVersion) and package.json.
  var PANEL_VERSION = '0.1.0';

  var DEFAULTS = {
    schemaVersion: SCHEMA_VERSION,
    themeMode: 'auto', // auto | dark | light
    accent: '#4990e2',
    autoApply: false,
    applyMode: 'keys', // keys | expression
    handleLength: 45, // bezier tangent handle length / smoothness (20-70); ~45 = clean ease-in-out arc
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

  function section(title, children) {
    return el('div.rb-card', { style: { marginBottom: '10px' } }, [
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

  // Build the settings form. onChange(settings) fires after each change (already
  // persisted), so the host panel can re-apply theme/prefs live.
  // One row of the shortcut editor: label · current chord · Set (record) · Clear.
  function keybindRow(action) {
    var chordEl = el('span.rb-kbd');
    var setBtn = el('button.rb-btn.is-ghost.rb-btn-sm', { type: 'button', title: 'Record a shortcut' }, ['Set']);
    var clearBtn = el('button.rb-btn.is-ghost.rb-btn-sm', { type: 'button', title: 'Clear shortcut' }, ['Clear']);
    function refresh() {
      var c = R.keybinds.bindingFor(action.id);
      chordEl.textContent = c || '—';
      chordEl.classList.toggle('is-empty', !c);
      clearBtn.style.display = c ? '' : 'none';
    }
    setBtn.addEventListener('click', function () {
      var prev = setBtn.textContent;
      setBtn.textContent = 'Press keys…';
      setBtn.classList.add('is-active');
      function cleanup() {
        document.removeEventListener('keydown', onKey, true);
        setBtn.textContent = prev;
        setBtn.classList.remove('is-active');
      }
      // Capture phase so the global dispatcher (bubble phase) never sees the key.
      function onKey(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === 'Escape') { cleanup(); return; }
        var chord = R.keybinds.chordFromEvent(ev);
        if (!chord) return; // a modifier alone: keep listening
        if (R.keybinds.isReserved(chord)) {
          if (ui.toast) ui.toast(chord + ' is reserved by Rebound', { kind: 'error' });
          return;
        }
        R.keybinds.setBinding(action.id, chord);
        cleanup();
        refresh();
      }
      document.addEventListener('keydown', onKey, true);
    });
    clearBtn.addEventListener('click', function () { R.keybinds.clearBinding(action.id); refresh(); });
    refresh();
    return el('div.rb-kbd-row', null, [
      el('span.rb-kbd-label', { text: action.label || action.id }),
      el('span.rb-spacer'),
      chordEl, setBtn, clearBtn
    ]);
  }

  function buildKeybindsSection() {
    var raw = (R.homeActions && R.homeActions.all && R.homeActions.all()) || [];
    var seen = {}, list = [];
    raw.forEach(function (a) { if (a && a.id && !seen[a.id]) { seen[a.id] = 1; list.push(a); } });
    // The catalog carries several actions per tool that render as the SAME row
    // text (open-color / widget-color / quick-stroke are all just "Color" or
    // "Stroke"), so the list showed duplicate rows. Collapse them per tool +
    // label, preferring an action that already has a binding, then a one-click
    // apply (the most useful thing to put on a key).
    var byRow = {}, deduped = [];
    list.forEach(function (a) {
      var key = (a.toolId || '') + '|' + String(a.label || a.id).toLowerCase();
      var prev = byRow[key];
      if (!prev) { byRow[key] = a; deduped.push(a); return; }
      var aBound = !!R.keybinds.bindingFor(a.id);
      var pBound = !!R.keybinds.bindingFor(prev.id);
      if ((aBound && !pBound) || (aBound === pBound && a.kind === 'apply' && prev.kind !== 'apply')) {
        deduped[deduped.indexOf(prev)] = a;
        byRow[key] = a;
      }
    });
    list = deduped;
    list.sort(function (a, b) {
      var g = String(a.group || '').localeCompare(String(b.group || ''));
      return g || String(a.label || '').localeCompare(String(b.label || ''));
    });
    var listEl = el('div.rb-kbd-list.rb-scroll');
    function render(filter) {
      R.dom.clear(listEl);
      var f = String(filter || '').toLowerCase(), n = 0;
      list.forEach(function (a) {
        if (f && String(a.label || '').toLowerCase().indexOf(f) === -1 &&
            String(a.group || '').toLowerCase().indexOf(f) === -1) return;
        listEl.appendChild(keybindRow(a));
        n++;
      });
      if (!n) listEl.appendChild(el('div.rb-faint', { text: 'No actions match.' }));
    }
    var searchInput = el('input', { type: 'text', placeholder: 'Filter actions…' });
    searchInput.addEventListener('input', function () { render(searchInput.value); });
    render('');
    return section('Keyboard shortcuts', [
      el('div.rb-faint', { text: 'Shortcuts run while the Rebound panel is focused (a CEP panel can’t register global After Effects hotkeys). Click Set, then press your combo: a letter, optionally with Alt / Shift / Cmd. Some combos are reserved.' }),
      el('div.rb-field.rb-field-text', null, [searchInput]),
      listEl
    ]);
  }

  function buildBody(onChange) {
    var settings = load();
    applyTheme(settings);

    var body = el('div.rb-col');

    function update(patch) {
      for (var k in patch) if (patch.hasOwnProperty(k)) settings[k] = patch[k];
      persist(settings);
      applyTheme(settings);
      if (typeof onChange === 'function') onChange(settings);
    }

    body.appendChild(section('Appearance', [
      ui.row('Theme', ui.segmented([
        { value: 'auto', label: 'Auto' },
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' }
      ], { value: settings.themeMode, onChange: function (v) { update({ themeMode: v }); } }).el),
      ui.row('Accent', accentPicker(settings.accent, function (hex) { update({ accent: hex }); }))
    ]));

    body.appendChild(section('Easing', [
      ui.toggle({ label: 'Auto-apply curve edits to the selection', value: settings.autoApply,
        onChange: function (v) { update({ autoApply: v }); } }).el,
      ui.row('Apply as', ui.segmented([
        { value: 'keys', label: 'Keyframes' },
        { value: 'expression', label: 'Expression' }
      ], { value: settings.applyMode, onChange: function (v) { update({ applyMode: v }); } }).el),
      ui.slider({
        label: 'Smoothness (handle length)', min: 20, max: 70, step: 1, value: settings.handleLength,
        format: function (v) { return Math.round(v) + '%'; },
        onInput: function (v) { update({ handleLength: v }); }
      }).el,
      el('div.rb-faint', { text: 'Bezier handle length on baked keys. ~45% is a clean ease-in-out arc (recommended). Lower is snappier; too high flattens the peaks into shelves. Applies when baking keyframes.' }),
      ui.row('Overshoot', ui.segmented([
        { value: 'bake', label: 'Bake' },
        { value: 'expression', label: 'Expression' }
      ], { value: settings.overshootMode, onChange: function (v) { update({ overshootMode: v }); } }).el)
    ]));

    body.appendChild(section('Units', [
      ui.row('Default time', ui.segmented([
        { value: 'frames', label: 'Frames' },
        { value: 'seconds', label: 'Seconds' }
      ], { value: settings.defaultUnits, onChange: function (v) { update({ defaultUnits: v }); } }).el),
      ui.toggle({ label: 'Show real-unit overlay on the curve editor', value: settings.showUnitsOverlay,
        onChange: function (v) { update({ showUnitsOverlay: v }); } }).el
    ]));

    if (R.keybinds && R.homeActions) body.appendChild(buildKeybindsSection());

    body.appendChild(section('Data', [
      el('div.rb-faint', { text: R.disk.available
        ? 'Presets and settings are stored in your user data folder.'
        : 'Running without file access, settings are kept in this session only.' })
    ]));

    // About: the mark, the version, one plain line.
    var aboutMark = el('span.rb-about-mark');
    aboutMark.innerHTML = (R.brand && R.brand.MARK) || '';
    body.appendChild(el('div.rb-card.rb-about', null, [
      el('div.rb-about-row', null, [
        aboutMark,
        el('span.rb-about-name', { text: 'Rebound' }),
        el('span.rb-about-ver', { text: 'v' + PANEL_VERSION })
      ]),
      el('div.rb-faint', { text: 'Animation tools for After Effects.' })
    ]));

    return body;
  }

  R.settings = {
    DEFAULTS: DEFAULTS,
    load: load,
    persist: persist,
    applyTheme: applyTheme,
    buildBody: buildBody
  };
})(window.Rebound = window.Rebound || {});
