/*
 * Rebound, configurable Home screen.
 *
 * A grid of one-click action tiles the user arranges themselves. A tile either
 * applies a host command in one click (Center Anchor, Thirds Grid, Easy Ease...)
 * or opens a tool that needs more interaction. Edit mode lets you drag tiles to
 * reorder, remove them, or open a searchable browser to pin any action or tool.
 * The layout persists to disk and travels in the Share Center bundle.
 *
 * R.homeScreen.create({ invoke, openTool, toast, refreshSelection }) -> { el, refresh }
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
    return (d && d.items && d.items.length) ? d.items.slice() : R.homeActions.DEFAULT.slice();
  }
  function persist(ids) { R.disk.write('home-layout', { schemaVersion: 1, items: ids }); }

  function create(opts) {
    var ids = load();
    var editing = false;
    var dragId = null;

    var grid = el('div.rb-home-grid');

    var editBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { editing = !editing; syncEdit(); render(); } }, ['Edit']);
    var addBtn = el('button.rb-btn', { type: 'button', onclick: openBrowser }, ['+ Add']);
    var hint = el('div.rb-home-hint', { text: '' });

    var head = el('div.rb-home-head', null, [
      el('span.rb-home-title', { text: 'Home' }),
      el('span.rb-grow'),
      addBtn,
      editBtn
    ]);

    var root = el('div.rb-home', null, [head, hint, grid]);

    function syncEdit() {
      editBtn.textContent = editing ? 'Done' : 'Edit';
      editBtn.classList.toggle('is-active', editing);
      addBtn.style.display = editing ? '' : 'none';
      hint.textContent = editing ? 'Drag tiles to arrange, × to remove, + Add to pin more.' : '';
      root.classList.toggle('is-editing', editing);
    }

    function runAction(action) {
      if (action.kind === 'open') { opts.openTool(action.toolId); return; }
      opts.invoke(action.invoke.method, action.invoke.args)
        .then(function () { opts.toast(action.label + ' applied', { kind: 'success' }); if (opts.refreshSelection) opts.refreshSelection(); })
        .catch(function (err) { opts.toast((err && err.message) || ('Could not apply ' + action.label), { kind: 'error' }); });
    }

    function removeItem(id) { ids = ids.filter(function (x) { return x !== id; }); persist(ids); render(); }
    function addItem(id) { if (ids.indexOf(id) === -1) { ids.push(id); persist(ids); render(); } }
    function reorder(fromId, toId) {
      var from = ids.indexOf(fromId), to = ids.indexOf(toId);
      if (from === -1 || to === -1 || from === to) return;
      ids.splice(from, 1);
      ids.splice(ids.indexOf(toId) + (from < to ? 1 : 0), 0, fromId);
      persist(ids); render();
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
        node.addEventListener('dragstart', function (e) { dragId = action.id; node.classList.add('is-dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', action.id); } catch (err) { /* ignore */ } } });
        node.addEventListener('dragend', function () { node.classList.remove('is-dragging'); dragId = null; });
        node.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; node.classList.add('is-droptarget'); });
        node.addEventListener('dragleave', function () { node.classList.remove('is-droptarget'); });
        node.addEventListener('drop', function (e) { e.preventDefault(); node.classList.remove('is-droptarget'); if (dragId && dragId !== action.id) reorder(dragId, action.id); });
      }
      return node;
    }

    function render() {
      R.dom.clear(grid);
      if (!ids.length) {
        grid.appendChild(el('div.rb-home-empty', null, [
          el('div', { text: 'No actions pinned yet.' }),
          el('button.rb-btn', { onclick: openBrowser }, ['Add actions'])
        ]));
        return;
      }
      ids.forEach(function (id) {
        var action = R.homeActions.byId(id);
        if (action) grid.appendChild(tile(action));
      });
      if (editing) {
        grid.appendChild(el('button.rb-home-tile.rb-home-add', { type: 'button', onclick: openBrowser }, [
          el('span.rb-home-plus', { text: '+' }), el('span.rb-home-label', { text: 'Add' })
        ]));
      }
    }

    // ---- Action browser (searchable) ----
    function openBrowser() {
      if (!R.ui.modal) return;
      var query = '';
      var listEl = el('div.rb-home-browser-list');
      var search = el('input', { type: 'text', spellcheck: 'false', placeholder: 'Search actions and tools…',
        oninput: function () { query = this.value.toLowerCase(); renderList(); } });

      function renderList() {
        R.dom.clear(listEl);
        var actions = R.homeActions.all().filter(function (a) {
          return !query || (a.label + ' ' + a.group).toLowerCase().indexOf(query) !== -1;
        });
        var groups = {}, order = [];
        actions.forEach(function (a) {
          var g = a.kind === 'apply' ? 'Quick actions' : a.group || 'Tools';
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(a);
        });
        order.sort(function (x, y) { return x === 'Quick actions' ? -1 : y === 'Quick actions' ? 1 : (x < y ? -1 : 1); });
        if (!actions.length) { listEl.appendChild(el('div.rb-empty', { text: 'No matches.' })); return; }
        order.forEach(function (g) {
          listEl.appendChild(el('div.rb-home-browser-head', { text: g }));
          groups[g].forEach(function (a) {
            var pinned = ids.indexOf(a.id) !== -1;
            var row = el('button.rb-home-browser-row' + (pinned ? '.is-pinned' : ''), { type: 'button', title: a.label }, [
              iconSpan(a.toolId, 'rb-home-ico-sm'),
              el('span.rb-grow', { text: a.label }),
              a.kind === 'apply' ? el('span.rb-home-badge', { text: '1-click' }) : el('span.rb-home-badge.is-open', { text: 'open' }),
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
        title: 'Add actions', width: 440, className: 'rb-modal-home',
        body: el('div.rb-home-browser', null, [el('div.rb-search', null, [search]), listEl]),
        footer: [doneBtn], initialFocus: search
      });
    }

    syncEdit();
    render();
    return { el: root, refresh: render };
  }

  R.homeScreen = { create: create };
})(window.Rebound = window.Rebound || {});
