/*
 * Rebound Relay (Figma), UI (iframe).
 *
 * The only context with network + DOM. It keeps a live connection to the Rebound
 * receiver running in After Effects, builds the IR from the current selection (in
 * the sandbox), and ships it: POST to the receiver when connected, or a .rbir
 * download when not. Everything stays on loopback.
 *
 * Connection model (the "always knows" part):
 *   - discover(): races every host x port in parallel with a hard timeout, so a
 *     stale/hung port can't stall the search and the first live one wins.
 *   - while offline: a quiet background sweep auto-connects the moment After
 *     Effects (or the panel) comes up — no Reconnect click needed.
 *   - while connected: a heartbeat re-pings the live endpoint; if it goes away
 *     (panel closed, AE quit, port moved) we drop straight back into searching.
 *   - regaining focus kicks an immediate sweep, so tabbing back reconnects fast.
 */
(function () {
  'use strict';

  // Figma's manifest allowedDomains only accepts hostnames, not IP literals
  // (a "127.0.0.1 must be a valid url" error), so we connect over localhost.
  // Chromium routes loopback localhost to the 127.0.0.1 the receiver binds.
  var HOSTS = ['localhost'];
  var PORTS = [7890, 7891, 7892, 7893];
  var PING_TIMEOUT = 1100;   // per ping; loopback answers in <50ms when present
  var RETRY_MS = 2500;       // background sweep cadence while offline
  var HEARTBEAT_MS = 5000;   // liveness check cadence while connected
  var IR_VERSION = '1.1.0';  // mirrors ir-build.js; overwritten by the sandbox's meta

  var el = {
    conn: document.getElementById('conn'),
    connTitle: document.getElementById('conn-title'),
    connSub: document.getElementById('conn-sub'),
    connAction: document.getElementById('conn-action'),
    connSteps: document.getElementById('conn-steps'),
    sel: document.getElementById('sel'),
    selTitle: document.getElementById('sel-title'),
    selSub: document.getElementById('sel-sub'),
    send: document.getElementById('send'),
    sendLabel: document.getElementById('send-label'),
    save: document.getElementById('save'),
    msg: document.getElementById('msg'),
    report: document.getElementById('report')
  };

  var endpoint = null;       // { host, port } when connected
  var panel = null;          // { panelVersion, irVersion } from the live ping
  var connState = 'connecting';
  var selectionCount = 0;
  var lastIR = null;
  var pendingSave = false;
  var gen = 0;               // cancels stale discovery results
  var retryTimer = null;
  var heartbeatTimer = null;

  // ── Connection ────────────────────────────────────────────────────

  function pingOnce(host, port) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, PING_TIMEOUT);
    var opts = { method: 'GET' };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch('http://' + host + ':' + port + '/rebound/ping', opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.app === 'rebound') return { host: host, port: port, panelVersion: j.panelVersion, irVersion: j.irVersion };
        return null;
      })
      .catch(function () { return null; })
      .then(function (res) { clearTimeout(timer); return res; });
  }

  // Race every endpoint; resolve on the first live one, or null when all fail.
  // Remembered endpoint goes to the front so a steady connection re-confirms fast.
  function sweep() {
    var combos = [];
    if (endpoint) combos.push(endpoint);
    for (var h = 0; h < HOSTS.length; h++) {
      for (var p = 0; p < PORTS.length; p++) {
        if (endpoint && HOSTS[h] === endpoint.host && PORTS[p] === endpoint.port) continue;
        combos.push({ host: HOSTS[h], port: PORTS[p] });
      }
    }
    return new Promise(function (resolve) {
      var pending = combos.length, done = false;
      combos.forEach(function (c) {
        pingOnce(c.host, c.port).then(function (res) {
          if (done) return;
          if (res) { done = true; resolve(res); return; }
          pending -= 1;
          if (pending === 0) { done = true; resolve(null); }
        });
      });
    });
  }

  function clearTimers() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function onConnected(info) {
    endpoint = { host: info.host, port: info.port };
    panel = { panelVersion: info.panelVersion || null, irVersion: info.irVersion || null };
    clearTimers();
    setState('connected');
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  }

  function onLost(searching) {
    endpoint = null;
    panel = null;
    clearTimers();
    setState(searching ? 'connecting' : 'offline');
    if (!searching) retryTimer = setTimeout(silentSweep, RETRY_MS);
  }

  // Visible search (Reconnect / first load): flips to "connecting" while it looks.
  function connect() {
    var mine = ++gen;
    clearTimers();
    setState('connecting');
    sweep().then(function (res) {
      if (mine !== gen) return;
      if (res) onConnected(res);
      else onLost(false);
    });
  }

  // Quiet background search while offline: no flicker, just connects when it can.
  function silentSweep() {
    if (endpoint) return;
    var mine = gen;
    sweep().then(function (res) {
      if (mine !== gen || endpoint) return;
      if (res) onConnected(res);
      else retryTimer = setTimeout(silentSweep, RETRY_MS);
    });
  }

  function heartbeat() {
    if (!endpoint) return;
    pingOnce(endpoint.host, endpoint.port).then(function (res) {
      if (!endpoint) return;
      if (res) { panel = { panelVersion: res.panelVersion, irVersion: res.irVersion }; }
      else { onLost(true); connect(); } // endpoint vanished — search again at once
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────

  function versionSkew() {
    if (!panel || !panel.irVersion) return false;
    return String(panel.irVersion).split('.')[0] !== String(IR_VERSION).split('.')[0];
  }

  function setState(state) {
    connState = state;
    el.conn.setAttribute('data-state', state);
    el.connSteps.hidden = state !== 'offline';
    var skew = versionSkew();
    if (state === 'connected') {
      el.connTitle.textContent = 'Connected to After Effects';
      var bits = [];
      if (panel && panel.panelVersion) bits.push('Rebound ' + panel.panelVersion);
      if (endpoint) bits.push('port ' + endpoint.port);
      el.connSub.textContent = skew
        ? 'Panel speaks IR ' + panel.irVersion + ' — update Rebound to match'
        : (bits.join(' · ') || 'Ready to receive');
      el.connSub.style.color = skew ? 'var(--rb-warn)' : '';
      el.connAction.querySelector('.conn-action-label').textContent = 'Reconnect';
      el.connAction.title = 'Reconnect';
    } else if (state === 'offline') {
      el.connTitle.textContent = 'After Effects not detected';
      el.connSub.textContent = 'Open the Rebound panel — it’ll connect on its own.';
      el.connSub.style.color = '';
      el.connAction.querySelector('.conn-action-label').textContent = 'Try again';
      el.connAction.title = 'Try again';
    } else {
      el.connTitle.textContent = 'Looking for After Effects…';
      el.connSub.textContent = 'Make sure the Rebound panel is open.';
      el.connSub.style.color = '';
    }
    syncHeight();
  }

  // Above this many objects, a flat import floods the After Effects timeline;
  // warn and point at a lighter strategy (import one frame / precomp).
  var HEAVY_THRESHOLD = 400;

  function updateSelection(count, total) {
    selectionCount = count;
    var has = count > 0;
    el.sel.setAttribute('data-has', has ? 'true' : 'false');
    if (has) {
      el.selTitle.textContent = count + (count === 1 ? ' layer selected' : ' layers selected');
      var obj = (total && total > count) ? total : count;
      if (obj >= HEAVY_THRESHOLD) {
        el.selTitle.textContent = '~' + obj + ' objects selected';
        el.selSub.textContent = 'That\'s a lot of layers — import one screen at a time, or use a precomp/collapse strategy.';
        el.sel.setAttribute('data-warn', 'true');
      } else {
        el.selSub.textContent = obj > count ? ('~' + obj + ' objects · ready to send') : 'Ready to send to After Effects';
        el.sel.removeAttribute('data-warn');
      }
    } else {
      el.selTitle.textContent = 'Nothing selected';
      el.selSub.textContent = 'Select a frame or layers in Figma';
      el.sel.removeAttribute('data-warn');
    }
    refreshSend();
  }

  function refreshSend() {
    el.send.disabled = selectionCount === 0 || el.send.classList.contains('loading');
  }

  function loading(on, label) {
    el.send.classList.toggle('loading', !!on);
    if (label) el.sendLabel.textContent = label;
    if (!on) { el.sendLabel.textContent = 'Send to After Effects'; }
    refreshSend();
  }

  function showMsg(kind, text) {
    el.msg.hidden = false;
    el.msg.className = 'msg ' + kind;
    el.msg.textContent = text;
    syncHeight();
  }
  function clearMsg() { el.msg.hidden = true; }

  function pluralise(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function renderReport(report) {
    if (!report) { el.report.hidden = true; return; }
    var frames = report.framesBuilt || 0;
    var layers = report.layersBuilt || 0;
    var notes = [];
    if (report.missingFonts && report.missingFonts.length) {
      notes.push(pluralise(report.missingFonts.length, 'font') + ' not installed: ' + report.missingFonts.join(', '));
    }
    if (report.approximated && report.approximated.length) {
      notes.push(pluralise(report.approximated.length, 'item') + ' approximated');
    }
    if (report.skipped && report.skipped.length) {
      notes.push(report.skipped.length + ' not yet supported');
    }
    var html =
      '<div class="report-head">' +
        '<span class="report-check"><svg viewBox="0 0 16 16" width="10" height="10"><path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        '<span class="report-title">Rebuilt in After Effects</span>' +
      '</div>' +
      '<div class="report-chips">' +
        '<span class="chip"><b>' + frames + '</b> ' + (frames === 1 ? 'frame' : 'frames') + '</span>' +
        '<span class="chip"><b>' + layers + '</b> ' + (layers === 1 ? 'layer' : 'layers') + '</span>' +
      '</div>';
    if (notes.length) {
      html += '<ul class="notes">';
      for (var i = 0; i < notes.length; i++) html += '<li>' + escapeHtml(notes[i]) + '</li>';
      html += '</ul>';
    }
    el.report.innerHTML = html;
    el.report.hidden = false;
    syncHeight();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Keep the Figma panel exactly as tall as the content.
  function syncHeight() {
    requestAnimationFrame(function () {
      var h = Math.ceil(document.documentElement.scrollHeight);
      parent.postMessage({ pluginMessage: { type: 'resize', height: h } }, '*');
    });
  }

  // ── Sending ───────────────────────────────────────────────────────

  // A short "how much the flood was tamed" suffix from the IR stats, so a big
  // import reads e.g. "130 layers · collapsed 1400 layout wrappers, merged 30 icons".
  function statsSuffix(ir) {
    var s = ir && ir.document && ir.document.stats;
    if (!s) return '';
    var tamed = [];
    if (s.collapsed) tamed.push('collapsed ' + s.collapsed + ' layout wrapper' + (s.collapsed === 1 ? '' : 's'));
    if (s.merged) tamed.push('merged ' + s.merged + ' icon' + (s.merged === 1 ? '' : 's'));
    if (s.dropped) tamed.push('dropped ' + s.dropped + ' spacer' + (s.dropped === 1 ? '' : 's'));
    if (!s.layers && !tamed.length) return '';
    var head = s.layers ? (s.layers + ' layer' + (s.layers === 1 ? '' : 's')) : '';
    return ' (' + [head].concat(tamed.length ? [tamed.join(', ')] : []).filter(Boolean).join(' · ') + ')';
  }

  function postIR(ir) {
    loading(true, 'Sending…');
    showMsg('info', 'Sending to After Effects…');
    return fetch('http://' + endpoint.host + ':' + endpoint.port + '/rebound/ir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ir)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        loading(false);
        if (res.ok && res.body && res.body.ok) {
          showMsg('ok', 'Sent. Your design is now in After Effects.' + statsSuffix(ir));
          renderReport(res.body.report);
        } else {
          showMsg('error', (res.body && res.body.error) || 'After Effects could not import this.');
        }
      })
      .catch(function () {
        loading(false);
        showMsg('warn', 'Lost the connection — saved a .rbir file you can import from the panel.');
        download(ir);
        onLost(true);
        connect();
      });
  }

  function download(ir) {
    var name = (ir.document && ir.document.name) || 'design';
    var blob = new Blob([JSON.stringify(ir)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^a-zA-Z0-9_-]+/g, '-') + '.rbir';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function deliver(ir) {
    if (endpoint) { postIR(ir); return; }
    // Offline: one quick sweep in case the panel just came up, else save.
    loading(true, 'Connecting…');
    sweep().then(function (res) {
      if (res) { onConnected(res); postIR(ir); }
      else {
        loading(false);
        download(ir);
        showMsg('info', 'After Effects isn’t open — saved a .rbir file. Import it from the Rebound panel.');
      }
    });
  }

  function requestExport(save) {
    clearMsg();
    el.report.hidden = true;
    pendingSave = !!save;
    loading(true, save ? 'Building…' : 'Reading selection…');
    parent.postMessage({ pluginMessage: { type: 'export' } }, '*');
  }

  // ── Wiring ────────────────────────────────────────────────────────

  el.send.addEventListener('click', function () { if (!el.send.disabled) requestExport(false); });
  el.save.addEventListener('click', function () {
    if (lastIR) { download(lastIR); showMsg('ok', 'Saved a .rbir file. Import it from the Rebound panel.'); return; }
    requestExport(true);
  });
  el.connAction.addEventListener('click', function () {
    el.connAction.classList.add('spin');
    setTimeout(function () { el.connAction.classList.remove('spin'); }, 700);
    connect();
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !endpoint && connState !== 'connecting') { clearTimers(); silentSweep(); }
  });
  window.addEventListener('focus', function () {
    if (!endpoint && connState !== 'connecting') { clearTimers(); silentSweep(); }
  });

  window.onmessage = function (e) {
    var msg = e.data && e.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'meta') {
      if (msg.irVersion) IR_VERSION = msg.irVersion;
    } else if (msg.type === 'selection') {
      updateSelection(msg.count, msg.total);
    } else if (msg.type === 'ir') {
      lastIR = msg.ir;
      if (pendingSave) {
        pendingSave = false;
        loading(false);
        download(msg.ir);
        showMsg('ok', 'Saved a .rbir file. Import it from the Rebound panel.');
        return;
      }
      deliver(msg.ir);
    } else if (msg.type === 'error') {
      loading(false);
      showMsg('error', msg.error);
    }
  };

  updateSelection(0);
  connect();
})();
