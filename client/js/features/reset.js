/*
 * Rebound, Reset tool.
 * Restores selected layers' transform properties to their defaults: position to
 * the composition center, scale to 100%, rotation to 0, opacity to 100%, and
 * anchor to the layer's bounding-box center. Each axis has its own toggle, and
 * a single "Reset all" applies every enabled reset at once.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A faint "current" layer (offset, tilted, enlarged, dim) and the "reset"
  // target. Each enabled toggle pulls one property to its default, so toggling
  // Rotation straightens the target, Position centers it, and so on.
  function resetSvg(state, h) {
    var W = 160, H = 100, cx = W / 2, cy = H / 2;
    var gx = cx - 22, gy = cy + 12;
    var ax = state.position ? cx : gx;
    var ay = state.position ? cy : gy;
    var rot = state.rotation ? 0 : 16;
    var sc = state.scale ? 1 : 1.25;
    var op = state.opacity ? 0.95 : 0.45;
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('g', { transform: 'translate(' + gx + ',' + gy + ') rotate(16) scale(1.25)', opacity: '0.3' }, [
        svg('rect', { x: -22, y: -12, width: 44, height: 24, rx: 3, fill: 'var(--rb-text-faint)' })
      ]),
      svg('g', { transform: 'translate(' + ax + ',' + ay + ') rotate(' + rot + ') scale(' + sc + ')', opacity: String(op) }, [
        svg('rect', { x: -22, y: -12, width: 44, height: 24, rx: 3, fill: 'var(--rb-accent)' }),
        svg('circle', { cx: state.anchor ? 0 : -18, cy: state.anchor ? 0 : -9, r: 2.6, fill: '#fff' })
      ])
    ]);
  }

  R.tools.register({
    id: 'reset',
    title: 'Reset',
    group: 'Transform',
    order: 1,
    keywords: ['reset', 'default', 'position', 'scale', 'rotation', 'opacity', 'anchor', 'center', 'restore', 'transform'],
    mount: mount
  });

  function mount(ctx) {
    var position = true;
    var scale = true;
    var rotation = true;
    var opacity = true;
    var anchor = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(resetSvg({ position: position, scale: scale, rotation: rotation, opacity: opacity, anchor: anchor }, 100)); }

    var positionToggle = ui.toggle({ label: 'Position (comp center)', value: position,
      onChange: function (v) { position = v; renderPreview(); } });
    var scaleToggle = ui.toggle({ label: 'Scale (100%)', value: scale,
      onChange: function (v) { scale = v; renderPreview(); } });
    var rotationToggle = ui.toggle({ label: 'Rotation (0°)', value: rotation,
      onChange: function (v) { rotation = v; renderPreview(); } });
    var opacityToggle = ui.toggle({ label: 'Opacity (100%)', value: opacity,
      onChange: function (v) { opacity = v; renderPreview(); } });
    var anchorToggle = ui.toggle({ label: 'Anchor (bbox center)', value: anchor,
      onChange: function (v) { anchor = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Restores the enabled transform properties to their defaults. Properties that are keyframed or expression-driven are left untouched.' }),
      previewHost,
      positionToggle.el,
      scaleToggle.el,
      rotationToggle.el,
      opacityToggle.el,
      anchorToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doResetAll }, ['Reset all']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function run(opts) {
      ctx.invoke('reset.apply', opts)
        .then(function (res) {
          ctx.toast('Reset ' + res.reset + ' layer' + (res.reset === 1 ? '' : 's'),
            { kind: res.reset ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not reset', { kind: 'error' }); });
    }

    function doApply() {
      if (!position && !scale && !rotation && !opacity && !anchor) {
        ctx.toast('Enable a property to reset', { kind: 'info' });
        return;
      }
      run({ position: position, scale: scale, rotation: rotation, opacity: opacity, anchor: anchor });
    }

    function doResetAll() {
      run({ position: true, scale: true, rotation: true, opacity: true, anchor: true });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to reset';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});