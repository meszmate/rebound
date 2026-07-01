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

  // Build options the panel controls (the exporter never sets these). Default is
  // the flat Overlord/AEUX build (one comp, frames become editable groups); the
  // user can opt into trimmed precomp-per-frame instead.
  var buildOpts = { precompFrames: false, importToActiveComp: true, updateExisting: false, autoPrecomp: true, labelByFrame: false };
  try {
    if (typeof localStorage !== 'undefined') buildOpts.precompFrames = localStorage.getItem('rb-import-precomp') === '1';
  } catch (e) { /* no storage in this host */ }
  try {
    if (typeof localStorage !== 'undefined') buildOpts.labelByFrame = localStorage.getItem('rb-import-labelbyframe') === '1';
  } catch (e) { /* no storage in this host */ }
  // Default on: auto-precomp large sub-frames so a big board doesn't flood the
  // timeline. Only false when the user explicitly turned it off ('0').
  try {
    if (typeof localStorage !== 'undefined') buildOpts.autoPrecomp = localStorage.getItem('rb-import-autoprecomp') !== '0';
  } catch (e) { /* no storage in this host */ }
  // Default on: only false when the user explicitly turned it off ('0').
  try {
    if (typeof localStorage !== 'undefined') buildOpts.importToActiveComp = localStorage.getItem('rb-import-active') !== '0';
  } catch (e) { /* no storage in this host */ }
  try {
    if (typeof localStorage !== 'undefined') buildOpts.updateExisting = localStorage.getItem('rb-import-update') === '1';
  } catch (e) { /* no storage in this host */ }
  function setPrecompFrames(on) {
    buildOpts.precompFrames = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('rb-import-precomp', on ? '1' : '0'); } catch (e2) { /* no storage */ }
  }
  function setImportToActiveComp(on) {
    buildOpts.importToActiveComp = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('rb-import-active', on ? '1' : '0'); } catch (e2) { /* no storage */ }
  }
  function setUpdateExisting(on) {
    buildOpts.updateExisting = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('rb-import-update', on ? '1' : '0'); } catch (e2) { /* no storage */ }
  }
  function setAutoPrecomp(on) {
    buildOpts.autoPrecomp = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('rb-import-autoprecomp', on ? '1' : '0'); } catch (e2) { /* no storage */ }
  }
  function setLabelByFrame(on) {
    buildOpts.labelByFrame = !!on;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('rb-import-labelbyframe', on ? '1' : '0'); } catch (e2) { /* no storage */ }
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
    // Apply the panel's build preference unless the document already carries one.
    ir.options = ir.options || {};
    if (ir.options.precompFrames == null) ir.options.precompFrames = buildOpts.precompFrames;
    if (ir.options.importToActiveComp == null) ir.options.importToActiveComp = buildOpts.importToActiveComp;
    if (ir.options.updateExisting == null) ir.options.updateExisting = buildOpts.updateExisting;
    if (ir.options.autoPrecompThreshold == null) ir.options.autoPrecompThreshold = buildOpts.autoPrecomp ? 120 : 0;
    if (ir.options.labelByFrame == null) ir.options.labelByFrame = buildOpts.labelByFrame;
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

    if (report.replaced) {
      var upd = 'Updated in place: replaced ' + report.replaced + ' previously-imported layer' + (report.replaced === 1 ? '' : 's');
      if (report.animRestored) upd += ' · kept your animation on ' + report.animRestored + ' of them';
      card.appendChild(el('div.rb-faint', { text: upd + '.' }));
    }

    // In-AE 1:1 self-check: the importer reconciled every source element against
    // what it built. A clean check is quietly reassuring; a deficit is flagged
    // loudly so a silent loss never passes for a faithful import.
    var fid = report.fidelity;
    if (fid && typeof fid.expected === 'number') {
      if (fid.ok) {
        card.appendChild(el('div.rb-faint', { text: '1:1 self-check: all ' + fid.expected + ' elements accounted for.' }));
      } else {
        card.appendChild(el('div.rb-report-sec.is-warn', null, [
          el('div.rb-report-sec-h', { text: '1:1 self-check: ' + fid.missing + ' element' + (fid.missing === 1 ? '' : 's') + ' unaccounted for' }),
          el('div.rb-faint', { text: 'Expected ' + fid.expected + ', built ' + fid.built + ', skipped ' + fid.skipped + '. Please report this file so the gap can be fixed.' })
        ]));
      }
    }

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

  // ---- small native building blocks ---------------------------------------

  // Source apps the bridge listens for. The dot uses each app's brand hue as a
  // quiet accent, no logos.
  var SOURCES = [
    { name: 'Figma', dot: '#a259ff' },
    { name: 'Illustrator', dot: '#ff9a00' },
    { name: 'Photoshop', dot: '#31a8ff' }
  ];

  // What comes across, shown as quiet chips rather than a marketing grid.
  var CAPS = ['Editable text', 'Vectors', 'Gradients', 'Layer styles', 'Masks', 'Images', 'Layer hierarchy'];

  function buildSources() {
    var chips = [el('span.rb-faint', { text: 'From' })];
    for (var i = 0; i < SOURCES.length; i++) {
      var dot = el('span.rb-src-dot');
      dot.style.background = SOURCES[i].dot;
      chips.push(el('span.rb-chip', null, [dot, el('span', { text: SOURCES[i].name })]));
    }
    return el('div.rb-srcs', null, chips);
  }

  function buildCaps() {
    var chips = [];
    for (var i = 0; i < CAPS.length; i++) chips.push(el('span.rb-chip', { text: CAPS[i] }));
    return el('div.rb-caps', null, chips);
  }

  // Title + sub for the connection hero, by receiver state.
  function bridgeLines() {
    switch (receiver.state) {
      case 'running': return { title: 'Listening for designs', sub: '127.0.0.1:' + receiver.port + ' · arrives in one click' };
      case 'starting': return { title: 'Starting the bridge...', sub: '' };
      case 'stopped': return { title: 'Bridge is off', sub: 'Turn it on to receive straight from a design app' };
      case 'error': return { title: 'Bridge could not start', sub: receiver.error || 'Use a .rbir file below instead' };
      case 'unavailable': return { title: 'Send needs After Effects', sub: 'Live one-click send runs inside the AE panel; import a .rbir file below' };
      default: return { title: 'Bridge idle', sub: '' };
    }
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

    // Connection hero: the live state of the bridge is the real centrepiece.
    var bridgeDot = el('span.rb-bridge-dot');
    var bridgeTitle = el('div.rb-bridge-title');
    var bridgeSub = el('div.rb-bridge-sub');
    var toggleBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () {
      if (receiver.state === 'running') stopReceiver();
      else startReceiver();
    } }, ['Turn on']);
    var bridge = el('div.rb-bridge', null, [
      bridgeDot,
      el('div.rb-bridge-main', null, [bridgeTitle, bridgeSub]),
      toggleBtn
    ]);

    function paintStatus() {
      var l = bridgeLines();
      bridgeDot.setAttribute('data-state', receiver.state);
      bridgeTitle.textContent = l.title;
      bridgeSub.textContent = l.sub;
      bridgeSub.style.display = l.sub ? '' : 'none';
      toggleBtn.textContent = receiver.state === 'running' ? 'Turn off' : 'Turn on';
      toggleBtn.disabled = (receiver.state === 'unavailable' || receiver.state === 'starting');
    }
    paintStatus();
    var off = onStatus(paintStatus);

    // File input + a real drop target (click to browse, or drop a .rbir in).
    var fileInput = el('input', { type: 'file', accept: '.rbir,.json,application/json', style: { display: 'none' } });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0], function (t) { importFromText(t, ctx); });
      fileInput.value = '';
    });
    var dropIcon = el('span');
    dropIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 12l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
    var drop = el('div.rb-drop', { role: 'button', tabindex: '0', onclick: function () { fileInput.click(); } }, [
      dropIcon,
      el('div.rb-drop-t', { text: 'Drop a .rbir file, or click to browse' }),
      el('div.rb-drop-sub', { text: 'Saved from any Rebound plugin' })
    ]);
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('is-over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f, function (t) { importFromText(t, ctx); });
    });

    // Paste fallback, kept quiet behind a disclosure so it does not clutter.
    var paste = el('textarea.rb-code', { rows: '4', placeholder: 'Paste a Rebound IR (.rbir) document', spellcheck: 'false' });
    var pasteBtn = el('button.rb-btn', { type: 'button', onclick: function () {
      var t = paste.value.trim();
      if (!t) { ctx.toast('Paste an IR document first.', { kind: 'error' }); return; }
      importFromText(t, ctx);
    } }, ['Import pasted IR']);
    var pasteWrap = el('details.rb-disclosure', null, [
      el('summary', { text: 'Paste IR instead' }),
      el('div.rb-col', null, [paste, el('div.rb-row', null, [pasteBtn])])
    ]);

    var sendNote = el('div.rb-import-note');
    sendNote.innerHTML = 'Install the free <b>Rebound</b> plugin for Figma, Illustrator or Photoshop. Select your art and run it: it lands here in one click, or saves a <b>.rbir</b> file (hold <b>Shift</b> to force a file).';

    var reportEl = el('div.rb-report-host');

    // Target preference: reuse the open comp (Overlord-style) vs always make a new one.
    var activeCompToggle = (R.ui && R.ui.toggle) ? R.ui.toggle({
      value: buildOpts.importToActiveComp,
      label: 'Import into the active composition',
      onChange: setImportToActiveComp
    }) : null;

    // Build preference: flat (one comp, frames as groups) vs trimmed precomps.
    var precompToggle = (R.ui && R.ui.toggle) ? R.ui.toggle({
      value: buildOpts.precompFrames,
      label: 'Precomp frames (trim & clip to bounds)',
      onChange: setPrecompFrames
    }) : null;

    // Scale preference: auto-precomp large sub-frames AND large groups so a big
    // board (or a single huge frame) lands as a handful of editable precomps
    // instead of thousands of flat layers.
    var autoPrecompToggle = (R.ui && R.ui.toggle) ? R.ui.toggle({
      value: buildOpts.autoPrecomp,
      label: 'Precomp large frames & groups (avoid flooding the timeline)',
      onChange: setAutoPrecomp
    }) : null;

    // Colour-code the timeline by group so a big import reads as distinct blocks.
    var labelByFrameToggle = (R.ui && R.ui.toggle) ? R.ui.toggle({
      value: buildOpts.labelByFrame,
      label: 'Colour-code layers by group',
      onChange: setLabelByFrame
    }) : null;

    // Re-import in place: replace the previous version of matched layers.
    var updateToggle = (R.ui && R.ui.toggle) ? R.ui.toggle({
      value: buildOpts.updateExisting,
      label: 'Update in place on re-import',
      onChange: setUpdateExisting
    }) : null;

    ctx.body.appendChild(el('div.rb-col.rb-import', null, [
      bridge,
      buildSources(),
      drop,

      el('div.rb-section-label', { text: 'What transfers' }),
      buildCaps(),
      el('div.rb-faint', { text: 'Everything comes in editable; a fidelity report lists anything approximated or skipped.' }),

      el('div.rb-section-label', { text: 'How it builds' }),
      activeCompToggle ? activeCompToggle.el : null,
      el('div.rb-faint', { text: 'Off: always create a new composition.' }),
      precompToggle ? precompToggle.el : null,
      el('div.rb-faint', { text: 'Off: one comp, frames become editable groups (like Overlord & AEUX). On: each frame is its own trimmed precomp.' }),
      autoPrecompToggle ? autoPrecompToggle.el : null,
      el('div.rb-faint', { text: 'On (default): a big design lands as a few editable precomps — each large frame OR group (e.g. a whole screen) becomes its own comp — so importing a full board doesn’t flood the timeline. Small frames stay flat. Importing a single frame is unaffected.' }),
      labelByFrameToggle ? labelByFrameToggle.el : null,
      el('div.rb-faint', { text: 'Off (default): give each top-level frame (or, for a single frame, each of its groups) a distinct timeline label colour so a big import reads as blocks. Purely cosmetic.' }),
      updateToggle ? updateToggle.el : null,
      el('div.rb-faint', { text: 'On: re-importing the same design replaces the prior version of each layer instead of stacking a duplicate, and KEEPS any animation you added — Position/Anchor keyframes follow the new placement; Scale/Rotation/Opacity are preserved. Layers you added by hand are never touched.' }),

      el('div.rb-section-label', { text: 'Send from a design app' }),
      sendNote,

      pasteWrap,
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
