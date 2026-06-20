/*
 * Rebound — Library tool.
 * Browse the built-in Penner presets and any custom presets, search them, mark
 * favorites, and apply a preset to the selection. Custom presets and favorites
 * persist as versioned JSON in user data.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'library',
    title: 'Library',
    group: 'Easing',
    order: 1,
    keywords: ['library', 'presets', 'preset', 'easing', 'penner', 'favorites'],
    mount: mountLibrary
  });

  function loadUser() { return R.disk.read('user-presets', { schemaVersion: 1, items: [] }); }
  function saveUser(data) { R.disk.write('user-presets', data); }
  function loadFavorites() { return R.disk.read('favorites', []) || []; }
  function saveFavorites(list) { R.disk.write('favorites', list); }

  function mountLibrary(ctx) {
    var filter = 'all';
    var query = '';
    var scope = 'inout';
    var favorites = loadFavorites();

    var searchInput = el('input', { type: 'text', placeholder: 'Search presets…',
      oninput: function () { query = this.value.toLowerCase(); render(); } });
    var search = el('div.rb-search', null, [searchInput]);

    var filterCtl = ui.segmented([
      { value: 'all', label: 'All' },
      { value: 'builtin', label: 'Built-in' },
      { value: 'custom', label: 'Custom' },
      { value: 'favorites', label: '★' }
    ], { value: filter, onChange: function (v) { filter = v; render(); } });

    var grid = el('div', { style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
      gap: '6px'
    } });

    ctx.body.appendChild(el('div.rb-col', null, [search, filterCtl.el, grid]));

    function allPresets() {
      var user = loadUser().items || [];
      return (R.presets.defaults || []).concat(user);
    }

    function visible() {
      return allPresets().filter(function (p) {
        if (filter === 'builtin' && !p.builtin) return false;
        if (filter === 'custom' && p.builtin) return false;
        if (filter === 'favorites' && favorites.indexOf(p.id) === -1) return false;
        if (query) {
          var hay = (p.name + ' ' + (p.collection || '') + ' ' + (p.tags || []).join(' ')).toLowerCase();
          if (hay.indexOf(query) === -1) return false;
        }
        return true;
      });
    }

    function render() {
      R.dom.clear(grid);
      var list = visible();
      if (!list.length) {
        grid.appendChild(el('div.rb-empty', { style: { gridColumn: '1 / -1' } }, ['No presets match.']));
        return;
      }
      list.forEach(function (p) {
        grid.appendChild(tile(p));
      });
    }

    function tile(preset) {
      var starred = favorites.indexOf(preset.id) !== -1;
      var star = el('span.rb-tile-star' + (starred ? '.is-on' : ''), { text: '★', onclick: function (e) {
        e.stopPropagation();
        toggleFav(preset.id);
      } });
      var node = el('div.rb-tile', { title: preset.name + (preset.collection ? ' · ' + preset.collection : ''),
        onclick: function () { apply(preset); } }, [
        star,
        miniCurve(preset.curve),
        el('div.rb-tile-name', { text: preset.name })
      ]);
      if (!preset.builtin) {
        node.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          if (confirmDelete(preset)) removeCustom(preset.id);
        });
      }
      return node;
    }

    function toggleFav(id) {
      var i = favorites.indexOf(id);
      if (i === -1) favorites.push(id); else favorites.splice(i, 1);
      saveFavorites(favorites);
      render();
    }

    function confirmDelete(preset) {
      return typeof confirm === 'function' ? confirm('Delete preset "' + preset.name + '"?') : true;
    }

    function removeCustom(id) {
      var data = loadUser();
      data.items = (data.items || []).filter(function (p) { return p.id !== id; });
      saveUser(data);
      ctx.toast('Preset deleted', { kind: 'info' });
      render();
    }

    function apply(preset) {
      ctx.invoke('ease.apply', { curve: preset.curve, scope: scope })
        .then(function (res) {
          ctx.toast('Applied ' + preset.name + ' to ' + res.segments + ' segment' + (res.segments === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply preset', { kind: 'error' }); });
    }

    var scopeCtl = ui.segmented([
      { value: 'out', label: 'Out' },
      { value: 'inout', label: 'In & Out' },
      { value: 'in', label: 'In' }
    ], { value: scope, onChange: function (v) { scope = v; } });
    ctx.footer.appendChild(el('span.rb-faint', { text: 'Apply as' }));
    ctx.footer.appendChild(scopeCtl.el);
    ctx.footer.appendChild(el('span.rb-spacer'));
    var count = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(count);
    var off = ctx.onSelection(function (sel) {
      count.textContent = sel && sel.hasComp ? sel.totalSelectedKeys + ' keys' : '';
    });

    render();
    return { destroy: off };
  }

  function miniCurve(curve) {
    var pts = R.easing.sampler.samplePoints(curve, 40);
    var w = 60, h = 30, pad = 4;
    var range = R.easing.sampler.range(curve, 60);
    var lo = Math.min(0, range.min), hi = Math.max(1, range.max), span = (hi - lo) || 1;
    var d = pts.map(function (pt, i) {
      var x = pad + pt.x * (w - 2 * pad);
      var y = (h - pad) - ((pt.y - lo) / span) * (h - 2 * pad);
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
    return R.dom.svg('svg', { viewBox: '0 0 ' + w + ' ' + h }, [
      R.dom.svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 })
    ]);
  }

  // Public helper so the Ease tool can save the current curve into the library.
  R.presets = R.presets || {};
  R.presets.saveCustom = function (curve, name, extra) {
    var data = R.disk.read('user-presets', { schemaVersion: 1, items: [] });
    data.items = data.items || [];
    var id = 'user-' + (data.items.length + 1) + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var preset = { id: id, name: name, collection: 'Custom', builtin: false, curve: curve };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) preset[k] = extra[k];
    data.items.push(preset);
    R.disk.write('user-presets', data);
    return preset;
  };
})(window.Rebound = window.Rebound || {});
