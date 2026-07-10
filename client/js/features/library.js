/*
 * Rebound, Library tool.
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
    var applyToAll = false;
    var favorites = loadFavorites();

    // Widget: a quick curve-preset picker. Your favourites first (or the built-in
    // curves), as clickable thumbnails; click one to apply that easing to the
    // selection. Search, filters, custom-preset management and the scope / every-key
    // options live in the full Library, via the widget's open control.
    if (ctx.widget) {
      // Choose which presets the widget shows from a dropdown: Favourites,
      // Built-in, All, or one of your custom collections; the choice persists per
      // instance. Star presets (or save sets) in the full Library to build the
      // Favourites / collections the widget can show.
      var wFilter = (ctx.config && ctx.config.filter) || 'fav';
      var wGrid = el('div.rb-wgt-pick', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(54px, 1fr))', gridAutoRows: '1fr' } });
      var wSel = el('select.rb-wgt-picksel', { title: 'Choose which presets the widget shows' });
      var buildOptions = function () {
        R.dom.clear(wSel);
        wSel.appendChild(el('option', { value: 'fav' }, ['★ Favourites']));
        wSel.appendChild(el('option', { value: 'builtin' }, ['Built-in']));
        wSel.appendChild(el('option', { value: 'all' }, ['All presets']));
        widgetCollections().forEach(function (c) { wSel.appendChild(el('option', { value: 'col:' + c }, [c])); });
        wSel.value = wFilter;
      };
      var renderWGrid = function () {
        wSel.value = wFilter;
        R.dom.clear(wGrid);
        var picks = widgetPicks(wFilter);
        if (!picks.length) { wGrid.appendChild(el('div.rb-empty', { style: { gridColumn: '1 / -1' } }, ['No presets, star some in the Library'])); return; }
        picks.forEach(function (p) {
          wGrid.appendChild(el('button.rb-wgt-picktile', { type: 'button', title: p.name + (p.collection ? ' · ' + p.collection : ''),
            onclick: function () { apply(p); } }, [miniCurve(p.curve), el('span.rb-wgt-picktile-name', { text: p.name })]));
        });
      };
      wSel.addEventListener('change', function () { wFilter = wSel.value; ctx.setConfig({ filter: wFilter }); renderWGrid(); });
      buildOptions();
      renderWGrid();
      ctx.body.appendChild(el('div.rb-wgt', null, [el('div.rb-wgt-pickhead', null, [wSel]), wGrid]));
      return { destroy: function () {} };
    }

    // The distinct custom-preset collections, so a widget can be pointed at one.
    function widgetCollections() {
      var cols = [], seen = {};
      (loadUser().items || []).forEach(function (p) {
        var c = p.collection || 'Custom';
        if (!seen[c]) { seen[c] = 1; cols.push(c); }
      });
      return cols.sort();
    }

    // The widget's preset set for a filter: Favourites (falling back to built-ins
    // when none are starred), Built-in only, All, or a named custom collection
    // (col:<name>); deduped and capped so it stays a useful, priority-ordered set.
    function widgetPicks(filter) {
      var all = allPresets(), byId = {}, seen = {}, list = [], i;
      all.forEach(function (p) { byId[p.id] = p; });
      function add(p) { if (p && !seen[p.id]) { seen[p.id] = 1; list.push(p); } }
      if (filter === 'all') { for (i = 0; i < all.length && list.length < 16; i++) add(all[i]); }
      else if (filter === 'builtin') { for (i = 0; i < all.length && list.length < 16; i++) if (all[i].builtin) add(all[i]); }
      else if (filter && filter.indexOf('col:') === 0) {
        var col = filter.slice(4);
        for (i = 0; i < all.length && list.length < 16; i++) if (!all[i].builtin && (all[i].collection || 'Custom') === col) add(all[i]);
      } else {
        favorites.forEach(function (id) { add(byId[id]); });
        if (!list.length) for (i = 0; i < all.length && list.length < 16; i++) if (all[i].builtin) add(all[i]);
      }
      return list.slice(0, 16);
    }

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
      var builtins = list.filter(function (p) { return p.builtin; });
      var customs = list.filter(function (p) { return !p.builtin; });
      var groupCustoms = customs.length > 0;

      if (builtins.length) {
        if (groupCustoms) grid.appendChild(collectionHeader('Built-in'));
        builtins.forEach(function (p) { grid.appendChild(tile(p)); });
      }
      if (groupCustoms) {
        // Group custom presets by their collection (set), sorted alphabetically.
        var order = [], byCol = {};
        customs.forEach(function (p) { var c = p.collection || 'Custom'; if (!byCol[c]) { byCol[c] = []; order.push(c); } byCol[c].push(p); });
        order.sort();
        order.forEach(function (c) {
          if (builtins.length || order.length > 1) grid.appendChild(collectionHeader(c));
          byCol[c].forEach(function (p) { grid.appendChild(tile(p)); });
        });
      }
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
          manageDialog(preset);
        });
      }
      // Animate the curve dot while the tile is hovered. SMIL begin/end methods
      // can throw in some engines, so each call is guarded.
      node.addEventListener('mouseenter', function () {
        var anims = node.querySelectorAll('animateMotion, animate');
        for (var i = 0; i < anims.length; i++) {
          try { anims[i].beginElement(); } catch (e) { /* SMIL not ready */ }
        }
      });
      node.addEventListener('mouseleave', function () {
        var anims = node.querySelectorAll('animateMotion, animate');
        for (var i = 0; i < anims.length; i++) {
          try { anims[i].endElement(); } catch (e) { /* SMIL not ready */ }
        }
      });
      return node;
    }

    // A header that spans the whole tile grid, labelling a collection.
    function collectionHeader(text) {
      return el('div.rb-lib-collhead', { style: {
        gridColumn: '1 / -1', fontSize: '11px', color: 'var(--rb-text-faint)',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px'
      }, text: text });
    }

    // Manage a custom preset: rename its collection (set) or delete it.
    function manageDialog(preset) {
      if (!R.ui.modal) { if (confirmDelete(preset)) removeCustom(preset.id); return; }
      var input = el('input.rb-savedlg-input', { type: 'text', spellcheck: 'false', maxlength: '30',
        value: preset.collection || 'Custom',
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } } });
      var field = el('div.rb-savedlg-field', null, [el('span.rb-savedlg-label', { text: 'Collection' }), input]);
      var delBtn = el('button.rb-btn.is-ghost', { onclick: function () { handle.close('close'); if (confirmDelete(preset)) removeCustom(preset.id); } }, ['Delete']);
      var cancelBtn = el('button.rb-btn.is-ghost', { onclick: function () { handle.close('close'); } }, ['Cancel']);
      var saveBtn = el('button.rb-btn.is-primary', { onclick: save }, ['Save']);
      var handle = R.ui.modal({ title: 'Manage ' + preset.name, width: 320,
        body: el('div.rb-savedlg', null, [field]), footer: [delBtn, cancelBtn, saveBtn], initialFocus: input });
      function save() {
        var c = (input.value || '').trim() || 'Custom';
        setCollection(preset.id, c);
        handle.close('confirm');
        if (R.ui.toast) R.ui.toast('Moved to ' + c, { kind: 'success' });
      }
    }

    function setCollection(id, collection) {
      var data = loadUser();
      (data.items || []).forEach(function (it) { if (it.id === id) it.collection = collection; });
      saveUser(data);
      render();
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
      // Overshooting/oscillating curves (elastic, spring) can't be a single
      // temporal ease; apply them per the "Apply as" setting (sparse editable
      // keyframes by default, or a clean remap expression). Monotonic curves
      // fall through to native temporal ease below.
      if (R.easing.sampler.strategy(preset.curve) === 'bake') {
        R.easing.applyCurve(ctx, preset.curve, preset.name);
        return;
      }
      ctx.invoke('ease.apply', { curve: preset.curve, scope: scope, applyToAll: applyToAll })
        .then(function (res) {
          R.easing.applyResultToast(ctx, res,
            'Applied ' + preset.name + ' to ' + res.segments + ' segment' + (res.segments === 1 ? '' : 's'));
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply preset', { kind: 'error' }); });
    }

    var scopeCtl = ui.segmented([
      { value: 'out', label: 'Out' },
      { value: 'inout', label: 'In & Out' },
      { value: 'in', label: 'In' }
    ], { value: scope, onChange: function (v) { scope = v; } });
    var allToggle = ui.toggle({ label: 'Every key', value: applyToAll,
      title: 'Apply the preset to every keyframe of the property, not just the selected ones.',
      onChange: function (v) { applyToAll = v; } });
    ctx.body.appendChild(allToggle.el);
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
    // A dot that rides the same curve path on hover, so the easing can be felt
    // before applying. The SMIL animations are dormant (begin:'indefinite') until
    // the tile starts them; tiles that are never hovered render the static path
    // exactly as before.
    var dot = R.dom.svg('circle', { r: 2.4, fill: 'var(--rb-accent)', opacity: 0 }, [
      R.dom.svg('animateMotion', { dur: '1.1s', repeatCount: 'indefinite', path: d, begin: 'indefinite' }),
      R.dom.svg('animate', { attributeName: 'opacity', values: '0;1;1;0', dur: '1.1s', repeatCount: 'indefinite', begin: 'indefinite' })
    ]);
    return R.dom.svg('svg', { 'class': 'rb-mini-curve', viewBox: '0 0 ' + w + ' ' + h }, [
      R.dom.svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }),
      dot
    ]);
  }

  // Public helper so the Ease tool can save the current curve into the library.
  R.presets = R.presets || {};
  R.presets.saveCustom = function (curve, name, extra) {
    var data = R.disk.read('user-presets', { schemaVersion: 1, items: [], seq: 0 });
    data.items = data.items || [];
    // A monotonic sequence, never reused, so deleting a middle preset cannot
    // make the next save collide with an existing id (which would attach stale
    // favorites to the wrong preset). Migrate older files that lack a seq.
    if (typeof data.seq !== 'number') data.seq = data.items.length;
    data.seq += 1;
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var id = 'user-' + data.seq + '-' + slug;
    var preset = { id: id, name: name, collection: 'Custom', builtin: false, curve: curve };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) preset[k] = extra[k];
    data.items.push(preset);
    R.disk.write('user-presets', data);
    return preset;
  };

  // Every easing preset (built-in Penner curves + your saved ones) as a Home
  // action, so a single preset can be pinned as a one-click tile and bound to a
  // shortcut. Applying eases the selected keyframes with that exact curve.
  R.presets.homeActions = function () {
    var user = (R.disk.read('user-presets', { items: [] }).items) || [];
    var s = (R.settings && R.settings.load) ? R.settings.load() : {};
    var hl = (s.handleLength > 0) ? s.handleLength : 45;
    var defMode = (s.applyMode === 'expression') ? 'expression' : 'keys';
    return (R.presets.defaults || []).concat(user).map(function (p) {
      // Overshoot curves (elastic) can apply EITHER as a few editable keyframes
      // OR as a live remap expression; the tile/keybind carries both datasets and
      // an "Apply as" choice (default from Settings). Monotonic curves have no
      // expression form, so they stay native temporal ease with no mode choice.
      var bake = R.easing.sampler.strategy(p.curve) === 'bake';
      var action = {
        id: 'easepreset-' + p.id, label: p.name, toolId: 'ease',
        group: p.builtin ? 'Easing presets' : 'Your presets', kind: 'apply', display: 'text',
        desc: (p.builtin ? 'Easing preset: ' : 'Your saved preset: ') + p.name + (p.collection && !p.builtin ? ' (' + p.collection + ')' : ''),
        invoke: bake
          ? { method: 'ease.applyMode', args: {
              mode: defMode,
              points: R.easing.sampler.sparseSamples(p.curve),
              factors: R.easing.sampler.bakeFactors(p.curve, 256),
              handleLength: hl
            } }
          : { method: 'ease.apply', args: { curve: p.curve, scope: 'inout', applyToAll: false } }
      };
      if (bake) {
        action.config = [{ arg: 'mode', label: 'Apply as', type: 'select', options: [
          { value: 'keys', label: 'Keyframes' },
          { value: 'expression', label: 'Expression' }
        ] }];
      }
      return action;
    });
  };
})(window.Rebound = window.Rebound || {});
