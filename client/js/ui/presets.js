/*
 * Rebound — per-tool preset bar.
 *
 * Any tool can opt in by returning a `presets` config from its mount():
 *   return {
 *     presets: {
 *       toolId: 'spring',
 *       get: function () { return { ...settings }; },   // current settings -> object
 *       set: function (state) { ... apply settings ... },
 *       defaults: [{ name: 'Gentle', state: {...} }]    // optional shipped presets
 *     },
 *     destroy: ...
 *   }
 *
 * The shell inserts the bar near the top of the tool. Users pick a preset to
 * apply it, save the current settings as a named preset, or delete their own.
 * Shipped defaults are locked; user presets persist as versioned JSON per tool.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  function presetBar(config) {
    var toolId = config.toolId;
    var defaults = config.defaults || [];

    function key() { return 'presets:' + toolId; }
    function loadUser() {
      var data = R.disk.read(key(), null);
      return (data && data.items) ? data.items : [];
    }
    function saveUser(items) { R.disk.write(key(), { schemaVersion: 1, items: items }); }

    function all() {
      var out = [];
      defaults.forEach(function (d) { out.push({ name: d.name, state: d.state, builtin: true }); });
      loadUser().forEach(function (u) { out.push({ name: u.name, state: u.state, builtin: false }); });
      return out;
    }

    var select = el('select.rb-preset-select', { 'aria-label': 'Preset' });
    var delBtn = el('button.rb-btn.is-ghost.is-icon', {
      title: 'Delete this preset', 'aria-label': 'Delete preset', onclick: onDelete
    }, ['🗑']);
    var saveBtn = el('button.rb-btn.is-ghost', {
      title: 'Save the current settings as a preset', onclick: onSave
    }, ['Save']);

    R.dom.on(select, 'change', onPick);

    function rebuild(selectName) {
      R.dom.clear(select);
      select.appendChild(el('option', { value: '', text: 'Presets…' }));
      var list = all();
      var selectIndex = 0;
      list.forEach(function (p, i) {
        var opt = el('option', { value: String(i), text: p.name + (p.builtin ? '' : ' *') });
        select.appendChild(opt);
        if (selectName && p.name === selectName) selectIndex = i + 1;
      });
      select.selectedIndex = selectIndex;
      updateDelState();
    }

    function current() {
      var i = select.selectedIndex - 1;
      var list = all();
      return i >= 0 && i < list.length ? list[i] : null;
    }

    function updateDelState() {
      var p = current();
      delBtn.disabled = !p || p.builtin;
      delBtn.classList.toggle('is-disabled', !p || p.builtin);
    }

    function onPick() {
      var p = current();
      updateDelState();
      if (p && config.set) {
        try { config.set(p.state); } catch (e) { R.log.error('Preset apply failed', e); }
      }
    }

    function onSave() {
      var suggested = (current() && !current().builtin) ? current().name : '';
      var name = typeof prompt === 'function' ? prompt('Preset name', suggested) : suggested;
      if (!name) return;
      name = ('' + name).trim();
      if (!name) return;
      var items = loadUser().filter(function (u) { return u.name !== name; });
      items.push({ name: name, state: config.get() });
      saveUser(items);
      rebuild(name);
      if (R.ui.toast) R.ui.toast('Saved preset “' + name + '”', { kind: 'success' });
    }

    function onDelete() {
      var p = current();
      if (!p || p.builtin) return;
      saveUser(loadUser().filter(function (u) { return u.name !== p.name; }));
      rebuild();
      if (R.ui.toast) R.ui.toast('Deleted preset', { kind: 'info' });
    }

    rebuild();
    return el('div.rb-presetbar', null, [
      el('span.rb-preset-label', { text: 'Preset' }),
      select,
      saveBtn,
      delBtn
    ]);
  }

  R.ui = R.ui || {};
  R.ui.presetBar = presetBar;
})(window.Rebound = window.Rebound || {});
