/*
 * Rebound, customizable keybinds.
 *
 * Assign a keyboard shortcut to any command: open a tool, run a one-click apply
 * (with its own args, e.g. an easing preset as Keyframes or Expression), or an
 * app command. Nothing ships pre-bound. Bindings persist and run everywhere
 * except while typing in a field.
 *
 * The manager shows only the shortcuts you have ACTIVE (search to add more).
 * Binding is also available in-context via the small API:
 *   R.keybinds.comboFor(id)            // current combo string, or ''
 *   R.keybinds.record(id, onDone, btn) // record a combo for id, then save
 *   R.keybinds.clearBind(id)           // remove id's shortcut
 *   R.keybinds.open({ focusId })       // manager, optionally focused on one id
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var hooks = {};
  var installed = false;
  var suspended = false;      // true while recording or the manager is open
  var reverse = {};           // combo -> commandId
  var reverseArgs = {};       // combo -> per-binding args (or null)

  function load() { return R.disk.read('keybinds', {}) || {}; }
  function save(map) { R.disk.write('keybinds', map); rebuildReverse(map); }
  function rebuildReverse(map) {
    reverse = {}; reverseArgs = {};
    for (var id in map) {
      if (!map.hasOwnProperty(id)) continue;
      var c = comboOf(map[id]);
      if (c) { reverse[c] = id; reverseArgs[c] = argsOf(map[id]); }
    }
  }

  // A stored binding is either a plain "Combo" string (legacy) or an object
  // { combo: "Combo", args: { ... } } carrying per-binding arg overrides. These
  // helpers read both forms so the rest of the code never has to branch.
  function comboOf(entry) {
    if (!entry) return '';
    return (typeof entry === 'string') ? entry : (entry.combo || '');
  }
  function argsOf(entry) {
    return (entry && typeof entry === 'object') ? (entry.args || null) : null;
  }
  // Persist the object form only when there are real overrides, otherwise keep
  // the compact legacy string so untouched bindings stay backward compatible.
  function makeEntry(combo, args) {
    var has = false, k;
    if (args) for (k in args) { if (args.hasOwnProperty(k) && args[k] != null && args[k] !== '') { has = true; break; } }
    return has ? { combo: combo, args: args } : combo;
  }

  // Same merge semantics as home-screen.js mergedArgs: override wins only when
  // its value is non-null/non-empty, otherwise the action's baked-in arg stands.
  function mergedArgs(action, override) {
    var base = (action && action.invoke && action.invoke.args) || (action && action.args) || {}, out = {}, k;
    for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
    if (override) for (k in override) if (override.hasOwnProperty(k) && override[k] != null && override[k] !== '') out[k] = override[k];
    return out;
  }

  // ---- command registry (built fresh: tools/actions are stable after load) ----
  function commands() {
    var list = [];
    list.push({ id: 'app:search', label: 'Focus search', group: 'App', run: function () { if (hooks.focusSearch) hooks.focusSearch(); } });
    list.push({ id: 'app:home', label: 'Go to Home', group: 'App', run: function () { if (hooks.goHome) hooks.goHome(); } });
    list.push({ id: 'app:browse', label: 'Browse all tools', group: 'App', run: function () { if (hooks.browse) hooks.browse(); } });
    list.push({ id: 'app:appearance', label: 'Open Appearance', group: 'App', run: function () { if (R.appearance) R.appearance.open(); } });
    list.push({ id: 'app:keybinds', label: 'Open Keybinds', group: 'App', run: function () { open(); } });

    var tools = (R.tools && R.tools.list) ? R.tools.list() : [];
    tools.forEach(function (t) {
      list.push({ id: 'tool:' + t.id, label: 'Open ' + (t.title || t.id), group: t.group || 'Tools', run: function () { if (hooks.openTool) hooks.openTool(t.id); } });
    });

    // Every one-click action is bindable, including each saved/built-in preset,
    // expression and script. The action is attached so a binding can carry its
    // own args (e.g. an easing preset as Keyframes vs Expression).
    var actions = (R.homeActions && R.homeActions.all) ? R.homeActions.all() : [];
    actions.forEach(function (a) {
      if (a.kind === 'open' || (!a.build && (!a.invoke || !a.invoke.method))) return;
      list.push({ id: 'action:' + a.id, label: a.label, group: a.group || 'Apply', action: a, run: function (over) { runAction(a, over); } });
    });

    // Providers contribute live commands they own (e.g. each tool's preset
    // tiles, each colour swatch), so anything on screen can be bound by key.
    for (var pi = 0; pi < providers.length; pi++) {
      var extra;
      try { extra = providers[pi]() || []; } catch (e) { extra = []; }
      for (var ei = 0; ei < extra.length; ei++) list.push(extra[ei]);
    }
    return list;
  }

  // Anything can register a function returning bindable commands. Called fresh
  // each time the registry is built, so it always reflects current state.
  var providers = [];
  function addProvider(fn) { if (typeof fn === 'function') providers.push(fn); }

  function runAction(a, override) {
    if (!hooks.invoke) return;
    var args = mergedArgs(a, override);
    var inv = a.build ? a.build(args) : { method: a.invoke.method, args: args };
    hooks.invoke(inv.method, inv.args)
      .then(function () { if (hooks.toast) hooks.toast(a.label + ' applied', { kind: 'success' }); if (hooks.refreshSelection) hooks.refreshSelection(); })
      .catch(function (err) { if (hooks.toast) hooks.toast((err && err.message) || ('Could not apply ' + a.label), { kind: 'error' }); });
  }

  function commandById(id) {
    var list = commands();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  // ---- combo encoding ----
  function comboFromEvent(e) {
    var k = e.key;
    if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta' || k === 'OS') return null; // lone modifier
    var parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    parts.push(normKey(k));
    return parts.join('+');
  }
  function normKey(k) {
    if (k === ' ') return 'Space';
    if (k.indexOf('Arrow') === 0) return k.slice(5);
    if (k.length === 1) return k.toUpperCase();
    return k;
  }

  // ---- global handler ----
  function isEditable(t) {
    if (!t) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }
  function onKeyDown(e) {
    if (suspended || isEditable(e.target)) return;
    var combo = comboFromEvent(e);
    if (!combo) return;
    var id = reverse[combo];
    if (!id) return;
    var cmd = commandById(id);
    if (!cmd) return;
    e.preventDefault();
    try { cmd.run(reverseArgs[combo]); } catch (err) { /* a command failing should not break key handling */ }
  }

  function init(h) {
    hooks = h || {};
    rebuildReverse(load());
    if (!installed) { document.addEventListener('keydown', onKeyDown, true); installed = true; }
  }

  // ---- recording + binding (shared by the manager and in-context callers) ----
  function modPrefix(e) {
    var p = [];
    if (e.ctrlKey) p.push('Ctrl');
    if (e.altKey) p.push('Alt');
    if (e.shiftKey) p.push('Shift');
    if (e.metaKey) p.push('Meta');
    return p;
  }
  // Capture the next combo. onCombo(combo) on commit; nothing on Esc. btn is an
  // optional button to show live feedback on.
  function recordInto(onCombo, btn) {
    suspended = true;
    if (btn) { btn.classList.add('is-recording'); btn.textContent = 'Press keys...'; }
    function reset() { suspended = false; if (btn) { btn.classList.remove('is-recording'); btn.textContent = 'Set'; } window.removeEventListener('keydown', cap, true); window.removeEventListener('keyup', prev, true); }
    function prev(e) { if (e.key === 'Escape' || !btn) return; var p = modPrefix(e); btn.textContent = p.length ? (p.join(' + ') + ' + ...') : 'Press keys...'; }
    function cap(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { reset(); return; }
      var combo = comboFromEvent(e);
      if (!combo) { prev(e); return; }
      reset(); onCombo(combo);
    }
    window.addEventListener('keydown', cap, true);
    window.addEventListener('keyup', prev, true);
  }

  // Assign combo to id, stealing it from any other command (never a silent clash).
  // Pass args to set per-binding overrides; omit to keep the existing ones.
  function setComboFor(id, combo, args) {
    var map = load();
    var stolen = null;
    for (var k in map) { if (map.hasOwnProperty(k) && comboOf(map[k]) === combo && k !== id) { stolen = k; delete map[k]; } }
    var keepArgs = (args !== undefined) ? args : argsOf(map[id]);
    map[id] = makeEntry(combo, keepArgs);
    save(map);
    return stolen;
  }
  function clearBind(id) { var map = load(); delete map[id]; save(map); }
  function comboFor(id) { return comboOf(load()[id]); }
  function record(id, onDone, btn) {
    recordInto(function (combo) {
      var stolen = setComboFor(id, combo);
      if (stolen && R.ui && R.ui.toast) R.ui.toast('Reassigned ' + combo, { kind: 'info' });
      if (onDone) onDone(combo);
    }, btn);
  }

  // ---- manager modal: shows ACTIVE binds; search reveals more to add ----
  function open(opts) {
    if (!R.ui.modal) return;
    opts = opts || {};
    var list = commands();
    var rowEls = [];
    var rowsWrap = el('div.rb-kb-list');
    var empty = el('div.rb-kb-empty', { text: 'No shortcuts yet. Search a command below (or use "Set shortcut" on a tool) to add one.' });
    var search = el('input.rb-kb-search', { type: 'text', placeholder: 'Search to bind a command...', spellcheck: 'false' });

    function isBound(cmd) { return !!comboFor(cmd.id); }

    function refreshRow(r) {
      var combo = comboFor(r.cmd.id);
      r.comboEl.textContent = combo || 'Unset';
      r.comboEl.classList.toggle('is-set', !!combo);
      r.clrBtn.style.visibility = combo ? '' : 'hidden';
      if (r.cfgWrap) r.cfgWrap.style.display = combo ? '' : 'none';
      applyFilter();
    }
    function labelOf(id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i].label; } return 'another command'; }
    function setCombo(cmd, combo) {
      var stolen = setComboFor(cmd.id, combo);
      rowEls.forEach(refreshRow);
      if (stolen && R.ui.toast) R.ui.toast('Reassigned ' + combo + ' from ' + labelOf(stolen), { kind: 'info' });
    }
    function clearCombo(cmd) { clearBind(cmd.id); rowEls.forEach(refreshRow); }

    // For an action carrying a config (e.g. easing 'Apply as'), an inline select
    // edits the bound args so the same key can apply Keyframes or Expression.
    function configControl(cmd) {
      var a = cmd.action;
      if (!a || !a.config || !a.config.length) return null;
      var wrap = el('span.rb-kb-cfg');
      a.config.forEach(function (f) {
        if (f.type !== 'select' || !f.options) return;
        var cur = (argsOf(load()[cmd.id]) || {})[f.arg];
        if (cur == null) cur = ((a.invoke && a.invoke.args) || a.args || {})[f.arg];
        var sel = el('select.rb-kb-select', { title: f.label });
        f.options.forEach(function (o) {
          sel.appendChild(el('option', { value: o.value, text: o.label, selected: (o.value === cur) ? 'selected' : null }));
        });
        sel.addEventListener('change', function () {
          var map = load();
          var args = argsOf(map[cmd.id]) || {};
          args[f.arg] = sel.value;
          map[cmd.id] = makeEntry(comboFor(cmd.id), args);
          save(map);
        });
        wrap.appendChild(el('span.rb-kb-cfg-lab', { text: f.label }));
        wrap.appendChild(sel);
      });
      return wrap;
    }

    function applyFilter() {
      var q = search.value.trim().toLowerCase();
      var anyVisible = false;
      rowEls.forEach(function (r) {
        // Default view = only bound. Searching reveals all matches so new ones
        // can be added.
        var match = !q || r.find.indexOf(q) !== -1;
        var show = match && (q ? true : isBound(r.cmd));
        r.rowNode.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      });
      empty.style.display = anyVisible ? 'none' : '';
    }

    list.forEach(function (cmd) {
      var comboEl = el('span.rb-kb-combo');
      var recBtn = el('button.rb-btn.is-ghost.rb-kb-rec', { type: 'button' }, ['Set']);
      var clrBtn = el('button.rb-kb-clr', { type: 'button', title: 'Remove shortcut' }, ['×']);
      var cfg = configControl(cmd);
      var rowNode = el('div.rb-kb-row', null, [
        el('span.rb-kb-cmd', null, [el('span.rb-kb-grp', { text: cmd.group }), el('span.rb-kb-name', { text: cmd.label })]),
        cfg || el('span'), comboEl, recBtn, clrBtn
      ]);
      recBtn.addEventListener('click', function () { recordInto(function (combo) { setCombo(cmd, combo); }, recBtn); });
      clrBtn.addEventListener('click', function () { clearCombo(cmd); });
      var r = { cmd: cmd, comboEl: comboEl, clrBtn: clrBtn, cfgWrap: cfg, rowNode: rowNode, find: (cmd.group + ' ' + cmd.label).toLowerCase() };
      rowEls.push(r); refreshRow(r);
      rowsWrap.appendChild(rowNode);
    });

    search.addEventListener('input', applyFilter);

    var body = el('div.rb-kb', null, [
      el('div.rb-kb-help', { text: 'Your active shortcuts. Change or remove them here; search a command to add a new one. Shortcuts run everywhere except while typing in a field.' }),
      search, empty, rowsWrap
    ]);
    var doneBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { handle.close('confirm'); } }, ['Done']);
    suspended = true;
    var handle = R.ui.modal({
      title: 'Keybinds', width: 480, className: 'rb-modal-home', body: body, footer: [doneBtn],
      initialFocus: search, onClose: function () { suspended = false; }
    });

    applyFilter();
    // In-context entry: jump straight to one command (prefill search to reveal it).
    if (opts.focusId) {
      var fc = commandById(opts.focusId);
      if (fc) { search.value = fc.label; applyFilter(); }
    }
  }

  R.keybinds = { init: init, open: open, comboFor: comboFor, record: record, clearBind: clearBind, addProvider: addProvider };
})(window.Rebound = window.Rebound || {});
