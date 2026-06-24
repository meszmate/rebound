/*
 * Rebound, preset gallery.
 * The single, consistent save/recall surface for every tool, themed like the
 * Ease preset tiles: a wrapping grid of tiles (a curve thumbnail of how the
 * preset feels, plus its name) and a Save tile that prompts for a name. Click a
 * tile to apply it; delete your own with the x. A tool that can preview a preset
 * adds presets.previewFor(state) -> curve (or a function); others show name-only
 * tiles.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  // A small static plot of a curve (the motion's shape), matching the Ease
  // preset tiles. Accepts a curve object or a bare fn.
  function thumb(curve) {
    if (typeof curve === 'function') curve = { type: 'fn', fn: curve };
    var w = 60, h = 30, pad = 4;
    var pts = R.easing.sampler.samplePoints(curve, 40);
    var rng = R.easing.sampler.range(curve, 56);
    var lo = Math.min(0, rng.min);
    var hi = Math.max(1, rng.max);
    var span = (hi - lo) || 1;
    var d = pts.map(function (pt, i) {
      var x = pad + pt.x * (w - 2 * pad);
      var y = (h - pad) - ((pt.y - lo) / span) * (h - 2 * pad);
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return svg('svg', { viewBox: '0 0 ' + w + ' ' + h }, [
      svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5, 'stroke-linecap': 'round' })
    ]);
  }

  function gallery(config) {
    var toolId = config.toolId;
    var previewFor = config.previewFor;
    var thumbFor = config.thumbFor; // optional custom per-preset visual (non-curve tools)
    var defaults = config.defaults || [];

    function key() { return 'presets:' + toolId; }
    function loadUser() {
      var data = R.disk.read(key(), null);
      return (data && data.items) ? data.items : [];
    }
    function saveUser(items) { R.disk.write(key(), { schemaVersion: 1, items: items }); }

    function all() {
      var out = [];
      defaults.forEach(function (d) { out.push({ name: d.name, state: d.state, builtin: true }); });
      loadUser().forEach(function (u) { out.push({ name: u.name, state: u.state, builtin: false }); });
      return out;
    }

    var grid = el('div.rb-pg-grid');
    var root = el('div.rb-presetgallery', null, [
      el('div.rb-section-label', { text: 'Presets' }),
      grid
    ]);

    function mark(name) {
      var tiles = grid.querySelectorAll('.rb-tile');
      for (var i = 0; i < tiles.length; i++) {
        tiles[i].classList.toggle('is-active', tiles[i].getAttribute('data-name') === name);
      }
    }

    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
    // The Home-action id for an applyable preset (tools that expose presets.apply).
    function presetActionId(name) { return 'toolpreset-' + toolId + '-' + slug(name); }
    // The keybind id for a preset's badge: when the tool can apply a preset
    // directly, bind to that APPLY action (so the key applies it); otherwise bind
    // to an open-the-tool-and-load command.
    function bindId(name) { return config.apply ? ('action:' + presetActionId(name)) : ('preset:' + toolId + ':' + name); }

    function tile(p) {
      var children = [];
      if (thumbFor) {
        try { var tnode = thumbFor(p.state); if (tnode) children.push(tnode); } catch (e) { /* no thumb */ }
      } else if (previewFor) {
        try { children.push(thumb(previewFor(p.state))); } catch (e2) { /* no thumb */ }
      }
      children.push(el('div.rb-tile-name', { text: p.name }));
      var node = el('div.rb-tile', {
        'data-name': p.name, title: 'Apply ' + p.name,
        onclick: function () {
          if (config.set) { try { config.set(p.state); } catch (e) { R.log.error('Preset apply failed', e); } }
          mark(p.name);
        }
      }, children);

      // Hover key-badge: bind a shortcut to this exact preset. Shows the current
      // combo when set (always visible), a key glyph to set otherwise (on hover).
      // Click to (re)record, right-click to clear.
      if (R.keybinds && R.keybinds.record) {
        var id = bindId(p.name);
        var keyBadge = el('button.rb-tile-key', { type: 'button' });
        function refreshKey() {
          var combo = R.keybinds.comboFor ? R.keybinds.comboFor(id) : '';
          keyBadge.textContent = combo || '⌨';
          keyBadge.classList.toggle('is-set', !!combo);
          keyBadge.title = combo
            ? 'Shortcut ' + combo + ' — click to change, right-click to remove'
            : 'Set a keyboard shortcut for ' + p.name;
        }
        keyBadge.addEventListener('click', function (e) {
          e.stopPropagation();
          R.keybinds.record(id, function () { refreshKey(); }, keyBadge);
        });
        keyBadge.addEventListener('contextmenu', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (R.keybinds.clearBind) { R.keybinds.clearBind(id); refreshKey(); if (R.ui.toast) R.ui.toast('Shortcut removed', { kind: 'info' }); }
        });
        refreshKey();
        node.appendChild(keyBadge);
      }
      if (!p.builtin) {
        node.appendChild(el('span.rb-tile-del', {
          title: 'Delete preset', 'aria-label': 'Delete ' + p.name,
          onclick: function (e) {
            e.stopPropagation();
            saveUser(loadUser().filter(function (u) { return u.name !== p.name; }));
            rebuild();
            if (R.ui.toast) R.ui.toast('Deleted ' + p.name, { kind: 'info' });
          }
        }, ['×']));
      }
      return node;
    }

    function userNames() { return loadUser().map(function (u) { return u.name; }); }
    function builtinNames() { return (defaults || []).map(function (d) { return d.name; }); }
    function eqi(a, b) { return a.toLowerCase() === b.toLowerCase(); }
    function existsIn(list, name) {
      for (var i = 0; i < list.length; i++) { if (eqi(list[i], name)) return list[i]; }
      return null;
    }

    function asCurve(c) { return (typeof c === 'function') ? { type: 'fn', fn: c } : c; }

    // A comfortable Save dialog: the curve graph being saved (matching the
    // tiles), a live preview of the motion, a generous name field with a smart
    // default, and graceful overwrite handling.
    function openSaveDialog() {
      var stage = null;
      var curveWrap = null;
      var previewWrap = null;

      if (thumbFor) {
        // The same custom visual the preset tile shows, at a larger size.
        try {
          var tn = thumbFor(config.get(), { height: 108 });
          if (tn) curveWrap = el('div.rb-savedlg-curve', null, [tn]);
        } catch (e0a) { curveWrap = null; }
      } else if (previewFor && R.ui.curveChip) {
        // The same static curve the preset tile shows, so the popup mirrors it.
        try {
          curveWrap = el('div.rb-savedlg-curve', null, [
            R.ui.curveChip(asCurve(previewFor(config.get())), { width: 300, height: 96, pad: 10 })
          ]);
        } catch (e0) { curveWrap = null; }
      }

      if (previewFor && R.ui.modal && R.ui.PreviewStage) {
        // previewFor may return a bare function or a curve object; PreviewStage
        // does not normalize a bare fn, so wrap it.
        var liveCurve = function () { return asCurve(previewFor(config.get())); };
        try {
          var stageHost = el('div.rb-savedlg-stage');
          previewWrap = el('div.rb-savedlg-preview', null, [stageHost]);
          stage = R.ui.PreviewStage(stageHost, { getCurve: liveCurve, property: 'position', sample: 'shape', duration: 900, controls: false });
        } catch (e) {
          stage = null;
          previewWrap = null;
        }
      }

      var input = el('input.rb-savedlg-input', {
        type: 'text', spellcheck: 'false', autocomplete: 'off', maxlength: '40',
        'data-autofocus': '1', value: suggestName(),
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); } },
        oninput: refreshHint
      });
      var hint = el('div.rb-savedlg-hint', { 'aria-live': 'polite', text: '' });
      var field = el('div.rb-savedlg-field', null, [
        el('span.rb-savedlg-label', { text: 'Preset name' }), input, hint
      ]);

      var children = [];
      if (curveWrap) children.push(curveWrap);
      if (previewWrap) children.push(previewWrap);
      children.push(field);

      var cancelBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { handle.close('close'); } }, ['Cancel']);
      var saveBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: commit }, ['Save']);

      var handle = R.ui.modal({
        title: 'Save preset', width: 360, className: 'rb-modal-save',
        body: el('div.rb-savedlg', null, children),
        footer: [cancelBtn, saveBtn],
        initialFocus: input,
        onClose: function () { if (stage) { stage.destroy(); stage = null; } }
      });

      function suggestName() {
        if (previewFor && R.ui.curveName) {
          try {
            var c = previewFor(config.get());
            var nm = R.ui.curveName(typeof c === 'function' ? null : c);
            if (nm && nm !== 'Custom' && nm !== 'No ease' && nm !== 'Linear' &&
              !existsIn(userNames(), nm) && !existsIn(builtinNames(), nm)) return nm;
          } catch (e) { /* fall through */ }
        }
        var n = loadUser().length + 1;
        while (existsIn(userNames(), 'Preset ' + n) || existsIn(builtinNames(), 'Preset ' + n)) n++;
        return 'Preset ' + n;
      }

      function refreshHint() {
        var name = input.value.trim();
        input.classList.remove('is-invalid');
        hint.classList.remove('is-warn', 'is-error');
        if (!name) { saveBtn.disabled = true; saveBtn.textContent = 'Save'; hint.textContent = ''; return; }
        var bi = existsIn(builtinNames(), name);
        if (bi) {
          saveBtn.disabled = true; saveBtn.textContent = 'Save';
          hint.classList.add('is-error'); hint.textContent = '“' + bi + '” is a built-in preset. Choose another name.';
          input.classList.add('is-invalid'); return;
        }
        saveBtn.disabled = false;
        var u = existsIn(userNames(), name);
        if (u) { saveBtn.textContent = 'Replace'; hint.classList.add('is-warn'); hint.textContent = 'Replaces your preset “' + u + '”.'; }
        else { saveBtn.textContent = 'Save'; hint.textContent = ''; }
      }

      function commit() {
        var name = input.value.trim();
        if (!name || existsIn(builtinNames(), name)) { input.classList.add('is-invalid'); input.focus(); input.select(); refreshHint(); return; }
        var replaced = !!existsIn(userNames(), name);
        var items = loadUser().filter(function (u) { return !eqi(u.name, name); });
        items.push({ name: name, state: config.get() });
        saveUser(items);
        handle.close('confirm');
        rebuild();
        mark(name);
        if (R.ui.toast) R.ui.toast((replaced ? 'Replaced “' : 'Saved “') + name + '”', { kind: 'success' });
      }

      refreshHint();
    }

    function saveTile() {
      return el('div.rb-tile.rb-pg-save', {
        role: 'button', tabindex: '0', title: 'Save current settings as a preset',
        onclick: openSaveDialog,
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSaveDialog(); } }
      }, [
        el('div.rb-pg-savebtn', null, [el('span.rb-pg-plus', { text: '+' }), el('span', { text: 'Save' })])
      ]);
    }

    function rebuild() {
      R.dom.clear(grid);
      all().forEach(function (p) { grid.appendChild(tile(p)); });
      grid.appendChild(saveTile());
    }

    function toolTitle() { var t = (R.tools && R.tools.get) ? R.tools.get(toolId) : null; return (t && t.title) || toolId; }

    // When the tool can APPLY a preset directly (presets.apply), the preset's
    // applyable Home action is registered by the tool itself (R.toolPresets), so
    // it exists without opening the tool; the badge just binds to it. Otherwise,
    // the shortcut opens the tool and loads the preset.
    if (!config.apply && R.keybinds && R.keybinds.addProvider) {
      R.keybinds.addProvider(function () {
        var title = toolTitle();
        return all().map(function (p) {
          return {
            id: bindId(p.name), label: title + ': ' + p.name, group: 'Presets',
            run: function () {
              if (R.shell && R.shell.openTool) R.shell.openTool(toolId);
              if (config.set) { try { config.set(p.state); } catch (e) { /* ignore */ } }
              mark(p.name);
            }
          };
        });
      });
    }

    rebuild();
    return root;
  }

  R.ui = R.ui || {};
  R.ui.presetGallery = gallery;
})(window.Rebound = window.Rebound || {});
