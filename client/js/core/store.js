/*
 * Rebound, reactive store + JSON persistence.
 *
 * createStore() is a tiny framework-free observable: get / set / update /
 * subscribe / select. Every view renders from one store so the multi-space
 * graph, live selection poll, and before/after preview stay consistent.
 *
 * disk.* persists versioned JSON under USER_DATA/Rebound/ using the Node.js
 * runtime the manifest enables (--enable-nodejs); it falls back to
 * localStorage when Node is unavailable (e.g. a plain browser dev session).
 */
;(function (R) {
  'use strict';

  // ---- Reactive store ------------------------------------------------------

  function createStore(initial) {
    var state = initial || {};
    var subs = [];
    var selectorSubs = [];

    function get() {
      return state;
    }

    function set(next) {
      var prev = state;
      state = next;
      notify(prev);
    }

    function update(patch) {
      var next = {};
      for (var k in state) {
        if (state.hasOwnProperty(k)) next[k] = state[k];
      }
      if (typeof patch === 'function') {
        patch = patch(state);
      }
      for (var p in patch) {
        if (patch.hasOwnProperty(p)) next[p] = patch[p];
      }
      set(next);
    }

    function notify(prev) {
      for (var i = 0; i < subs.length; i++) {
        subs[i](state, prev);
      }
      for (var j = 0; j < selectorSubs.length; j++) {
        var s = selectorSubs[j];
        var nextVal = s.selector(state);
        if (!shallowEqual(nextVal, s.last)) {
          s.last = nextVal;
          s.fn(nextVal, state);
        }
      }
    }

    function subscribe(fn) {
      subs.push(fn);
      return function unsubscribe() {
        var i = subs.indexOf(fn);
        if (i !== -1) subs.splice(i, 1);
      };
    }

    // Subscribe to a derived slice; fn fires only when the slice changes.
    function select(selector, fn) {
      var entry = { selector: selector, fn: fn, last: selector(state) };
      selectorSubs.push(entry);
      return function unsubscribe() {
        var i = selectorSubs.indexOf(entry);
        if (i !== -1) selectorSubs.splice(i, 1);
      };
    }

    return { get: get, set: set, update: update, subscribe: subscribe, select: select };
  }

  function shallowEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    var ak = Object.keys(a);
    var bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (var i = 0; i < ak.length; i++) {
      if (a[ak[i]] !== b[ak[i]]) return false;
    }
    return true;
  }

  // ---- Persistence ---------------------------------------------------------

  var node = (function () {
    try {
      if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
        return {
          fs: window.cep_node.require('fs'),
          path: window.cep_node.require('path')
        };
      }
    } catch (e) { /* not in CEP, or Node disabled */ }
    return null;
  })();

  function dataDir() {
    if (!node) return null;
    try {
      var base = R.bridge && R.bridge.cs
        ? R.bridge.cs.getSystemPath(SystemPath.USER_DATA)
        : null;
      if (!base) return null;
      var dir = node.path.join(base, 'Rebound');
      if (!node.fs.existsSync(dir)) {
        node.fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    } catch (e) {
      if (R.log) R.log.warn('Persistence: could not resolve data dir', e);
      return null;
    }
  }

  function fileFor(name) {
    var dir = dataDir();
    return dir ? node.path.join(dir, name + '.json') : null;
  }

  function readJson(name, fallback) {
    var file = fileFor(name);
    if (file) {
      try {
        if (node.fs.existsSync(file)) {
          return JSON.parse(node.fs.readFileSync(file, 'utf8'));
        }
      } catch (e) {
        if (R.log) R.log.error('Persistence: failed reading ' + name, e);
        // Keep a copy of the corrupt file so nothing is silently lost.
        try { node.fs.renameSync(file, file + '.corrupt'); } catch (e2) { /* ignore */ }
      }
      return fallback;
    }
    // localStorage fallback
    try {
      var raw = typeof localStorage !== 'undefined' ? localStorage.getItem('rebound:' + name) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch (e3) {
      return fallback;
    }
  }

  function writeJson(name, value) {
    var json = JSON.stringify(value, null, 2);
    var file = fileFor(name);
    if (file) {
      try {
        node.fs.writeFileSync(file, json, 'utf8');
        return true;
      } catch (e) {
        if (R.log) R.log.error('Persistence: failed writing ' + name, e);
        return false;
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('rebound:' + name, json);
        return true;
      }
    } catch (e2) { /* ignore */ }
    return false;
  }

  R.createStore = createStore;
  R.disk = {
    available: !!node,
    dir: dataDir,
    read: readJson,
    write: writeJson
  };
})(window.Rebound = window.Rebound || {});
