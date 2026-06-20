/*
 * Rebound — Palette tool.
 * Curated and custom color palettes; click a swatch to recolor the selected
 * layers (reusing the Color command). Custom palettes persist as JSON.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  var BUILTIN = [
    { name: 'Spectrum', colors: ['#4990e2', '#7c5cff', '#22b07d', '#e8a838', '#e5534b', '#e06cc4'] },
    { name: 'Warm', colors: ['#f4a259', '#f25c54', '#e63946', '#bc4749', '#7f5539', '#ffba08'] },
    { name: 'Cool', colors: ['#118ab2', '#073b4c', '#06d6a0', '#4cc9f0', '#3a0ca3', '#4361ee'] },
    { name: 'Mono', colors: ['#ffffff', '#cccccc', '#999999', '#666666', '#333333', '#111111'] }
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

  function mount(ctx) {
    var wrap = el('div.rb-col');
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Click a swatch to recolor the selected layers (shape fills, solids, or a Fill effect).' }),
      wrap
    ]));

    function palettes() {
      return BUILTIN.concat((loadCustom().items) || []);
    }

    function render() {
      R.dom.clear(wrap);
      palettes().forEach(function (pal, idx) {
        var row = el('div.rb-row', { style: { gap: '4px', alignItems: 'center' } });
        pal.colors.forEach(function (hex) {
          row.appendChild(el('button.rb-btn.is-icon', {
            style: { background: hex, borderColor: hex },
            title: hex,
            onclick: function () { applyColor(hex); }
          }, ['']));
        });
        var del = pal.builtin === false ? el('button.rb-btn.is-ghost.is-icon', {
          title: 'Delete palette', onclick: function () { removeCustom(idx); }
        }, ['×']) : null;
        wrap.appendChild(el('div.rb-col', { style: { gap: '2px', marginBottom: '8px' } }, [
          el('div.rb-row', null, [el('span.rb-faint.rb-grow', { text: pal.name }), del]),
          row
        ]));
      });
      wrap.appendChild(el('button.rb-btn.is-ghost', { onclick: addCustom }, ['+ Save palette from hex list']));
    }

    function addCustom() {
      var input = typeof prompt === 'function'
        ? prompt('Palette: name then colors, e.g.  Sunset #f4a259 #e63946 #3a0ca3')
        : null;
      if (!input) return;
      var parts = input.trim().split(/\s+/);
      var name = parts[0].charAt(0) === '#' ? 'Custom' : parts.shift();
      var colors = parts.filter(function (p) { return /^#?[0-9a-f]{6}$/i.test(p); })
        .map(function (p) { return p.charAt(0) === '#' ? p : '#' + p; });
      if (!colors.length) { ctx.toast('No valid hex colors found', { kind: 'error' }); return; }
      var data = loadCustom();
      data.items = data.items || [];
      data.items.push({ name: name, colors: colors, builtin: false });
      saveCustom(data);
      render();
      ctx.toast('Saved palette "' + name + '"', { kind: 'success' });
    }

    function removeCustom(displayIdx) {
      var data = loadCustom();
      var customIdx = displayIdx - BUILTIN.length;
      if (customIdx < 0) return;
      data.items.splice(customIdx, 1);
      saveCustom(data);
      render();
    }

    function applyColor(hex) {
      var rgb = hexToRgb01(hex);
      ctx.invoke('color.apply', { rgb: rgb })
        .then(function (res) { ctx.toast('Colored ' + res.colored + ' layer' + (res.colored === 1 ? '' : 's'), { kind: 'success' }); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply color', { kind: 'error' }); });
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

  function hexToRgb01(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return [1, 1, 1];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
})(window.Rebound = window.Rebound || {});
