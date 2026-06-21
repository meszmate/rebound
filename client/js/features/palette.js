/*
 * Rebound, Palette tool.
 * A premium palette shelf: curated built-in palettes and your saved ones as
 * accordion cards with full-bleed swatch bars. Open a card to apply individual
 * colors (with hover hex + copy), inspect the focused color, and edit / build
 * palettes in a modal. Click a color to recolor the selected layers' fill,
 * stroke, or both.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  var BUILTIN = [
    { name: 'Spectrum', colors: ['#4990e2', '#7c5cff', '#22b07d', '#e8a838', '#e5534b', '#e06cc4'] },
    { name: 'Warm', colors: ['#f4a259', '#f25c54', '#e63946', '#bc4749', '#7f5539', '#ffba08'] },
    { name: 'Cool', colors: ['#118ab2', '#073b4c', '#06d6a0', '#4cc9f0', '#3a0ca3', '#4361ee'] },
    { name: 'Mono', colors: ['#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#111111'] },
    { name: 'Pastel', colors: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bdb2ff'] },
    { name: 'Neon', colors: ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff', '#06ffa5'] },
    { name: 'Earth', colors: ['#582f0e', '#7f4f24', '#936639', '#a68a64', '#b6ad90', '#c2c5aa'] },
    { name: 'Ocean', colors: ['#03045e', '#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#caf0f8'] },
    { name: 'Forest', colors: ['#081c15', '#1b4332', '#2d6a4f', '#40916c', '#74c69d', '#b7e4c7'] },
    { name: 'Sunset', colors: ['#03071e', '#370617', '#9d0208', '#dc2f02', '#f48c06', '#ffba08'] },
    { name: 'Twilight', colors: ['#10002b', '#240046', '#5a189a', '#7b2cbf', '#9d4edd', '#c77dff'] },
    { name: 'Candy', colors: ['#ff5d8f', '#ff8fab', '#ffb3c6', '#fb6f92', '#f15bb5', '#ffc2d1'] },
    { name: 'Slate', colors: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#a9b4c2', '#e0e1dd'] },
    { name: 'Mango', colors: ['#ff7b00', '#ff8800', '#ff9500', '#ffa200', '#ffb700', '#ffd000'] }
  ];

  R.tools.register({
    id: 'palette',
    title: 'Palette',
    group: 'Color',
    order: 1,
    keywords: ['palette', 'colors', 'swatch', 'scheme', 'theme', 'recolor'],
    mount: mount
  });

  function loadCustom() { return R.disk.read('palettes', { schemaVersion: 1, items: [] }); }
  function saveCustom(data) { R.disk.write('palettes', data); }

  function normHex(h) {
    h = ('' + h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return '#' + h.toLowerCase();
  }
  function hexToRgb01(hex) { var r = hexToRgb255(hex); return [r[0] / 255, r[1] / 255, r[2] / 255]; }
  function hexToRgb255(hex) { var h = normHex(hex).substring(1); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function isHex(h) { return /^#?[0-9a-f]{6}$/i.test(h) || /^#?[0-9a-f]{3}$/i.test(h); }

  // A sample shape painted the way the current Target (fill / stroke / both)
  // would recolor: filled accent when fill is included, an accent outline when
  // stroke is included.
  function paletteTargetSvg(target) {
    var hasFill = target === 'fill' || target === 'both';
    var hasStroke = target === 'stroke' || target === 'both';
    return svg('svg', { viewBox: '0 0 44 28', width: 44, height: 28, style: 'flex:none' }, [
      svg('rect', { x: hasStroke ? 3 : 2, y: hasStroke ? 3 : 2, width: hasStroke ? 38 : 40, height: hasStroke ? 22 : 24, rx: 5,
        fill: hasFill ? 'var(--rb-accent)' : 'none', 'fill-opacity': hasFill ? '0.85' : '0',
        stroke: hasStroke ? 'var(--rb-accent)' : 'none', 'stroke-width': hasStroke ? 3 : 0 })
    ]);
  }

  function chevSvg() { return svg('svg', { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [svg('path', { d: 'M9 6l6 6-6 6' })]); }
  function pencilSvg() { return svg('svg', { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [svg('path', { d: 'M4 20h4L18 10l-4-4L4 16z' }), svg('path', { d: 'M13 7l4 4' })]); }
  function plusSvg() { return svg('svg', { viewBox: '0 0 24 24', width: 13, height: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }, [svg('path', { d: 'M12 5v14M5 12h14' })]); }
  function copySvg() { return svg('svg', { viewBox: '0 0 24 24', width: 11, height: 11, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [svg('rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }), svg('path', { d: 'M5 15V5a2 2 0 0 1 2-2h10' })]); }

  function mount(ctx) {
    var target = 'fill';
    var openId = null;
    var lastAppliedId = null;

    var targetPrevHost = el('div', { style: { display: 'inline-flex', alignItems: 'center' } });
    function renderTargetPreview() { R.dom.clear(targetPrevHost); targetPrevHost.appendChild(paletteTargetSvg(target)); }

    var targetCtl = R.ui.segmented([
      { value: 'fill', label: 'Fill', title: 'Recolor fills and solids.' },
      { value: 'stroke', label: 'Stroke', title: 'Recolor shape strokes.' },
      { value: 'both', label: 'Both', title: 'Recolor fills and strokes.' }
    ], { value: target, onChange: function (v) { target = v; renderTargetPreview(); } });

    renderTargetPreview();
    var shelf = el('div.rb-palette-shelf');
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Tap a palette to open it, then tap a color to recolor the selection.' }),
      el('div.rb-palette-bartop', null, [el('div.rb-row', { style: { alignItems: 'center', gap: '8px' } }, [targetCtl.el, targetPrevHost])]),
      shelf
    ]));

    function copyHex(hex) {
      var h = normHex(hex).toUpperCase();
      var ta = document.createElement('textarea');
      ta.value = h; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ctx.toast(ok ? 'Copied ' + h : 'Could not copy', { kind: ok ? 'success' : 'error' });
    }

    function applyColor(hex, idAttr, sw) {
      lastAppliedId = idAttr;
      var cards = shelf.querySelectorAll('.rb-palette-card.is-active');
      for (var i = 0; i < cards.length; i++) cards[i].classList.remove('is-active');
      var card = sw.closest ? sw.closest('.rb-palette-card') : null;
      if (card) card.classList.add('is-active');
      sw.classList.add('is-applied');
      sw.addEventListener('animationend', function done() { sw.classList.remove('is-applied'); sw.removeEventListener('animationend', done); });
      ctx.invoke('color.apply', { rgb: hexToRgb01(hex), target: target })
        .then(function (res) { ctx.toast('Colored ' + res.colored + ' layer' + (res.colored === 1 ? '' : 's'), { kind: res.colored ? 'success' : 'info' }); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply color', { kind: 'error' }); });
    }

    function buildCard(pal, idAttr, isCustom, customIdx) {
      var open = openId === idAttr;
      var detail = null, setFocus = function () {};

      if (open) {
        var curFocus = pal.colors[0];
        var preview = el('div.rb-detail-preview');
        var hexEl = el('span.rb-detail-hex', { text: '' });
        var rgbEl = el('span.rb-detail-rgb', { text: '' });
        setFocus = function (hex) {
          curFocus = normHex(hex);
          preview.style.background = curFocus;
          hexEl.textContent = curFocus.toUpperCase();
          var r = hexToRgb255(curFocus);
          rgbEl.textContent = 'R ' + r[0] + '  G ' + r[1] + '  B ' + r[2];
        };
        var detailKids = [
          preview,
          el('div.rb-detail-meta', null, [hexEl, rgbEl]),
          el('div.rb-row', null, [el('button.rb-btn.is-ghost', { onclick: function () { copyHex(curFocus); } }, ['Copy'])])
        ];
        if (isCustom) detailKids.push(el('button.rb-btn.is-ghost', { onclick: function () { buildModal(pal, customIdx); } }, ['Edit palette']));
        detail = el('div.rb-palette-detail', null, detailKids);
        setFocus(pal.colors[0]);
      }

      var bar = el('div.rb-palette-bar');
      if (!open) bar.onclick = function () { toggle(idAttr); };
      pal.colors.forEach(function (hex) {
        var sw = el('button.rb-swatch', { style: { background: hex }, 'aria-label': pal.name + ' ' + hex.toUpperCase() }, [
          el('span.rb-swatch-tip', { text: hex.toUpperCase() }),
          el('button.rb-swatch-copy', { title: 'Copy hex', onclick: function (e) { e.stopPropagation(); copyHex(hex); } }, [copySvg()])
        ]);
        if (open) {
          sw.addEventListener('mouseenter', function () { setFocus(hex); });
          sw.addEventListener('click', function () { setFocus(hex); applyColor(hex, idAttr, sw); });
        }
        bar.appendChild(sw);
      });

      var chev = el('button.rb-palette-chev', { 'aria-expanded': open ? 'true' : 'false', title: open ? 'Collapse' : 'Expand', onclick: function (e) { e.stopPropagation(); toggle(idAttr); } }, [chevSvg()]);
      var actions = isCustom ? el('div.rb-palette-actions', null, [
        el('button.rb-btn.is-ghost.is-icon', { title: 'Edit palette', onclick: function (e) { e.stopPropagation(); buildModal(pal, customIdx); } }, [pencilSvg()]),
        el('button.rb-btn.is-ghost.is-icon.rb-palette-del', { title: 'Delete palette', 'aria-label': 'Delete ' + pal.name, onclick: function (e) { e.stopPropagation(); removeCustom(customIdx, pal); } }, ['×'])
      ]) : null;
      var foot = el('div.rb-palette-foot', { onclick: function () { toggle(idAttr); } }, [chev, el('span.rb-palette-name.rb-grow', { text: pal.name }), el('span.rb-palette-count.rb-faint', { text: String(pal.colors.length) }), actions]);

      var cls = 'div.rb-palette-card' + (open ? '.is-open' : '') + (lastAppliedId === idAttr ? '.is-active' : '');
      return el(cls, null, [bar, foot, detail]);
    }

    function render() {
      R.dom.clear(shelf);
      shelf.appendChild(el('div.rb-section-label', { text: 'Built-in' }));
      BUILTIN.forEach(function (p) { shelf.appendChild(buildCard(p, 'b:' + p.name, false, null)); });
      var cust = (loadCustom().items) || [];
      if (cust.length) {
        shelf.appendChild(el('div.rb-section-label', { text: 'Yours' }));
        cust.forEach(function (p, i) { shelf.appendChild(buildCard(p, 'c:' + i, true, i)); });
      }
      shelf.appendChild(el('button.rb-palette-new', { onclick: function () { buildModal(null, null); } }, [plusSvg(), 'New palette']));
    }
    function toggle(id) { openId = (openId === id ? null : id); render(); }

    function removeCustom(idx, pal) {
      var data = loadCustom();
      var removed = data.items.splice(idx, 1)[0];
      saveCustom(data);
      if (openId === 'c:' + idx) openId = null;
      render();
      ctx.toast('Deleted ' + pal.name, { kind: 'info', action: 'Undo', onAction: function () {
        var d = loadCustom(); d.items.splice(idx, 0, removed); saveCustom(d); render();
      } });
    }

    function buildModal(existing, index) {
      var rows = [];
      var rowsHost = el('div.rb-palette-edit-rows');
      var preview = el('div.rb-palette-edit-preview');
      var hint = el('div.rb-savedlg-hint', { text: '' });
      var nameInput, saveBtn;

      function validColors() {
        return rows.map(function (r) { return r.hi.value; }).filter(isHex).map(normHex);
      }
      function refresh() {
        var cols = validColors();
        R.dom.clear(preview);
        cols.forEach(function (c) { preview.appendChild(el('span', { style: { background: c } })); });
        var nInvalid = rows.length - cols.length;
        hint.classList.remove('is-error', 'is-warn');
        if (!cols.length) { hint.classList.add('is-warn'); hint.textContent = 'Add at least one color'; }
        else if (nInvalid) { hint.classList.add('is-error'); hint.textContent = 'Fix ' + nInvalid + ' invalid color' + (nInvalid === 1 ? '' : 's'); }
        else hint.textContent = cols.length + ' colors';
        if (saveBtn) saveBtn.disabled = !((nameInput && nameInput.value.trim()) && cols.length);
      }
      function makeRow(hex) {
        var ci = el('input.rb-color-input', { type: 'color', value: normHex(hex) });
        var hi = el('input.rb-savedlg-input', { type: 'text', spellcheck: 'false', value: normHex(hex) });
        var r = { ci: ci, hi: hi, row: null };
        ci.addEventListener('input', function () { hi.value = ci.value; hi.classList.remove('is-invalid'); refresh(); });
        hi.addEventListener('input', function () { if (isHex(hi.value)) { hi.classList.remove('is-invalid'); ci.value = normHex(hi.value); } else hi.classList.add('is-invalid'); refresh(); });
        hi.addEventListener('keydown', function (e) { if (e.key === 'Enter' && rows[rows.length - 1] === r && rows.length < 10) { addRow('#888888'); } });
        var del = el('button.rb-btn.is-ghost.is-icon', { title: 'Remove color', onclick: function () { if (rows.length > 1) { var i = rows.indexOf(r); rows.splice(i, 1); rowsHost.removeChild(r.row); refresh(); } } }, ['×']);
        r.row = el('div.rb-palette-edit-row', null, [ci, hi, del]);
        return r;
      }
      function addRow(hex) { var r = makeRow(hex); rows.push(r); rowsHost.appendChild(r.row); refresh(); }
      function pasteList() {
        function fill(text) {
          var hs = ('' + (text || '')).split(/[\s,]+/).filter(isHex);
          if (!hs.length) { ctx.toast('No hex colors on the clipboard', { kind: 'info' }); return; }
          rows.slice().forEach(function (r) { rowsHost.removeChild(r.row); });
          rows.length = 0;
          hs.slice(0, 10).forEach(function (h) { addRow(h); });
        }
        try { if (navigator.clipboard && navigator.clipboard.readText) { navigator.clipboard.readText().then(fill, function () { ctx.toast('Clipboard not available', { kind: 'info' }); }); return; } } catch (e) { /* fall through */ }
        ctx.toast('Clipboard not available', { kind: 'info' });
      }

      (existing ? existing.colors : ['#888888', '#888888', '#888888', '#888888', '#888888']).forEach(function (h) { addRow(h); });

      nameInput = el('input.rb-savedlg-input', { type: 'text', 'data-autofocus': '1', spellcheck: 'false', placeholder: 'e.g. Sunset', value: existing ? existing.name : '', oninput: refresh });

      var body = el('div.rb-savedlg', null, [
        el('div.rb-savedlg-field', null, [el('span.rb-savedlg-label', { text: 'Name' }), nameInput]),
        el('div.rb-savedlg-field', null, [
          el('span.rb-savedlg-label', { text: 'Colors' }),
          rowsHost,
          el('div.rb-row', null, [
            el('button.rb-btn.is-ghost', { onclick: function () { if (rows.length < 10) addRow('#888888'); } }, ['+ Add color']),
            el('button.rb-btn.is-ghost', { onclick: pasteList }, ['Paste hex list'])
          ]),
          preview,
          hint
        ])
      ]);

      var cancelBtn = el('button.rb-btn.is-ghost', { onclick: function () { dlg.close('close'); } }, ['Cancel']);
      saveBtn = el('button.rb-btn.is-primary', { onclick: doSave }, [existing ? 'Save' : 'Create']);
      var dlg = R.ui.modal({ title: existing ? 'Edit palette' : 'New palette', width: 360, className: 'rb-modal-save', body: body, footer: [cancelBtn, saveBtn], initialFocus: nameInput });

      function doSave() {
        var nm = nameInput.value.trim();
        var cols = validColors();
        if (!nm || !cols.length) { refresh(); return; }
        var data = loadCustom();
        data.items = data.items || [];
        if (index != null) data.items[index] = { name: nm, colors: cols, builtin: false };
        else data.items.push({ name: nm, colors: cols, builtin: false });
        saveCustom(data);
        dlg.close('confirm');
        render();
        ctx.toast('Saved “' + nm + '”', { kind: 'success' });
      }

      refresh();
    }

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected'
        : 'Open a composition';
    });

    render();
    return { destroy: off };
  }
})(window.Rebound = window.Rebound || {});
