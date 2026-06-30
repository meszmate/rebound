/*
 * Rebound, user-assignable keyboard shortcuts.
 *
 * A persisted map of { actionId: chord } where an action is any Home-action id
 * (see home-actions.js). The dispatcher in main.js builds a chord from each
 * keydown and runs the bound action. NOTE: a CEP panel only receives key events
 * while it is FOCUSED — these are panel shortcuts, not global AE hotkeys (which
 * only KBar / AE's own keymap can register). The Settings UI states this.
 *
 * Chord format: modifier tokens then the key, e.g. "Alt+E", "Mod+Shift+R".
 * "Mod" = Cmd on macOS / Ctrl on Windows. Plain letters are normalized upper.
 */
;(function (R) {
  'use strict';

  var KEY = 'keybinds';

  // Chords the shell already owns — never let a user binding shadow these.
  var RESERVED = { 'Mod+K': 1, 'Mod+Enter': 1, '/': 1, 'Escape': 1, 'Enter': 1 };

  function load() { return R.disk.read(KEY, {}) || {}; }
  function save(map) { R.disk.write(KEY, map || {}); }

  function getAll() { return load(); }
  function bindingFor(actionId) { return load()[actionId] || null; }

  // Assign chord to actionId. A chord is unique: assigning it clears any other
  // action that held it. Passing a falsy chord clears the action's binding.
  function setBinding(actionId, chord) {
    var m = load(), k;
    if (chord) {
      for (k in m) if (m.hasOwnProperty(k) && m[k] === chord) delete m[k];
      m[actionId] = chord;
    } else {
      delete m[actionId];
    }
    save(m);
    return m;
  }
  function clearBinding(actionId) { return setBinding(actionId, null); }

  function isReserved(chord) { return !!RESERVED[chord]; }

  // Normalize a keydown into a chord string, or null if it is only a modifier.
  function chordFromEvent(e) {
    var key = e.key;
    if (!key || key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') return null;
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Mod');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (key === ' ' || key === 'Spacebar') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
    return parts.join('+');
  }

  function actionIdForChord(chord) {
    if (!chord) return null;
    var m = load();
    for (var k in m) if (m.hasOwnProperty(k) && m[k] === chord) return k;
    return null;
  }

  R.keybinds = {
    getAll: getAll,
    bindingFor: bindingFor,
    setBinding: setBinding,
    clearBinding: clearBinding,
    isReserved: isReserved,
    chordFromEvent: chordFromEvent,
    actionIdForChord: actionIdForChord
  };
})(window.Rebound = window.Rebound || {});
