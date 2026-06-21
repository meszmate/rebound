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
    if (d && d.items && d.items.length) return { items: d.items.slice(), widths: d.widths || {}, collapsed: d.collapsed || {}, meta: d.meta || {}, sizes: d.sizes || {}, board: d.board || 'md' };
    return { items: R.homeActions.DEFAULT.slice(), widths: {}, collapsed: {}, meta: {}, sizes: {}, board: 'md' };
  }

  // Stretch a widget's schematic preview graphs to fill its width so there is no
  // letterboxed empty space. Interactive curve editors and curve chips are left
  // alone so their shape is not distorted.
  function fillPreviews(host) {
    var svgs = host.querySelectorAll('svg[width="100%"]');
    for (var i = 0; i < svgs.length; i++) {
      var s = svgs[i];
      if ((s.getAttribute('class') || '').indexOf('rb-curve-chip') !== -1) continue;
      if (s.querySelector('.rb-curve-path, .rb-handle, .rb-swatch-dot')) continue;
      s.setAttribute('preserveAspectRatio', 'none');
    }
  }

  function create(opts) {
    var saved = load();
    var ids = saved.items;
    var widths = saved.widths || {};
    var collapsed = saved.collapsed || {};
    var meta = saved.meta || {};            // per-tile look: label, display, badge, size, icon
    var sizes = saved.sizes || {};          // per-item drag-resized pixel size { w, h }
    var board = saved.board || 'md';        // global density: sm | md | lg
    var maximizedId = null;
    var editing = false;
    var dragId = null;
    var lastAddedId = null; // gets a one-time pop animation on the next render
    var widgetCache = {}; // id -> { card, destroy, widthBtn, collapseBtn, maxBtn }

    function metaOf(id) { return meta[id] || {}; }
    function setMeta(id, m) {
      // Drop the override entirely when it is all defaults, to keep storage clean.
      var isDefault = (!m.label) && (!m.display || m.display === 'icon') && (!m.badge) && (!m.icon);
      if (isDefault) delete meta[id]; else meta[id] = m;
      persist(); render();
    }

    // Replay a CSS animation class on a node once (remove, reflow, add, cleanup).
    function playOnce(node, cls) {
      if (!node) return;
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
      node.addEventListener('animationend', function h() { node.classList.remove(cls); node.removeEventListener('animationend', h); });
    }

    function persist() { R.disk.write('home-layout', { schemaVersion: 1, items: ids, widths: widths, collapsed: collapsed, meta: meta, sizes: sizes, board: board }); }

    function setBoard(b) { board = b; grid.classList.remove('is-sm', 'is-md', 'is-lg'); grid.classList.add('is-' + b); persist(); syncBoardBtns(); }
    function syncBoardBtns() {
      if (!boardBtns) return;
      ['sm', 'md', 'lg'].forEach(function (b) { boardBtns[b].classList.toggle('is-active', board === b); });
    }

    // A corner drag-resize handle (edit mode), MTP-style: drag to size an item.
    // axes 'both' resizes width + height (tiles); 'x' width only (widgets).
    function attachResize(node, id, axes, minW, minH) {
      var handle = el('span.rb-home-resize', { title: 'Drag to resize' });
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var r = node.getBoundingClientRect();
        var sx = e.clientX, sy = e.clientY, sw = r.width, sh = r.height, drafted = null;
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        function mv(ev) {
          var w = Math.max(minW, Math.round(sw + (ev.clientX - sx)));
          var h = Math.max(minH, Math.round(sh + (ev.clientY - sy)));
          node.style.flex = '0 0 auto';
          node.style.width = w + 'px';
          node.style.maxWidth = 'none';
          if (axes === 'both') { node.style.height = h + 'px'; node.style.minHeight = h + 'px'; }
          drafted = (axes === 'both') ? { w: w, h: h } : { w: w };
        }
        function up() {
          handle.removeEventListener('pointermove', mv);
          handle.removeEventListener('pointerup', up);
          if (drafted) { sizes[id] = drafted; persist(); render(); }
        }
        handle.addEventListener('pointermove', mv);
        handle.addEventListener('pointerup', up);
      });
      // Double-click the handle to reset to the default size.
      handle.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); delete sizes[id]; persist(); render(); });
      node.appendChild(handle);
    }

    var WIDTHS = ['full', 'half', 'twothirds', 'third'];
    function widthOf(id) { return widths[id] || 'full'; }
    function widthGlyph(id) { var w = widthOf(id); return w === 'half' ? '½' : w === 'third' ? '⅓' : w === 'twothirds' ? '⅔' : '▭'; }
    function cycleWidth(id) {
      var next = WIDTHS[(WIDTHS.indexOf(widthOf(id)) + 1) % WIDTHS.length];
      if (next === 'full') delete widths[id]; else widths[id] = next;
      delete sizes[id]; // a width preset overrides a drag size
      persist(); render();
    }
    function collapsedOf(id) { return !!collapsed[id]; }
    function toggleCollapse(id) { if (collapsed[id]) delete collapsed[id]; else collapsed[id] = true; persist(); render(); }
    function toggleMaximize(id) { maximizedId = (maximizedId === id) ? null : id; render(); }

    var grid = el('div.rb-home-grid');

    function iconBtn(inner, title, onclick) {
      var b = el('button.rb-btn.is-ghost.is-icon', { type: 'button', title: title, 'aria-label': title, onclick: onclick });
      if (R.toolMeta) b.innerHTML = R.toolMeta.svg(inner);
      return b;
    }
    var ICON_ADD = '<path d="M12 5v14M5 12h14"/>';
    var ICON_EDIT = '<path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 7l4 4"/>';
    var ICON_BROWSE = '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>';
    var ICON_GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z"/>';

    var addBtn = iconBtn(ICON_ADD, 'Add to Home', openBrowser);
    var editBtn = iconBtn(ICON_EDIT, 'Edit board', function () { editing = !editing; syncEdit(); render(); });

    var boardBtns = {};
    function boardBtn(b, lbl) { var x = el('button.rb-home-sizebtn', { type: 'button', title: 'Tile size ' + lbl, onclick: function () { setBoard(b); } }, [lbl]); boardBtns[b] = x; return x; }
    var boardControl = el('div.rb-home-sizectl', null, [el('span.rb-faint', { text: 'Size' }), boardBtn('sm', 'S'), boardBtn('md', 'M'), boardBtn('lg', 'L')]);
    var hintText = el('span.rb-grow', { text: '' });
    var hint = el('div.rb-home-hint', null, [hintText, boardControl]);

    var brand = el('div.rb-home-brand', null, [el('span.rb-home-mark', { text: '◗' }), el('span', { text: 'Rebound' })]);
    var actions = [addBtn, editBtn];
    if (opts.onBrowse) actions.push(iconBtn(ICON_BROWSE, 'Browse all tools', opts.onBrowse));
    if (opts.openSettings) actions.push(iconBtn(ICON_GEAR, 'Settings', opts.openSettings));
    var head = el('div.rb-home-head', null, [brand, el('span.rb-grow')].concat(actions));

    var root = el('div.rb-home', null, [head, hint, grid]);
    grid.classList.add('is-' + board);
    syncBoardBtns();

    function syncEdit() {
      editBtn.classList.toggle('is-active', editing);
      editBtn.title = editing ? 'Done editing' : 'Edit board';
      hintText.textContent = editing ? 'Drag to arrange · drag a tile corner to resize · × to remove' : '';
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
      delete widths[id]; delete collapsed[id]; delete sizes[id]; delete meta[id];
      if (maximizedId === id) maximizedId = null;
      if (widgetCache[id]) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; }
      persist(); render();
    }
    function addItem(id) { if (ids.indexOf(id) === -1) { ids.push(id); lastAddedId = id; persist(); render(); } }
    function reorder(fromId, toId) {
      var from = ids.indexOf(fromId), to = ids.indexOf(toId);
      if (from === -1 || to === -1 || from === to) return;
      ids.splice(from, 1);
      ids.splice(ids.indexOf(toId) + (from < to ? 1 : 0), 0, fromId);
      persist(); render();
    }

    function wireDrag(node, id) {
      node.addEventListener('dragstart', function (e) { if (!editing) { e.preventDefault(); return; } dragId = id; node.classList.add('is-dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* ignore */ } } });
      node.addEventListener('dragend', function () { node.classList.remove('is-dragging'); dragId = null; });
      node.addEventListener('dragover', function (e) { if (!editing) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; node.classList.add('is-droptarget'); });
      node.addEventListener('dragleave', function () { node.classList.remove('is-droptarget'); });
      node.addEventListener('drop', function (e) { if (!editing) return; e.preventDefault(); node.classList.remove('is-droptarget'); if (dragId && dragId !== id) reorder(dragId, id); });
    }

    function tileIcon(action, m) {
      if (m && m.icon) return el('span.rb-home-ico.is-custom', null, [el('img', { src: m.icon, alt: '' })]);
      return iconSpan(action.toolId);
    }
    function tileVisual(action) {
      var d = R.toolDemos && R.toolDemos[action.toolId];
      if (d && d.svg) { var w = el('div.rb-home-tilevis'); w.innerHTML = d.svg; return w; }
      return null;
    }
    // The tile contents for a given look (display, label, badge, icon).
    function tileContent(action, m) {
      var display = m.display || 'icon';
      var label = m.label || action.label;
      var kids = [];
      if (display === 'visual') { kids.push(tileVisual(action) || tileIcon(action, m)); }
      else if (display !== 'text') { kids.push(tileIcon(action, m)); }
      if (display !== 'icononly') kids.push(el('span.rb-home-label', { text: label }));
      if (m.badge === true && display !== 'icononly') {
        kids.push(action.kind === 'apply' ? el('span.rb-home-badge', { text: '1-click' }) : el('span.rb-home-badge.is-open', { text: 'open' }));
      }
      return kids;
    }
    function tileClass(action, m, base) {
      var c = base;
      if (action && action.id === lastAddedId) c += '.rb-pop';
      c += '.is-disp-' + (m.display || 'icon');
      return c;
    }
    function applySize(node, id, both) {
      var sz = sizes[id];
      if (sz) {
        node.style.flex = '0 0 auto'; node.style.width = sz.w + 'px'; node.style.maxWidth = 'none';
        if (both && sz.h) { node.style.height = sz.h + 'px'; node.style.minHeight = sz.h + 'px'; }
      }
    }
    function tile(action) {
      var m = metaOf(action.id);
      var node = el(tileClass(action, m, 'button.rb-home-tile'), {
        type: 'button', 'data-id': action.id,
        title: action.kind === 'apply' ? ('Apply ' + (m.label || action.label)) : ('Open ' + (m.label || action.label)),
        onclick: function () { if (editing) return; runAction(action); if (action.kind === 'apply') playOnce(node, 'rb-pulse'); }
      }, tileContent(action, m));
      applySize(node, action.id, true);
      if (editing) {
        node.classList.add('is-editmode');
        node.setAttribute('draggable', 'true');
        node.appendChild(el('span.rb-home-cog', { title: 'Customize tile', onclick: function (e) { e.stopPropagation(); customizeTile(action); } }, ['✎']));
        node.appendChild(el('span.rb-home-remove', { title: 'Remove', onclick: function (e) { e.stopPropagation(); removeItem(action.id); } }, ['×']));
        wireDrag(node, action.id);
        attachResize(node, action.id, 'both', 44, 40);
      }
      return node;
    }
    function previewTile(action, m) {
      return el(tileClass(null, m, 'div.rb-home-tile') + '.is-static', null, tileContent(action, m));
    }

    // The full tile customizer: label, display (icon / visual / text / icon only),
    // badge, size, and a custom uploaded icon, with a live tile preview.
    function customizeTile(action) {
      if (!R.ui.modal) return;
      var b = metaOf(action.id);
      var draft = { label: b.label || '', display: b.display || 'icon', badge: b.badge === true, icon: b.icon || null };

      var previewHost = el('div.rb-home-cust-preview');
      function renderPrev() { R.dom.clear(previewHost); previewHost.appendChild(previewTile(action, draft)); }

      var labelInput = el('input.rb-savedlg-input', { type: 'text', spellcheck: 'false', value: draft.label, placeholder: action.label,
        oninput: function () { draft.label = this.value; renderPrev(); } });
      var displayCtl = R.ui.segmented([
        { value: 'icon', label: 'Icon' }, { value: 'visual', label: 'Visual' }, { value: 'text', label: 'Text' }, { value: 'icononly', label: 'Icon only' }
      ], { value: draft.display, onChange: function (v) { draft.display = v; renderPrev(); } });
      var badgeToggle = R.ui.toggle({ label: 'Show badge', value: draft.badge, onChange: function (v) { draft.badge = v; renderPrev(); } });

      var fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' },
        onchange: function () {
          var f = this.files && this.files[0];
          if (!f) return;
          var r = new window.FileReader();
          r.onload = function () { draft.icon = r.result; renderPrev(); };
          r.readAsDataURL(f);
        } });
      var uploadBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { fileInput.click(); } }, ['Upload icon…']);
      var clearIconBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { draft.icon = null; renderPrev(); } }, ['Default icon']);

      renderPrev();
      var body = el('div.rb-home-cust', null, [
        previewHost,
        R.ui.row('Label', labelInput),
        R.ui.row('Display', displayCtl.el),
        badgeToggle.el,
        el('div.rb-row', { style: { gap: '6px' } }, [uploadBtn, clearIconBtn, fileInput])
      ]);

      var resetBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { delete meta[action.id]; persist(); render(); handle.close('confirm'); } }, ['Reset']);
      var cancelBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { handle.close('close'); } }, ['Cancel']);
      var saveBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { setMeta(action.id, draft); handle.close('confirm'); } }, ['Save']);
      var handle = R.ui.modal({ title: 'Customize tile', width: 380, className: 'rb-modal-home', body: body, footer: [resetBtn, cancelBtn, saveBtn], initialFocus: labelInput });
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
          // Mount just the tool's controls (no preset gallery) so the widget
          // stays a compact, manageable panel; the long intro text is hidden
          // by CSS. The full tool view still has presets and descriptions.
          var api = tool.mount(wctx);
          if (api && typeof api.destroy === 'function') destroy = api.destroy;
        } catch (e) {
          host.appendChild(el('div.rb-empty', null, ['This widget failed to load: ' + ((e && e.message) || e)]));
        }
      } else {
        host.appendChild(el('div.rb-empty', null, ['Unknown widget']));
      }

      // Fill preview graphs now and on every re-render (controls rebuild them).
      fillPreviews(host);
      var mo = null;
      if (typeof MutationObserver !== 'undefined') {
        mo = new MutationObserver(function () { fillPreviews(host); });
        mo.observe(host, { childList: true, subtree: true });
      }
      var toolDestroy = destroy;
      destroy = function () { if (mo) { try { mo.disconnect(); } catch (e) { /* ignore */ } } toolDestroy(); };

      var collapseBtn = el('button.rb-home-wbtn', { type: 'button', title: 'Collapse / expand',
        onclick: function (e) { e.stopPropagation(); toggleCollapse(action.id); } }, [collapsedOf(action.id) ? '▸' : '▾']);
      var maxBtn = el('button.rb-home-wbtn', { type: 'button', title: 'Maximize / restore',
        onclick: function (e) { e.stopPropagation(); toggleMaximize(action.id); } }, [maximizedId === action.id ? '⤡' : '⤢']);
      var widthBtn = el('button.rb-home-wbtn.rb-home-wbtn-edit', { type: 'button', title: 'Cycle width (full, half, two-thirds, third)',
        onclick: function (e) { e.stopPropagation(); cycleWidth(action.id); } }, [widthGlyph(action.id)]);
      var header = el('div.rb-home-widget-head', null, [
        el('span.rb-home-grip', { title: 'Drag to move' }, ['⠿']),
        iconSpan(action.toolId, 'rb-home-ico-sm'),
        el('span.rb-grow', { text: action.label }),
        collapseBtn, maxBtn, widthBtn,
        el('span.rb-home-remove', { title: 'Remove', onclick: function (e) { e.stopPropagation(); removeItem(action.id); } }, ['×'])
      ]);
      var shield = el('div.rb-home-widget-shield', { title: 'Editing - turn off Edit to use this widget' });
      var card = el('div.rb-home-widget', { 'data-id': action.id }, [header, shield, host, footer]);
      wireDrag(card, action.id);
      attachResize(card, action.id, 'x', 200, 0);
      widgetCache[action.id] = { card: card, destroy: destroy, widthBtn: widthBtn, collapseBtn: collapseBtn, maxBtn: maxBtn };
      return card;
    }

    function decorateWidget(action) {
      var entry = widgetCache[action.id];
      if (!entry) return;
      var card = entry.card, w = widthOf(action.id);
      card.classList.toggle('is-editmode', editing);
      card.classList.toggle('is-half', w === 'half');
      card.classList.toggle('is-third', w === 'third');
      card.classList.toggle('is-twothirds', w === 'twothirds');
      card.classList.toggle('is-collapsed', collapsedOf(action.id));
      card.classList.toggle('is-maximized', maximizedId === action.id);
      card.setAttribute('draggable', editing ? 'true' : 'false');
      var sz = sizes[action.id];
      if (sz && maximizedId !== action.id) { card.style.flex = '0 0 ' + sz.w + 'px'; card.style.width = sz.w + 'px'; card.style.maxWidth = 'none'; }
      else { card.style.flex = ''; card.style.width = ''; card.style.maxWidth = ''; }
      entry.widthBtn.textContent = widthGlyph(action.id);
      entry.collapseBtn.textContent = collapsedOf(action.id) ? '▸' : '▾';
      entry.maxBtn.textContent = maximizedId === action.id ? '⤡' : '⤢';
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
          if (id === lastAddedId) playOnce(widgetCache[id].card, 'rb-pop');
        } else {
          grid.appendChild(tile(action));
        }
      });
      if (editing) grid.appendChild(addTile());
      lastAddedId = null;
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
