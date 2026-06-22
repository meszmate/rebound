/*
 * Rebound, Import (receive a design from another app).
 *
 * The After Effects side of the cross-app bridge. On load it starts the loopback
 * receiver so a design-app plugin (Figma, Illustrator, ...) can send a Rebound
 * IR document straight into the active composition, and it publishes the chosen
 * port to bridge.json so exporters can find it. It also accepts a dropped/opened
 * .rbir file and pasted IR, so importing works offline with no plugin running.
 *
 * Every path funnels through doImport(ir) -> host 'import.build', which rebuilds
 * the design as native AE layers and returns a fidelity report.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  // Keep in sync with shared/ir/ir-version.json.
  var IR_VERSION = '1.0.0';

  var node = (function () {
    try {
      if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
        return {
          fs: window.cep_node.require('fs'),
          path: window.cep_node.require('path'),
          Buffer: window.cep_node.require('buffer').Buffer
        };
      }
    } catch (e) { /* not in CEP */ }
    return null;
  })();

  function assetExt(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'image/webp') return 'webp';
    return 'png';
  }

  // Decode each image asset's base64 to a file the host can import, then drop the
  // bytes so the bridge payload stays small. A no-op without Node (e.g. the
  // browser preview); the host then flags any image it could not rebuild.
  function materializeAssets(ir) {
    if (!node || !ir.document || !ir.document.assets) return;
    var dir = (R.disk && R.disk.dir) ? R.disk.dir() : null;
    if (!dir) return;
    var adir = node.path.join(dir, 'assets');
    try { if (!node.fs.existsSync(adir)) node.fs.mkdirSync(adir, { recursive: true }); } catch (e) { return; }
    var assets = ir.document.assets;
    for (var hash in assets) {
      if (!assets.hasOwnProperty(hash)) continue;
      var a = assets[hash];
      if (!a || !a.bytesBase64) continue;
      var safe = String(hash).replace(/[^a-zA-Z0-9_-]/g, '_');
      var file = node.path.join(adir, safe + '.' + assetExt(a.mime));
      try {
        node.fs.writeFileSync(file, node.Buffer.from(a.bytesBase64, 'base64'));
        a.path = file;
        delete a.bytesBase64;
      } catch (e2) { /* leave bytes; the host will flag the image */ }
    }
  }

  var lastReport = null;
  var reportHost = null;
  var fontFamiliesCache = null;
  var statusListeners = [];

  function emitStatus() {
    for (var i = 0; i < statusListeners.length; i++) {
      try { statusListeners[i](); } catch (e) { /* ignore */ }
    }
  }

  // ---- the import path -----------------------------------------------------

  function preValidate(ir) {
    if (typeof window !== 'undefined' && window.ReboundValidate) {
      var res = window.ReboundValidate.validate(ir);
      if (!res.valid) {
        var msg = (res.errors && res.errors.length) ? res.errors[0] : 'Invalid IR document.';
        return { ok: false, error: msg };
      }
    }
    return { ok: true };
  }

  // Build an IR document into the active comp. Resolves with the host report.
  function doImport(ir) {
    var pre = preValidate(ir);
    if (!pre.ok) return Promise.reject(new Error(pre.error));
    try { materializeAssets(ir); } catch (e) { /* non-fatal: host flags missing images */ }
    return R.bridge.invoke('import.build', ir).then(function (report) {
      showReport(report);
      emitStatus();
      return report;
    });
  }

  function summarize(report) {
    if (!report) return 'Nothing imported.';
    var parts = [];
    parts.push(report.framesBuilt + (report.framesBuilt === 1 ? ' frame' : ' frames'));
    parts.push(report.layersBuilt + (report.layersBuilt === 1 ? ' layer' : ' layers'));
    var tail = '';
    if (report.skipped && report.skipped.length) tail = ', ' + report.skipped.length + ' not yet supported';
    return 'Imported ' + parts.join(', ') + tail + '.';
  }

  // ---- the fidelity report (transparency: what transferred, what did not) --

  function showReport(report) {
    lastReport = report;
    if (reportHost) renderReport(reportHost, report);
  }

  function ensureFontFamilies() {
    if (fontFamiliesCache) return Promise.resolve(fontFamiliesCache);
    if (!R.bridge || !R.bridge.available) return Promise.resolve([]);
    return R.bridge.invoke('import.fontFamilies', {})
      .then(function (r) { fontFamiliesCache = (r && r.families) || []; return fontFamiliesCache; })
      .catch(function () { return []; });
  }

  function noteList(title, items, kind) {
    var ul = el('ul.rb-report-list');
    var max = 8;
    for (var i = 0; i < Math.min(items.length, max); i++) ul.appendChild(el('li', { text: items[i] }));
    if (items.length > max) ul.appendChild(el('li.rb-report-more', { text: 'and ' + (items.length - max) + ' more' }));
    return el('div.rb-report-sec' + (kind ? '.is-' + kind : ''), null, [
      el('div.rb-report-sec-h', { text: title + ' (' + items.length + ')' }),
      ul
    ]);
  }

  function fontResolver(families) {
    var sec = el('div.rb-report-sec.is-warn', null, [
      el('div.rb-report-sec-h', { text: 'Fonts not installed (' + families.length + ')' }),
      el('div.rb-faint', { text: 'Pick a font to use instead, or install the originals and import again.' })
    ]);
    ensureFontFamilies().then(function (installed) {
      families.forEach(function (fam) {
        var sel = el('select.rb-select');
        sel.appendChild(el('option', { value: '', text: 'Replace with...' }));
        installed.forEach(function (f) { sel.appendChild(el('option', { value: f, text: f })); });
        var applyBtn = el('button.rb-btn.is-ghost.rb-fontrow-btn', { type: 'button' }, ['Apply']);
        var row = el('div.rb-fontrow', null, [el('span.rb-fontrow-name', { text: fam }), sel, applyBtn]);
        applyBtn.addEventListener('click', function () {
          if (!sel.value) return;
          applyBtn.disabled = true;
          applyBtn.textContent = '...';
          R.bridge.invoke('import.remapFont', { from: fam, to: sel.value })
            .then(function (res) { R.dom.clear(row); row.className = 'rb-fontrow is-done'; row.appendChild(el('span', { text: fam + ' to ' + sel.value + ' (' + res.remapped + ')' })); })
            .catch(function (err) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; if (R.ui && R.ui.toast) R.ui.toast(err.message || 'Could not replace font.', { kind: 'error' }); });
        });
        sec.appendChild(row);
      });
    });
    return sec;
  }

  function renderReport(host, report) {
    R.dom.clear(host);
    if (!report) return;
    var card = el('div.rb-report', null, [
      el('div.rb-report-head', null, [
        el('span.rb-report-title', { text: 'Imported' }),
        el('span.rb-report-counts', { text: report.framesBuilt + (report.framesBuilt === 1 ? ' frame' : ' frames') + ' · ' + report.layersBuilt + (report.layersBuilt === 1 ? ' layer' : ' layers') })
      ])
    ]);

    if (report.missingFonts && report.missingFonts.length) card.appendChild(fontResolver(report.missingFonts));

    var approx = (report.approximated || []).map(function (a) { return a.name ? (a.name + ': ' + a.detail) : a.detail; });
    if (approx.length) card.appendChild(noteList('Approximated', approx, 'warn'));

    var skip = (report.skipped || []).map(function (s) { return (s.name || 'Item') + ' (' + s.reason + ')'; });
    if (skip.length) card.appendChild(noteList('Not transferred', skip, 'muted'));

    var hasFonts = report.missingFonts && report.missingFonts.length;
    if (!approx.length && !skip.length && !hasFonts) {
      card.appendChild(el('div.rb-report-clean', { text: 'Everything transferred cleanly.' }));
    }
    host.appendChild(card);
  }

  // ---- the receiver (loopback server) --------------------------------------

  var receiver = { state: 'idle', port: null, error: null };

  function networkImport(ir) {
    // A design arrived over the wire while the user may be elsewhere in AE.
    return doImport(ir).then(function (report) {
      if (R.ui && R.ui.toast) R.ui.toast(summarize(report) + ' (from ' + (ir.source && ir.source.app ? ir.source.app : 'a design app') + ')', { kind: 'success' });
      return report;
    }).catch(function (err) {
      if (R.ui && R.ui.toast) R.ui.toast('Import failed: ' + (err.message || err), { kind: 'error' });
      throw err;
    });
  }

  function publishBridge(port) {
    try {
      R.disk.write('bridge', {
        port: port,
        ports: [7890, 7891, 7892, 7893],
        irVersion: IR_VERSION,
        panelVersion: (R.bridge && R.bridge.version) || null,
        updatedAt: new Date().toISOString()
      });
    } catch (e) { /* disk may be unavailable in a plain browser */ }
  }

  function startReceiver() {
    if (!R.ingestServer || !R.ingestServer.available()) {
      receiver.state = 'unavailable';
      emitStatus();
      return Promise.resolve(null);
    }
    if (R.ingestServer.isRunning()) {
      receiver.state = 'running';
      receiver.port = R.ingestServer.port();
      emitStatus();
      return Promise.resolve(receiver.port);
    }
    receiver.state = 'starting';
    emitStatus();
    return R.ingestServer.start({
      onIR: networkImport,
      ping: { irVersion: IR_VERSION, panelVersion: (R.bridge && R.bridge.version) || null }
    }).then(function (port) {
      receiver.state = 'running';
      receiver.port = port;
      receiver.error = null;
      publishBridge(port);
      emitStatus();
      return port;
    }).catch(function (err) {
      receiver.state = 'error';
      receiver.error = err.message || String(err);
      emitStatus();
      return null;
    });
  }

  function stopReceiver() {
    if (R.ingestServer) R.ingestServer.stop();
    receiver.state = 'stopped';
    receiver.port = null;
    emitStatus();
  }

  // Auto-start once, so After Effects is listening as soon as the panel opens.
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    startReceiver();
  }
  boot();

  // ---- tool UI -------------------------------------------------------------

  R.tools.register({
    id: 'import',
    title: 'Import',
    group: 'Convert',
    order: 0,
    keywords: ['import', 'figma', 'illustrator', 'svg', 'convert', 'send', 'relay', 'receive', 'paste', 'overlord', 'design'],
    mount: mount
  });

  function statusText() {
    switch (receiver.state) {
      case 'running': return 'Receiver on. Listening on 127.0.0.1:' + receiver.port + '.';
      case 'starting': return 'Starting receiver...';
      case 'stopped': return 'Receiver off.';
      case 'unavailable': return 'Receiver needs After Effects (not available in this preview).';
      case 'error': return 'Receiver could not start: ' + receiver.error;
      default: return 'Receiver idle.';
    }
  }

  function readFile(file, onText) {
    var reader = new FileReader();
    reader.onload = function () { onText(String(reader.result)); };
    reader.onerror = function () { if (R.ui && R.ui.toast) R.ui.toast('Could not read that file.', { kind: 'error' }); };
    reader.readAsText(file);
  }

  function importFromText(text, ctx) {
    var ir;
    try { ir = JSON.parse(text); } catch (e) {
      ctx.toast('That is not valid IR JSON.', { kind: 'error' });
      return;
    }
    if (reportHost) { R.dom.clear(reportHost); reportHost.appendChild(el('div.rb-report-building', { text: 'Building in After Effects...' })); }
    doImport(ir)
      .then(function (report) { ctx.toast(summarize(report), { kind: 'success' }); ctx.refreshSelection(); })
      .catch(function (err) {
        if (reportHost) R.dom.clear(reportHost);
        ctx.toast(err.message || 'Import failed.', { kind: 'error' });
      });
  }

  function mount(ctx) {
    if (ctx.widget) {
      var wfile = el('input', { type: 'file', accept: '.rbir,.json,application/json', style: { display: 'none' } });
      wfile.addEventListener('change', function () {
        if (wfile.files && wfile.files[0]) readFile(wfile.files[0], function (t) { importFromText(t, ctx); });
        wfile.value = '';
      });
      var wbtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { wfile.click(); } }, ['Import a design file']);
      var wstat = el('div.rb-faint', { text: statusText() });
      var offw = onStatus(function () { wstat.textContent = statusText(); });
      ctx.body.appendChild(el('div.rb-wgt', null, [el('div.rb-col', null, [wbtn, wstat, wfile])]));
      return { destroy: offw };
    }

    var statusDot = el('span.rb-recv-dot');
    var statusLabel = el('span', { text: statusText() });
    var statusRow = el('div.rb-recv-status', null, [statusDot, statusLabel]);

    function paintStatus() {
      statusLabel.textContent = statusText();
      statusDot.setAttribute('data-state', receiver.state);
    }
    paintStatus();
    var off = onStatus(paintStatus);

    var toggleBtn = el('button.rb-btn', { type: 'button', onclick: function () {
      if (receiver.state === 'running') stopReceiver();
      else startReceiver();
    } }, ['Toggle receiver']);

    var fileInput = el('input', { type: 'file', accept: '.rbir,.json,application/json', style: { display: 'none' } });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0], function (t) { importFromText(t, ctx); });
      fileInput.value = '';
    });
    var fileBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { fileInput.click(); } }, ['Import from file...']);

    var paste = el('textarea.rb-code', { rows: '5', placeholder: 'Or paste a Rebound IR (.rbir) document here', spellcheck: 'false' });
    var pasteBtn = el('button.rb-btn', { type: 'button', onclick: function () {
      var t = paste.value.trim();
      if (!t) { ctx.toast('Paste an IR document first.', { kind: 'error' }); return; }
      importFromText(t, ctx);
    } }, ['Import pasted IR']);

    var reportEl = el('div.rb-report-host');

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Bring a design from Figma or Illustrator into After Effects as native, editable layers. Send it from the design app, or import a .rbir file or pasted IR here.' }),
      statusRow,
      el('div.rb-row.rb-wrap', null, [fileBtn, toggleBtn]),
      el('div.rb-faint', { text: 'Open a composition first; imported frames are dropped into it.' }),
      paste,
      el('div.rb-row', null, [pasteBtn]),
      reportEl
    ]));

    // Render the report here, and re-render it for any import while open.
    reportHost = reportEl;
    if (lastReport) renderReport(reportHost, lastReport);

    return { destroy: function () { off(); if (reportHost === reportEl) reportHost = null; } };
  }

  function onStatus(fn) {
    statusListeners.push(fn);
    return function () {
      var i = statusListeners.indexOf(fn);
      if (i !== -1) statusListeners.splice(i, 1);
    };
  }

  // Expose for other panel code (e.g. drag-drop wiring later).
  R.reboundImport = {
    doImport: doImport,
    startReceiver: startReceiver,
    stopReceiver: stopReceiver,
    receiver: receiver,
    onStatus: onStatus,
    showReport: showReport,
    irVersion: IR_VERSION,
    lastReport: function () { return lastReport; }
  };
})(window.Rebound = window.Rebound || {});
