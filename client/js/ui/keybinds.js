/*
 * Rebound, customizable keybinds.
 *
 * Assign a keyboard shortcut to any command you want: open a tool, run a
 * one-click apply, or an app command (search, Home, Appearance...). Bindings are
 * fully user-defined (nothing ships pre-bound), persisted, and run everywhere
 * except while you are typing in a field.
 *
 *   R.keybinds.init({ openTool, invoke, toast, refreshSelection, focusSearch, goHome, browse })
 *   R.keybinds.open()   // the manager modal
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var hooks = {};
  var installed = false;
  var suspended = false;      // true while recording or the manager is open
  var reverse = {};           // combo -> commandId

  function load() { return R.disk.read('keybinds', {}) || {}; }
  function save(map) { R.disk.write('keybinds', map); rebuildReverse(map); }
  function rebuildReverse(map) {
    reverse = {};
    for (var id in map) { if (map.hasOwnProperty(id) && map[id]) reverse[map[id]] = id; }
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
    // expression and script (they all surface through homeActions.all). Keep each
    // action's own group so the 100+ commands stay navigable in the manager.
    var actions = (R.homeActions && R.homeActions.all) ? R.homeActions.all() : [];
    actions.forEach(function (a) {
      if (a.kind === 'open' || !a.invoke || !a.invoke.method) return;
      list.push({ id: 'action:' + a.id, label: a.label, group: a.group || 'Apply', run: function () { runAction(a); } });
    });
    return list;
  }

  function runAction(a) {
    if (!hooks.invoke) return;
    hooks.invoke(a.invoke.method, a.invoke.args || {})
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
    try { cmd.run(); } catch (err) { /* a command failing should not break key handling */ }
  }

  function init(h) {
    hooks = h || {};
    rebuildReverse(load());
    if (!installed) { document.addEventListener('keydown', onKeyDown, true); installed = true; }
  }

  // ---- manager modal ----
  function open() {
    if (!R.ui.modal) return;
    var map = load();
    var list = commands();
    var rowEls = [];
    var rowsWrap = el('div.rb-kb-list');
    var search = el('input.rb-kb-search', { type: 'text', placeholder: 'Search commands...', spellcheck: 'false' });

    function refreshRow(r) {
      var combo = map[r.cmd.id];
      r.comboEl.textContent = combo || 'Unset';
      r.comboEl.classList.toggle('is-set', !!combo);
      r.clrBtn.style.visibility = combo ? '' : 'hidden';
    }
    function labelOf(id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i].label; } return 'another command'; }
    function setCombo(cmd, combo) {
      // A combo maps to exactly one command: if it was already taken, steal it and
      // tell the user which command lost it, so a clash is never silent.
      var stolenFrom = null;
      for (var id in map) { if (map.hasOwnProperty(id) && map[id] === combo && id !== cmd.id) { stolenFrom = id; delete map[id]; } }
      map[cmd.id] = combo;
      save(map);
      rowEls.forEach(refreshRow);
      if (stolenFrom && R.ui.toast) R.ui.toast('Reassigned ' + combo + ' from ' + labelOf(stolenFrom), { kind: 'info' });
    }
    function clearCombo(cmd) { delete map[cmd.id]; save(map); rowEls.forEach(refreshRow); }

    // Record a combo with live feedback: as you hold modifiers the button shows
    // them (Ctrl + Shift + ...), and the first non-modifier key commits the combo.
    function startRecord(cmd, btn) {
      suspended = true;
      btn.classList.add('is-recording');
      btn.textContent = 'Press keys...';
      function modPrefix(e) {
        var p = [];
        if (e.ctrlKey) p.push('Ctrl');
        if (e.altKey) p.push('Alt');
        if (e.shiftKey) p.push('Shift');
        if (e.metaKey) p.push('Meta');
        return p;
      }
      function preview(e) {
        if (e.key === 'Escape') return;
        var p = modPrefix(e);
        btn.textContent = p.length ? (p.join(' + ') + ' + ...') : 'Press keys...';
      }
      function done() {
        suspended = false;
        btn.classList.remove('is-recording');
        btn.textContent = 'Set';
        window.removeEventListener('keydown', cap, true);
        window.removeEventListener('keyup', preview, true);
      }
      function cap(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { done(); return; }
        var combo = comboFromEvent(e);
        if (!combo) { preview(e); return; } // modifier held: show it live, keep waiting
        setCombo(cmd, combo);
        done();
      }
      window.addEventListener('keydown', cap, true);
      window.addEventListener('keyup', preview, true);
    }

    list.forEach(function (cmd) {
      var comboEl = el('span.rb-kb-combo');
      var recBtn = el('button.rb-btn.is-ghost.rb-kb-rec', { type: 'button' }, ['Set']);
      var clrBtn = el('button.rb-kb-clr', { type: 'button', title: 'Clear shortcut' }, ['×']);
      var rowNode = el('div.rb-kb-row', { 'data-find': (cmd.group + ' ' + cmd.label).toLowerCase() }, [
        el('span.rb-kb-cmd', null, [el('span.rb-kb-grp', { text: cmd.group }), el('span.rb-kb-name', { text: cmd.label })]),
        comboEl, recBtn, clrBtn
      ]);
      recBtn.addEventListener('click', function () { startRecord(cmd, recBtn); });
      clrBtn.addEventListener('click', function () { clearCombo(cmd); });
      var r = { cmd: cmd, comboEl: comboEl, clrBtn: clrBtn, rowNode: rowNode };
      rowEls.push(r); refreshRow(r);
      rowsWrap.appendChild(rowNode);
    });

    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      rowEls.forEach(function (r) {
        var hit = !q || r.rowNode.getAttribute('data-find').indexOf(q) !== -1;
        r.rowNode.style.display = hit ? '' : 'none';
      });
    });

    var body = el('div.rb-kb', null, [
      el('div.rb-kb-help', { text: 'Bind any tool, action, easing preset, expression or script. Click Set, then press your combination, e.g. Ctrl+Shift+E (Esc cancels). Shortcuts run everywhere except while typing in a field.' }),
      search, rowsWrap
    ]);
    var doneBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { handle.close('confirm'); } }, ['Done']);
    suspended = true;
    var handle = R.ui.modal({
      title: 'Keybinds', width: 480, className: 'rb-modal-home', body: body, footer: [doneBtn],
      initialFocus: search, onClose: function () { suspended = false; }
    });
  }

  R.keybinds = { init: init, open: open };
})(window.Rebound = window.Rebound || {});
