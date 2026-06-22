/*
 * Rebound Relay (Figma), UI (iframe).
 *
 * The only context with network + DOM. It discovers the Rebound receiver in
 * After Effects by pinging the loopback ports, asks the sandbox to build the IR,
 * and ships it: POST to the receiver when connected, or a .rbir download when
 * not. The build's fidelity report is shown back to the user.
 */
(function () {
  'use strict';

  var PORTS = [7890, 7891, 7892, 7893];
  var aePort = null;
  var lastIR = null;
  var selectionCount = 0;
  var pendingSave = false;

  var connEl = document.getElementById('conn');
  var connText = document.getElementById('conn-text');
  var selEl = document.getElementById('sel');
  var sendBtn = document.getElementById('send');
  var reconnectBtn = document.getElementById('reconnect');
  var saveBtn = document.getElementById('save');
  var msgEl = document.getElementById('msg');
  var reportEl = document.getElementById('report');

  function setConn(state, text) {
    connEl.setAttribute('data-state', state);
    connText.textContent = text;
  }

  function showMsg(kind, text) {
    msgEl.hidden = false;
    msgEl.className = 'msg ' + kind;
    msgEl.textContent = text;
  }
  function clearMsg() { msgEl.hidden = true; }

  function updateSend() {
    sendBtn.disabled = selectionCount === 0;
  }

  function updateSelection(count) {
    selectionCount = count;
    if (count === 0) { selEl.textContent = 'Select a frame or layers to send'; selEl.className = 'sel'; }
    else { selEl.textContent = count + (count === 1 ? ' item selected' : ' items selected'); selEl.className = 'sel has'; }
    updateSend();
  }

  function ping(port) {
    return fetch('http://127.0.0.1:' + port + '/rebound/ping', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.app === 'rebound'); })
      .catch(function () { return false; });
  }

  function discover() {
    setConn('connecting', 'Looking for After Effects…');
    var i = 0;
    function tryNext() {
      if (i >= PORTS.length) { aePort = null; setConn('disconnected', 'After Effects not detected. Open the Rebound panel.'); return; }
      var port = PORTS[i++];
      ping(port).then(function (ok) {
        if (ok) { aePort = port; setConn('connected', 'Connected to After Effects on ' + port); }
        else tryNext();
      });
    }
    tryNext();
  }

  function renderReport(report) {
    if (!report) { reportEl.hidden = true; return; }
    var lines = [];
    lines.push('<h4>Imported ' + report.framesBuilt + ' frame' + (report.framesBuilt === 1 ? '' : 's') + ', ' + report.layersBuilt + ' layer' + (report.layersBuilt === 1 ? '' : 's') + '</h4>');
    var notes = [];
    if (report.missingFonts && report.missingFonts.length) notes.push(report.missingFonts.length + ' font' + (report.missingFonts.length === 1 ? '' : 's') + ' not installed: ' + report.missingFonts.join(', '));
    if (report.approximated && report.approximated.length) notes.push(report.approximated.length + ' item' + (report.approximated.length === 1 ? '' : 's') + ' approximated');
    if (report.skipped && report.skipped.length) notes.push(report.skipped.length + ' not yet supported');
    if (notes.length) {
      lines.push('<ul>');
      for (var i = 0; i < notes.length; i++) lines.push('<li>' + notes[i] + '</li>');
      lines.push('</ul>');
    }
    reportEl.innerHTML = lines.join('');
    reportEl.hidden = false;
  }

  function postIR(ir) {
    showMsg('info', 'Sending to After Effects…');
    return fetch('http://127.0.0.1:' + aePort + '/rebound/ir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ir)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok && res.body && res.body.ok) {
          showMsg('ok', 'Sent. Check After Effects.');
          renderReport(res.body.report);
        } else {
          showMsg('error', (res.body && res.body.error) || 'After Effects could not import this.');
        }
      })
      .catch(function () {
        showMsg('error', 'Lost the connection to After Effects. Saving a .rbir file instead.');
        download(ir);
        discover();
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

  function requestExport() {
    clearMsg();
    reportEl.hidden = true;
    sendBtn.disabled = true;
    showMsg('info', 'Reading the selection…');
    parent.postMessage({ pluginMessage: { type: 'export' } }, '*');
  }

  sendBtn.addEventListener('click', requestExport);
  reconnectBtn.addEventListener('click', discover);
  saveBtn.addEventListener('click', function () {
    if (lastIR) download(lastIR);
    else { clearMsg(); reportEl.hidden = true; showMsg('info', 'Building the file…'); parent.postMessage({ pluginMessage: { type: 'export', save: true } }, '*'); pendingSave = true; }
  });

  window.onmessage = function (e) {
    var msg = e.data && e.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'selection') {
      updateSelection(msg.count);
    } else if (msg.type === 'ir') {
      lastIR = msg.ir;
      updateSend();
      if (pendingSave) { pendingSave = false; download(msg.ir); showMsg('ok', 'Saved a .rbir file. Import it from the Rebound panel.'); return; }
      if (aePort) { postIR(msg.ir); }
      else { download(msg.ir); showMsg('info', 'After Effects was not detected, so a .rbir file was saved. Import it from the Rebound panel.'); }
    } else if (msg.type === 'error') {
      updateSend();
      showMsg('error', msg.error);
    }
  };

  updateSelection(0);
  discover();
})();
