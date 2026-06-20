/*
 * Rebound, tiny synchronous event bus.
 * No dependencies; used for cross-module signalling inside one panel.
 */
;(function (R) {
  'use strict';

  function createBus() {
    var listeners = {};

    function on(type, fn) {
      if (!listeners[type]) {
        listeners[type] = [];
      }
      listeners[type].push(fn);
      return function off() {
        var arr = listeners[type];
        if (!arr) return;
        var i = arr.indexOf(fn);
        if (i !== -1) arr.splice(i, 1);
      };
    }

    function once(type, fn) {
      var off = on(type, function (payload) {
        off();
        fn(payload);
      });
      return off;
    }

    function emit(type, payload) {
      var arr = listeners[type];
      if (!arr) return;
      // Copy so handlers can unsubscribe during emit.
      var copy = arr.slice();
      for (var i = 0; i < copy.length; i++) {
        try {
          copy[i](payload);
        } catch (e) {
          if (R.log) R.log.error('Event handler for "' + type + '" failed', e);
        }
      }
    }

    return { on: on, once: once, emit: emit };
  }

  R.createBus = createBus;
  R.bus = createBus();
})(window.Rebound = window.Rebound || {});
