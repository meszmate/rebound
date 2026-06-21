/*
 * Rebound, Expressions library.
 * A searchable, categorized gallery of ready-made After Effects expressions.
 * Pick one to see its code, then apply it to the selected property in one click,
 * or write and save your own. Custom snippets persist as versioned JSON in user
 * data. Remove strips Rebound-applied expressions from the selection.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  // ---- Built-in catalog ----------------------------------------------------
  // Codes are stored as arrays joined with newlines so they stay readable here.
  function code() { return Array.prototype.slice.call(arguments).join('\n'); }

  var BUILTIN = [
    { id: 'wiggle', name: 'Wiggle', category: 'wiggle', desc: 'Organic random motion', code: 'wiggle(2, 30)' },
    { id: 'wiggle-slow', name: 'Wiggle (slow)', category: 'wiggle', desc: 'Gentle drift', code: 'wiggle(1, 15)' },
    { id: 'wiggle-fast', name: 'Wiggle (fast)', category: 'wiggle', desc: 'Nervous shake', code: 'wiggle(8, 40)' },
    { id: 'wiggle-x', name: 'Wiggle X only', category: 'wiggle', desc: 'Horizontal wiggle, Y held', code: code('x = wiggle(2, 30)[0];', '[x, value[1]]') },
    { id: 'wiggle-y', name: 'Wiggle Y only', category: 'wiggle', desc: 'Vertical wiggle, X held', code: code('y = wiggle(2, 30)[1];', '[value[0], y]') },

    { id: 'loop-cycle', name: 'Loop cycle', category: 'loop', desc: 'Repeat the keyframes forever', code: 'loopOut("cycle")' },
    { id: 'loop-pingpong', name: 'Loop ping-pong', category: 'loop', desc: 'Bounce back and forth', code: 'loopOut("pingpong")' },
    { id: 'loop-continue', name: 'Loop continue', category: 'loop', desc: 'Keep going at the last velocity', code: 'loopOut("continue")' },
    { id: 'loop-offset', name: 'Loop offset', category: 'loop', desc: 'Repeat and accumulate', code: 'loopOut("offset")' },
    { id: 'loop-in', name: 'Loop in', category: 'loop', desc: 'Repeat before the first keyframe', code: 'loopIn("cycle")' },

    { id: 'time-rotate', name: 'Spin by time', category: 'time', desc: 'Continuous rotation (deg/sec)', code: 'time * 60' },
    { id: 'time-tick', name: 'Tick (whole seconds)', category: 'time', desc: 'Stepped value each second', code: 'Math.round(time)' },
    { id: 'posterize', name: 'Posterize time', category: 'time', desc: 'Stepped playback at a frame rate', code: code('posterizeTime(12);', 'value') },

    { id: 'random-static', name: 'Random (static)', category: 'random', desc: 'A fixed random value per layer', code: code('seedRandom(index, true);', 'random(0, 100)') },
    { id: 'random-range', name: 'Random in range', category: 'random', desc: 'Random within a range each frame', code: 'random(0, 100)' },

    { id: 'inertia', name: 'Inertia / overshoot', category: 'physics', desc: 'Elastic settle after each keyframe', code: code(
      'freq = 3;',
      'decay = 5;',
      'n = 0;',
      'if (numKeys > 0) {',
      '  n = nearestKey(time).index;',
      '  if (key(n).time > time) { n--; }',
      '}',
      'if (n > 0) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  value + v * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t) / freq;',
      '} else {',
      '  value;',
      '}'
    ) },
    { id: 'bounce-floor', name: 'Bounce settle', category: 'physics', desc: 'Decaying bounce after a move', code: code(
      'amp = 0.12;',
      'freq = 2.5;',
      'decay = 4.0;',
      'n = 0;',
      'if (numKeys > 0) {',
      '  n = nearestKey(time).index;',
      '  if (key(n).time > time) { n--; }',
      '}',
      'if (n > 0) {',
      '  t = time - key(n).time;',
      '  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);',
      '  value + v * amp * Math.abs(Math.sin(freq * t * 2 * Math.PI)) / Math.exp(decay * t);',
      '} else {',
      '  value;',
      '}'
    ) },
    { id: 'smooth', name: 'Smooth', category: 'physics', desc: 'Temporal smoothing of the value', code: 'smooth(0.5, 5)' }
  ];

  // ---- Category sparkline (tile + detail visual) ---------------------------
  function spark(cat, w, h) {
    w = w || 56; h = h || 24;
    var mid = h / 2, pad = 3, iw = w - 2 * pad;
    var d = '', i, x, y, n = 28;
    function rnd(seed) { var s = Math.sin(seed * 12.9898) * 43758.5453; return s - Math.floor(s); }
    if (cat === 'wiggle') {
      for (i = 0; i <= n; i++) { x = pad + (i / n) * iw; y = mid + (rnd(i + 1) - 0.5) * (h - 2 * pad); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    } else if (cat === 'loop') {
      for (i = 0; i <= n; i++) { x = pad + (i / n) * iw; var ph = (i / n) * 3 % 1; y = (h - pad) - ph * (h - 2 * pad); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    } else if (cat === 'time') {
      d = 'M' + pad + ' ' + (h - pad) + 'L' + (w - pad) + ' ' + pad;
    } else if (cat === 'random') {
      var dots = [];
      for (i = 0; i < 9; i++) { x = pad + rnd(i + 3) * iw; y = pad + rnd(i + 7) * (h - 2 * pad); dots.push(svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.4, fill: 'var(--rb-accent)' })); }
      return svg('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h }, dots);
    } else { // physics: decaying sine
      for (i = 0; i <= n; i++) { var t = i / n; x = pad + t * iw; y = mid - Math.sin(t * 4 * Math.PI) * (mid - pad) * Math.exp(-2 * t); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
    }
    return svg('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h }, [
      svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.3, 'stroke-linejoin': 'round' })
    ]);
  }

  R.tools.register({
    id: 'expressions',
    title: 'Expressions',
    group: 'Generators',
    order: 1,
    keywords: ['expression', 'expressions', 'code', 'wiggle', 'loop', 'loopout', 'inertia', 'overshoot', 'random', 'snippet', 'library'],
    mount: mount
  });

  var CATS = [
    { value: 'all', label: 'All' },
    { value: 'wiggle', label: 'Wiggle' },
    { value: 'loop', label: 'Loop' },
    { value: 'time', label: 'Time' },
    { value: 'random', label: 'Random' },
    { value: 'physics', label: 'Physics' },
    { value: 'custom', label: 'Custom' }
  ];

  function loadCustom() { return R.disk.read('user-expressions', { schemaVersion: 1, items: [], seq: 0 }); }
  function saveCustom(data) { R.disk.write('user-expressions', data); }

  function mount(ctx) {
    var cat = 'all';
    var query = '';
    var selected = null;

    var searchInput = el('input', { type: 'text', placeholder: 'Search expressions…',
      oninput: function () { query = this.value.toLowerCase(); render(); } });

    // Wrapping category chips (segmented would overflow at seven options).
    var chipRow = el('div.rb-row', { style: { flexWrap: 'wrap', gap: '4px' } });
    var chipBtns = {};
    CATS.forEach(function (c) {
      var b = el('button.rb-btn.is-ghost', { onclick: function () { cat = c.value; syncChips(); render(); } }, [c.label]);
      chipBtns[c.value] = b;
      chipRow.appendChild(b);
    });
    function syncChips() { CATS.forEach(function (c) { chipBtns[c.value].classList.toggle('is-active', c.value === cat); }); }

    var grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: '6px' } });

    // Detail: code box + Apply / Copy.
    var codeBox = el('textarea', { readonly: 'readonly', spellcheck: 'false', style: {
      width: '100%', minHeight: '88px', resize: 'vertical', boxSizing: 'border-box',
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '11px', lineHeight: '1.45',
      color: 'var(--rb-text)', background: 'var(--rb-bg-sunken)', border: '1px solid var(--rb-border)',
      borderRadius: 'var(--rb-radius-2)', padding: '6px' } });
    var detailName = el('div.rb-section-label', { text: 'Pick an expression' });
    var applyBtn = el('button.rb-btn.is-primary.is-disabled', { onclick: doApply }, ['Apply']);
    var copyBtn = el('button.rb-btn.is-disabled', { onclick: doCopy }, ['Copy']);
    var detail = el('div.rb-col', { style: { gap: '6px' } }, [
      detailName, codeBox, el('div.rb-row', { style: { gap: '6px' } }, [applyBtn, copyBtn])
    ]);

    // New-expression form (collapsible).
    var newName = el('input', { type: 'text', placeholder: 'Name' });
    var newCode = el('textarea', { spellcheck: 'false', placeholder: 'transform.position + wiggle(1, 10)', style: {
      width: '100%', minHeight: '64px', resize: 'vertical', boxSizing: 'border-box',
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '11px', lineHeight: '1.45',
      color: 'var(--rb-text)', background: 'var(--rb-bg-sunken)', border: '1px solid var(--rb-border)',
      borderRadius: 'var(--rb-radius-2)', padding: '6px' } });
    var saveBtn = el('button.rb-btn', { onclick: doSave }, ['Save expression']);
    var newForm = el('details', null, [
      el('summary', { text: 'New expression', style: { cursor: 'pointer', color: 'var(--rb-text-muted)' } }),
      el('div.rb-col', { style: { gap: '6px', marginTop: '6px' } }, [newName, newCode, el('div.rb-row', null, [saveBtn])])
    ]);

    syncChips();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Apply a ready-made expression to the selected property, or save your own.' }),
      el('div.rb-search', null, [searchInput]),
      chipRow,
      grid,
      detail,
      newForm
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('span.rb-spacer'));
    ctx.footer.appendChild(el('button.rb-btn', { title: 'Strip Rebound-applied expressions from the selection', onclick: doRemove }, ['Remove']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function allSnippets() {
      var custom = (loadCustom().items || []).map(function (s) {
        return { id: s.id, name: s.name, category: 'custom', desc: 'Custom', code: s.code, builtin: false };
      });
      return BUILTIN.map(function (b) { var c = {}; for (var k in b) if (b.hasOwnProperty(k)) c[k] = b[k]; c.builtin = true; return c; }).concat(custom);
    }

    function visible() {
      return allSnippets().filter(function (s) {
        if (cat === 'custom' && s.builtin) return false;
        if (cat !== 'all' && cat !== 'custom' && s.category !== cat) return false;
        if (query) {
          var hay = (s.name + ' ' + (s.desc || '') + ' ' + s.code).toLowerCase();
          if (hay.indexOf(query) === -1) return false;
        }
        return true;
      });
    }

    function render() {
      R.dom.clear(grid);
      var list = visible();
      if (!list.length) {
        grid.appendChild(el('div.rb-empty', { style: { gridColumn: '1 / -1' } }, ['No expressions match.']));
        return;
      }
      list.forEach(function (s) { grid.appendChild(tile(s)); });
    }

    function tile(snippet) {
      var node = el('div.rb-tile', { title: snippet.name + (snippet.desc ? ' · ' + snippet.desc : ''),
        onclick: function () { select(snippet); } }, [
        spark(snippet.category, 56, 24),
        el('div.rb-tile-name', { text: snippet.name })
      ]);
      if (selected && selected.id === snippet.id) node.classList.add('is-active');
      if (!snippet.builtin) {
        node.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          if (typeof confirm !== 'function' || confirm('Delete expression "' + snippet.name + '"?')) removeCustom(snippet.id);
        });
      }
      return node;
    }

    function select(snippet) {
      selected = snippet;
      detailName.textContent = snippet.name;
      codeBox.value = snippet.code;
      applyBtn.classList.remove('is-disabled');
      copyBtn.classList.remove('is-disabled');
      render();
    }

    function doApply() {
      if (!selected) { ctx.toast('Pick an expression first', { kind: 'error' }); return; }
      ctx.invoke('expressions.apply', { code: selected.code })
        .then(function (res) {
          ctx.toast('Applied to ' + res.applied + ' propert' + (res.applied === 1 ? 'y' : 'ies'), { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply', { kind: 'error' }); });
    }

    function doCopy() {
      if (!selected) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(selected.code);
        else { codeBox.focus(); codeBox.select(); document.execCommand('copy'); }
        ctx.toast('Copied', { kind: 'info' });
      } catch (e) { ctx.toast('Could not copy', { kind: 'error' }); }
    }

    function doRemove() {
      ctx.invoke('expressions.remove', {})
        .then(function (res) { ctx.toast('Removed from ' + res.cleared + ' propert' + (res.cleared === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not remove', { kind: 'error' }); });
    }

    function doSave() {
      var name = (newName.value || '').trim();
      var body = (newCode.value || '').trim();
      if (!name) { ctx.toast('Name the expression', { kind: 'error' }); return; }
      if (!body) { ctx.toast('Write some code first', { kind: 'error' }); return; }
      var data = loadCustom();
      data.items = data.items || [];
      if (typeof data.seq !== 'number') data.seq = data.items.length;
      data.seq += 1;
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      data.items.push({ id: 'user-' + data.seq + '-' + slug, name: name, code: body });
      saveCustom(data);
      newName.value = ''; newCode.value = '';
      cat = 'custom'; syncChips();
      ctx.toast('Saved ' + name, { kind: 'success' });
      render();
    }

    function removeCustom(id) {
      var data = loadCustom();
      data.items = (data.items || []).filter(function (s) { return s.id !== id; });
      saveCustom(data);
      if (selected && selected.id === id) { selected = null; codeBox.value = ''; detailName.textContent = 'Pick an expression'; applyBtn.classList.add('is-disabled'); copyBtn.classList.add('is-disabled'); }
      ctx.toast('Expression deleted', { kind: 'info' });
      render();
    }

    render();
    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Select a property';
  }
})(window.Rebound = window.Rebound || {});
