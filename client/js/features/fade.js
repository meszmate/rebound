/*
 * Rebound, Fade tool.
 * Adds opacity fade-in and/or fade-out keyframes to each selected layer,
 * with independent frame durations and toggles for each end.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'fade',
    title: 'Fade',
    group: 'Timing',
    order: 3,
    keywords: ['fade', 'opacity', 'in', 'out', 'dissolve', 'transition', 'timing'],
    mount: mount
  });

  function mount(ctx) {
    var doIn = true;
    var doOut = true;
    var inFrames = 12;
    var outFrames = 12;

    var inToggle = ui.toggle({ label: 'Fade in', value: doIn,
      onChange: function (v) { doIn = v; } });
    var inField = ui.numberField({ label: 'Fade in', value: inFrames, min: 0, step: 1, decimals: 0,
      suffix: 'fr', width: '110px', onChange: function (v) { inFrames = v; } });
    var outToggle = ui.toggle({ label: 'Fade out', value: doOut,
      onChange: function (v) { doOut = v; } });
    var outField = ui.numberField({ label: 'Fade out', value: outFrames, min: 0, step: 1, decimals: 0,
      suffix: 'fr', width: '110px', onChange: function (v) { outFrames = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Keyframes opacity from transparent up at the layer in point and back down at the out point. Layers with an opacity expression are skipped.' }),
      inToggle.el,
      ui.row('Fade in', inField.el),
      outToggle.el,
      ui.row('Fade out', outField.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      if (!doIn && !doOut) {
        ctx.toast('Enable a fade in or fade out', { kind: 'info' });
        return;
      }
      ctx.invoke('fade.apply', { inFrames: inFrames, outFrames: outFrames, doIn: doIn, doOut: doOut })
        .then(function (res) {
          ctx.toast('Faded ' + res.faded + ' layer' + (res.faded === 1 ? '' : 's'),
            { kind: res.faded ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not fade', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to fade';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
