/*
 * Rebound — main panel bootstrap.
 *
 * Navigation model: a single primary zone at a time, sized for a narrow dock.
 *   Home  — a searchable, keyboard-navigable launcher of all tools, grouped by
 *           goal-shaped sections (see ui/tool-meta.js).
 *   Detail — the focused tool, with a back arrow + breadcrumb above it.
 *
 * Keyboard: type in the always-present search to filter; Up/Down move the
 * highlighted row; Enter opens it; Esc clears the search or returns from a tool;
 * Ctrl/Cmd-K focuses search; "/" focuses search from anywhere.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  var appStore = R.createStore({
    selection: { hasComp: false, totalSelectedKeys: 0, properties: [] },
    activeTool: null
  });

  var mounted = {};        // toolId -> { wrap, api }
  var ctx = null;
  var view = 'home';       // 'home' | 'detail'
  var homeQuery = '';
  var homeScroll = 0;
  var rows = [];           // [{ tool, el }] currently shown in the launcher
  var activeIndex = -1;

  var homeEl, detailEl, mountsEl, breadcrumbEl, searchInput;

  // ---- Boot ----------------------------------------------------------------

  function boot() {
    R.theme.init();
    applySavedSettings();
    listenForSettings();

    var app = document.getElementById('rb-app');
    R.dom.clear(app);
    app.appendChild(buildHeader());
    app.appendChild(buildSelStrip());

    homeEl = el('div#rb-home.rb-home');
    mountsEl = el('div#rb-mounts.rb-grow');
    breadcrumbEl = el('span.rb-crumb');
    var backBtn = el('button.rb-btn.is-ghost.is-icon', {
      'aria-label': 'Back to all tools', title: 'Back (Esc)', onclick: goHome
    }, [icon('<path d="M15 6l-6 6 6 6"/>')]);
    detailEl = el('div#rb-detail.rb-detail.rb-hidden', null, [
      el('div.rb-detail-bar', null, [backBtn, breadcrumbEl]),
      mountsEl
    ]);
    app.appendChild(el('div.rb-body', null, [homeEl, detailEl]));

    ctx = makeContext();
    renderHome();
    setupKeyboard();

    if (R.bridge.available) {
      pollSelection();
      setInterval(pollSelection, 800);
    } else {
      R.log.info('Running outside the host — selection polling disabled.');
    }

    R.ui.toast('Rebound ready', { kind: 'info', duration: 1500 });
  }

  function icon(inner) {
    var span = el('span.rb-icon');
    span.innerHTML = R.toolMeta.svg(inner);
    return span;
  }

  // ---- Home launcher -------------------------------------------------------

  function toolsInSection(sid) {
    return R.tools.list().filter(function (t) {
      var m = R.toolMeta.forTool(t.id);
      return m && m.section === sid;
    });
  }

  function searchTools(q) {
    var scored = [];
    R.tools.list().forEach(function (t) {
      var m = R.toolMeta.forTool(t.id) || {};
      var title = t.title.toLowerCase();
      var hay = (t.title + ' ' + (t.keywords || []).join(' ') + ' ' + (m.desc || '')).toLowerCase();
      var score = -1;
      if (title === q) score = 100;
      else if (title.indexOf(q) === 0) score = 80;
      else if (hay.indexOf(q) !== -1) score = 50;
      else if (fuzzy(q, hay)) score = 20;
      if (score >= 0) scored.push({ t: t, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s) { return s.t; });
  }

  function makeRow(tool) {
    var m = R.toolMeta.forTool(tool.id) || {};
    var iconEl = el('span.rb-launch-row-icon');
    iconEl.innerHTML = R.toolMeta.svg(m.icon || R.toolMeta.ICONS.curve);
    var row = el('button.rb-launch-row', {
      type: 'button', 'data-tool': tool.id, onclick: function () { openTool(tool); }
    }, [
      iconEl,
      el('span.rb-launch-row-text', null, [
        el('span.rb-launch-row-title', { text: tool.title }),
        el('span.rb-launch-row-desc', { text: m.desc || '' })
      ])
    ]);
    rows.push({ tool: tool, el: row });
    return row;
  }

  function renderHome() {
    R.dom.clear(homeEl);
    rows = [];
    var q = homeQuery.trim().toLowerCase();

    if (q) {
      var results = searchTools(q);
      if (!results.length) {
        homeEl.appendChild(el('div.rb-empty', null, [
          el('div', { text: 'No tool matches “' + homeQuery + '”' }),
          el('button.rb-btn', { onclick: clearSearch }, ['Browse all tools'])
        ]));
        return;
      }
      var flat = el('div.rb-launch-list');
      results.forEach(function (t) { flat.appendChild(makeRow(t)); });
      homeEl.appendChild(flat);
    } else {
      R.toolMeta.SECTIONS.forEach(function (section) {
        var tools = toolsInSection(section.id);
        if (!tools.length) return;
        var head = el('div.rb-launch-section');
        head.appendChild(svgSpan('rb-launch-section-icon', section.icon));
        head.appendChild(el('span', { text: section.name }));
        homeEl.appendChild(head);
        var list = el('div.rb-launch-list');
        tools.forEach(function (t) { list.appendChild(makeRow(t)); });
        homeEl.appendChild(list);
      });
    }
    setActiveRow(rows.length ? 0 : -1);
  }

  function svgSpan(cls, inner) {
    var s = el('span.' + cls);
    s.innerHTML = R.toolMeta.svg(inner);
    return s;
  }

  function setActiveRow(i) {
    activeIndex = i;
    for (var r = 0; r < rows.length; r++) {
      rows[r].el.classList.toggle('is-active', r === i);
    }
    if (i >= 0 && rows[i] && rows[i].el.scrollIntoView) {
      rows[i].el.scrollIntoView({ block: 'nearest' });
    }
  }

  function clearSearch() {
    homeQuery = '';
    if (searchInput) searchInput.value = '';
    renderHome();
    if (searchInput) searchInput.focus();
  }

  // ---- Detail view ---------------------------------------------------------

  function openTool(tool) {
    homeScroll = homeEl.scrollTop;

    if (!mounted[tool.id]) {
      var host = el('div.rb-tool-host');
      var footer = el('div.rb-action-bar');
      var wrap = el('div.rb-tool', { 'data-tool': tool.id }, [host, footer]);
      mountsEl.appendChild(wrap);
      var toolCtx = Object.create(ctx);
      toolCtx.body = host;
      toolCtx.footer = footer;
      var api = null;
      try {
        api = tool.mount(toolCtx);
      } catch (err) {
        R.log.error('Tool "' + tool.id + '" failed to mount', err);
        host.appendChild(el('div.rb-empty', null, ['This tool failed to load: ' + (err.message || err)]));
      }
      mounted[tool.id] = { wrap: wrap, api: api };
    }
    for (var id in mounted) {
      if (mounted.hasOwnProperty(id)) mounted[id].wrap.classList.toggle('rb-hidden', id !== tool.id);
    }

    var m = R.toolMeta.forTool(tool.id);
    R.dom.clear(breadcrumbEl);
    breadcrumbEl.appendChild(el('span.rb-crumb-section', { text: m ? sectionName(m.section) : (tool.group || '') }));
    breadcrumbEl.appendChild(el('span.rb-crumb-sep', { text: '›' }));
    breadcrumbEl.appendChild(el('span.rb-crumb-tool', { text: tool.title }));

    view = 'detail';
    homeEl.classList.add('rb-hidden');
    detailEl.classList.remove('rb-hidden');
    appStore.update({ activeTool: tool.id });
  }

  function goHome() {
    view = 'home';
    detailEl.classList.add('rb-hidden');
    homeEl.classList.remove('rb-hidden');
    homeEl.scrollTop = homeScroll || 0;
    if (searchInput) searchInput.focus();
  }

  function openToolById(id) {
    var tool = R.tools.get(id);
    if (tool) openTool(tool);
  }

  function sectionName(sid) {
    var list = R.toolMeta.SECTIONS;
    for (var i = 0; i < list.length; i++) if (list[i].id === sid) return list[i].name;
    return sid;
  }

  // ---- Keyboard ------------------------------------------------------------

  function onSearchKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveRow(Math.min(activeIndex + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveRow(Math.max(activeIndex - 1, 0)); }
    else if (e.key === 'Enter') { if (rows[activeIndex]) { e.preventDefault(); openTool(rows[activeIndex].tool); } }
    else if (e.key === 'Escape') { if (homeQuery) { e.preventDefault(); clearSearch(); } }
  }

  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var inInput = /input|textarea/i.test(tag);

      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (view === 'detail') goHome();
        if (searchInput) searchInput.select();
        return;
      }
      if (e.key === '/' && !inInput) { e.preventDefault(); if (searchInput) searchInput.focus(); return; }

      if (view === 'detail') {
        if (e.key === 'Escape' && !inInput) { e.preventDefault(); goHome(); }
        return;
      }
      if (!inInput) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveRow(Math.min(activeIndex + 1, rows.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveRow(Math.max(activeIndex - 1, 0)); }
        else if (e.key === 'Enter' && rows[activeIndex]) { e.preventDefault(); openTool(rows[activeIndex].tool); }
        else if (e.key === 'Escape' && homeQuery) { e.preventDefault(); clearSearch(); }
      }
    });
  }

  // ---- Shell pieces --------------------------------------------------------

  function buildHeader() {
    searchInput = el('input', {
      type: 'text', placeholder: 'Search tools…', 'aria-label': 'Search tools', spellcheck: 'false'
    });
    R.dom.on(searchInput, 'input', function () {
      homeQuery = searchInput.value;
      if (view !== 'home') {
        view = 'home';
        detailEl.classList.add('rb-hidden');
        homeEl.classList.remove('rb-hidden');
      }
      renderHome();
    });
    R.dom.on(searchInput, 'keydown', onSearchKeydown);

    var search = el('div.rb-search.rb-grow', null, [
      svgSpan('rb-search-icon', '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
      searchInput,
      el('span.rb-kbd', { text: '⌘K' })
    ]);

    var settingsBtn = el('button.rb-btn.is-ghost.is-icon', {
      title: 'Settings', 'aria-label': 'Settings', onclick: openSettings
    }, [icon('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z"/>')]);

    var children = [
      el('div.rb-logo', null, [el('span.rb-logo-mark', { text: '◗' }), 'Rebound']),
      search,
      settingsBtn
    ];

    if (R.bridge.available) {
      children.push(el('button.rb-btn.is-ghost.is-icon', {
        title: 'Reload host script (dev)', 'aria-label': 'Reload host',
        onclick: function () {
          R.bridge.reloadHost()
            .then(function (v) { R.ui.toast('Host reloaded (v' + v + ')', { kind: 'success' }); })
            .catch(function (e) { R.ui.toast('Host reload failed: ' + e.message, { kind: 'error' }); });
        }
      }, [icon('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>')]));
    }
    return el('div.rb-header', null, children);
  }

  function buildSelStrip() {
    var strip = el('div.rb-selstrip', null, [el('span.rb-dot'), el('span', { text: 'No composition' })]);
    var label = strip.querySelector('span:last-child');
    appStore.select(function (s) { return s.selection; }, function (sel) {
      if (!sel || !sel.hasComp) {
        strip.classList.remove('is-live');
        label.textContent = 'No composition';
        return;
      }
      strip.classList.add('is-live');
      label.textContent = sel.compName + '  ·  ' + sel.selectedLayerCount + ' layer' +
        (sel.selectedLayerCount === 1 ? '' : 's') + '  ·  ' + sel.totalSelectedKeys + ' key' +
        (sel.totalSelectedKeys === 1 ? '' : 's');
    });
    return strip;
  }

  // ---- Settings / selection / context -------------------------------------

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }

  function applySavedSettings() {
    try {
      var s = R.disk.read('settings', null);
      if (s && s.accent) {
        var rgb = hexToRgb(s.accent);
        if (rgb) R.theme.setAccent(rgb);
      }
      appStore.update({ settings: s || {} });
    } catch (e) {
      R.log.warn('Could not load settings', e);
    }
  }

  function listenForSettings() {
    try {
      if (R.bridge.cs) {
        R.bridge.cs.addEventListener('com.meszmate.rebound.settingsChanged', function (ev) {
          var s = null;
          try { s = JSON.parse(ev.data); } catch (e) { return; }
          if (s.accent) {
            var rgb = hexToRgb(s.accent);
            if (rgb) R.theme.setAccent(rgb);
          }
          appStore.update({ settings: s });
        });
      }
    } catch (e) {
      R.log.warn('Could not subscribe to settings changes', e);
    }
  }

  function pollSelection() {
    R.bridge.invoke('system.selectionSummary')
      .then(function (sel) {
        var prev = appStore.get().selection;
        if (JSON.stringify(prev) !== JSON.stringify(sel)) {
          appStore.update({ selection: sel });
        }
      })
      .catch(function (err) { R.log.warn('selection poll failed', err); });
  }

  function makeContext() {
    return {
      bridge: R.bridge,
      invoke: function (method, args) { return R.bridge.invoke(method, args); },
      store: appStore,
      bus: R.bus,
      toast: R.ui.toast,
      theme: R.theme,
      units: R.units,
      openTool: openToolById,
      goHome: goHome,
      getSelection: function () { return appStore.get().selection; },
      onSelection: function (fn) { return appStore.select(function (s) { return s.selection; }, fn); },
      refreshSelection: pollSelection
    };
  }

  function fuzzy(q, text) {
    if (text.indexOf(q) !== -1) return true;
    var i = 0;
    for (var j = 0; j < text.length && i < q.length; j++) {
      if (text.charAt(j) === q.charAt(i)) i++;
    }
    return i === q.length;
  }

  function openSettings() {
    try {
      if (R.bridge.cs && R.bridge.cs.requestOpenExtension) {
        R.bridge.cs.requestOpenExtension('com.meszmate.rebound.settings', '');
        return;
      }
    } catch (e) { /* ignore */ }
    R.ui.toast('Settings panel opens inside After Effects', { kind: 'info' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Rebound = window.Rebound || {});
