/*
 * Rebound — host bridge.
 *
 * The ONLY module that touches CSInterface. Everything else calls
 * Rebound.bridge.invoke(method, args) and gets back a Promise of the host
 * command's result (or a rejected Promise carrying a structured host error).
 *
 * evalScript is asynchronous on Windows and synchronous on macOS and always
 * yields a string, so every call is wrapped in a Promise and routed through
 * the JSON envelope protocol defined in host/lib/core.jsx.
 */
;(function (R) {
  'use strict';

  // new CSInterface() dereferences window.__adobe_cep__, which only exists
  // inside the host — guard it so the panel still loads in a plain browser.
  var cs = null;
  try {
    if (typeof CSInterface !== 'undefined') cs = new CSInterface();
  } catch (e) {
    cs = null;
  }
  var EVAL_ERROR = 'EvalScript error.';

  function rawEval(code) {
    return new Promise(function (resolve, reject) {
      if (!cs) {
        reject(new Error('Not running inside the host application (CSInterface unavailable).'));
        return;
      }
      try {
        cs.evalScript(code, function (result) {
          resolve(typeof result === 'string' ? result : String(result));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  var bootPromise = null;

  // Load the ExtendScript host once, resolving with its reported version.
  function ensureHost() {
    if (bootPromise) {
      return bootPromise;
    }
    bootPromise = (function () {
      if (!cs) {
        return Promise.reject(new Error('Host bridge unavailable outside the host application.'));
      }
      var extRoot = cs.getSystemPath(SystemPath.EXTENSION);
      var indexPath = extRoot + '/host/index.jsx';
      var boot =
        '(function(){try{' +
        '$.__rebound_root=' + JSON.stringify(extRoot) + ';' +
        '$.evalFile(new File(' + JSON.stringify(indexPath) + '));' +
        'return ($.__rebound&&$.__rebound.version)?("ok:"+$.__rebound.version):"noversion";' +
        '}catch(e){return "ERR:"+e.toString();}})()';
      return rawEval(boot).then(function (res) {
        if (typeof res === 'string' && res.indexOf('ok:') === 0) {
          return res.substring(3);
        }
        throw new Error('Rebound host failed to load: ' + res);
      });
    })();
    return bootPromise;
  }

  function parseEnvelope(raw, method) {
    if (raw === EVAL_ERROR) {
      throw new Error('Host evaluation error while running "' + method + '".');
    }
    var env;
    try {
      env = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        'Unexpected host response for "' + method + '": ' + String(raw).substring(0, 200)
      );
    }
    if (!env || env.ok !== true) {
      var info = (env && env.error) || { message: 'Unknown host error.' };
      var err = new Error(info.message || 'Host error.');
      err.hostError = info;
      err.method = method;
      throw err;
    }
    return env.data;
  }

  // Call a registered host command. Resolves with its data, rejects with Error.
  function invoke(method, args) {
    return ensureHost()
      .then(function () {
        var argsJson = JSON.stringify(args == null ? {} : args);
        // JSON.stringify(argsJson) safely embeds the args string as an
        // ExtendScript string literal; the host JSON.parses it back.
        var code =
          '$.__rebound.dispatch(' + JSON.stringify(method) + ',' + JSON.stringify(argsJson) + ')';
        return rawEval(code);
      })
      .then(function (raw) {
        return parseEnvelope(raw, method);
      });
  }

  // Force a fresh host reload (used by the dev "reload host" affordance).
  function reloadHost() {
    bootPromise = null;
    return ensureHost();
  }

  R.bridge = {
    available: !!cs,
    cs: cs,
    rawEval: rawEval,
    ensureHost: ensureHost,
    reloadHost: reloadHost,
    invoke: invoke
  };
})(window.Rebound = window.Rebound || {});
