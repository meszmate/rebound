/*
 * Rebound, Rename tool.
 * Batch-renames the selected layers: an optional new base name, a literal
 * find/replace, prefix/suffix, and sequential numbering. A live preview shows
 * how a few sample names would come out and reacts to every control.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Sample names used by the live preview when we cannot read the real layers.
  var SAMPLES = ['Background', 'Shape', 'Title'];

  function pad(n, width) {
    var s = '' + Math.abs(Math.round(n));
    while (s.length < width) s = '0' + s;
    return (n < 0 ? '-' : '') + s;
  }

  function makeName(orig, st, i) {
    var core = st.base ? st.base : orig;
    if (st.find) core = core.split(st.find).join(st.replace || '');
    var name = (st.prefix || '') + core;
    if (st.number) name += pad((st.start || 0) + i, Math.max(1, st.padding || 1));
    name += (st.suffix || '');
    return name || orig;
  }

  // A schematic of the output name shape: prefix and number blocks in accent,
  // the core name neutral, so each preset thumbnail reads differently.
  function renameThumb(st, h) {
    var segs = [];
    var x = 6;
    function seg(w, accent) { segs.push(svg('rect', { x: x, y: 11, width: w, height: 8, rx: 2, fill: accent ? 'var(--rb-accent)' : 'var(--rb-text-faint)', 'fill-opacity': accent ? '0.9' : '0.5' })); x += w + 3; }
    if (st.prefix) seg(8, true);
    seg(st.base ? 20 : 26, false);
    if (st.find) seg(6, false);
    if (st.number) seg(10, true);
    if (st.suffix) seg(8, true);
    return svg('svg', { viewBox: '0 0 120 30', width: '100%', height: h }, segs);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var RENAME_DEFAULTS = [
    { name: 'Sequence', state: { base: 'Layer ', prefix: '', suffix: '', find: '', replace: '', number: true, start: 1, padding: 2 } },
    { name: 'Underscore', state: { base: '', prefix: '', suffix: '', find: ' ', replace: '_', number: false, start: 1, padding: 2 } },
    { name: 'Prefix BG', state: { base: '', prefix: 'BG_', suffix: '', find: '', replace: '', number: false, start: 1, padding: 2 } },
    { name: 'Versioned', state: { base: '', prefix: '', suffix: '_v01', find: '', replace: '', number: false, start: 1, padding: 2 } }
  ];
  R.toolPresets.declare('rename', { defaults: RENAME_DEFAULTS });

  R.tools.register({
    id: 'rename',
    title: 'Rename',
    group: 'Organize',
    order: 4,
    keywords: ['rename', 'batch', 'name', 'number', 'sequence', 'prefix', 'suffix', 'find', 'replace', 'organize'],
    mount: mount
  });

  function field(placeholder, onInput) {
    var input = el('input', { type: 'text', value: '', placeholder: placeholder, 'aria-label': placeholder,
      spellcheck: 'false', oninput: function () { onInput(input.value); } });
    var root = el('div.rb-field.rb-field-text', null, [input]);
    return { el: root, get: function () { return input.value; }, set: function (v) { input.value = v == null ? '' : v; } };
  }

  function mount(ctx) {
    var st = { base: '', find: '', replace: '', prefix: '', suffix: '', number: false, start: 1, padding: 2 };

    var liveNames = null; // real selected layer names (top-to-bottom), or null

    function currentNames() { return (liveNames && liveNames.length) ? liveNames : SAMPLES; }

    function updateNames(sel) {
      if (sel && sel.hasComp && sel.layers && sel.layers.length) {
        liveNames = sel.layers.slice().sort(function (a, b) { return a.index - b.index; }).map(function (l) { return l.name; });
      } else {
        liveNames = null;
      }
    }

    // How many of the current names the pattern would actually change. With
    // real layer names this is exact; with the sample names it is only used
    // via isIdentity() below, so a find that misses the samples cannot
    // wrongly disable the button.
    function changedCount() {
      var names = currentNames();
      var n = 0;
      for (var i = 0; i < names.length; i++) {
        if (makeName(names[i], st, i) !== names[i]) n++;
      }
      return n;
    }
    // A pattern that can never change any name, whatever the layers are called.
    function isIdentity() {
      return !st.base && !st.find && !st.prefix && !st.suffix && !st.number;
    }

    var previewHost = el('div.rb-rename-preview');
    function renderPreview() {
      R.dom.clear(previewHost);
      var names = currentNames();
      var max = 8;
      if (!liveNames) previewHost.appendChild(el('div.rb-faint', { text: 'Examples (select layers to preview the real names):' }));
      for (var i = 0; i < Math.min(names.length, max); i++) {
        var next = makeName(names[i], st, i);
        var row = el('div.rb-rename-row', null, [
          el('span.rb-rename-old', { text: names[i] }),
          el('span.rb-rename-arrow', { text: '→' }),
          el('span.rb-rename-new', { text: next })
        ]);
        if (next === names[i]) { // unchanged: gray the row out
          row.style.opacity = '0.45';
          row.title = 'Unchanged';
        }
        previewHost.appendChild(row);
      }
      if (names.length > max) previewHost.appendChild(el('div.rb-faint', { text: 'and ' + (names.length - max) + ' more' }));
      syncApply();
    }

    var baseF = field('New base name (keeps original if blank)', function (v) { st.base = v; renderPreview(); });
    var findF = field('Find', function (v) { st.find = v; renderPreview(); });
    var replaceF = field('Replace', function (v) { st.replace = v; renderPreview(); });
    var prefixF = field('Prefix', function (v) { st.prefix = v; renderPreview(); });
    var suffixF = field('Suffix', function (v) { st.suffix = v; renderPreview(); });

    var numberTog = ui.toggle({ label: 'Add a number', value: st.number, onChange: function (v) { st.number = v; renderPreview(); } });
    var startF = ui.numberField({ label: 'Start', value: st.start, min: -9999, max: 9999, step: 1, decimals: 0, onChange: function (v) { st.start = v; renderPreview(); } });
    var padF = ui.numberField({ label: 'Digits', value: st.padding, min: 1, max: 6, step: 1, decimals: 0, onChange: function (v) { st.padding = v; renderPreview(); } });

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Renames every selected layer. Numbering runs top-to-bottom.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Name' }),
      baseF.el,
      el('div.rb-row.rb-wrap', null, [findF.el, replaceF.el]),
      el('div.rb-section-label', { text: 'Affixes' }),
      el('div.rb-row.rb-wrap', null, [prefixF.el, suffixF.el]),
      el('div.rb-section-label', { text: 'Numbering' }),
      numberTog.el,
      el('div.rb-row.rb-wrap', null, [startF.el, padF.el])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Rename']);
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(applyBtn);
    var curSel = null;
    function setEnabled(sel) {
      curSel = sel;
      syncApply();
    }
    // Rename is enabled only with layers selected AND a pattern that would
    // actually change at least one name (exact against the live names,
    // identity-only against the samples).
    function syncApply() {
      if (!applyBtn) return; // preview renders before the footer exists
      var ok = !!(curSel && curSel.hasComp && curSel.selectedLayerCount > 0) &&
        (liveNames ? changedCount() > 0 : !isIdentity());
      applyBtn.disabled = !ok;
      applyBtn.classList.toggle('is-disabled', !ok);
    }

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); updateNames(sel); setEnabled(sel); renderPreview(); });
    var initSel = ctx.getSelection();
    scopeText.textContent = describe(initSel);
    updateNames(initSel);
    setEnabled(initSel);
    renderPreview();

    function doApply() {
      ctx.invoke('rename.apply', st)
        .then(function (res) {
          // The host counts (and touches) only real changes, so this is honest.
          ctx.toast(res.renamed
            ? 'Renamed ' + res.renamed + ' layer' + (res.renamed === 1 ? '' : 's')
            : 'No names changed', { kind: res.renamed ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not rename', { kind: 'error' }); });
    }

    function getState() { return { base: st.base, find: st.find, replace: st.replace, prefix: st.prefix, suffix: st.suffix, number: st.number, start: st.start, padding: st.padding }; }
    function applyState(s) {
      if (!s) return;
      st.base = s.base || ''; baseF.set(st.base);
      st.find = s.find || ''; findF.set(st.find);
      st.replace = s.replace || ''; replaceF.set(st.replace);
      st.prefix = s.prefix || ''; prefixF.set(st.prefix);
      st.suffix = s.suffix || ''; suffixF.set(st.suffix);
      st.number = !!s.number; numberTog.set(st.number);
      if (s.start != null) { st.start = s.start; startF.set(s.start); }
      if (s.padding != null) { st.padding = s.padding; padF.set(s.padding); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'rename',
        get: getState,
        set: applyState,
        thumbFor: function (s, opts) { return renameThumb(s, (opts && opts.height) || 30); },
        defaults: RENAME_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rename';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
