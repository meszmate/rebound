/*
 * Rebound, Trim Paths tool.
 * Adds an animated Trim Paths write-on to selected shape layers, sweeping the
 * stroke on (or off) over a chosen number of frames in the chosen direction.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'trimpaths',
    title: 'Trim Paths',
    group: 'Shapes',
    order: 0,
    keywords: ['trim', 'paths', 'write on', 'write-on', 'reveal', 'stroke', 'draw', 'shape'],
    mount: mount
  });

  function mount(ctx) {
    var direction = 'start-end';
    var durationFrames = 24;
    var ease = 'smooth';
    var replace = true;

    var directionCtl = ui.segmented([
      { value: 'start-end', label: 'Start to End', title: 'Sweep the stroke on from its start' },
      { value: 'end-start', label: 'End to Start', title: 'Sweep the stroke on from its end' },
      { value: 'center', label: 'Center out', title: 'Grow the stroke outward from its middle' }
    ], { value: direction, onChange: function (v) { direction = v; } });

    var durationField = ui.numberField({ label: 'Duration', value: durationFrames, min: 1, step: 1, decimals: 0,
      suffix: 'f', width: '110px', onChange: function (v) { durationFrames = v; } });

    var easeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'Constant write-on speed' },
      { value: 'smooth', label: 'Smooth', title: 'Ease the write-on in and out' }
    ], { value: ease, onChange: function (v) { ease = v; } });

    var replaceToggle = ui.toggle({ label: 'Replace existing', value: replace,
      title: 'Swap an earlier Trim Paths on the layer instead of stacking another.',
      onChange: function (v) { replace = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds an animated Trim Paths write-on to each selected shape layer, starting at the playhead. Non-shape layers are skipped.' }),
      ui.row('Direction', directionCtl.el),
      ui.row('Duration', durationField.el),
      ui.row('Ease', easeCtl.el),
      replaceToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('trimpaths.apply', { direction: direction, durationFrames: durationFrames, ease: ease, replace: replace })
        .then(function (res) {
          var msg = 'Trim Paths on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) {
            msg += ', skipped ' + res.skipped.length + ' non-shape';
          }
          ctx.toast(msg, { kind: res.applied ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not add Trim Paths', { kind: 'error' }); });
    }

    function getState() {
      return { direction: direction, durationFrames: durationFrames, ease: ease };
    }
    function applyState(s) {
      if (!s) return;
      if (s.direction != null) { direction = s.direction; directionCtl.set(s.direction); }
      if (s.durationFrames != null) { durationFrames = s.durationFrames; durationField.set(s.durationFrames); }
      if (s.ease != null) { ease = s.ease; easeCtl.set(s.ease); }
    }

    return {
      presets: {
        toolId: 'trimpaths',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Quick Write-on', state: { direction: 'start-end', durationFrames: 12, ease: 'smooth' } },
          { name: 'Slow Draw', state: { direction: 'start-end', durationFrames: 48, ease: 'smooth' } },
          { name: 'Reverse', state: { direction: 'end-start', durationFrames: 24, ease: 'smooth' } },
          { name: 'Mechanical', state: { direction: 'start-end', durationFrames: 24, ease: 'linear' } },
          { name: 'Center Burst', state: { direction: 'center', durationFrames: 18, ease: 'smooth' } }
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
