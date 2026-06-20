/*
 * Rebound host RPC core.
 *
 * The panel calls $.__rebound.dispatch(method, argsJson) over the CEP
 * evalScript bridge and always receives back a JSON envelope string:
 *
 *   success:  {"ok":true,"data": <result>}
 *   failure:  {"ok":false,"error":{"message":...,"line":...}}
 *
 * Command functions take a single parsed-args object and return a plain value
 * (or undefined). Commands registered with an undo label run inside one
 * beginUndoGroup/endUndoGroup so a whole batch collapses to a single Ctrl-Z.
 */
$.__rebound = (function (existing) {
  var api = existing || {};
  var commands = api.commands || {};

  function register(name, fn, undoLabel) {
    commands[name] = { fn: fn, undo: undoLabel || null };
  }

  function envelope(ok, payload) {
    try {
      if (ok) {
        return JSON.stringify({ ok: true, data: payload === undefined ? null : payload });
      }
      return JSON.stringify({ ok: false, error: payload });
    } catch (e) {
      return '{"ok":false,"error":{"message":"Host failed to serialize its response."}}';
    }
  }

  function errorInfo(e) {
    return {
      message: e && e.message ? e.message : String(e),
      line: e && typeof e.line !== 'undefined' ? e.line : null,
      fileName: e && e.fileName ? String(e.fileName) : null,
      name: e && e.name ? String(e.name) : 'Error'
    };
  }

  function dispatch(name, argsJson) {
    var cmd = commands[name];
    if (!cmd) {
      return envelope(false, { message: 'Unknown command: ' + name, code: 'UNKNOWN_COMMAND' });
    }

    var args;
    try {
      args = argsJson ? JSON.parse(argsJson) : {};
    } catch (parseErr) {
      return envelope(false, { message: 'Could not parse command arguments.', code: 'BAD_ARGS' });
    }

    if (cmd.undo) {
      app.beginUndoGroup(cmd.undo);
      try {
        return envelope(true, cmd.fn(args));
      } catch (runErr) {
        return envelope(false, errorInfo(runErr));
      } finally {
        app.endUndoGroup();
      }
    }

    try {
      return envelope(true, cmd.fn(args));
    } catch (runErr2) {
      return envelope(false, errorInfo(runErr2));
    }
  }

  api.version = '0.1.0';
  api.commands = commands;
  api.register = register;
  api.dispatch = dispatch;
  api.envelope = envelope;
  return api;
})($.__rebound);
