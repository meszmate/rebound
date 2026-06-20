/*
 * Rebound — Reset tool.
 * Restores selected layers' transform properties to their defaults: position to
 * the composition center, scale to 100%, rotation to 0, opacity to 100%, and
 * anchor to the layer's bounding-box center. Each axis has its own toggle, and
 * a single "Reset all" applies every enabled reset at once.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

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

    var positionToggle = ui.toggle({ label: 'Position (comp center)', value: position,
      onChange: function (v) { position = v; } });
    var scaleToggle = ui.toggle({ label: 'Scale (100%)', value: scale,
      onChange: function (v) { scale = v; } });
    var rotationToggle = ui.toggle({ label: 'Rotation (0°)', value: rotation,
      onChange: function (v) { rotation = v; } });
    var opacityToggle = ui.toggle({ label: 'Opacity (100%)', value: opacity,
      onChange: function (v) { opacity = v; } });
    var anchorToggle = ui.toggle({ label: 'Anchor (bbox center)', value: anchor,
      onChange: function (v) { anchor = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Restores the enabled transform properties to their defaults. Properties that are keyframed or expression-driven are left untouched.' }),
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