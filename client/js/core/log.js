/*
 * Rebound — logging + a small in-memory ring buffer.
 * Failures surface to the user as toasts (see ui/toast.js); the ring buffer
 * backs a "copy log" affordance so users can paste diagnostics into an issue.
 */
;(function (R) {
  'use strict';

  var MAX = 300;
  var buffer = [];
  var hasConsole = typeof console !== 'undefined';

  function record(level, args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a instanceof Error) {
        parts.push(a.message + (a.hostError ? ' [' + (a.hostError.message || '') + ']' : ''));
      } else if (typeof a === 'object') {
        try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
      } else {
        parts.push(String(a));
      }
    }
    var line = '[' + level + '] ' + parts.join(' ');
    buffer.push(line);
    if (buffer.length > MAX) buffer.shift();
    if (hasConsole && console[level]) {
      console[level].apply(console, args);
    } else if (hasConsole) {
      console.log(line);
    }
    return line;
  }

  R.log = {
    debug: function () { return record('debug', arguments); },
    info: function () { return record('info', arguments); },
    warn: function () { return record('warn', arguments); },
    error: function () { return record('error', arguments); },
    dump: function () { return buffer.join('\n'); },
    clear: function () { buffer.length = 0; }
  };
})(window.Rebound = window.Rebound || {});
