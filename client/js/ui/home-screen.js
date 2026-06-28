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
    // no items field at all falls back to the curated DEFAULT_BOARD (the rich
    // first-run layout). A requested empty board (a brand-new tab) stays empty.
    var def = (R.homeActions && R.homeActions.DEFAULT_BOARD) || {};
    var usingDefault = !d.items && !emptyItems;
    var items = d.items ? d.items.slice()
      : (emptyItems ? [] : (def.items ? def.items.slice() : R.homeActions.DEFAULT.slice()));
    var spans = d.spans || (usingDefault && def.spans ? JSON.parse(JSON.stringify(def.spans)) : {});
    return {
      name: name, items: items, refs: d.refs || {},
      spans: spans, collapsed: d.collapsed || {}, meta: d.meta || {}, filled: d.filled || {},
      board: d.board || (usingDefault && def.board) || 'md',
      cols: d.cols || (usingDefault && def.cols) || 4, theme: d.theme || null
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
  // Tools whose single primary element IS the whole widget when filled. Only
  // tools with a real direct-manipulation surface that fills without scrolling
  // belong here (mirrors WIDGET_TOOLS in home-actions.js). Align renders its own
  // purpose-built button grid from its mount (ctx.widget), so it is not listed.
  var WIDGET_FOCUS = {
    anchor: '.rb-anchor-stage', ease: '.rb-curve', gradient: '.rb-grad-editor'
  };
  // Inside the focused element, drop these so the widget keeps just the essential
  // control (its secondary panel lives in the full tool, via the open control).
  var WIDGET_HIDE = {
    gradient: ['.rb-grad-panel']
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

  // A readable "ink" for marks/labels drawn directly ON an accent fill: white on
  // a dark or saturated accent, near-black on a light one (so it stays visible
  // even on a white tile). Computed alongside every --rb-accent we set.
  function inkFor(hex) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
    if (!m) return 'rgba(255,255,255,0.9)';
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    var light = lum > 0.78; // only near-white accents darken; everything else lightens
    var t = 0.32, tc = light ? 0 : 255; // gently toward black / white, so it blends
    function mx(c) { return Math.round(c + (tc - c) * t); }
    return 'rgb(' + mx(r) + ',' + mx(g) + ',' + mx(b) + ')';
  }
  // Set (or clear) --rb-accent on a node together with its companion ink.
  function setAccentVar(node, color) {
    if (color) {
      node.style.setProperty('--rb-accent', color);
      node.style.setProperty('--rb-accent-ink', inkFor(color));
    } else {
      node.style.removeProperty('--rb-accent');
      node.style.removeProperty('--rb-accent-ink');
    }
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
    var ids = act.items;                    // instance ids (an action can be pinned many times)
    var refs = act.refs;                    // instance id -> action id (when it differs)
    var collapsed = act.collapsed;
    var meta = act.meta;                    // per-instance look: label, display, badge, icon
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

    // An item id is an INSTANCE id. The action it refers to is refs[id], or the id
    // itself for a first/legacy instance (or the part before '#').
    function actionIdOf(id) { return refs[id] || (id.indexOf('#') !== -1 ? id.slice(0, id.indexOf('#')) : id); }
    function newInstanceId(actionId) {
      if (ids.indexOf(actionId) === -1) return actionId; // first one keeps the clean id
      var n = 2; while (ids.indexOf(actionId + '#' + n) !== -1) n++;
      return actionId + '#' + n;
    }
    // A per-instance action: the catalog action with this instance's id, so all the
    // per-item state (meta, spans, colour...) is keyed per instance and customized
    // independently, while toolId/kind/invoke come from the shared definition.
    function instAction(id) {
      var def = R.homeActions.byId(actionIdOf(id));
      if (!def) return null;
      if (def.id === id) return def;
      var o = {}; for (var k in def) { if (def.hasOwnProperty(k)) o[k] = def[k]; }
      o.id = id; o.actionId = def.id;
      return o;
    }

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
      node.addEventListener('animationend', function h() { node.classList.remove(cls); node.style.animationDelay = ''; node.removeEventListener('animationend', h); });
    }

    // A distinct entrance per item so adding several different things never
    // replays one identical animation. We rotate through the pool by sequence
    // (each successive add, and each item on a staggered first paint), so
    // consecutive items always differ.
    var TILE_IN = ['rb-in-grow', 'rb-in-zoom', 'rb-in-up', 'rb-in-down', 'rb-in-left', 'rb-in-right', 'rb-in-flip', 'rb-in-swing'];
    var WIDGET_IN = ['rb-win-fade', 'rb-win-up', 'rb-win-scale', 'rb-win-left', 'rb-win-reveal'];
    function entranceClass(seq, kind) { var pool = kind === 'widget' ? WIDGET_IN : TILE_IN; return pool[((seq % pool.length) + pool.length) % pool.length]; }
    function playEntrance(node, seq, kind, delayIdx) {
      if (!node) return;
      if (delayIdx) node.style.animationDelay = (delayIdx * 0.045).toFixed(3) + 's';
      playOnce(node, entranceClass(seq, kind));
    }
    var introAll = true; // play a staggered intro for every item on first paint / board switch
    var addSeq = 0;       // advances on each add so consecutive adds use different animations

    function syncToBoard() {
      var b = boards[activeIdx];
      b.items = ids; b.refs = refs; b.collapsed = collapsed; b.meta = meta; b.spans = spans; b.filled = filled; b.board = board; b.cols = cols;
    }
    function persist() { syncToBoard(); R.disk.write('home-layout', { schemaVersion: 3, boards: boards, activeIdx: activeIdx }); }

    // ---- Multiple boards (panels) ----
    function loadActive() {
      var b = boards[activeIdx];
      ids = b.items; refs = b.refs; collapsed = b.collapsed; meta = b.meta; spans = b.spans; filled = b.filled; board = b.board; cols = b.cols;
      grid.classList.remove('is-sm', 'is-md', 'is-lg'); grid.classList.add('is-' + board);
      grid.style.setProperty('--rb-home-cols', cols);
      syncBoardBtns(); syncColsBtns(); applyBoardTheme();
    }
    // Per-board (per-grid) theme: scope the accent to the active board's grid, so
    // each board can have its own colour. Cards and widgets inherit it.
    function applyBoardTheme() {
      var th = boards[activeIdx].theme;
      setAccentVar(grid, th && th.accent);
      if (boardColorInput) boardColorInput.value = (th && th.accent) || accentHex();
    }
    function destroyAllWidgets() {
      Object.keys(widgetCache).forEach(function (id) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; });
    }
    function switchBoard(idx) {
      if (idx === activeIdx || idx < 0 || idx >= boards.length) return;
      syncToBoard(); destroyAllWidgets(); maximizedId = null;
      activeIdx = idx; loadActive();
      introAll = true; // the new board's items intro in
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
    // Duplicate a board: a fully independent deep copy (items, per-instance look,
    // sizes, colours, theme) inserted right after it and made active.
    function duplicateBoard(idx) {
      syncToBoard();
      var copy = boardFrom(boards[idx].name + ' copy', JSON.parse(JSON.stringify(boards[idx])));
      boards.splice(idx + 1, 0, copy);
      destroyAllWidgets(); maximizedId = null;
      activeIdx = idx + 1; loadActive();
      introAll = true;
      persist(); renderTabs(); render();
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

    function setBoard(b) { board = b; grid.classList.remove('is-sm', 'is-md', 'is-lg'); grid.classList.add('is-' + b); persist(); syncBoardBtns(); scheduleFit(); }
    function syncBoardBtns() {
      if (boardBtns) ['sm', 'md', 'lg'].forEach(function (b) { boardBtns[b].classList.toggle('is-active', board === b); });
    }
    function setCols(n) { cols = n; grid.style.setProperty('--rb-home-cols', n); persist(); syncColsBtns(); render(); }
    function syncColsBtns() {
      if (colsBtns) [3, 4, 5, 6].forEach(function (n) { colsBtns[n].classList.toggle('is-active', cols === n); });
    }

    function applySpan(node, id, full) {
      var s = spans[id];
      if (s) { node.style.gridColumn = 'span ' + Math.min(s.c, cols); node.style.gridRow = 'span ' + Math.min(s.r || 1, maxRowsFor(id)); }
      else if (full) { node.style.gridColumn = '1 / -1'; node.style.gridRow = ''; }
    }

    // One grid row's height incl. the row gap, for converting between a pixel
    // height and a whole-row span. Rows now stretch to fill the panel, so measure
    // the real first track rather than the cell minimum.
    function rowTrackPx(gcs) {
      var tracks = (gcs.gridTemplateRows || '').split(' ').map(parseFloat).filter(function (n) { return !isNaN(n); });
      return tracks.length ? tracks[0] : (parseFloat(gcs.getPropertyValue('--rb-home-cell')) || 78);
    }
    function rowUnit() {
      var gcs = window.getComputedStyle(grid);
      var rgap = parseFloat(gcs.rowGap || gcs.gap) || 8;
      return rowTrackPx(gcs) + rgap;
    }

    // Fit the whole board into the panel height: shrink the cell (and the icon
    // chip with it) so the rows the grid actually uses fill the available height
    // exactly, instead of overflowing into a scrollbar. Tiles stay as large as
    // they can while everything fits; a floor keeps them usable, below which the
    // board scrolls as a last resort (a great many items in a very short panel).
    // The CAP per size matches the .is-sm/.is-md/.is-lg cells in home.css.
    var FIT_BASE = { sm: 54, md: 70, lg: 88 };
    var FIT_MIN = 46;
    var fitPending = 0;
    function fitToHeight() {
      if (!grid || !ids.length) return;
      var gcs = window.getComputedStyle(grid);
      var rows = (gcs.gridTemplateRows || '').split(' ')
        .map(parseFloat).filter(function (n) { return !isNaN(n); }).length;
      var avail = grid.clientHeight;
      if (!rows || avail <= 0) return; // not laid out yet (e.g. pre-mount)
      var rgap = parseFloat(gcs.rowGap || gcs.gap) || 6;
      var cap = FIT_BASE[board] || 70;
      // The height each row actually gets when the board fills the panel. With few
      // items this exceeds the cap (rows stretch via 1fr); with many it is small.
      var rowH = Math.floor((avail - (rows - 1) * rgap) / rows);
      // Cell minimum: cap it so a sparse board does not balloon the min past its
      // size, but shrink below the cap (down to a floor) when rows must get small.
      grid.style.setProperty('--rb-home-cell', Math.max(FIT_MIN, Math.min(cap, rowH)) + 'px');
      // Only scroll when the board GENUINELY overflows -- i.e. the rows had to be
      // clamped up to the floor (rowH < FIT_MIN) so the content is taller than the
      // panel. When everything fits, the rows fill the height exactly via 1fr, so
      // keeping overflow `auto` would still show a 1px scrollbar from sub-pixel
      // rounding between clientHeight and the real fractional layout. Hiding it in
      // the fit case removes that phantom 1px scroll gap.
      grid.style.overflowY = rowH < FIT_MIN ? 'auto' : 'hidden';
      // Icon chip tracks the REAL row height (~40%), clamped so it neither dominates
      // a tall tile nor vanishes in a short one.
      grid.style.setProperty('--rb-home-ico', Math.max(15, Math.min(40, Math.round(rowH * 0.4))) + 'px');
    }
    function scheduleFit() {
      if (fitPending) return;
      fitPending = window.requestAnimationFrame(function () { fitPending = 0; fitToHeight(); });
    }

    // The tallest an item may be made, by type, so nothing can be dragged into a
    // stretched, ungainly shape. Direct-manipulation widgets (curve, anchor box,
    // gradient bar) earn more height; picker widgets and one-click tiles stay
    // compact (a curve tile gets one extra row to show its shape). Width is always
    // capped at the column count by the grid itself.
    var MAX_ROWS = { wgtBig: 6, wgt: 4, tileVisual: 3, tile: 2 };
    function maxRowsFor(id) {
      var a = instAction(id);
      if (!a) return MAX_ROWS.tile;
      if (a.kind === 'widget') {
        return (a.toolId === 'ease' || a.toolId === 'anchor' || a.toolId === 'gradient') ? MAX_ROWS.wgtBig : MAX_ROWS.wgt;
      }
      return (displayFor(a, meta[id] || {}) === 'visual') ? MAX_ROWS.tileVisual : MAX_ROWS.tile;
    }

    // A corner drag-resize handle (edit mode). Tiles ('both') snap to whole grid
    // cells, so a tile is always a clean 1x1 / 2x1 / 2x2 rectangle. Widgets
    // ('widget') snap their WIDTH to columns but take a free pixel HEIGHT, so you
    // can drag a widget taller or shorter and its content fills that height.
    function attachResize(node, id, mode) {
      var handle = el('span.rb-home-resize', { title: 'Drag to resize' });
      handle.addEventListener('pointerdown', function (e) {
        if (!editing) return; // resizing only happens in edit mode
        e.preventDefault(); e.stopPropagation();
        var gcs = window.getComputedStyle(grid);
        var gap = parseFloat(gcs.columnGap || gcs.gap) || 8;
        var rgap = parseFloat(gcs.rowGap || gcs.gap) || 8;
        var cellW = (grid.clientWidth - (cols - 1) * gap) / cols;
        var cellH = rowTrackPx(gcs);
        var rect = node.getBoundingClientRect();
        var left = rect.left, top = rect.top, drafted = null, lastC = null, lastR = null;
        node.classList.add('is-resizing');
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        function mv(ev) {
          var c = Math.max(1, Math.min(cols, Math.round((ev.clientX - left) / (cellW + gap))));
          if (mode === 'widget') {
            // Snap height to whole grid rows (like tiles), so the widget reserves
            // its grid track and never overflows it into the items below. Capped
            // per type so a widget can't be dragged into a stretched shape.
            var rW = Math.max(1, Math.min(maxRowsFor(id), Math.round((ev.clientY - top) / (cellH + rgap))));
            if (c !== lastC || rW !== lastR) {
              var p1 = captureRects();
              node.style.gridColumn = (c < cols) ? ('span ' + c) : '1 / -1';
              node.style.gridRow = 'span ' + rW;
              node.style.height = '';
              flip(p1, true);
              lastC = c; lastR = rW;
            }
            node.classList.add('is-sized');
            drafted = { c: c, r: rW };
          } else {
            var r = Math.max(1, Math.min(maxRowsFor(id), Math.round((ev.clientY - top) / (cellH + rgap))));
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
    var DUP_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
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
    boardColorInput.addEventListener('input', function () { boards[activeIdx].theme = { accent: boardColorInput.value }; setAccentVar(grid, boardColorInput.value); persist(); });
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
        if (editing) {
          var dup = el('span.rb-home-tab-dup', { title: 'Duplicate board', onclick: (function (n) { return function (e) { e.stopPropagation(); duplicateBoard(n); }; })(i) });
          dup.innerHTML = DUP_SVG;
          tab.appendChild(dup);
        }
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

    // Re-fit the board whenever the panel is resized (height changes mean a
    // different number of rows can fit). Changing the cell size does not change
    // the grid's own (flex-constrained) box, so this never loops.
    if (window.ResizeObserver) {
      try { new ResizeObserver(scheduleFit).observe(grid); } catch (eRO) { /* older CEF */ }
    }

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
      var base = (action.invoke && action.invoke.args) || action.args || {}, out = {}, k;
      for (k in base) if (base.hasOwnProperty(k)) out[k] = base[k];
      if (override) for (k in override) if (override.hasOwnProperty(k) && override[k] != null && override[k] !== '') out[k] = override[k];
      return out;
    }
    function runAction(action) {
      if (action.kind === 'open') { opts.openTool(action.toolId); return; }
      // build() computes {method, args} at click time (e.g. sampling a live
      // curve, honouring config like keyframes-vs-expression); otherwise use the
      // static invoke. Either way config overrides flow through mergedArgs.
      var cfgArgs = mergedArgs(action, metaOf(action.id).args);
      var inv = action.build ? action.build(cfgArgs) : { method: action.invoke.method, args: cfgArgs };
      opts.invoke(inv.method, inv.args)
        .then(function () { opts.toast(action.label + ' applied', { kind: 'success' }); if (opts.refreshSelection) opts.refreshSelection(); })
        .catch(function (err) { opts.toast((err && err.message) || ('Could not apply ' + action.label), { kind: 'error' }); });
    }

    function removeItem(id) {
      ids = ids.filter(function (x) { return x !== id; });
      delete collapsed[id]; delete spans[id]; delete meta[id]; delete refs[id];
      if (maximizedId === id) maximizedId = null;
      if (widgetCache[id]) { try { widgetCache[id].destroy(); } catch (e) { /* ignore */ } delete widgetCache[id]; }
      persist(); render();
    }
    // Each add pins a NEW instance, so the same action can live on the board many
    // times and each instance is customized independently.
    function addItem(actionId) {
      var instId = newInstanceId(actionId);
      if (instId !== actionId) refs[instId] = actionId;
      ids.push(instId); lastAddedId = instId; addSeq++; persist(); render();
      return instId;
    }
    function countOf(actionId) { var n = 0; ids.forEach(function (id) { if (actionIdOf(id) === actionId) n++; }); return n; }

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
      hold: 'M6,46 L50,46 L50,6 L94,6',
      // Recoil: shoots up past the target line then settles back onto it, the
      // springy elastic overshoot. Sampled from the real Apple curve (no shoulder),
      // so the tile reads as the actual motion, and the dot rides it (rb-ez-recoil).
      overshoot: 'M6.0,46.0 L9.1,45.3 L12.3,43.3 L15.4,40.3 L18.6,36.3 L21.7,31.6 L24.9,26.3 L28.0,20.6 L31.1,14.8 L34.3,9.0 L37.4,3.7 L40.6,1.4 L43.7,1.5 L46.9,2.9 L50.0,4.5 L53.1,5.7 L56.3,6.4 L59.4,6.7 L62.6,6.6 L65.7,6.4 L68.9,6.1 L72.0,6.0 L75.1,5.9 L78.3,5.9 L81.4,6.0 L84.6,6.0 L87.7,6.0 L90.9,6.0 L94.0,6.0',
      // Bounce: rises to the target then rebounds off it in diminishing hops.
      bounce: 'M6,46 C 16,46 26,6 36,6 C 42,6 44,22 52,22 C 60,22 62,6 70,6 C 74,6 75,14 80,14 C 84,14 85,6 94,6',
      // Drift: a living, organic wander, never settling on a single line.
      drift: 'M6,30 C 14,16 22,40 30,28 C 38,16 46,38 54,26 C 62,14 70,36 78,26 C 84,19 88,30 94,24'
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
      if (m.color) setAccentVar(node, m.color);
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
      if (m && m.color) setAccentVar(node, m.color);
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
        body: host, footer: footer, bridge: R.bridge, widget: true,
        invoke: opts.invoke, openTool: opts.openTool, toast: opts.toast,
        refreshSelection: opts.refreshSelection || function () {},
        onSelection: opts.onSelection || function () { return function () {}; },
        getSelection: opts.getSelection || function () { return {}; },
        // Per-instance widget config (e.g. which palette / preset set a picker
        // shows). Read once at mount; persist a change with setConfig so it
        // survives reload. Stored on the instance's meta, like a tile's args.
        config: (meta[action.id] && meta[action.id].args) || {},
        setConfig: function (patch) {
          var m = meta[action.id] || {};
          m.args = m.args || {};
          for (var k in patch) if (patch.hasOwnProperty(k)) m.args[k] = patch[k];
          meta[action.id] = m;
          persist();
        }
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

      // The footer (Apply/Read) sits at the bottom only where it is needed: tools
      // with no action buttons (e.g. Anchor) hide it entirely.
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
      var wColor = el('input.rb-home-wcolor.rb-home-wbtn-edit', { type: 'color', title: 'Widget colour' });
      function autoWColor() { if (meta[action.id]) delete meta[action.id].color; setAccentVar(card, null); wColor.value = accentHex(); persist(); }
      wColor.addEventListener('input', function () { var mm = meta[action.id] || {}; mm.color = wColor.value; meta[action.id] = mm; setAccentVar(card, wColor.value); persist(); });
      wColor.addEventListener('dblclick', autoWColor);
      // Explicit Auto (use the theme accent), matching the tile and board controls.
      var wColorAuto = el('button.rb-home-wbtn.rb-home-wbtn-edit.rb-home-wbtn-auto', { type: 'button', title: 'Auto colour (use the theme)', onclick: function (e) { e.stopPropagation(); autoWColor(); } }, ['Auto']);
      var controls = el('div.rb-home-wctrls', null, [wColor, wColorAuto, collapseBtn, prefsBtn, maxBtn, removeBtn]);
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
      // Drop the tool's secondary panel so the widget keeps only the essential
      // control (the rest stays in the full tool, via the open control).
      var hide = WIDGET_HIDE[action.toolId];
      if (hide) hide.forEach(function (h) { Array.prototype.forEach.call(target.querySelectorAll(h), function (n) { n.classList.add('rb-focus-hidden'); }); });
    }

    function decorateWidget(action) {
      var entry = widgetCache[action.id];
      if (!entry) return;
      var card = entry.card;
      card.classList.toggle('is-editmode', editing);
      card.classList.toggle('is-collapsed', collapsedOf(action.id));
      card.classList.toggle('is-maximized', maximizedId === action.id);
      card.setAttribute('draggable', editing ? 'true' : 'false');
      // Width snaps to columns (full by default); height is a whole-row span, so
      // the widget always reserves its grid track (never overflows onto the items
      // below). Legacy pixel heights are migrated to a row span on sight.
      card.style.gridColumn = ''; card.style.gridRow = ''; card.style.height = '';
      card.classList.remove('is-sized');
      if (maximizedId !== action.id) {
        var s = spans[action.id];
        if (s && s.h && !s.r) { s.r = Math.max(1, Math.round(s.h / rowUnit())); delete s.h; }
        card.style.gridColumn = (s && s.c && s.c < cols) ? ('span ' + s.c) : '1 / -1';
        if (s && s.r) { card.style.gridRow = 'span ' + Math.min(s.r, maxRowsFor(action.id)); card.classList.add('is-sized'); }
      }
      entry.collapseBtn.textContent = collapsedOf(action.id) ? '▸' : '▾';
      entry.maxBtn.textContent = maximizedId === action.id ? '⤡' : '⤢';
      var mc = (meta[action.id] || {}).color;
      setAccentVar(card, mc);
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
      var introIdx = 0;
      ids.forEach(function (id) {
        var action = instAction(id); // catalog action carrying this instance's id
        if (!action) return;
        var node;
        if (action.kind === 'widget') {
          if (!widgetCache[id]) buildWidget(action);
          decorateWidget(action);
          node = widgetCache[id].card;
        } else {
          node = tile(action);
        }
        grid.appendChild(node);
        // Each item gets its own entrance: the newly added one (rotating so back to
        // back adds differ), or every item staggered on first paint / board switch.
        if (id === lastAddedId) playEntrance(node, addSeq, action.kind, 0);
        else if (introAll) { playEntrance(node, introIdx, action.kind, introIdx); introIdx++; }
      });
      if (editing) grid.appendChild(addTile());
      fitToHeight();      // size cells to fill the panel height (no scroll) before
      flip(prevRects);    // FLIP captures the fitted rects
      lastAddedId = null;
      introAll = false;
    }

    // ---- Browser (searchable, filterable by kind) ----
    function openBrowser() {
      if (!R.ui.modal) return;
      var query = '';
      var kind = 'all';
      var listEl = el('div.rb-home-browser-list');

      var kindCtl = R.ui.segmented([
        { value: 'all', label: 'All' },
        { value: 'widget', label: 'Widgets' },
        { value: 'apply', label: 'Actions' },
        { value: 'open', label: 'Tools' }
      ], { value: kind, onChange: function (v) { kind = v; renderList(); } });

      var search = el('input', { type: 'text', spellcheck: 'false', placeholder: 'Search actions, presets, expressions, tools…',
        oninput: function () { query = this.value.toLowerCase(); renderList(); } });

      // Self-explaining sections: each tells the user, in plain language, what the
      // items are and what one click does, so widget-vs-action-vs-tool is obvious.
      var SECTIONS = [
        { id: 'widget', title: 'Live widgets', hint: 'A whole tool embedded on your board, drag the curve, anchor or swatches right here. Best for tools you use constantly.' },
        { id: 'quick', title: 'Quick actions', hint: 'One click runs a command on your selection, ease, align, add a shape and more.' },
        { id: 'ease', title: 'Easing presets', hint: 'One click eases the selected keyframes with this exact curve. Save your own in the Library.' },
        { id: 'expr', title: 'Expressions', hint: 'One click writes this expression onto the selected property. Save your own in the Expressions tool.' },
        { id: 'script', title: 'Your scripts', hint: 'Scripts and expressions you saved yourself, one click runs them.' },
        { id: 'tool', title: 'All tools', hint: 'Opens the full tool in the panel, with every option.' }
      ];
      function sectionOf(a) {
        if (a.kind === 'widget') return 'widget';
        if (a.kind === 'open') return 'tool';
        if (a.group === 'Expressions') return 'expr';
        if (a.group === 'Easing presets' || a.group === 'Your presets') return 'ease';
        if (a.group === 'Scripts') return 'script';
        return 'quick';
      }

      function renderList() {
        R.dom.clear(listEl);
        var actions = R.homeActions.all().filter(function (a) {
          if (kind !== 'all' && a.kind !== kind) return false;
          return !query || (a.label + ' ' + a.group + ' ' + (a.desc || '')).toLowerCase().indexOf(query) !== -1;
        });
        if (!actions.length) { listEl.appendChild(el('div.rb-empty', { text: 'No matches.' })); return; }
        var bySec = {};
        actions.forEach(function (a) { var s = sectionOf(a); (bySec[s] = bySec[s] || []).push(a); });
        SECTIONS.forEach(function (sec) {
          var items = bySec[sec.id];
          if (!items || !items.length) return;
          listEl.appendChild(el('div.rb-home-browser-head', null, [
            el('div.rb-home-browser-head-top', null, [
              el('span.rb-home-browser-head-t', { text: sec.title }),
              el('span.rb-home-browser-count', { text: String(items.length) })
            ]),
            el('div.rb-home-browser-hint', { text: sec.hint })
          ]));
          var gridEl = el('div.rb-home-browser-grid');
          items.forEach(function (a) { gridEl.appendChild(browserCard(a)); });
          listEl.appendChild(gridEl);
        });
      }

      // A big, explanatory card: an animated example of what the tool does (its
      // easing curve or demo, the same visual the tile uses), its name, a kind
      // badge, a plain-language description, and an Add button. Adding is additive:
      // it pins ANOTHER instance every click, and a chip shows how many are on the
      // board (remove instances from the board itself).
      function browserCard(a) {
        var badge = a.kind === 'apply' ? el('span.rb-home-badge', { text: '1-click', title: 'One click runs this on your selection' })
          : a.kind === 'widget' ? el('span.rb-home-badge.is-widget', { text: 'widget', title: 'Embeds the whole tool on your board' })
            : el('span.rb-home-badge.is-open', { text: 'open', title: 'Opens the full tool in the panel' });
        var vis = tileVisual(a, {});
        var visWrap = el('div.rb-home-card-vis', null, [vis || iconSpan(a.toolId, 'rb-home-ico')]);
        if (!vis) visWrap.classList.add('is-icon');
        // A 1-click action carries its own specific line; for a widget/open of a
        // tool, the tool's own demo caption explains it far better than the generic
        // line, so prefer that (tags stripped to plain text).
        var demo = R.toolDemos && R.toolDemos[a.toolId];
        var cap = demo && demo.caption ? demo.caption.replace(/<[^>]+>/g, '') : '';
        var descText = (a.kind === 'apply') ? (a.desc || cap) : (cap || a.desc || '');
        var countChip = el('span.rb-home-card-count');
        var addBtn = el('button.rb-home-card-add', { type: 'button' });
        var card = el('div.rb-home-card', { title: a.label }, [
          visWrap,
          el('div.rb-home-card-body', null, [
            el('div.rb-home-card-top', null, [el('span.rb-home-card-name', { text: a.label }), countChip, badge]),
            el('div.rb-home-card-desc', { text: descText }),
            addBtn
          ])
        ]);
        function sync() {
          var n = countOf(a.id);
          card.classList.toggle('is-pinned', n > 0);
          countChip.textContent = n ? (n + ' on board') : '';
          R.dom.clear(addBtn);
          addBtn.appendChild(el('span', { text: n ? 'Add another' : 'Add to Home' }));
        }
        addBtn.addEventListener('click', function () { addItem(a.id); sync(); });
        sync();
        return card;
      }
      renderList();

      var doneBtn = el('button.rb-btn.is-primary', { type: 'button', onclick: function () { handle.close('confirm'); } }, ['Done']);
      var handle = R.ui.modal({
        title: 'Add to Home', width: 640, className: 'rb-modal-home',
        body: el('div.rb-home-browser', null, [
          el('div.rb-home-browser-intro', null, [
            el('span', null, [el('b', { text: 'Widgets' }), ' embed a whole tool on your board. ']),
            el('span', null, [el('b', { text: 'Actions' }), ' run one command on your selection. ']),
            el('span', null, [el('b', { text: 'Tools' }), ' open the full panel.'])
          ]),
          el('div.rb-home-browser-tools', null, [el('div.rb-search.rb-grow', null, [search]), kindCtl.el]),
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
