/*
 * Rebound, Gradient tool.
 * A multi-stop gradient editor (Figma-style) applied to the selected shape
 * layers: build any number of color stops, choose linear or radial and an angle,
 * preview it live on a shape and on text, then fill every shape group.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  // '#rrggbb' to a 0..1 RGB triplet for the host.
  function hexToRgb01(hex) {
    var h = ('' + hex).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  var DEFAULT = { type: 'linear', angle: 0, stops: [{ pos: 0, color: '#1e63ff' }, { pos: 1, color: '#16e0c0' }] };

  R.tools.register({
    id: 'gradient',
    title: 'Gradient',
    group: 'Color',
    order: 3,
    keywords: ['gradient', 'ramp', 'fill', 'linear', 'radial', 'blend', 'shape', 'stops', 'multi'],
    mount: mount
  });

  function mount(ctx) {
    var editor = R.ui.gradientEditor({ value: DEFAULT });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Build a multi-stop gradient and fill the selected shape layers. Click the bar to add a stop, drag to move it, select one to recolor or reposition. Non-shape layers are skipped.' }),
      editor.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      var m = editor.getValue();
      var L = R.ui.gradientLineOf(m); // the dragged line endpoints (may sit outside the box)
      var angle = Math.atan2(L.b.y - L.a.y, L.b.x - L.a.x) * 180 / Math.PI;
      ctx.invoke('gradient.apply', {
        type: m.type,
        angle: angle,
        start: L.a,
        end: L.b,
        stops: m.stops.map(function (s) { return { pos: s.pos, color: hexToRgb01(s.color) }; })
      })
        .then(function (res) {
          if (!res.applied) ctx.toast('No shape layers to fill', { kind: 'info' });
          else ctx.toast('Filled ' + res.applied + ' shape layer' + (res.applied === 1 ? '' : 's') + (res.skipped ? ' (' + res.skipped + ' skipped)' : ''), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not add gradient', { kind: 'error' }); });
    }

    return {
      presets: {
        toolId: 'gradient',
        get: function () { return editor.getValue(); },
        set: function (s) { editor.setValue(s); },
        thumbFor: function (state, opts) {
          return el('div', { style: { height: ((opts && opts.height) || 38) + 'px', borderRadius: 'var(--rb-radius-1)', background: R.ui.gradientCss(state) } });
        },
        defaults: [
          { name: 'Ocean', state: { type: 'linear', angle: 0, stops: [{ pos: 0, color: '#1e63ff' }, { pos: 1, color: '#16e0c0' }] } },
          { name: 'Sunset', state: { type: 'linear', angle: 0, stops: [{ pos: 0, color: '#ff5e3a' }, { pos: 0.5, color: '#ff2d75' }, { pos: 1, color: '#ffd166' }] } },
          { name: 'Grape', state: { type: 'radial', angle: 0, stops: [{ pos: 0, color: '#f72fb0' }, { pos: 1, color: '#7b2ff7' }] } },
          { name: 'Spectrum', state: { type: 'linear', angle: 0, stops: [{ pos: 0, color: '#e5534b' }, { pos: 0.33, color: '#e8a838' }, { pos: 0.66, color: '#22b07d' }, { pos: 1, color: '#4990e2' }] } },
          { name: 'Mono Fade', state: { type: 'linear', angle: 0, stops: [{ pos: 0, color: '#ffffff' }, { pos: 1, color: '#222222' }] } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select shape layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
