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

  // --- Reference-counted undo groups -----------------------------------------
  // After Effects does NOT support nested undo groups: a second beginUndoGroup
  // while one is open triggers "Undo group mismatch, will attempt to fix". The
  // dispatch opens a group for any labelled command, and several commands ALSO
  // open their own — so they nest. Route every begin/end through this counter so
  // only the OUTERMOST pair touches AE; inner ones are no-ops. resetUndo() is the
  // leak safety-net the dispatch runs in `finally`, force-closing anything a
  // command left open so the mismatch can never persist across calls.
  var undoDepth = 0;
  function beginUndo(label) {
    if (undoDepth === 0) { try { app.beginUndoGroup(label || 'Rebound'); } catch (e) {} }
    undoDepth++;
  }
  function endUndo() {
    if (undoDepth <= 0) return;
    undoDepth--;
    if (undoDepth === 0) { try { app.endUndoGroup(); } catch (e) {} }
  }
  function resetUndo() {
    while (undoDepth > 0) { try { app.endUndoGroup(); } catch (e) {} undoDepth--; }
    undoDepth = 0;
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
      beginUndo(cmd.undo);
      try {
        return envelope(true, cmd.fn(args));
      } catch (runErr) {
        return envelope(false, errorInfo(runErr));
      } finally {
        resetUndo(); // close our group + any a command left open (never nest/leak)
      }
    }

    // Unlabelled commands may still open their own group (e.g. scripts.run); the
    // reset is a safety-net so a thrown snippet can't leave the stack unbalanced.
    try {
      return envelope(true, cmd.fn(args));
    } catch (runErr2) {
      return envelope(false, errorInfo(runErr2));
    } finally {
      resetUndo();
    }
  }

  api.version = '0.1.0';
  api.commands = commands;
  api.register = register;
  api.dispatch = dispatch;
  api.envelope = envelope;
  api.beginUndo = beginUndo;
  api.endUndo = endUndo;
  api.resetUndo = resetUndo;
  return api;
})($.__rebound);
