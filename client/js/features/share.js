/*
 * Rebound, Share Center.
 * Exports all of your Rebound data (settings, saved presets, palettes, custom
 * expressions, favorites, and per-tool presets) into one portable text bundle to
 * copy elsewhere, and imports a bundle back, merging into or replacing your
 * current data. No file dialogs: the bundle is plain JSON you can paste into a
 * file or message and carry between machines or teammates.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var BUNDLE_VERSION = 1;
  var FIXED_KEYS = ['settings', 'user-presets', 'favorites', 'palettes', 'user-expressions', 'user-scripts', 'fav-tools', 'home-layout'];

  function allKeys() {
    var keys = FIXED_KEYS.slice();
    (R.tools.list() || []).forEach(function (t) { keys.push('presets:' + t.id); });
    return keys;
  }

  function buildBundle() {
    var data = {};
    allKeys().forEach(function (k) {
      var v = R.disk.read(k, null);
      if (v != null) data[k] = v;
    });
    return { rebound: true, kind: 'rebound-bundle', version: BUNDLE_VERSION, exportedAt: nowIso(), data: data };
  }

  function nowIso() { try { return new Date().toISOString(); } catch (e) { return ''; } }

  // ---- Merge helpers -------------------------------------------------------
  function itemKey(it) { return (it && (it.id != null ? String(it.id) : (it.name != null ? 'name:' + String(it.name) : null))); }

  function mergeItems(existing, incoming) {
    var out = existing.slice();
    var index = {};
    for (var i = 0; i < out.length; i++) { var k = itemKey(out[i]); if (k) index[k] = i; }
    for (var j = 0; j < incoming.length; j++) {
      var key = itemKey(incoming[j]);
      if (key != null && index[key] != null) out[index[key]] = incoming[j];
      else { out.push(incoming[j]); if (key != null) index[key] = out.length - 1; }
    }
    return out;
  }

  function mergeValue(existing, incoming) {
    if (existing == null) return incoming;
    // Arrays of primitives (favorites, fav-tools): union by value.
    if (existing instanceof Array && incoming instanceof Array) {
      var seen = {}, out = [];
      existing.concat(incoming).forEach(function (v) { var s = JSON.stringify(v); if (!seen[s]) { seen[s] = true; out.push(v); } });
      return out;
    }
    // Objects holding an items array (presets, palettes, expressions): merge items.
    if (existing && incoming && existing.items instanceof Array && incoming.items instanceof Array) {
      var merged = {};
      for (var k in existing) if (existing.hasOwnProperty(k)) merged[k] = existing[k];
      for (var k2 in incoming) if (incoming.hasOwnProperty(k2)) merged[k2] = incoming[k2];
      merged.items = mergeItems(existing.items, incoming.items);
      if (typeof existing.seq === 'number' || typeof incoming.seq === 'number') {
        merged.seq = Math.max(existing.seq || 0, incoming.seq || 0, merged.items.length);
      }
      return merged;
    }
    // Plain objects (settings): shallow-merge, incoming wins.
    if (existing && incoming && typeof existing === 'object' && typeof incoming === 'object') {
      var o = {};
      for (var a in existing) if (existing.hasOwnProperty(a)) o[a] = existing[a];
      for (var b in incoming) if (incoming.hasOwnProperty(b)) o[b] = incoming[b];
      return o;
    }
    return incoming;
  }

  function importBundle(bundle, mode) {
    if (!bundle || bundle.kind !== 'rebound-bundle' || !bundle.data) throw new Error('Not a Rebound bundle.');
    var data = bundle.data;
    var n = 0;
    for (var key in data) {
      if (!data.hasOwnProperty(key)) continue;
      var incoming = data[key];
      if (mode === 'replace') {
        R.disk.write(key, incoming);
      } else {
        R.disk.write(key, mergeValue(R.disk.read(key, null), incoming));
      }
      n++;
    }
    return n;
  }

  R.tools.register({
    id: 'share',
    title: 'Share Center',
    group: 'Organization',
    order: 5,
    keywords: ['share', 'export', 'import', 'backup', 'bundle', 'presets', 'palettes', 'expressions', 'sync', 'transfer', 'team'],
    mount: mount
  });

  function mount(ctx) {
    var importMode = 'merge';

    var codeStyle = {
      width: '100%', minHeight: '110px', resize: 'vertical', boxSizing: 'border-box',
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '11px', lineHeight: '1.45',
      color: 'var(--rb-text)', background: 'var(--rb-bg-sunken)', border: '1px solid var(--rb-border)',
      borderRadius: 'var(--rb-radius-2)', padding: '6px'
    };

    // ---- Export ----
    var exportBox = el('textarea', { readonly: 'readonly', spellcheck: 'false', style: codeStyle });
    var exportInfo = el('div.rb-faint', { text: '' });
    function regenExport() {
      var bundle = buildBundle();
      exportBox.value = JSON.stringify(bundle, null, 2);
      var n = Object.keys(bundle.data).length;
      exportInfo.textContent = n + ' data set' + (n === 1 ? '' : 's') + ' · ' + exportBox.value.length + ' chars';
    }
    var copyBtn = el('button.rb-btn', { onclick: function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(exportBox.value);
        else { exportBox.focus(); exportBox.select(); document.execCommand('copy'); }
        ctx.toast('Bundle copied', { kind: 'success' });
      } catch (e) { ctx.toast('Could not copy', { kind: 'error' }); }
    } }, ['Copy bundle']);
    var regenBtn = el('button.rb-btn.is-ghost', { onclick: regenExport }, ['Refresh']);

    // ---- Import ----
    var importBox = el('textarea', { spellcheck: 'false', placeholder: 'Paste a Rebound bundle here…', style: codeStyle });
    var modeCtl = ui.segmented([
      { value: 'merge', label: 'Merge', title: 'Add and update, keeping your existing data' },
      { value: 'replace', label: 'Replace', title: 'Overwrite each included data set' }
    ], { value: importMode, onChange: function (v) { importMode = v; } });
    var importBtn = el('button.rb-btn.is-primary', { onclick: doImport }, ['Import']);

    function doImport() {
      var raw = (importBox.value || '').trim();
      if (!raw) { ctx.toast('Paste a bundle first', { kind: 'error' }); return; }
      var bundle;
      try { bundle = JSON.parse(raw); } catch (e) { ctx.toast('That is not valid JSON', { kind: 'error' }); return; }
      try {
        var n = importBundle(bundle, importMode);
        ctx.toast('Imported ' + n + ' data set' + (n === 1 ? '' : 's') + '. Reopen tools to see changes.', { kind: 'success', duration: 6000 });
        regenExport();
      } catch (e2) { ctx.toast(e2.message || 'Could not import', { kind: 'error' }); }
    }

    regenExport();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: R.disk.available
        ? 'Carry your presets, palettes, expressions, and settings between machines or teammates.'
        : 'Running without file access: data lives in this session only, but you can still copy a bundle out.' }),
      el('div.rb-section-label', { text: 'Export' }),
      exportBox,
      exportInfo,
      el('div.rb-row', { style: { gap: '6px' } }, [copyBtn, regenBtn]),
      el('div.rb-section-label', { text: 'Import' }),
      importBox,
      ui.row('On import', modeCtl.el),
      el('div.rb-row', null, [importBtn])
    ]));

    return {};
  }
})(window.Rebound = window.Rebound || {});
