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

  // One board's full state. Several boards live side by side, switched via tabs.
  function boardFrom(name, d, emptyItems) {
    d = d || {};
    // An explicit items array (even an empty one) is respected; only a board with
    // no items field at all falls back to the default set (or empty on request).
    var items = d.items ? d.items.slice() : (emptyItems ? [] : R.homeActions.DEFAULT.slice());
    return {
      name: name, items: items,
      spans: d.spans || {}, collapsed: d.collapsed || {}, meta: d.meta || {}, filled: d.filled || {},
      board: d.board || 'md', cols: d.cols || 4, theme: d.theme || null
    };
  }
  function load() {
    var d = R.disk.read('home-layout', null);
    if (d && d.boards && d.boards.length) {
      var idx = (typeof d.activeIdx === 'number' && d.activeIdx >= 0 && d.activeIdx < d.boards.length) ? d.activeIdx : 0;
      return { boards: d.boards.map(function (b) { return boardFrom(b.name || 'Board', b); }), activeIdx: idx };
    }
    // Migrate a single saved layout (schema <= 2), or start fresh, as Board 1.
    return { boards: [boardFrom('Board 1', d)], activeIdx: 0 };
  }

  // The primary, full-bleed element of a tool's widget when "Fill" is on, and the
  // widgets that fill by default (their box IS the tool).
  var WIDGET_FOCUS = {
    anchor: '.rb-anchor-stage', ease: '.rb-curve', velocity: '.rb-curve', copyease: '.rb-curve',
    spring: '.rb-preview-stage', bounce: '.rb-preview-stage', recoil: '.rb-preview-stage', drift: '.rb-preview-stage', smooth: '.rb-curve'
  };

  // Only offer icons that fit the action, by group, so the picker stays relevant.
  var ICON_RELATED = {
    Easing: ['curve', 'wave', 'gauge', 'spring', 'bolt', 'play', 'sparkle'],
    Timing: ['clock', 'scissors', 'copy', 'play', 'bake', 'bolt'],
    Transform: ['target', 'move', 'link', 'crop', 'rotate', 'scale', 'orbit'],
    Layout: ['align', 'grid', 'layout', 'stack', 'crop', 'move'],
    Shapes: ['shape', 'star', 'heart', 'droplet', 'pen', 'sparkle', 'image'],
    Generators: ['stack', 'orbit', 'copy', 'sparkle', 'bolt', 'magic', 'layers'],
    Color: ['droplet', 'grid', 'pen', 'image', 'sparkle'],
    Tools: ['curve', 'grid', 'target', 'shape', 'spring', 'star', 'bolt']
  };
  function relatedIconKeys(action) {
    var ICONS = (R.toolMeta && R.toolMeta.ICONS) || {};
    var keys = ICON_RELATED[action.group] || ['curve', 'grid', 'target', 'shape', 'star', 'bolt', 'sparkle', 'tag'];
    return keys.filter(function (k) { return ICONS[k]; });
  }

  // Current theme accent as a hex, for seeding the per-tile colour picker.
  function accentHex() {
    var v = window.getComputedStyle(document.documentElement).getPropertyValue('--rb-accent').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    var m = /rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(v);
    if (!m) return '#5496fa';
    function h(n) { var x = Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16); return x.length < 2 ? '0' + x : x; }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
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
    var boards = saved.boards;              // all boards (panels)
    var activeIdx = saved.activeIdx;        // which board is showing
    // The live working set IS the active board's data; switchBoard swaps it.
    var act = boards[activeIdx];
    var ids = act.items;
    var collapsed = act.collapsed;
    var meta = act.meta;                    // per-tile look: label, display, badge, icon
    var spans = act.spans;                  // per-item grid span { c, r } (cells)
    var filled = act.filled;                // per-widget Fill (just the main control) state
    var board = act.board;                  // cell size: sm | md | lg
    var cols = act.cols;                    // number of grid columns
    var maximizedId = null;
    var editing = false;
    var dragId = null;
    var dragNode = null;        // the DOM node being dragged (for live rearrange)
    var lastOverId = null;      // last item dragged over, to throttle live reorder
    var lastAddedId = null; // gets a one-time pop animation on the next render
    var widgetCache = {}; // id -> { card, destroy, widthBtn, collapseBtn, maxBtn }

    function metaOf(id) { return meta[id] || {}; }
    function setMeta(id, m) {
      // Drop the override entirely when it is all defaults, to keep storage clean.
      var noArgs = true;
      if (m.args) for (var ak in m.args) { if (m.args.hasOwnProperty(ak)) { noArgs = false; break; } }
      var isDefault = (!m.label) && (!m.display || m.display === 'icon') && (!m.badge) && (!m.icon)
        && (!m.iconKey) && (!m.svg) && (!m.color) && (m.iconBg !== false) && (!m.layout || m.layout === 'vertical') && noArgs;
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

    function syncToBoard() {
      var b = boards[activeIdx];
      b.items = ids; b.collapsed = collapsed; b.meta = meta; b.spans = spans; b.filled = filled; b.board = board; b.cols = cols;
    }
    function persist() { syncToBoard(); R.disk.write('home-layout', { schemaVersion: 3, boards: boards, activeIdx: activeIdx }); }

    // ---- Multiple boards (panels) ----
    function loadActive() {
      var b = boards[activeIdx];
      ids = b.items; collapsed = b.collapsed; meta = b.meta; spans = b.spans; filled = b.filled; board = b.board; cols = b.cols;
      grid.classList.remove('is-sm', 'is-md', 'is-lg'); grid.classList.add('is-' + board);
      grid.style.setProperty('--rb-home-cols', cols);
      syncBoardBtns(); syncColsBtns(); applyBoardTheme();
    }
    // Per-board (per-grid) theme: scope the accent to the active board's grid, so
    // each board can have its own colour. Cards and widgets inherit it.
    function applyBoardTheme() {
      var th = boards[activeIdx].theme;
      if (th && th.accent) grid.style.setProperty('--rb-accent', th.accent); else grid.style.removeProperty('--rb-accent');
      if (boardColorInput) boardColorInput.value = (th && th.accent) || accentHex();
    }
    function destroyAllWidgets() {
      Object.keys(widgetCache).forEach(function (id) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; });
    }
    function switchBoard(idx) {
      if (idx === activeIdx || idx < 0 || idx >= boards.length) return;
      syncToBoard(); destroyAllWidgets(); maximizedId = null;
      activeIdx = idx; loadActive();
      persist(); renderTabs(); render();
    }
    function addBoard() {
      syncToBoard();
      boards.push(boardFrom('Board ' + (boards.length + 1), null, true));
      switchBoard(boards.length - 1);
    }
    function deleteBoard(idx) {
      if (boards.length <= 1) return;
      var wasActive = (idx === activeIdx);
      if (wasActive) destroyAllWidgets();
      boards.splice(idx, 1);
      if (idx < activeIdx || activeIdx >= boards.length) activeIdx = Math.max(0, Math.min(activeIdx - (idx < activeIdx ? 1 : 0), boards.length - 1));
      if (wasActive) { maximizedId = null; loadActive(); render(); }
      persist(); renderTabs();
    }
    function renameBoard(idx) {
      if (!R.ui.modal) return;
      var input = el('input.rb-savedlg-input', { type: 'text', spellcheck: 'false', value: boards[idx].name });
      var saveB = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { var v = (input.value || '').trim(); if (v) { boards[idx].name = v; persist(); renderTabs(); } h.close('confirm'); } }, ['Rename']);
      var h = R.ui.modal({ title: 'Rename board', width: 320, className: 'rb-modal-home', body: R.ui.row('Name', input), footer: [saveB], initialFocus: input });
    }

    // Widgets are always full-bleed: the tool's main control fills the widget.
    // Extra settings live in the full tool view (the "open" control on the widget).
    function filledOf() { return true; }

    function setBoard(b) { board = b; grid.classList.remove('is-sm', 'is-md', 'is-lg'); grid.classList.add('is-' + b); persist(); syncBoardBtns(); }
    function syncBoardBtns() {
      if (boardBtns) ['sm', 'md', 'lg'].forEach(function (b) { boardBtns[b].classList.toggle('is-active', board === b); });
    }
    function setCols(n) { cols = n; grid.style.setProperty('--rb-home-cols', n); persist(); syncColsBtns(); render(); }
    function syncColsBtns() {
      if (colsBtns) [3, 4, 5, 6].forEach(function (n) { colsBtns[n].classList.toggle('is-active', cols === n); });
    }

    function applySpan(node, id, full) {
      var s = spans[id];
      if (s) { node.style.gridColumn = 'span ' + Math.min(s.c, cols); node.style.gridRow = 'span ' + (s.r || 1); }
      else if (full) { node.style.gridColumn = '1 / -1'; node.style.gridRow = ''; }
    }

    // A corner drag-resize handle (edit mode). Tiles ('both') snap to whole grid
    // cells, so a tile is always a clean 1x1 / 2x1 / 2x2 rectangle. Widgets
    // ('widget') snap their WIDTH to columns but take a free pixel HEIGHT, so you
    // can drag a widget taller or shorter and its content fills that height.
    function attachResize(node, id, mode) {
      var handle = el('span.rb-home-resize', { title: 'Drag to resize' });
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation();
        var gcs = window.getComputedStyle(grid);
        var gap = parseFloat(gcs.columnGap || gcs.gap) || 8;
        var rgap = parseFloat(gcs.rowGap || gcs.gap) || 8;
        var cellW = (grid.clientWidth - (cols - 1) * gap) / cols;
        var cellH = parseFloat(gcs.getPropertyValue('--rb-home-cell')) || 78;
        var rect = node.getBoundingClientRect();
        var left = rect.left, top = rect.top, drafted = null, lastC = null, lastR = null;
        node.classList.add('is-resizing');
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        function mv(ev) {
          var c = Math.max(1, Math.min(cols, Math.round((ev.clientX - left) / (cellW + gap))));
          if (mode === 'widget') {
            var h = Math.max(120, Math.round(ev.clientY - top));
            if (c !== lastC) { var p1 = captureRects(); node.style.gridColumn = 'span ' + c; flip(p1, true); lastC = c; }
            node.style.height = h + 'px';        // free height, follows the pointer
            node.classList.add('is-sized');
            drafted = { c: c, h: h };
          } else {
            var r = Math.max(1, Math.min(6, Math.round((ev.clientY - top) / (cellH + rgap))));
            if (c !== lastC || r !== lastR) {    // snap changed: glide everything to the new layout
              var p2 = captureRects();
              node.style.gridColumn = 'span ' + c;
              node.style.gridRow = 'span ' + r;
              flip(p2, true);
              lastC = c; lastR = r;
            }
            drafted = { c: c, r: r };
          }
        }
        function up() {
          handle.removeEventListener('pointermove', mv);
          handle.removeEventListener('pointerup', up);
          node.classList.remove('is-resizing');
          if (drafted) {
            if (mode !== 'widget' && drafted.c === 1 && drafted.r === 1) delete spans[id]; else spans[id] = drafted;
            persist(); render();
          }
        }
        handle.addEventListener('pointermove', mv);
        handle.addEventListener('pointerup', up);
      });
      handle.addEventListener('dblclick', function (e) { e.preventDefault(); e.stopPropagation(); delete spans[id]; persist(); render(); });
      node.appendChild(handle);
    }

    function collapsedOf(id) { return !!collapsed[id]; }
    function toggleCollapse(id) { if (collapsed[id]) delete collapsed[id]; else collapsed[id] = true; persist(); render(); }
    function toggleMaximize(id) { maximizedId = (maximizedId === id) ? null : id; render(); }

    var grid = el('div.rb-home-grid');

    // A big, readable tooltip (not the tiny native one). Shows the action name and
    // a short description on hover, positioned above the tile and kept on-panel.
    var tip = el('div.rb-home-tip');
    var tipTimer = null;
    function showTip(node, title, desc) {
      R.dom.clear(tip);
      tip.appendChild(el('div.rb-home-tip-title', { text: title }));
      if (desc) tip.appendChild(el('div.rb-home-tip-desc', { text: desc }));
      tip.classList.add('is-on');
      var r = node.getBoundingClientRect(), rootR = root.getBoundingClientRect();
      tip.style.left = '0px'; tip.style.top = '0px';
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var cx = r.left + r.width / 2 - rootR.left;
      var x = Math.max(6, Math.min(rootR.width - tw - 6, cx - tw / 2));
      var y = r.top - rootR.top - th - 9;
      tip.classList.toggle('is-below', y < 2);
      if (y < 2) y = r.bottom - rootR.top + 9;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function hideTip() { window.clearTimeout(tipTimer); tip.classList.remove('is-on'); }
    function attachTip(node, title, desc) {
      node.addEventListener('mouseenter', function () { if (editing) return; window.clearTimeout(tipTimer); tipTimer = window.setTimeout(function () { showTip(node, title, desc); }, 320); });
      node.addEventListener('mouseleave', hideTip);
      node.addEventListener('mousedown', hideTip);
    }

    function iconBtn(inner, title, onclick) {
      var b = el('button.rb-btn.is-ghost.is-icon', { type: 'button', title: title, 'aria-label': title, onclick: onclick });
      if (R.toolMeta) b.innerHTML = R.toolMeta.svg(inner);
      return b;
    }
    var ICON_ADD = '<path d="M12 5v14M5 12h14"/>';
    var ICON_EDIT = '<path d="M4 20h4L18 10l-4-4L4 16z"/><path d="M13 7l4 4"/>';
    var ICON_BROWSE = '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>';
    var ICON_GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z"/>';
    var ICON_THEME = '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="8" r="1.3"/><circle cx="8.4" cy="13.6" r="1.3"/><circle cx="15.6" cy="13.6" r="1.3"/>';

    var addBtn = iconBtn(ICON_ADD, 'Add to Home', openBrowser);
    var editBtn = iconBtn(ICON_EDIT, 'Edit board', function () { editing = !editing; syncEdit(); render(); });

    var boardBtns = {};
    function boardBtn(b, lbl) { var x = el('button.rb-home-sizebtn', { type: 'button', title: 'Tile size ' + lbl, onclick: function () { setBoard(b); } }, [lbl]); boardBtns[b] = x; return x; }
    var boardControl = el('div.rb-home-sizectl', null, [el('span.rb-faint', { text: 'Size' }), boardBtn('sm', 'S'), boardBtn('md', 'M'), boardBtn('lg', 'L')]);
    var colsBtns = {};
    function colsBtn(n) { var x = el('button.rb-home-sizebtn', { type: 'button', title: n + ' columns', onclick: function () { setCols(n); } }, [String(n)]); colsBtns[n] = x; return x; }
    var colsControl = el('div.rb-home-sizectl', null, [el('span.rb-faint', { text: 'Columns' }), colsBtn(3), colsBtn(4), colsBtn(5), colsBtn(6)]);
    var boardColorInput = el('input.rb-appe-color.rb-home-boardcolor', { type: 'color', title: 'Board accent colour' });
    boardColorInput.addEventListener('input', function () { boards[activeIdx].theme = { accent: boardColorInput.value }; grid.style.setProperty('--rb-accent', boardColorInput.value); persist(); });
    var boardColorClear = el('button.rb-home-sizebtn.rb-home-autobtn', { type: 'button', title: 'Use the global theme', onclick: function () { boards[activeIdx].theme = null; grid.style.removeProperty('--rb-accent'); boardColorInput.value = accentHex(); persist(); } }, ['Auto']);
    var boardThemeControl = el('div.rb-home-sizectl', null, [el('span.rb-faint', { text: 'Board' }), boardColorInput, boardColorClear]);
    var hintText = el('span.rb-grow', { text: '' });
    var hint = el('div.rb-home-hint', null, [hintText, boardThemeControl, colsControl, boardControl]);

    // Board tabs: switch panels; in edit mode add / rename (double-click) / delete.
    var tabsBar = el('div.rb-home-tabs');
    function renderTabs() {
      R.dom.clear(tabsBar);
      var show = boards.length > 1 || editing;
      tabsBar.style.display = show ? '' : 'none';
      if (!show) return;
      boards.forEach(function (b, i) {
        var tab = el('button.rb-home-tab' + (i === activeIdx ? '.is-active' : ''), { type: 'button', title: editing ? (b.name + ' (double-click to rename)') : b.name,
          onclick: function () { switchBoard(i); } }, [el('span.rb-home-tab-name', { text: b.name })]);
        tab.addEventListener('dblclick', function () { if (editing) renameBoard(i); });
        if (editing && boards.length > 1) tab.appendChild(el('span.rb-home-tab-x', { title: 'Delete board', onclick: function (e) { e.stopPropagation(); deleteBoard(i); } }, ['×']));
        tabsBar.appendChild(tab);
      });
      if (editing) tabsBar.appendChild(el('button.rb-home-tab.rb-home-tab-add', { type: 'button', title: 'New board', onclick: addBoard }, ['+']));
    }

    var brand = el('div.rb-home-brand', null, [el('span.rb-home-mark', { text: '◗' }), el('span', { text: 'Rebound' })]);
    var actions = [addBtn, editBtn];
    if (opts.onBrowse) actions.push(iconBtn(ICON_BROWSE, 'Browse all tools', opts.onBrowse));
    var themeBtn = iconBtn(ICON_THEME, 'Theme & colours', function () { if (R.appearance) R.appearance.open(); });
    themeBtn.classList.add('rb-home-themebtn');
    actions.push(themeBtn);
    if (opts.openSettings) actions.push(iconBtn(ICON_GEAR, 'Settings', opts.openSettings));
    var head = el('div.rb-home-head', null, [brand, el('span.rb-grow')].concat(actions));

    var root = el('div.rb-home', null, [head, tabsBar, hint, grid, tip]);
    grid.classList.add('is-' + board);
    grid.style.setProperty('--rb-home-cols', cols);
    syncBoardBtns();
    syncColsBtns();
    applyBoardTheme();

    function syncEdit() {
      editBtn.classList.toggle('is-active', editing);
      editBtn.title = editing ? 'Done editing' : 'Edit board';
      editBtn.setAttribute('aria-label', editing ? 'Done editing' : 'Edit board');
      hintText.textContent = editing ? 'Drag to arrange · drag a tile corner to resize · × to remove' : '';
      root.classList.toggle('is-editing', editing);
      renderTabs();
      if (editing) hideTip();
    }

    // Merge a tile's saved setup (meta.args) over the action's default args, so a
    // tile can be pointed at a specific easing, expression or shape.
    function mergedArgs(action, override) {
      var base = action.invoke.args || {}, out = {}, k;
      for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
      if (override) for (k in override) if (override.hasOwnProperty(k) && override[k] != null && override[k] !== '') out[k] = override[k];
      return out;
    }
    function runAction(action) {
      if (action.kind === 'open') { opts.openTool(action.toolId); return; }
      opts.invoke(action.invoke.method, mergedArgs(action, metaOf(action.id).args))
        .then(function () { opts.toast(action.label + ' applied', { kind: 'success' }); if (opts.refreshSelection) opts.refreshSelection(); })
        .catch(function (err) { opts.toast((err && err.message) || ('Could not apply ' + action.label), { kind: 'error' }); });
    }

    function removeItem(id) {
      ids = ids.filter(function (x) { return x !== id; });
      delete collapsed[id]; delete spans[id]; delete meta[id];
      if (maximizedId === id) maximizedId = null;
      if (widgetCache[id]) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; }
      persist(); render();
    }
    function addItem(id) { if (ids.indexOf(id) === -1) { ids.push(id); lastAddedId = id; persist(); render(); } }

    function wireDrag(node, id) {
      node.addEventListener('dragstart', function (e) { if (!editing) { e.preventDefault(); return; } dragId = id; dragNode = node; lastOverId = id; node.classList.add('is-dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* ignore */ } } });
      node.addEventListener('dragend', function () { node.classList.remove('is-dragging'); if (dragId) persist(); dragId = null; dragNode = null; lastOverId = null; });
      node.addEventListener('dragover', function (e) {
        if (!editing || !dragId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (id !== dragId && id !== lastOverId) { lastOverId = id; liveReorder(node, id); }
      });
      node.addEventListener('drop', function (e) { if (!editing) return; e.preventDefault(); });
    }
    // Live, animated rearrange: move the dragged item next to the hovered one and
    // glide the rest into place, without a full re-render (so the drag continues).
    function liveReorder(targetNode, targetId) {
      var from = ids.indexOf(dragId), to = ids.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return;
      var prev = captureRects();
      ids.splice(from, 1);
      ids.splice(ids.indexOf(targetId) + (from < to ? 1 : 0), 0, dragId);
      if (dragNode) {
        if (from < to) grid.insertBefore(dragNode, targetNode.nextSibling);
        else grid.insertBefore(dragNode, targetNode);
      }
      flip(prev, true);
    }

    function iconInnerFor(action, m) {
      var ICONS = R.toolMeta && R.toolMeta.ICONS;
      if (m && m.iconKey && ICONS && ICONS[m.iconKey]) return ICONS[m.iconKey];
      var meta = (R.toolMeta && R.toolMeta.forTool(action.toolId)) || {};
      return meta.icon || (ICONS && ICONS.curve) || '';
    }
    // Accept a pasted full <svg> as-is, or wrap pasted inner markup in our frame.
    function customSvgMarkup(svg) {
      return /<svg[\s>]/i.test(svg) ? svg : (R.toolMeta ? R.toolMeta.svg(svg) : svg);
    }
    function tileIcon(action, m) {
      m = m || {};
      var sel = 'span.rb-home-ico' + (m.iconBg === false ? '.is-nobg' : '');
      if (m.svg) { var sv = el(sel + '.is-custom'); sv.innerHTML = customSvgMarkup(m.svg); return sv; }
      if (m.icon) return el(sel + '.is-custom', null, [el('img', { src: m.icon, alt: '' })]);
      var span = el(sel);
      span.innerHTML = R.toolMeta ? R.toolMeta.svg(iconInnerFor(action, m)) : '';
      return span;
    }
    // Unique easing visuals: each curve type draws its own shape and a dot that
    // travels the baseline with that exact easing, so Linear, Hold, Ease In/Out
    // look and move differently. The dot animation can be turned off globally.
    var EZ_PATH = {
      linear: 'M6,46 L94,6',
      ease: 'M6,46 C 42,46 58,6 94,6',
      easeIn: 'M6,46 C 52,46 76,32 94,6',
      easeOut: 'M6,46 C 24,20 48,6 94,6',
      hold: 'M6,46 L50,46 L50,6 L94,6'
    };
    function easingVisual(kind) {
      if (!EZ_PATH[kind]) kind = 'ease';
      var box = el('div.rb-home-tilevis.rb-ez.is-ez-' + kind);
      box.innerHTML = '<svg viewBox="0 0 100 52" preserveAspectRatio="none" class="rb-ez-svg">'
        + '<line x1="6" y1="46" x2="94" y2="46" class="rb-ez-base"/>'
        + '<path d="' + EZ_PATH[kind] + '" class="rb-ez-curve"/></svg>'
        + '<span class="rb-ez-dot"></span>';
      return box;
    }
    // A configured easing type drives the visual, so a tile set to "Ease In" shows
    // the ease-in curve even if it started as a different one.
    var TYPE_CURVE = { easyEase: 'ease', easyEaseIn: 'easeIn', easyEaseOut: 'easeOut', linear: 'linear', hold: 'hold', autoBezier: 'ease', continuous: 'ease', bezier: 'ease' };
    function tileVisual(action, m) {
      var curve = (m && m.args && m.args.type && TYPE_CURVE[m.args.type]) || action.curve;
      if (curve) return easingVisual(curve);
      var d = R.toolDemos && R.toolDemos[action.toolId];
      if (d && d.svg) { var w = el('div.rb-home-tilevis'); w.innerHTML = d.svg; return w; }
      return null;
    }
    // Smart default look per action: a recognizable easing curve shows its visual,
    // a wordy action (Add Null, Reset Transform) shows clear text, everything else
    // an icon + label. The catalog can pin a default with action.display; the user
    // can always override per tile in the customizer.
    function autoDisplay(action) {
      var demo = R.toolDemos && R.toolDemos[action.toolId];
      if (demo && action.group === 'Easing') return 'visual';
      return 'icon';
    }
    function displayFor(action, m) { return (m && m.display) || action.display || autoDisplay(action); }

    // The tile contents for a given look (display, label, badge, icon).
    function tileContent(action, m) {
      var display = displayFor(action, m);
      var label = m.label || action.label;
      var kids = [];
      if (display === 'visual') { kids.push(tileVisual(action, m) || tileIcon(action, m)); }
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
      c += '.is-disp-' + displayFor(action, m);
      if (m && m.layout === 'horizontal') c += '.is-lay-h';
      return c;
    }
    function tile(action) {
      var m = metaOf(action.id);
      var label = m.label || action.label;
      var node = el(tileClass(action, m, 'button.rb-home-tile'), {
        type: 'button', 'data-id': action.id,
        onclick: function () { if (editing) return; runAction(action); if (action.kind === 'apply') playOnce(node, 'rb-pulse'); }
      }, tileContent(action, m));
      if (m.color) node.style.setProperty('--rb-accent', m.color);
      applySpan(node, action.id, false);
      attachTip(node, label, action.desc || (action.kind === 'open' ? 'Opens the full tool' : 'One-click action'));
      if (editing) {
        node.classList.add('is-editmode');
        node.setAttribute('draggable', 'true');
        node.appendChild(el('span.rb-home-cog', { title: 'Customize tile', onclick: function (e) { e.stopPropagation(); customizeTile(action); } }, ['✎']));
        node.appendChild(el('span.rb-home-remove', { title: 'Remove', onclick: function (e) { e.stopPropagation(); removeItem(action.id); } }, ['×']));
        wireDrag(node, action.id);
        attachResize(node, action.id, 'both');
      }
      return node;
    }
    function previewTile(action, m) {
      var node = el(tileClass(action, m, 'div.rb-home-tile') + '.is-static', null, tileContent(action, m));
      if (m && m.color) node.style.setProperty('--rb-accent', m.color);
      return node;
    }

    // The full tile customizer: label, display mode, layout (icon above or beside
    // the text), a pick-an-icon gallery (or upload your own), the icon background,
    // and the badge, all with a live tile preview.
    function customizeTile(action) {
      if (!R.ui.modal) return;
      var b = metaOf(action.id);
      var draft = {
        label: b.label || '', display: displayFor(action, b), badge: b.badge === true,
        icon: b.icon || null, iconKey: b.iconKey || null, svg: b.svg || '', color: b.color || null,
        iconBg: b.iconBg !== false, layout: b.layout || 'vertical', args: {}
      };
      if (b.args) for (var ak in b.args) if (b.args.hasOwnProperty(ak)) draft.args[ak] = b.args[ak];

      var previewHost = el('div.rb-home-cust-preview');
      function renderPrev() { R.dom.clear(previewHost); previewHost.appendChild(previewTile(action, draft)); }

      // ---- Setup: configure what this tile actually does (per action.config) ----
      function argValue(field) {
        if (draft.args[field.arg] != null && draft.args[field.arg] !== '') return draft.args[field.arg];
        return (action.invoke && action.invoke.args) ? action.invoke.args[field.arg] : '';
      }
      function setArg(field, v) { draft.args[field.arg] = v; renderPrev(); }
      function cfgField(field) {
        if (field.type === 'select') {
          var sel = el('select.rb-cfg-select');
          (field.options || []).forEach(function (o) {
            var op = el('option', { value: o.value }, [o.label]);
            if (String(o.value) === String(argValue(field))) op.selected = true;
            sel.appendChild(op);
          });
          sel.addEventListener('change', function () { setArg(field, sel.value); });
          return sel;
        }
        var inp = el('input.rb-cfg-text', { type: 'text', spellcheck: 'false', value: argValue(field) });
        inp.addEventListener('input', function () { setArg(field, inp.value); });
        return inp;
      }
      var setupSection = null;
      if (action.config && action.config.length) {
        var setupRows = action.config.map(function (f) { return R.ui.row(f.label, cfgField(f)); });
        setupSection = el('div.rb-home-cust-setup', null, [el('div.rb-section-label', { text: 'Setup' })].concat(setupRows));
      }

      var labelInput = el('input.rb-savedlg-input', { type: 'text', spellcheck: 'false', value: draft.label, placeholder: action.label,
        oninput: function () { draft.label = this.value; renderPrev(); } });
      var displayCtl = R.ui.segmented([
        { value: 'icon', label: 'Icon' }, { value: 'visual', label: 'Visual' }, { value: 'text', label: 'Text' }, { value: 'icononly', label: 'Icon only' }
      ], { value: draft.display, onChange: function (v) { draft.display = v; renderPrev(); } });
      var layoutCtl = R.ui.segmented([
        { value: 'vertical', label: 'Stacked' }, { value: 'horizontal', label: 'Side by side' }
      ], { value: draft.layout, onChange: function (v) { draft.layout = v; renderPrev(); } });
      var bgToggle = R.ui.toggle({ label: 'Icon background', value: draft.iconBg, onChange: function (v) { draft.iconBg = v; renderPrev(); renderIcons(); } });
      var badgeToggle = R.ui.toggle({ label: 'Show badge', value: draft.badge, onChange: function (v) { draft.badge = v; renderPrev(); } });

      // ---- Icon picker: tool default, the icon library, or an upload ----
      var iconGrid = el('div.rb-home-iconpick-grid');
      function iconBtn(opts) {
        var bcls = 'button.rb-home-iconpick' + (opts.selected ? '.is-sel' : '') + (draft.iconBg === false ? '.is-nobg' : '');
        var node = el(bcls, { type: 'button', title: opts.title, onclick: opts.onclick });
        if (opts.img) node.appendChild(el('img', { src: opts.img, alt: '' }));
        else if (opts.raw) node.innerHTML = customSvgMarkup(opts.raw);
        else node.innerHTML = R.toolMeta.svg(opts.inner);
        return node;
      }
      function renderIcons() {
        R.dom.clear(iconGrid);
        var usingDefault = !draft.iconKey && !draft.icon && !draft.svg;
        iconGrid.appendChild(iconBtn({ title: 'Tool default', inner: iconInnerFor(action, { iconKey: null }), selected: usingDefault,
          onclick: function () { draft.iconKey = null; draft.icon = null; draft.svg = ''; if (svgInput) svgInput.value = ''; renderPrev(); renderIcons(); } }));
        if (draft.icon) iconGrid.appendChild(iconBtn({ title: 'Your uploaded icon', img: draft.icon, selected: true, onclick: function () {} }));
        if (draft.svg) iconGrid.appendChild(iconBtn({ title: 'Your pasted SVG', raw: draft.svg, selected: true, onclick: function () {} }));
        var ICONS = (R.toolMeta && R.toolMeta.ICONS) || {};
        relatedIconKeys(action).forEach(function (k) {
          iconGrid.appendChild(iconBtn({ title: k, inner: ICONS[k], selected: !draft.icon && !draft.svg && draft.iconKey === k,
            onclick: function () { draft.iconKey = k; draft.icon = null; draft.svg = ''; if (svgInput) svgInput.value = ''; renderPrev(); renderIcons(); } }));
        });
      }

      var fileInput = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' },
        onchange: function () {
          var f = this.files && this.files[0];
          if (!f) return;
          var r = new window.FileReader();
          r.onload = function () { draft.icon = r.result; draft.iconKey = null; draft.svg = ''; if (svgInput) svgInput.value = ''; renderPrev(); renderIcons(); };
          r.readAsDataURL(f);
        } });
      var uploadBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { fileInput.click(); } }, ['Upload your own…']);

      // Paste raw SVG markup as the icon (a full <svg> or just the inner shapes).
      var svgInput = el('textarea.rb-cfg-text.rb-home-svgin', { spellcheck: 'false', rows: '2', placeholder: 'Paste SVG markup…' });
      svgInput.value = draft.svg || '';
      svgInput.addEventListener('input', function () { draft.svg = svgInput.value.trim(); if (draft.svg) { draft.icon = null; draft.iconKey = null; } renderPrev(); renderIcons(); });

      // Per-tile colour: scopes the accent to just this tile.
      var colorInput = el('input.rb-appe-color', { type: 'color', value: draft.color || accentHex() });
      colorInput.addEventListener('input', function () { draft.color = colorInput.value; renderPrev(); });
      var colorClear = el('button.rb-appe-clear', { type: 'button', title: 'Use the theme accent', onclick: function () { draft.color = null; colorInput.value = accentHex(); renderPrev(); } }, ['Auto']);

      renderPrev();
      renderIcons();
      var bodyKids = [previewHost];
      if (setupSection) bodyKids.push(setupSection);
      bodyKids.push(
        R.ui.row('Label', labelInput),
        R.ui.row('Display', displayCtl.el),
        R.ui.row('Layout', layoutCtl.el),
        R.ui.row('Tile colour', el('div.rb-appe-cf', null, [colorInput, colorClear])),
        bgToggle.el,
        badgeToggle.el,
        el('div.rb-section-label', { text: 'Icon' }),
        iconGrid,
        el('div.rb-row', { style: { gap: '6px' } }, [uploadBtn, fileInput]),
        svgInput
      );
      var body = el('div.rb-home-cust', null, bodyKids);

      var resetBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { delete meta[action.id]; persist(); render(); handle.close('confirm'); } }, ['Reset']);
      var cancelBtn = el('button.rb-btn.is-ghost', { type: 'button', onclick: function () { handle.close('close'); } }, ['Cancel']);
      var saveBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { setMeta(action.id, draft); handle.close('confirm'); } }, ['Save']);
      var handle = R.ui.modal({ title: 'Customize tile', width: 400, className: 'rb-modal-home', body: body, footer: [resetBtn, cancelBtn, saveBtn], initialFocus: labelInput });
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

      // Tools with no footer buttons (e.g. Anchor) get no Apply pill at all.
      if (!footer.querySelector('.rb-btn')) footer.classList.add('is-empty');

      // No persistent header: the tool fills the widget, and the chrome appears
      // only in edit mode so it never blocks the tool during use.
      var collapseBtn = el('button.rb-home-wbtn', { type: 'button', title: 'Collapse / expand',
        onclick: function (e) { e.stopPropagation(); toggleCollapse(action.id); } }, [collapsedOf(action.id) ? '▸' : '▾']);
      var prefsBtn = el('button.rb-home-wbtn', { type: 'button', title: 'Open the full tool (all settings)',
        onclick: function (e) { e.stopPropagation(); opts.openTool(action.toolId); } }, ['↗']);
      var maxBtn = el('button.rb-home-wbtn', { type: 'button', title: 'Maximize / restore',
        onclick: function (e) { e.stopPropagation(); toggleMaximize(action.id); } }, [maximizedId === action.id ? '⤡' : '⤢']);
      var removeBtn = el('button.rb-home-wbtn.rb-home-wbtn-x.rb-home-wbtn-edit', { type: 'button', title: 'Remove', onclick: function (e) { e.stopPropagation(); removeItem(action.id); } }, ['×']);
      var wColor = el('input.rb-home-wcolor.rb-home-wbtn-edit', { type: 'color', title: 'Widget colour (double-click to clear)' });
      wColor.addEventListener('input', function () { var mm = meta[action.id] || {}; mm.color = wColor.value; meta[action.id] = mm; card.style.setProperty('--rb-accent', wColor.value); persist(); });
      wColor.addEventListener('dblclick', function () { if (meta[action.id]) delete meta[action.id].color; card.style.removeProperty('--rb-accent'); persist(); });
      var controls = el('div.rb-home-wctrls', null, [wColor, collapseBtn, prefsBtn, maxBtn, removeBtn]);
      var titleChip = el('div.rb-home-wtitle', null, [iconSpan(action.toolId, 'rb-home-ico-sm'), el('span.rb-home-wtitle-name', { text: action.label })]);
      var shield = el('div.rb-home-widget-shield', { title: 'Editing - turn off Edit to use this widget' });
      var card = el('div.rb-home-widget', { 'data-id': action.id }, [titleChip, controls, shield, host, footer]);
      wireDrag(card, action.id);
      attachResize(card, action.id, 'widget');
      widgetCache[action.id] = { card: card, destroy: destroy, collapseBtn: collapseBtn, maxBtn: maxBtn, wColor: wColor };
      return card;
    }

    // Fill mode: keep only the tool's primary element (per WIDGET_FOCUS) and let
    // it stretch to the whole widget; hide everything else. Works for any widget
    // with a registered primary element, e.g. the Ease curve or the Anchor box.
    function applyFocus(action) {
      var entry = widgetCache[action.id];
      if (!entry) return;
      var card = entry.card, body = card.querySelector('.rb-home-widget-body');
      Array.prototype.forEach.call(card.querySelectorAll('.rb-focus-hidden'), function (n) { n.classList.remove('rb-focus-hidden'); });
      Array.prototype.forEach.call(card.querySelectorAll('.rb-focus-fill'), function (n) { n.classList.remove('rb-focus-fill'); });
      card.classList.toggle('is-filled', filledOf(action.id));
      if (!filledOf(action.id) || !body) return;
      var sel = WIDGET_FOCUS[action.toolId];
      var target = sel ? body.querySelector(sel) : null;
      if (!target) return;
      var node = target;
      while (node && node !== body) {
        node.classList.add('rb-focus-fill');
        var parent = node.parentNode;
        Array.prototype.forEach.call(parent.children, function (ch) { if (ch !== node) ch.classList.add('rb-focus-hidden'); });
        node = parent;
      }
    }

    function decorateWidget(action) {
      var entry = widgetCache[action.id];
      if (!entry) return;
      var card = entry.card;
      card.classList.toggle('is-editmode', editing);
      card.classList.toggle('is-collapsed', collapsedOf(action.id));
      card.classList.toggle('is-maximized', maximizedId === action.id);
      card.setAttribute('draggable', editing ? 'true' : 'false');
      // Width snaps to columns (full by default); height is the user's free size.
      card.style.gridColumn = ''; card.style.gridRow = ''; card.style.height = '';
      card.classList.remove('is-sized');
      if (maximizedId !== action.id) {
        var s = spans[action.id];
        card.style.gridColumn = (s && s.c && s.c < cols) ? ('span ' + s.c) : '1 / -1';
        if (s && s.h) { card.style.height = s.h + 'px'; card.classList.add('is-sized'); }
      }
      entry.collapseBtn.textContent = collapsedOf(action.id) ? '▸' : '▾';
      entry.maxBtn.textContent = maximizedId === action.id ? '⤡' : '⤢';
      var mc = (meta[action.id] || {}).color;
      if (mc) card.style.setProperty('--rb-accent', mc); else card.style.removeProperty('--rb-accent');
      if (entry.wColor) entry.wColor.value = mc || accentHex();
      applyFocus(action);
    }

    function addTile() {
      return el('button.rb-home-tile.rb-home-add', { type: 'button', onclick: openBrowser }, [
        el('span.rb-home-plus', { text: '+' }), el('span.rb-home-label', { text: 'Add' })
      ]);
    }

    // Smooth reflow (FLIP): snapshot positions/sizes before a re-render, then
    // animate each surviving item from where it was to where it lands, so resize,
    // reorder and column changes glide instead of jumping.
    function captureRects() {
      var map = {};
      Array.prototype.forEach.call(grid.querySelectorAll('[data-id]'), function (n) { map[n.getAttribute('data-id')] = n.getBoundingClientRect(); });
      return map;
    }
    function flip(prev, fast) {
      if (!prev) return;
      if (document.documentElement.classList.contains('rb-tiles-static')) return;
      if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var dur = fast ? '0.13s' : 'var(--rb-dur-medium, 0.26s)';
      Array.prototype.forEach.call(grid.querySelectorAll('[data-id]'), function (n) {
        if (n.classList.contains('is-dragging')) return; // the dragged item follows the cursor
        var was = prev[n.getAttribute('data-id')];
        if (!was) return;
        var now = n.getBoundingClientRect();
        if (!now.width || !was.width) return;
        var dx = was.left - now.left, dy = was.top - now.top;
        var sx = was.width / now.width, sy = was.height / now.height;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
        n.style.transformOrigin = 'top left';
        n.style.transition = 'none';
        n.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
        void n.offsetWidth;
        n.style.transition = 'transform ' + dur + ' var(--rb-ease-emphasized, cubic-bezier(0.2, 0.9, 0.25, 1))';
        n.style.transform = '';
        n.addEventListener('transitionend', function te(ev) {
          if (ev.propertyName === 'transform') { n.style.transition = ''; n.style.transformOrigin = ''; n.removeEventListener('transitionend', te); }
        });
      });
    }

    function render() {
      var prevRects = captureRects();
      var keep = {};
      ids.forEach(function (id) { keep[id] = true; });
      Object.keys(widgetCache).forEach(function (id) {
        if (!keep[id]) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; }
      });

      R.dom.clear(grid);
      if (!ids.length) {
        var art = el('div.rb-home-empty-art');
        art.innerHTML = '<svg viewBox="0 0 120 92" xmlns="http://www.w3.org/2000/svg">'
          + '<rect class="rb-ee-card rb-ee-c1" x="20" y="30" width="34" height="34" rx="8"/>'
          + '<rect class="rb-ee-card rb-ee-c2" x="66" y="24" width="34" height="34" rx="8"/>'
          + '<rect class="rb-ee-card rb-ee-c3" x="44" y="48" width="34" height="34" rx="8"/>'
          + '<path class="rb-ee-plus" d="M61 60v12M55 66h12"/>'
          + '<path class="rb-ee-spark" d="M98 14l1.6 4.4 4.4 1.6-4.4 1.6L98 26l-1.6-4.4-4.4-1.6 4.4-1.6z"/>'
          + '</svg>';
        grid.appendChild(el('div.rb-home-empty', null, [
          art,
          el('div.rb-home-empty-title', { text: 'Make this board yours' }),
          el('div.rb-home-empty-sub', { text: 'Pin one-click actions, tools and live widgets, then arrange and theme them however you like.' }),
          el('button.rb-btn.is-primary.rb-home-empty-btn', { type: 'button', onclick: openBrowser }, ['+  Add your first item'])
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
          if (id === lastAddedId) playOnce(widgetCache[id].card, 'rb-anim-in'); // gentle fade, never overshoots its bounds
        } else {
          grid.appendChild(tile(action));
        }
      });
      if (editing) grid.appendChild(addTile());
      flip(prevRects);
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
            var ico = iconSpan(a.toolId, 'rb-home-ico'); // the tinted chip, bigger than the tiny one
            var text = el('div.rb-home-browser-text', null, [
              el('div.rb-home-browser-name', { text: a.label }),
              el('div.rb-home-browser-desc', { text: a.desc || '' })
            ]);
            var row = el('button.rb-home-browser-row' + (pinned ? '.is-pinned' : ''), { type: 'button', title: a.label }, [
              ico, text, badge, el('span.rb-home-pin', { text: pinned ? '✓' : '+' })
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
