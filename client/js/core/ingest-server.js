/*
 * Rebound, ingest server.
 *
 * A loopback HTTP server hosted inside the panel on CEP's Node runtime. It is
 * how a design-app plugin (Figma, ...) hands a Rebound IR document to After
 * Effects: the exporter POSTs the IR, this server validates and forwards it to
 * the importer, and replies with the fidelity report.
 *
 * Bound to 127.0.0.1 only (never 0.0.0.0). It tries a small ordered range of
 * ports and uses the first free one, so a stale port never blocks a connect;
 * the chosen port is published by the Import feature to bridge.json. CORS is
 * fully open because the Figma plugin iframe posts from a null origin.
 *
 *   R.ingestServer.start({ onIR: fn, ping: { irVersion, panelVersion } })
 *     -> Promise<port>
 */
;(function (R) {
  'use strict';

  var node = (function () {
    try {
      if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
        return { http: window.cep_node.require('http') };
      }
    } catch (e) { /* not in CEP */ }
    return null;
  })();

  var PORTS = [7890, 7891, 7892, 7893];

  var server = null;
  var activePort = null;
  var config = { onIR: null, ping: {} };

  function available() {
    return !!node;
  }

  function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  function sendJson(res, status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  }

  function handlePing(res) {
    sendJson(res, 200, {
      ok: true,
      app: 'rebound',
      irVersion: config.ping.irVersion || null,
      panelVersion: config.ping.panelVersion || null
    });
  }

  function handleIR(req, res) {
    var body = '';
    var tooBig = false;
    req.on('data', function (chunk) {
      body += chunk;
      // Guard against a runaway upload (base64 images can be large but bounded).
      if (body.length > 96 * 1024 * 1024) { tooBig = true; req.destroy(); }
    });
    req.on('end', function () {
      if (tooBig) { sendJson(res, 413, { ok: false, error: 'Payload too large.' }); return; }
      var ir;
      try { ir = JSON.parse(body); } catch (e) {
        sendJson(res, 400, { ok: false, error: 'Could not parse IR JSON.' });
        return;
      }
      if (!config.onIR) {
        sendJson(res, 503, { ok: false, error: 'Importer not ready.' });
        return;
      }
      try {
        Promise.resolve(config.onIR(ir)).then(function (report) {
          sendJson(res, 200, { ok: true, report: report });
        }).catch(function (err) {
          sendJson(res, 500, { ok: false, error: (err && err.message) || String(err) });
        });
      } catch (err2) {
        sendJson(res, 500, { ok: false, error: (err2 && err2.message) || String(err2) });
      }
    });
  }

  function onRequest(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    var url = req.url || '';
    if (req.method === 'GET' && url.indexOf('/rebound/ping') === 0) { handlePing(res); return; }
    if (req.method === 'POST' && url.indexOf('/rebound/ir') === 0) { handleIR(req, res); return; }
    sendJson(res, 404, { ok: false, error: 'Not found.' });
  }

  function listenOn(idx, resolve, reject) {
    if (idx >= PORTS.length) {
      reject(new Error('No free loopback port in range ' + PORTS[0] + '-' + PORTS[PORTS.length - 1] + '.'));
      return;
    }
    var port = PORTS[idx];
    var s = node.http.createServer(onRequest);
    s.on('error', function () {
      try { s.close(); } catch (e) { /* ignore */ }
      listenOn(idx + 1, resolve, reject);
    });
    s.listen(port, '127.0.0.1', function () {
      server = s;
      activePort = port;
      resolve(port);
    });
  }

  function start(opts) {
    opts = opts || {};
    if (opts.onIR) config.onIR = opts.onIR;
    if (opts.ping) config.ping = opts.ping;
    if (!available()) return Promise.reject(new Error('Node is unavailable, so the receiver cannot run in this panel.'));
    if (server) return Promise.resolve(activePort);
    return new Promise(function (resolve, reject) { listenOn(0, resolve, reject); });
  }

  function stop() {
    if (server) {
      try { server.close(); } catch (e) { /* ignore */ }
      server = null;
      activePort = null;
    }
  }

  R.ingestServer = {
    available: available,
    start: start,
    stop: stop,
    port: function () { return activePort; },
    isRunning: function () { return !!server; },
    onIR: function (fn) { config.onIR = fn; }
  };
})(window.Rebound = window.Rebound || {});
