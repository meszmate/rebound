/*
 * Rebound — main panel bootstrap.
 * Builds the shell, mounts tools from the registry, keeps the reactive store in
 * sync with the After Effects selection, and wires the command palette.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  var appStore = R.createStore({
    selection: { hasComp: false, totalSelectedKeys: 0, properties: [] },
    activeTool: null
  });

  var mounted = {}; // toolId -> { wrap, api }
  var activeGroup = 0;

  function boot() {
    R.theme.init();
    applySavedSettings();
    listenForSettings();
    var app = document.getElementById('rb-app');
    R.dom.clear(app);

    app.appendChild(buildHeader());
    app.appendChild(buildSelStrip());

    var groups = R.tools.groups();
    var tabs = buildTabs(groups);
    app.appendChild(tabs.el);

    var subnav = el('div#rb-subnav.rb-subnav.rb-hidden');
    var mounts = el('div#rb-mounts.rb-grow');
    var body = el('div.rb-body', null, [subnav, mounts]);
    app.appendChild(body);

    var ctx = makeContext();

    function showGroup(gi) {
      activeGroup = gi;
      tabs.setActive(gi);
      var group = groups[gi];
      // sub-navigation chips when a group has several tools.
      R.dom.clear(subnav);
      if (group.tools.length > 1) {
        subnav.classList.remove('rb-hidden');
        group.tools.forEach(function (t) {
          subnav.appendChild(el('button.rb-chip', {
            onclick: function () { openTool(t, group); markChips(group, t); },
            'data-tool': t.id
          }, [t.title]));
        });
      } else {
        subnav.classList.add('rb-hidden');
      }
      openTool(group.tools[0], group);
      markChips(group, group.tools[0]);
    }

    function markChips(group, active) {
      R.dom.qsa('.rb-chip', subnav).forEach(function (c) {
        c.classList.toggle('is-accent', c.getAttribute('data-tool') === active.id);
      });
    }

    function openTool(tool, group) {
      // Hide all, show/create the requested one.
      for (var id in mounted) {
        if (mounted.hasOwnProperty(id)) mounted[id].wrap.classList.add('rb-hidden');
      }
      if (!mounted[tool.id]) {
        var host = el('div.rb-tool-host');
        var footer = el('div.rb-action-bar');
        var wrap = el('div.rb-tool', { 'data-tool': tool.id }, [host, footer]);
        mounts.appendChild(wrap);
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
      mounted[tool.id].wrap.classList.remove('rb-hidden');
      appStore.update({ activeTool: tool.id });
    }

    tabs.onSelect = showGroup;
    if (groups.length) showGroup(0);

    // Selection polling (only inside the host).
    if (R.bridge.available) {
      pollSelection();
      setInterval(pollSelection, 800);
    } else {
      R.log.info('Running outside the host — selection polling disabled.');
    }

    buildPalette();
    R.ui.toast('Rebound ready', { kind: 'info', duration: 1500 });
  }

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
      .catch(function (err) {
        R.log.warn('selection poll failed', err);
      });
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
      getSelection: function () { return appStore.get().selection; },
      onSelection: function (fn) { return appStore.select(function (s) { return s.selection; }, fn); },
      refreshSelection: pollSelection
    };
  }

  // ---- Shell pieces --------------------------------------------------------

  function buildHeader() {
    var search = el('div.rb-search.rb-grow', {
      onclick: openPalette,
      title: 'Search tools and presets (Ctrl/Cmd-K)'
    }, [el('span.rb-faint', { text: 'Search  ⌘K' })]);

    var settingsBtn = el('button.rb-btn.is-ghost.is-icon', {
      title: 'Settings',
      onclick: openSettings
    }, ['⚙']);

    var children = [
      el('div.rb-logo', null, [el('span.rb-logo-mark', { text: '◗' }), 'Rebound']),
      search,
      settingsBtn
    ];

    if (R.bridge.available) {
      children.push(el('button.rb-btn.is-ghost.is-icon', {
        title: 'Reload host script (dev)',
        onclick: function () {
          R.bridge.reloadHost()
            .then(function (v) { R.ui.toast('Host reloaded (v' + v + ')', { kind: 'success' }); })
            .catch(function (e) { R.ui.toast('Host reload failed: ' + e.message, { kind: 'error' }); });
        }
      }, ['⟳']));
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

  function buildTabs(groups) {
    var root = el('div.rb-tabs');
    var buttons = groups.map(function (g, i) {
      return el('button', { onclick: function () { if (api.onSelect) api.onSelect(i); } }, [g.name]);
    });
    buttons.forEach(function (b) { root.appendChild(b); });
    var api = {
      el: root,
      onSelect: null,
      setActive: function (i) {
        buttons.forEach(function (b, bi) { b.classList.toggle('is-active', bi === i); });
      }
    };
    return api;
  }

  // ---- Command palette -----------------------------------------------------

  var paletteEl = null;
  function buildPalette() {
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openPalette();
      } else if (e.key === 'Escape' && paletteEl) {
        closePalette();
      }
    });
  }

  function openPalette() {
    if (paletteEl) return;
    var commands = R.tools.allCommands();
    var input = el('input', { type: 'text', placeholder: 'Run a tool or command…' });
    var listEl = el('div.rb-palette-list');
    var active = 0;
    var filtered = commands;

    function render() {
      R.dom.clear(listEl);
      filtered.forEach(function (c, i) {
        listEl.appendChild(el('div.rb-palette-item' + (i === active ? '.is-active' : ''), {
          onclick: function () { run(c); }
        }, [el('span.rb-grow', { text: c.title }), el('span.rb-palette-kbd', { text: c.kind })]));
      });
    }
    function refilter() {
      var q = input.value.trim().toLowerCase();
      filtered = q ? commands.filter(function (c) { return fuzzy(q, c.title.toLowerCase() + ' ' + (c.keywords || []).join(' ')); }) : commands;
      active = 0;
      render();
    }
    function run(c) {
      closePalette();
      if (c.kind === 'tool') {
        openToolById(c.tool.id);
      } else if (c.command) {
        try { c.command.run(makeContext()); } catch (e) { R.ui.toast(e.message, { kind: 'error' }); }
      }
    }

    R.dom.on(input, 'input', refilter);
    R.dom.on(input, 'keydown', function (e) {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, filtered.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && filtered[active]) { run(filtered[active]); }
    });

    paletteEl = el('div#rb-palette', {
      onclick: function (e) { if (e.target === paletteEl) closePalette(); }
    }, [el('div.rb-palette-box', null, [input, listEl])]);
    document.body.appendChild(paletteEl);
    render();
    input.focus();
  }

  function closePalette() {
    if (paletteEl && paletteEl.parentNode) paletteEl.parentNode.removeChild(paletteEl);
    paletteEl = null;
  }

  function openToolById(id) {
    var groups = R.tools.groups();
    for (var gi = 0; gi < groups.length; gi++) {
      for (var ti = 0; ti < groups[gi].tools.length; ti++) {
        if (groups[gi].tools[ti].id === id) {
          // Re-render group then open the specific tool.
          var btn = R.dom.qsa('.rb-tabs button')[gi];
          if (btn) btn.click();
          var chip = R.dom.qs('.rb-chip[data-tool="' + id + '"]');
          if (chip) chip.click();
          return;
        }
      }
    }
  }

  function fuzzy(q, text) {
    if (text.indexOf(q) !== -1) return true;
    // subsequence match
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
