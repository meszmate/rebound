/*
 * Rebound — Echo tool.
 * Adds an optical echo/trail to selected layers via the built-in Echo effect,
 * blending a number of time-shifted copies of the frame with a decay falloff.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'echo',
    title: 'Echo',
    group: 'Generators',
    order: 3,
    keywords: ['echo', 'trail', 'ghost', 'streak', 'smear', 'motion trail', 'afterimage', 'optical'],
    mount: mount
  });

  function mount(ctx) {
    var echoTime = -0.05;
    var numEchoes = 8;
    var decay = 0.7;

    var echoTimeSlider = ui.slider({ label: 'Echo time', min: -1, max: 0, step: 0.01, value: echoTime,
      format: function (v) { return v.toFixed(2) + 's'; }, onInput: function (v) { echoTime = v; } });
    var numEchoesField = ui.numberField({ label: 'Number of echoes', value: numEchoes, min: 1, max: 30, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { numEchoes = v; } });
    var decaySlider = ui.slider({ label: 'Decay', min: 0, max: 1, step: 0.01, value: decay,
      format: function (v) { return v.toFixed(2); }, onInput: function (v) { decay = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Blends time-shifted copies of each selected layer into a single optical trail. Echo time sets the gap between copies; decay fades successive echoes.' }),
      echoTimeSlider.el,
      numEchoesField.el,
      decaySlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('echo.apply', { echoTime: echoTime, numEchoes: numEchoes, decay: decay })
        .then(function (res) { ctx.toast('Echo on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: res.applied ? 'success' : 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add Echo', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to echo';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
