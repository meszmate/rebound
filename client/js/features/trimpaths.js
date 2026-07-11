/*
 * Rebound, Trim Paths tool.
 * Adds an animated Trim Paths write-on (or write-off) to selected shape layers,
 * sweeping the stroke over a chosen number of frames in the chosen direction.
 * On starts at the playhead and draws the stroke in; Off inverts the keys and
 * ends at the playhead, retracting the stroke away.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // The growth origin for each direction: start (left), end (right), or centre.
  function anchorFor(direction) {
    if (direction === 'end-start') return { tx: 114, x1: -104, x2: 0 };
    if (direction === 'center') return { tx: 62, x1: -52, x2: 52 };
    return { tx: 10, x1: 0, x2: 104 };
  }
  // Animated preview: a stroke that grows from the chosen end (On) or holds
  // and then retracts back into it (Off), with the chosen ease. Off is the On
  // animation with the values/keyTimes reversed, mirroring the host's
  // swapped key pairs.
  function trimAnim(direction, ease, mode) {
    var a = anchorFor(direction);
    var off = mode === 'off';
    var anim = svg('animateTransform', { attributeName: 'transform', type: 'scale',
      values: off ? '1 1;1 1;0 1' : '0 1;1 1;1 1',
      keyTimes: off ? '0;0.38;1' : '0;0.62;1',
      dur: '2.4s', repeatCount: 'indefinite',
      calcMode: ease === 'linear' ? 'linear' : 'spline' });
    if (ease !== 'linear') anim.setAttribute('keySplines', off ? '0 0 1 1;0.4 0 0.2 1' : '0.4 0 0.2 1;0 0 1 1');
    return svg('svg', { viewBox: '0 0 124 60', width: '100%', height: 60 }, [
      svg('line', { x1: 10, y1: 30, x2: 114, y2: 30, stroke: 'var(--rb-border)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      svg('g', { transform: 'translate(' + a.tx + ' 30)' }, [
        svg('line', { x1: a.x1, y1: 0, x2: a.x2, y2: 0, stroke: 'var(--rb-accent)', 'stroke-width': 5, 'stroke-linecap': 'round' }, [anim])
      ])
    ]);
  }
  // Static thumbnail: the stroke drawn ~60% from the chosen end (write-on) or
  // the ~40% left mid-retract (write-off).
  function trimThumb(state, h) {
    var dir = state.direction || 'start-end';
    var a = anchorFor(dir), L = 104, frac = state.mode === 'off' ? 0.38 : 0.62, bx1, bx2;
    if (dir === 'center') { bx1 = -L * frac / 2; bx2 = L * frac / 2; }
    else if (dir === 'end-start') { bx1 = -L * frac; bx2 = 0; }
    else { bx1 = 0; bx2 = L * frac; }
    return svg('svg', { viewBox: '0 0 124 60', width: '100%', height: h }, [
      svg('g', { transform: 'translate(' + a.tx + ' 30)' }, [
        svg('line', { x1: a.x1, y1: 0, x2: a.x2, y2: 0, stroke: 'var(--rb-border)', 'stroke-width': 5, 'stroke-linecap': 'round' }),
        svg('line', { x1: bx1, y1: 0, x2: bx2, y2: 0, stroke: 'var(--rb-accent)', 'stroke-width': 5, 'stroke-linecap': 'round' })
      ])
    ]);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var TRIMPATHS_DEFAULTS = [
    { name: 'Quick Write-on', state: { direction: 'start-end', durationFrames: 12, ease: 'smooth' } },
    { name: 'Slow Draw', state: { direction: 'start-end', durationFrames: 48, ease: 'smooth' } },
    { name: 'Reverse', state: { direction: 'end-start', durationFrames: 24, ease: 'smooth' } },
    { name: 'Mechanical', state: { direction: 'start-end', durationFrames: 24, ease: 'linear' } },
    { name: 'Center Burst', state: { direction: 'center', durationFrames: 18, ease: 'smooth' } },
    { name: 'Write-off', state: { mode: 'off', direction: 'start-end', durationFrames: 24, ease: 'smooth' } }
  ];
  R.toolPresets.declare('trimpaths', { defaults: TRIMPATHS_DEFAULTS });

  R.tools.register({
    id: 'trimpaths',
    title: 'Trim Paths',
    group: 'Shapes',
    order: 0,
    quick: {
      desc: 'Add an animated Trim Paths write-on to the selected shape layers at the playhead.',
      method: 'trimpaths.apply',
      args: { mode: 'on', direction: 'start-end', durationFrames: 24, ease: 'smooth', replace: true },
      config: [{ arg: 'direction', label: 'Direction', type: 'select', options: [
        { value: 'start-end', label: 'Start to End' },
        { value: 'end-start', label: 'End to Start' },
        { value: 'center', label: 'Center out' }
      ] }]
    },
    keywords: ['trim', 'paths', 'write on', 'write-on', 'reveal', 'stroke', 'draw', 'shape'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'on';
    var direction = 'start-end';
    var durationFrames = 24;
    var ease = 'smooth';
    var replace = true;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(trimAnim(direction, ease, mode)); }

    var modeCtl = ui.segmented([
      { value: 'on', label: 'On', title: 'Write the stroke on, starting at the playhead' },
      { value: 'off', label: 'Off', title: 'Retract the stroke away, ending at the playhead' }
    ], { value: mode, onChange: function (v) { mode = v; renderPreview(); } });

    var directionCtl = ui.segmented([
      { value: 'start-end', label: 'Start to End', title: 'Sweep the stroke on from its start' },
      { value: 'end-start', label: 'End to Start', title: 'Sweep the stroke on from its end' },
      { value: 'center', label: 'Center out', title: 'Grow the stroke outward from its middle' }
    ], { value: direction, onChange: function (v) { direction = v; renderPreview(); } });

    var durationField = ui.numberField({ label: 'Duration', value: durationFrames, min: 1, step: 1, decimals: 0,
      suffix: 'f', width: '110px', onChange: function (v) { durationFrames = v; } });

    var easeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'Constant write-on speed' },
      { value: 'smooth', label: 'Smooth', title: 'Ease the write-on in and out' }
    ], { value: ease, onChange: function (v) { ease = v; renderPreview(); } });

    var replaceToggle = ui.toggle({ label: 'Replace existing', value: replace,
      title: 'Swap an earlier Trim Paths on the layer instead of stacking another.',
      onChange: function (v) { replace = v; } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Adds an animated Trim Paths sweep to each selected shape layer. On writes the stroke on from the playhead; Off retracts it, ending at the playhead. Non-shape layers are skipped.' }),
      previewHost,
      ui.row('Animate', modeCtl.el),
      ui.row('Direction', directionCtl.el),
      ui.row('Duration', durationField.el),
      ui.row('Ease', easeCtl.el),
      replaceToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    function canApply(sel) { return !!(sel && sel.hasComp && sel.selectedLayerCount); }
    function sync(sel) {
      scopeText.textContent = describe(sel);
      applyBtn.disabled = !canApply(sel);
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function doApply() {
      ctx.invoke('trimpaths.apply', { mode: mode, direction: direction, durationFrames: durationFrames, ease: ease, replace: replace })
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
      return { mode: mode, direction: direction, durationFrames: durationFrames, ease: ease, replace: replace };
    }
    function applyState(s) {
      if (!s) return;
      // Older presets carry no mode: they are write-ons, so absent means 'on'.
      mode = s.mode != null ? s.mode : 'on';
      modeCtl.set(mode);
      if (s.direction != null) { direction = s.direction; directionCtl.set(s.direction); }
      if (s.durationFrames != null) { durationFrames = s.durationFrames; durationField.set(s.durationFrames); }
      if (s.ease != null) { ease = s.ease; easeCtl.set(s.ease); }
      if (s.replace != null) { replace = s.replace; replaceToggle.set(s.replace); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'trimpaths',
        get: getState,
        set: applyState,
        thumbFor: function (state, opts) { return trimThumb(state, (opts && opts.height) || 38); },
        defaults: TRIMPATHS_DEFAULTS
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
