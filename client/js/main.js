/*
 * Rebound, main panel bootstrap.
 *
 * Shell: a left icon rail of categories, and a main area that either browses a
 * category's tools as cards (each card plays the tool's demo so you see what it
 * does), or shows a focused tool. Opening the panel drops you straight into the
 * default tool (Ease) so you can work without navigating first.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  var DEFAULT_TOOL = 'ease';
  var PREVIEW_TOOLS = { ease: 1, spring: 1, recoil: 1, bounce: 1 };
  var STAR_ICON = '<path d="M12 3l2.6 6.3L21 10l-4.8 4.2L17.5 21 12 17.3 6.5 21l1.3-6.8L3 10l6.4-.7z"/>';

  var appStore = R.createStore({
    selection: { hasComp: false, totalSelectedKeys: 0, properties: [] },
    activeTool: null
  });

  var mounted = {};
  var ctx = null;
  var view = 'detail';        // 'browse' | 'detail'
  var lastCategory = 'ease';
  var searchQuery = '';
  var cards = [];             // [{ tool, el }] currently shown
  var activeIndex = -1;

  var railEl, browseEl, detailEl, mountsEl, breadcrumbEl, searchInput;
  var railButtons = {};

  // ---- Boot ----------------------------------------------------------------

  function boot() {
    R.theme.init();
    applySavedSettings();
    listenForSettings();

    var app = document.getElementById('rb-app');
    R.dom.clear(app);

    railEl = buildRail();
    app.appendChild(railEl);

    browseEl = el('div.rb-browse');
    mountsEl = el('div#rb-mounts.rb-grow');
    breadcrumbEl = el('span.rb-crumb');
    var backBtn = el('button.rb-btn.is-ghost.is-icon', {
      'aria-label': 'Back to category', title: 'Back (Esc)', onclick: back
    }, [icon('<path d="M15 6l-6 6 6 6"/>')]);
    detailEl = el('div.rb-detail.rb-hidden', null, [
      el('div.rb-detail-bar', null, [
        backBtn,
        breadcrumbEl,
        el('span.rb-rail-spacer'),
        el('span.rb-kbd-hint', { title: 'Run this tool’s main action' }, [
          el('span.rb-kbd', { text: ctrlSymbol() + '⏎' }),
          el('span.rb-kbd-hint-label', { text: 'Apply' })
        ])
      ]),
      mountsEl
    ]);

    var main = el('div.rb-main', null, [
      buildTopbar(),
      buildContextStrip(),
      el('div.rb-content', null, [browseEl, detailEl])
    ]);
    app.appendChild(main);

    ctx = makeContext();
    setupKeyboard();

    if (R.bridge.available) {
      pollSelection();
      setInterval(pollSelection, 800);
    } else {
      R.log.info('Running outside the host, selection polling disabled.');
      // Dev-only hook so the panel can be driven with a fake selection in the
      // browser preview. Never present when running inside After Effects.
      R._debug = { setSelection: function (sel) { appStore.update({ selection: sel }); } };
    }

    // Land directly in the default tool, ready to use.
    var def = R.tools.get(DEFAULT_TOOL);
    if (def) openTool(def); else showCategory(R.toolMeta.SECTIONS[0].id);

    R.ui.toast('Rebound ready', { kind: 'info', duration: 1400 });
  }

  function icon(inner) {
    var span = el('span.rb-icon');
    span.innerHTML = R.toolMeta.svg(inner);
    return span;
  }

  // Platform-appropriate modifier glyph for shortcut hints.
  function ctrlSymbol() {
    var mac = /Mac|iPod|iPhone|iPad/.test((navigator && navigator.platform) || '');
    return mac ? '⌘' : 'Ctrl ';
  }

  // Run the visible tool's primary action (its footer primary button), so the
  // whole apply flow is reachable from the keyboard.
  function triggerPrimaryAction() {
    if (view !== 'detail') return false;
    var id = appStore.get().activeTool;
    var m = id && mounted[id];
    if (!m || !m.wrap) return false;
    var btn = m.wrap.querySelector('.rb-action-bar .rb-btn.is-primary');
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }

  function buildDemo(d) {
    var stage = el('div.rb-demo-stage');
    stage.innerHTML = d.svg;
    var caption = el('div.rb-demo-caption');
    caption.innerHTML = d.caption;
    return el('div.rb-demo', null, [stage, caption]);
  }

  // ---- Left rail ------------------------------------------------------------

  function buildRail() {
    var children = [el('div.rb-rail-logo', { text: '◗', title: 'Rebound' })];
    R.toolMeta.SECTIONS.forEach(function (section) {
      var btn = el('button.rb-rail-btn', {
        title: section.name, 'aria-label': section.name,
        onclick: function () { showCategory(section.id); }
      });
      btn.innerHTML = R.toolMeta.svg(section.icon);
      railButtons[section.id] = btn;
      children.push(btn);
    });
    children.push(el('div.rb-rail-spacer'));
    children.push(el('button.rb-rail-btn', {
      title: 'Settings', 'aria-label': 'Settings', onclick: openSettings
    }, [icon('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z"/>')]));
    return el('div.rb-rail', null, children);
  }

  function highlightRail(catId) {
    for (var id in railButtons) {
      if (railButtons.hasOwnProperty(id)) railButtons[id].classList.toggle('is-active', id === catId);
    }
  }

  // ---- Topbar / search ------------------------------------------------------

  function buildTopbar() {
    searchInput = el('input', {
      type: 'text', placeholder: 'Search tools…', 'aria-label': 'Search tools', spellcheck: 'false'
    });
    R.dom.on(searchInput, 'input', function () {
      searchQuery = searchInput.value;
      if (searchQuery.trim()) renderSearch();
      else showCategory(lastCategory);
    });
    R.dom.on(searchInput, 'keydown', onListKeydown);

    var search = el('div.rb-search.rb-grow', null, [
      svgSpan('rb-search-icon', '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
      searchInput,
      el('span.rb-kbd', { text: '⌘K' })
    ]);

    var selDot = el('span.rb-dot');
    var selText = el('span.rb-seltext', { text: '' });
    appStore.select(function (s) { return s.selection; }, function (sel) {
      var ok = sel && sel.hasComp;
      selDot.classList.toggle('is-live', !!ok);
      selText.textContent = !ok ? 'No comp'
        : (sel.totalSelectedKeys + ' key' + (sel.totalSelectedKeys === 1 ? '' : 's') +
           ' · ' + sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's'));
    });

    // Visible wordmark so it is always clear this is the Rebound panel.
    var brand = el('div.rb-brand', { title: 'Rebound' }, [
      el('span.rb-brand-mark', { text: '◗' }),
      el('span.rb-brand-name', { text: 'Rebound' })
    ]);

    var children = [brand, search, el('span.rb-selchip', null, [selDot, selText])];
    if (R.bridge.available) {
      children.push(el('button.rb-btn.is-ghost.is-icon', {
        title: 'Reload host (dev)', 'aria-label': 'Reload host',
        onclick: function () {
          R.bridge.reloadHost()
            .then(function (v) { R.ui.toast('Host reloaded (v' + v + ')', { kind: 'success' }); })
            .catch(function (e) { R.ui.toast('Host reload failed: ' + e.message, { kind: 'error' }); });
        }
      }, [icon('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>')]));
    }
    return el('div.rb-topbar', null, children);
  }

  function svgSpan(cls, inner) {
    var s = el('span.' + cls);
    s.innerHTML = R.toolMeta.svg(inner);
    return s;
  }

  // ---- Selection-aware suggestions -----------------------------------------

  // Pick the tools most relevant to what is selected right now. Returns null
  // when there is nothing worth suggesting (the strip then hides).
  function suggestionsFor(sel) {
    if (!sel || !sel.hasComp) return null;
    if (sel.totalSelectedKeys >= 2) {
      var tools = ['ease', 'spring', 'smooth'];
      var props = sel.properties || [];
      for (var i = 0; i < props.length; i++) {
        if (props[i] && props[i].hasExpression) { tools.push('bake'); break; }
      }
      return { label: sel.totalSelectedKeys + ' keyframes', tools: tools };
    }
    if (sel.selectedLayerCount >= 2) {
      return { label: sel.selectedLayerCount + ' layers', tools: ['align', 'stagger', 'sequence'] };
    }
    if (sel.selectedLayerCount === 1) {
      return { label: '1 layer', tools: ['anchor', 'motion', 'drift'] };
    }
    return null;
  }

  function buildContextStrip() {
    var label = el('span.rb-ctx-label', { text: '' });
    var chips = el('div.rb-ctx-chips');
    var strip = el('div.rb-ctxstrip.rb-hidden', null, [
      svgSpan('rb-ctx-spark', '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>'),
      label,
      chips
    ]);

    appStore.select(function (s) { return s.selection; }, function (sel) {
      var sug = suggestionsFor(sel);
      if (!sug) { strip.classList.add('rb-hidden'); return; }
      label.textContent = sug.label;
      R.dom.clear(chips);
      sug.tools.forEach(function (id) {
        var t = R.tools.get(id);
        if (!t) return;
        var active = appStore.get().activeTool === id;
        chips.appendChild(el('button.rb-ctx-chip' + (active ? '.is-active' : ''), {
          type: 'button', title: 'Open ' + t.title,
          onclick: function () { openToolById(id); }
        }, [t.title]));
      });
      strip.classList.remove('rb-hidden');
    });

    return strip;
  }

  // ---- Browse (category / search) ------------------------------------------

  function toolsInSection(sid) {
    return R.tools.list().filter(function (t) {
      var m = R.toolMeta.forTool(t.id);
      return m && m.section === sid;
    });
  }

  function showBrowse() {
    view = 'browse';
    detailEl.classList.add('rb-hidden');
    browseEl.classList.remove('rb-hidden');
  }

  function showCategory(catId) {
    lastCategory = catId;
    highlightRail(catId);
    showBrowse();
    R.dom.clear(browseEl);
    cards = [];

    var section = sectionMeta(catId);
    var tools = toolsInSection(catId);
    browseEl.appendChild(el('div.rb-cat-head', null, [
      el('span.rb-cat-title', { text: section ? section.name : catId }),
      el('span.rb-cat-count', { text: tools.length + ' tool' + (tools.length === 1 ? '' : 's') })
    ]));
    var grid = el('div.rb-card-grid');
    tools.forEach(function (t) { grid.appendChild(makeCard(t)); });
    browseEl.appendChild(grid);
    setActiveCard(cards.length ? 0 : -1);
  }

  function renderSearch() {
    view = 'browse';
    highlightRail(null);
    showBrowse();
    R.dom.clear(browseEl);
    cards = [];
    var results = searchTools(searchQuery.trim().toLowerCase());
    browseEl.appendChild(el('div.rb-cat-head', null, [
      el('span.rb-cat-title', { text: 'Search' }),
      el('span.rb-cat-count', { text: results.length + ' match' + (results.length === 1 ? '' : 'es') })
    ]));
    if (!results.length) {
      browseEl.appendChild(el('div.rb-empty', null, [
        el('div', { text: 'No tool matches “' + searchQuery + '”' }),
        el('button.rb-btn', { onclick: function () { searchInput.value = ''; searchQuery = ''; showCategory('ease'); } }, ['Browse all'])
      ]));
      return;
    }
    var grid = el('div.rb-card-grid');
    results.forEach(function (t) { grid.appendChild(makeCard(t)); });
    browseEl.appendChild(grid);
    setActiveCard(0);
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

  function makeCard(tool) {
    var m = R.toolMeta.forTool(tool.id) || {};
    var demoWrap = el('div.rb-card-demo');
    var d = R.toolDemos && R.toolDemos[tool.id];
    if (d) demoWrap.innerHTML = d.svg;

    var iconEl = el('span.rb-card-icon');
    iconEl.innerHTML = R.toolMeta.svg(m.icon || R.toolMeta.ICONS.curve);

    var fav = isFav(tool.id);
    var star = el('button.rb-card-star' + (fav ? '.is-on' : ''), {
      type: 'button', 'aria-label': fav ? 'Unfavorite' : 'Favorite', title: 'Favorite',
      onclick: function (e) { e.stopPropagation(); toggleFav(tool.id); star.classList.toggle('is-on'); }
    });
    star.innerHTML = R.toolMeta.svg(STAR_ICON);

    var card = el('button.rb-card', {
      type: 'button', 'data-tool': tool.id, onclick: function () { openTool(tool); }
    }, [
      demoWrap,
      star,
      el('div.rb-card-foot', null, [
        el('div.rb-card-titlerow', null, [iconEl, el('span.rb-card-title', { text: tool.title })]),
        el('div.rb-card-desc', { text: m.desc || '' })
      ])
    ]);
    cards.push({ tool: tool, el: card });
    return card;
  }

  function setActiveCard(i) {
    activeIndex = i;
    for (var c = 0; c < cards.length; c++) cards[c].el.classList.toggle('is-active', c === i);
    if (i >= 0 && cards[i] && cards[i].el.scrollIntoView) cards[i].el.scrollIntoView({ block: 'nearest' });
  }

  // ---- Detail ---------------------------------------------------------------

  function openTool(tool) {
    pushRecent(tool.id);
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
      var demoNode = null;
      if (R.toolDemos && R.toolDemos[tool.id] && !PREVIEW_TOOLS[tool.id]) {
        demoNode = buildDemo(R.toolDemos[tool.id]);
        host.insertBefore(demoNode, host.firstChild);
      }
      // A preset bar for tools that expose one (save/recall their settings).
      if (api && api.presets && R.ui.presetBar) {
        var bar = R.ui.presetBar(api.presets);
        if (demoNode) host.insertBefore(bar, demoNode.nextSibling);
        else host.insertBefore(bar, host.firstChild);
      }
      mounted[tool.id] = { wrap: wrap, api: api };
    }
    for (var id in mounted) {
      if (mounted.hasOwnProperty(id)) mounted[id].wrap.classList.toggle('rb-hidden', id !== tool.id);
    }

    var m = R.toolMeta.forTool(tool.id);
    if (m) { lastCategory = m.section; highlightRail(m.section); }
    R.dom.clear(breadcrumbEl);
    breadcrumbEl.appendChild(el('span.rb-crumb-section', { text: m ? sectionName(m.section) : (tool.group || '') }));
    breadcrumbEl.appendChild(el('span.rb-crumb-sep', { text: '›' }));
    breadcrumbEl.appendChild(el('span.rb-crumb-tool', { text: tool.title }));

    view = 'detail';
    browseEl.classList.add('rb-hidden');
    detailEl.classList.remove('rb-hidden');
    appStore.update({ activeTool: tool.id });
  }

  function back() {
    showCategory(lastCategory || 'ease');
  }

  function openToolById(id) {
    var tool = R.tools.get(id);
    if (tool) openTool(tool);
  }

  function sectionMeta(sid) {
    var list = R.toolMeta.SECTIONS;
    for (var i = 0; i < list.length; i++) if (list[i].id === sid) return list[i];
    return null;
  }
  function sectionName(sid) {
    var s = sectionMeta(sid);
    return s ? s.name : sid;
  }

  // ---- Favorites / recents --------------------------------------------------

  function loadFavTools() { return R.disk.read('fav-tools', []) || []; }
  function isFav(id) { return loadFavTools().indexOf(id) !== -1; }
  function toggleFav(id) {
    var f = loadFavTools();
    var i = f.indexOf(id);
    if (i === -1) f.push(id); else f.splice(i, 1);
    R.disk.write('fav-tools', f);
  }
  function pushRecent(id) {
    var r = (R.disk.read('recent-tools', []) || []).filter(function (x) { return x !== id; });
    r.unshift(id);
    R.disk.write('recent-tools', r.slice(0, 8));
  }

  // ---- Keyboard -------------------------------------------------------------

  function onListKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setActiveCard(Math.min(activeIndex + 1, cards.length - 1)); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setActiveCard(Math.max(activeIndex - 1, 0)); }
    else if (e.key === 'Enter') { if (cards[activeIndex]) { e.preventDefault(); openTool(cards[activeIndex].tool); } }
    else if (e.key === 'Escape') { if (searchQuery) { searchInput.value = ''; searchQuery = ''; showCategory('ease'); } }
  }

  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var inInput = /input|textarea/i.test(tag);

      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (searchInput) searchInput.select();
        return;
      }
      // Ctrl/Cmd+Enter runs the active tool's main action from anywhere,
      // including while typing in one of its fields.
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (triggerPrimaryAction()) e.preventDefault();
        return;
      }
      if (e.key === '/' && !inInput) { e.preventDefault(); if (searchInput) searchInput.focus(); return; }

      if (view === 'detail') {
        if (e.key === 'Escape' && !inInput) { e.preventDefault(); back(); return; }
        // A plain Enter applies too, as long as focus is not in a text field.
        if (e.key === 'Enter' && !inInput) { if (triggerPrimaryAction()) e.preventDefault(); return; }
        return;
      }
      if (!inInput) onListKeydown(e);
    });
  }

  // ---- Settings / selection / context --------------------------------------

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
      goBack: back,
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
