/*
 * Rebound, configurable Home screen.
 *
 * A board the user arranges themselves, mixing three kinds of item:
 *   - one-click ACTION tiles that apply a host command or open a tool,
 *   - live WIDGETS that embed a tool's whole UI right on the Home, so you use the
 *     real controller (the Align grid, the Ease curve, the Anchor box...) inline.
 * Widgets can be full or half width. Edit mode lets you drag to reorder, resize,
 * remove, or open a searchable browser (filterable by kind) to pin anything. The
 * layout persists to disk (home-layout) and travels in the Share Center bundle.
 *
 * R.homeScreen.create({ invoke, openTool, toast, refreshSelection, onSelection,
 *   getSelection, onToggleFocus }) -> { el, refresh }
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  function iconSpan(toolId, cls) {
    var span = el('span.' + (cls || 'rb-home-ico'));
    var m = (R.toolMeta && R.toolMeta.forTool(toolId)) || {};
    var inner = m.icon || (R.toolMeta && R.toolMeta.ICONS && R.toolMeta.ICONS.curve) || '';
    span.innerHTML = R.toolMeta ? R.toolMeta.svg(inner) : '';
    return span;
  }

  function load() {
    var d = R.disk.read('home-layout', null);
    if (d && d.items && d.items.length) return { items: d.items.slice(), widths: d.widths || {} };
    return { items: R.homeActions.DEFAULT.slice(), widths: {} };
  }

  function create(opts) {
    var saved = load();
    var ids = saved.items;
    var widths = saved.widths || {};
    var editing = false;
    var dragId = null;
    var widgetCache = {}; // id -> { card, destroy, widthBtn }

    function persist() { R.disk.write('home-layout', { schemaVersion: 1, items: ids, widths: widths }); }
    function widthOf(id) { return widths[id] === 'half' ? 'half' : 'full'; }

    var grid = el('div.rb-home-grid');
    var editBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { editing = !editing; syncEdit(); render(); } }, ['Edit']);
    var addBtn = el('button.rb-btn', { type: 'button', onclick: openBrowser }, ['+ Add']);
    var hint = el('div.rb-home-hint', { text: '' });

    var headKids = [el('span.rb-home-title', { text: 'Home' }), el('span.rb-grow')];
    if (opts.onToggleFocus) {
      headKids.push(el('button.rb-btn.is-ghost', { type: 'button', title: 'Hide the sidebar and fill the panel (Ctrl/Cmd+Shift+F)', onclick: opts.onToggleFocus }, ['Focus']));
    }
    headKids.push(addBtn);
    headKids.push(editBtn);
    var head = el('div.rb-home-head', null, headKids);

    var root = el('div.rb-home', null, [head, hint, grid]);

    function syncEdit() {
      editBtn.textContent = editing ? 'Done' : 'Edit';
      editBtn.classList.toggle('is-active', editing);
      addBtn.style.display = editing ? '' : 'none';
      hint.textContent = editing ? 'Drag to arrange, ▭/½ to resize a widget, × to remove, + Add to pin more.' : '';
      root.classList.toggle('is-editing', editing);
    }

    function runAction(action) {
      if (action.kind === 'open') { opts.openTool(action.toolId); return; }
      opts.invoke(action.invoke.method, action.invoke.args)
        .then(function () { opts.toast(action.label + ' applied', { kind: 'success' }); if (opts.refreshSelection) opts.refreshSelection(); })
        .catch(function (err) { opts.toast((err && err.message) || ('Could not apply ' + action.label), { kind: 'error' }); });
    }

    function removeItem(id) {
      ids = ids.filter(function (x) { return x !== id; });
      delete widths[id];
      if (widgetCache[id]) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; }
      persist(); render();
    }
    function addItem(id) { if (ids.indexOf(id) === -1) { ids.push(id); persist(); render(); } }
    function reorder(fromId, toId) {
      var from = ids.indexOf(fromId), to = ids.indexOf(toId);
      if (from === -1 || to === -1 || from === to) return;
      ids.splice(from, 1);
      ids.splice(ids.indexOf(toId) + (from < to ? 1 : 0), 0, fromId);
      persist(); render();
    }
    function setWidth(id, w) { if (w === 'full') delete widths[id]; else widths[id] = w; persist(); render(); }

    function wireDrag(node, id) {
      node.addEventListener('dragstart', function (e) { if (!editing) { e.preventDefault(); return; } dragId = id; node.classList.add('is-dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* ignore */ } } });
      node.addEventListener('dragend', function () { node.classList.remove('is-dragging'); dragId = null; });
      node.addEventListener('dragover', function (e) { if (!editing) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; node.classList.add('is-droptarget'); });
      node.addEventListener('dragleave', function () { node.classList.remove('is-droptarget'); });
      node.addEventListener('drop', function (e) { if (!editing) return; e.preventDefault(); node.classList.remove('is-droptarget'); if (dragId && dragId !== id) reorder(dragId, id); });
    }

    function tile(action) {
      var node = el('button.rb-home-tile', {
        type: 'button', 'data-id': action.id,
        title: action.kind === 'apply' ? ('Apply ' + action.label + ' in one click') : ('Open ' + action.label),
        onclick: function () { if (!editing) runAction(action); }
      }, [
        iconSpan(action.toolId),
        el('span.rb-home-label', { text: action.label }),
        action.kind === 'apply' ? el('span.rb-home-badge', { text: '1-click' }) : el('span.rb-home-badge.is-open', { text: 'open' })
      ]);
      if (editing) {
        node.classList.add('is-editmode');
        node.setAttribute('draggable', 'true');
        node.appendChild(el('span.rb-home-remove', { title: 'Remove', onclick: function (e) { e.stopPropagation(); removeItem(action.id); } }, ['×']));
        wireDrag(node, action.id);
      }
      return node;
    }

    function buildWidget(action) {
      var tool = R.tools.get(action.toolId);
      var host = el('div.rb-home-widget-body');
      var footer = el('div.rb-action-bar');
      var wctx = {
        body: host, footer: footer, bridge: R.bridge,
        invoke: opts.invoke, openTool: opts.openTool, toast: opts.toast,
        refreshSelection: opts.refreshSelection || function () {},
        onSelection: opts.onSelection || function () { return function () {}; },
        getSelection: opts.getSelection || function () { return {}; }
      };
      var destroy = function () {};
      if (tool && tool.mount) {
        try {
          var api = tool.mount(wctx);
          if (api && typeof api.destroy === 'function') destroy = api.destroy;
          if (api && api.presets && R.ui.presetGallery) host.appendChild(R.ui.presetGallery(api.presets));
        } catch (e) {
          host.appendChild(el('div.rb-empty', null, ['This widget failed to load: ' + ((e && e.message) || e)]));
        }
      } else {
        host.appendChild(el('div.rb-empty', null, ['Unknown widget']));
      }

      var widthBtn = el('button.rb-home-wbtn', { type: 'button', title: 'Toggle widget width',
        onclick: function (e) { e.stopPropagation(); setWidth(action.id, widthOf(action.id) === 'half' ? 'full' : 'half'); } }, [widthOf(action.id) === 'half' ? '½' : '▭']);
      var header = el('div.rb-home-widget-head', null, [
        el('span.rb-home-grip', { title: 'Drag to move' }, ['⠿']),
        iconSpan(action.toolId, 'rb-home-ico-sm'),
        el('span.rb-grow', { text: action.label }),
        widthBtn,
        el('span.rb-home-remove', { title: 'Remove', onclick: function (e) { e.stopPropagation(); removeItem(action.id); } }, ['×'])
      ]);
      var shield = el('div.rb-home-widget-shield', { title: 'Editing - turn off Edit to use this widget' });
      var card = el('div.rb-home-widget', { 'data-id': action.id }, [header, shield, host, footer]);
      wireDrag(card, action.id);
      widgetCache[action.id] = { card: card, destroy: destroy, widthBtn: widthBtn };
      return card;
    }

    function decorateWidget(action) {
      var entry = widgetCache[action.id];
      if (!entry) return;
      entry.card.classList.toggle('is-editmode', editing);
      entry.card.classList.toggle('is-half', widthOf(action.id) === 'half');
      entry.card.setAttribute('draggable', editing ? 'true' : 'false');
      entry.widthBtn.textContent = widthOf(action.id) === 'half' ? '½' : '▭';
    }

    function addTile() {
      return el('button.rb-home-tile.rb-home-add', { type: 'button', onclick: openBrowser }, [
        el('span.rb-home-plus', { text: '+' }), el('span.rb-home-label', { text: 'Add' })
      ]);
    }

    function render() {
      var keep = {};
      ids.forEach(function (id) { keep[id] = true; });
      Object.keys(widgetCache).forEach(function (id) {
        if (!keep[id]) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; }
      });

      R.dom.clear(grid);
      if (!ids.length) {
        grid.appendChild(el('div.rb-home-empty', null, [
          el('div', { text: 'No items pinned yet.' }),
          el('button.rb-btn', { onclick: openBrowser }, ['Add items'])
        ]));
        return;
      }
      ids.forEach(function (id) {
        var action = R.homeActions.byId(id);
        if (!action) return;
        if (action.kind === 'widget') {
          if (!widgetCache[id]) buildWidget(action);
          decorateWidget(action);
          grid.appendChild(widgetCache[id].card);
        } else {
          grid.appendChild(tile(action));
        }
      });
      if (editing) grid.appendChild(addTile());
    }

    // ---- Browser (searchable, filterable by kind) ----
    function openBrowser() {
      if (!R.ui.modal) return;
      var query = '';
      var kind = 'all';
      var listEl = el('div.rb-home-browser-list');

      var kindCtl = R.ui.segmented([
        { value: 'all', label: 'All' },
        { value: 'apply', label: '1-click' },
        { value: 'widget', label: 'Widgets' },
        { value: 'open', label: 'Open' }
      ], { value: kind, onChange: function (v) { kind = v; renderList(); } });

      var search = el('input', { type: 'text', spellcheck: 'false', placeholder: 'Search…',
        oninput: function () { query = this.value.toLowerCase(); renderList(); } });

      function groupName(a) {
        if (a.kind === 'apply') return 'Quick actions';
        if (a.kind === 'widget') return 'Widgets (whole tool on Home)';
        return a.group || 'Tools';
      }
      function rank(g) { return g === 'Quick actions' ? 0 : (g.indexOf('Widgets') === 0 ? 1 : 2); }

      function renderList() {
        R.dom.clear(listEl);
        var actions = R.homeActions.all().filter(function (a) {
          if (kind !== 'all' && a.kind !== kind) return false;
          return !query || (a.label + ' ' + a.group).toLowerCase().indexOf(query) !== -1;
        });
        var groups = {}, order = [];
        actions.forEach(function (a) {
          var g = groupName(a);
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(a);
        });
        order.sort(function (x, y) { return rank(x) - rank(y) || (x < y ? -1 : 1); });
        if (!actions.length) { listEl.appendChild(el('div.rb-empty', { text: 'No matches.' })); return; }
        order.forEach(function (g) {
          listEl.appendChild(el('div.rb-home-browser-head', { text: g }));
          groups[g].forEach(function (a) {
            var pinned = ids.indexOf(a.id) !== -1;
            var badge = a.kind === 'apply' ? el('span.rb-home-badge', { text: '1-click' })
              : a.kind === 'widget' ? el('span.rb-home-badge.is-widget', { text: 'widget' })
                : el('span.rb-home-badge.is-open', { text: 'open' });
            var row = el('button.rb-home-browser-row' + (pinned ? '.is-pinned' : ''), { type: 'button', title: a.label }, [
              iconSpan(a.toolId, 'rb-home-ico-sm'),
              el('span.rb-grow', { text: a.label }),
              badge,
              el('span.rb-home-pin', { text: pinned ? '✓' : '+' })
            ]);
            row.addEventListener('click', function () {
              if (ids.indexOf(a.id) !== -1) removeItem(a.id); else addItem(a.id);
              row.classList.toggle('is-pinned');
              var pin = row.querySelector('.rb-home-pin');
              if (pin) pin.textContent = (ids.indexOf(a.id) !== -1) ? '✓' : '+';
            });
            listEl.appendChild(row);
          });
        });
      }
      renderList();

      var doneBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { handle.close('confirm'); } }, ['Done']);
      var handle = R.ui.modal({
        title: 'Add to Home', width: 460, className: 'rb-modal-home',
        body: el('div.rb-home-browser', null, [
          el('div.rb-home-browser-filter', null, [kindCtl.el]),
          el('div.rb-search', null, [search]),
          listEl
        ]),
        footer: [doneBtn], initialFocus: search
      });
    }

    syncEdit();
    render();
    return { el: root, refresh: render };
  }

  R.homeScreen = { create: create };
})(window.Rebound = window.Rebound || {});
