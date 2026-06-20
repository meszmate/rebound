/*
 * Rebound — Radial tool.
 * Duplicates each selected layer into a ring of copies arranged around the
 * layer's own position, optionally rotating each copy to face outward.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'radial',
    title: 'Radial',
    group: 'Generators',
    order: 1,
    keywords: ['radial', 'ring', 'circle', 'array', 'around', 'duplicate', 'clone', 'orbit', 'arc'],
    mount: mount
  });

  function mount(ctx) {
    var count = 8;
    var radius = 200;
    var startAngle = 0;
    var arc = 360;
    var orient = false;

    var countField = ui.numberField({ label: 'Count', value: count, min: 2, max: 60, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { count = v; } });

    var radiusSlider = ui.slider({ label: 'Radius', min: 0, max: 1000, step: 1, value: radius,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { radius = v; } });
    var startSlider = ui.slider({ label: 'Start angle', min: -360, max: 360, step: 1, value: startAngle,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { startAngle = v; } });
    var arcSlider = ui.slider({ label: 'Arc', min: 0, max: 360, step: 1, value: arc,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { arc = v; } });

    var orientToggle = ui.toggle({ label: 'Orient to center', value: orient,
      onChange: function (v) { orient = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Duplicates each selected layer into a ring of copies around where the layer sits. Arc sets how much of the circle to fill.' }),
      countField.el,
      radiusSlider.el,
      startSlider.el,
      arcSlider.el,
      orientToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('radial.apply', {
        count: count,
        radius: radius,
        startAngle: startAngle,
        arc: arc,
        orient: orient
      })
        .then(function (res) { ctx.toast('Created ' + res.created + ' cop' + (res.created === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not build ring', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to array';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});