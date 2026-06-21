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

    function tile(p) {
      var children = [];
      if (previewFor) {
        try { children.push(thumb(previewFor(p.state))); } catch (e) { /* no thumb */ }
      }
      children.push(el('div.rb-tile-name', { text: p.name }));
      var node = el('div.rb-tile', {
        'data-name': p.name, title: 'Apply ' + p.name,
        onclick: function () {
          if (config.set) { try { config.set(p.state); } catch (e) { R.log.error('Preset apply failed', e); } }
          mark(p.name);
        }
      }, children);
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

    function saveTile() {
      var node = el('div.rb-tile.rb-pg-save');
      function showButton() {
        R.dom.clear(node);
        node.classList.remove('is-editing');
        node.appendChild(el('div.rb-pg-savebtn', null, [
          el('span.rb-pg-plus', { text: '+' }),
          el('span', { text: 'Save' })
        ]));
        node.onclick = showField;
      }
      function showField() {
        R.dom.clear(node);
        node.onclick = null;
        node.classList.add('is-editing');
        var input = el('input.rb-pg-input', {
          type: 'text', placeholder: 'Name…', spellcheck: 'false',
          onkeydown: function (e) {
            if (e.key === 'Enter') commit(input.value);
            else if (e.key === 'Escape') showButton();
          }
        });
        var ok = el('button.rb-pg-ok', { type: 'button', title: 'Save', onclick: function () { commit(input.value); } }, ['✓']);
        node.appendChild(el('div.rb-pg-form', null, [input, ok]));
        input.focus();
      }
      function commit(name) {
        name = ('' + (name || '')).trim();
        if (!name) { showButton(); return; }
        var items = loadUser().filter(function (u) { return u.name !== name; });
        items.push({ name: name, state: config.get() });
        saveUser(items);
        rebuild();
        mark(name);
        if (R.ui.toast) R.ui.toast('Saved “' + name + '”', { kind: 'success' });
      }
      showButton();
      return node;
    }

    function rebuild() {
      R.dom.clear(grid);
      all().forEach(function (p) { grid.appendChild(tile(p)); });
      grid.appendChild(saveTile());
    }

    rebuild();
    return root;
  }

  R.ui = R.ui || {};
  R.ui.presetGallery = gallery;
})(window.Rebound = window.Rebound || {});
