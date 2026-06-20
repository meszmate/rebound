/*
 * Rebound, Composition tool.
 * Edits the active composition's settings in place: frame rate, duration,
 * width, and height. Fields are pre-filled from the current comp on mount.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'comp',
    title: 'Composition',
    group: 'Layout',
    order: 3,
    keywords: ['composition', 'comp', 'settings', 'frame rate', 'fps', 'duration', 'resolution', 'width', 'height', 'size'],
    mount: mount
  });

  function mount(ctx) {
    var frameRate = 0;
    var duration = 0;
    var width = 0;
    var height = 0;
    var recenter = true;

    var frameRateField = ui.numberField({ label: 'Frame rate', value: frameRate, min: 1, max: 999, step: 1, decimals: 3, suffix: 'fps', width: '160px',
      onChange: function (v) { frameRate = v; } });
    var durationField = ui.numberField({ label: 'Duration', value: duration, min: 0, max: 86400, step: 0.1, decimals: 3, suffix: 's', width: '160px',
      onChange: function (v) { duration = v; } });
    var widthField = ui.numberField({ label: 'Width', value: width, min: 1, max: 30000, step: 1, decimals: 0, suffix: 'px', width: '160px',
      onChange: function (v) { width = v; } });
    var heightField = ui.numberField({ label: 'Height', value: height, min: 1, max: 30000, step: 1, decimals: 0, suffix: 'px', width: '160px',
      onChange: function (v) { height = v; } });
    var recenterToggle = ui.toggle({ label: 'Keep content centered', value: recenter,
      title: 'When changing resolution, shift every layer so the existing framing stays centered instead of drifting toward a corner.',
      onChange: function (v) { recenter = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Edits the active composition in place. Fields are pre-filled from the current comp; Apply writes back any value above zero.' }),
      ui.row('Frame rate', frameRateField.el),
      ui.row('Duration', durationField.el),
      ui.row('Width', widthField.el),
      ui.row('Height', heightField.el),
      recenterToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    // Pull live width/height/duration/frameRate from the host to pre-fill.
    function prefill() {
      ctx.invoke('comp.info', {})
        .then(function (info) {
          frameRate = info.frameRate; frameRateField.set(frameRate);
          duration = info.duration; durationField.set(duration);
          width = info.width; widthField.set(width);
          height = info.height; heightField.set(height);
        })
        .catch(function () { /* no comp open, leave fields at zero */ });
    }
    prefill();

    function doApply() {
      ctx.invoke('comp.apply', {
        frameRate: frameRate,
        duration: duration,
        width: width,
        height: height,
        recenter: recenter
      })
        .then(function (res) {
          ctx.toast(res && res.recentered ? 'Composition updated, content recentered' : 'Composition updated', { kind: 'success' });
          ctx.refreshSelection(); prefill();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not update composition', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return sel.compName ? 'Editing ' + sel.compName : 'Editing active composition';
  }
})(window.Rebound = window.Rebound || {});
