/*
 * Rebound, preset gallery.
 * A richer save/recall experience than the plain dropdown: every preset shows a
 * tiny looping animation of what it feels like, with its name underneath. Click
 * a preset to apply it; save the current settings as a named preset inline; user
 * presets can be deleted. A tool opts in by adding a `previewFor(state)` to its
 * presets config (returns the motion function fn(t) for that preset).
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  function round(v) { return Math.round(v * 100) / 100; }

  // A tiny looping animation of a motion function: a dot slides along a baseline
  // following fn(t) (overshoot runs past the target tick), holds, then glides
  // back. Conveys the preset's feel at a glance. Pure SMIL, compositor-friendly.
  function miniLoop(fn, opts) {
    opts = opts || {};
    var w = opts.width || 96;
    var h = opts.height || 34;
    var pad = 9;
    var travel = w - 2 * pad - 4;
    var n = 24;
    var playEnd = 0.55;
    var cy = round(h / 2);
    function x(v) { return round(pad + v * travel); }

    var vals = [];
    var kt = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      vals.push(x(fn(t)));
      kt.push(round(t * playEnd));
    }
    vals.push(x(fn(1))); kt.push(0.68); // brief hold
    vals.push(x(0)); kt.push(1);        // glide back to start

    return svg('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, 'class': 'rb-miniloop' }, [
      svg('line', { x1: pad, y1: cy, x2: w - pad, y2: cy, stroke: 'var(--rb-border)', 'stroke-width': 1 }),
      svg('line', { x1: x(1), y1: cy - 5, x2: x(1), y2: cy + 5, stroke: 'var(--rb-border-strong)', 'stroke-width': 1 }),
      svg('circle', { cx: x(0), cy: cy, r: 3.6, fill: 'var(--rb-accent)' }, [
        svg('animate', { attributeName: 'cx', values: vals.join(';'), keyTimes: kt.join(';'),
          dur: opts.dur || '2.6s', calcMode: 'linear', repeatCount: 'indefinite' })
      ])
    ]);
  }

  function gallery(config) {
    var toolId = config.toolId;
    var previewFor = config.previewFor;
    var defaults = config.defaults || [];

    function key() { return 'presets:' + toolId; }
    function loadUser() {
      var data = R.disk.read(key(), null);
      return (data && data.items) ? data.items : [];
    }
    function saveUser(items) { R.disk.write(key(), { schemaVersion: 1, items: items }); }

    function all() {
      var out = [];
      defaults.forEach(function (d) { out.push({ name: d.name, state: d.state, builtin: true }); });
      loadUser().forEach(function (u) { out.push({ name: u.name, state: u.state, builtin: false }); });
      return out;
    }

    var track = el('div.rb-pg-track');
    var root = el('div.rb-presetgallery', null, [
      el('div.rb-pg-head', null, [el('span.rb-pg-title', { text: 'Presets' })]),
      track
    ]);

    function fnFor(state) {
      try { return previewFor(state); } catch (e) { return function (t) { return t; }; }
    }

    function applyPreset(p) {
      if (config.set) {
        try { config.set(p.state); } catch (e) { R.log.error('Preset apply failed', e); }
      }
      mark(p.name);
    }

    var activeName = null;
    function mark(name) {
      activeName = name;
      var cards = track.querySelectorAll('.rb-pg-card');
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.toggle('is-active', cards[i].getAttribute('data-name') === name);
      }
    }

    function card(p) {
      var node = el('button.rb-pg-card' + (p.name === activeName ? '.is-active' : ''), {
        type: 'button', 'data-name': p.name, title: 'Apply ' + p.name,
        onclick: function () { applyPreset(p); }
      }, [
        el('div.rb-pg-anim', null, [miniLoop(fnFor(p.state))]),
        el('div.rb-pg-name', { text: p.name })
      ]);
      if (!p.builtin) {
        var del = el('span.rb-pg-del', {
          title: 'Delete preset', 'aria-label': 'Delete ' + p.name,
          onclick: function (e) {
            e.stopPropagation();
            saveUser(loadUser().filter(function (u) { return u.name !== p.name; }));
            rebuild();
            if (R.ui.toast) R.ui.toast('Deleted ' + p.name, { kind: 'info' });
          }
        }, ['×']);
        node.appendChild(del);
      }
      return node;
    }

    // The save tile: a + that expands into an inline name field.
    function saveTile() {
      var tile = el('div.rb-pg-card.rb-pg-save');
      function showButton() {
        R.dom.clear(tile);
        tile.classList.remove('is-editing');
        tile.appendChild(el('button.rb-pg-savebtn', {
          type: 'button', title: 'Save the current settings as a preset', onclick: showField
        }, [el('span.rb-pg-plus', { text: '+' }), el('span', { text: 'Save' })]));
      }
      function showField() {
        R.dom.clear(tile);
        tile.classList.add('is-editing');
        var input = el('input.rb-pg-input', {
          type: 'text', placeholder: 'Name…', spellcheck: 'false',
          onkeydown: function (e) {
            if (e.key === 'Enter') commit(input.value);
            else if (e.key === 'Escape') showButton();
          }
        });
        var ok = el('button.rb-pg-ok', { type: 'button', title: 'Save', onclick: function () { commit(input.value); } }, ['✓']);
        tile.appendChild(el('div.rb-pg-form', null, [input, ok]));
        input.focus();
      }
      function commit(name) {
        name = ('' + (name || '')).trim();
        if (!name) { showButton(); return; }
        var items = loadUser().filter(function (u) { return u.name !== name; });
        items.push({ name: name, state: config.get() });
        saveUser(items);
        rebuild();
        mark(name);
        if (R.ui.toast) R.ui.toast('Saved “' + name + '”', { kind: 'success' });
      }
      showButton();
      return tile;
    }

    function rebuild() {
      R.dom.clear(track);
      all().forEach(function (p) { track.appendChild(card(p)); });
      track.appendChild(saveTile());
    }

    rebuild();
    return root;
  }

  R.ui = R.ui || {};
  R.ui.miniLoop = miniLoop;
  R.ui.presetGallery = gallery;
})(window.Rebound = window.Rebound || {});
