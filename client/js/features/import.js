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
  var IR_VERSION = '1.1.0';

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

  // ---- feature showcase (what a user can expect from an import) ------------

  function ico(inner) {
    var s = el('span.rb-feat-ic');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    return s;
  }

  var FEATURES = [
    { t: 'Editable text', d: 'Real type layers: font, size, tracking, leading, colour and alignment kept.', i: '<path d="M5 6h14M12 6v13M9 19h6"/>' },
    { t: 'Vector shapes', d: 'Paths rebuilt 1:1, with corners, booleans and strokes intact.', i: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>' },
    { t: 'Gradients', d: 'Linear and radial rebuilt as native After Effects gradients.', i: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 12h18"/>' },
    { t: 'Layer styles', d: 'Drop and inner shadow, glows, bevel, satin, overlays and stroke.', i: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M8 20h10a2 2 0 0 0 2-2V8"/>' },
    { t: 'Masks and clipping', d: 'Clipping masks become track mattes automatically.', i: '<path d="M4 4h11v11H4z"/><circle cx="15" cy="15" r="5.5"/>' },
    { t: 'Images', d: 'Embedded images imported as footage and placed exactly.', i: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 16l-5-5L5 20"/>' },
    { t: 'Layer hierarchy', d: 'Groups, stacking order, opacity and blend modes preserved.', i: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>' },
    { t: 'Fidelity report', d: 'See exactly what transferred and swap any missing fonts.', i: '<path d="M9 6h11M9 12h11M9 18h7"/><path d="M3.5 6l1.1 1.1L6.5 4.8"/><path d="M3.5 12l1.1 1.1L6.5 10.8"/>' }
  ];

  var APPS = [
    { name: 'Figma', dot: '#a259ff' },
    { name: 'Illustrator', dot: '#ff9a00' },
    { name: 'Photoshop', dot: '#31a8ff' }
  ];

  var STEPS = [
    'Install the free <b>Rebound</b> plugin in Figma, Illustrator, or Photoshop.',
    'Select your design and run Rebound: it sends here in <b>one click</b>, or saves a <b>.rbir</b> file (hold Shift to force a file).',
    'It rebuilds in your active composition as native, <b>editable</b> layers.'
  ];

  function buildApps() {
    var chips = [];
    for (var i = 0; i < APPS.length; i++) {
      var dot = el('span.rb-app-dot');
      dot.style.background = APPS[i].dot;
      chips.push(el('span.rb-app-chip', null, [dot, el('span', { text: APPS[i].name })]));
    }
    return el('div.rb-apps', null, chips);
  }

  function buildFeatures() {
    var cells = [];
    for (var i = 0; i < FEATURES.length; i++) {
      var f = FEATURES[i];
      cells.push(el('div.rb-feat', null, [
        ico(f.i),
        el('div.rb-feat-body', null, [
          el('div.rb-feat-t', { text: f.t }),
          el('div.rb-feat-d', { text: f.d })
        ])
      ]));
    }
    return el('div.rb-feat-grid', null, cells);
  }

  function buildSteps() {
    var rows = [];
    for (var i = 0; i < STEPS.length; i++) {
      var d = el('div.rb-step-d');
      d.innerHTML = STEPS[i];
      rows.push(el('div.rb-step', null, [d]));
    }
    return el('div.rb-steps', null, rows);
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

    ctx.body.appendChild(el('div.rb-col.rb-import', null, [
      el('div.rb-import-lead', { text: 'Bring a design from Figma, Illustrator, or Photoshop into After Effects as native, editable layers, no flattening and no re-tracing.' }),
      buildApps(),

      el('div.rb-import-sec-h', { text: 'What lands in your comp' }),
      buildFeatures(),

      el('div.rb-import-sec-h', { text: 'How it works' }),
      buildSteps(),

      el('div.rb-import-sec-h', { text: 'Bridge to After Effects' }),
      statusRow,
      el('div.rb-row.rb-wrap', null, [toggleBtn]),
      el('div.rb-faint', { text: 'Open a composition first; imported frames are dropped into it.' }),

      el('div.rb-import-sec-h', { text: 'No plugin handy? Import a file' }),
      el('div.rb-faint', { text: 'Drop in a .rbir file saved from any Rebound plugin, or paste its contents.' }),
      el('div.rb-row.rb-wrap', null, [fileBtn]),
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
