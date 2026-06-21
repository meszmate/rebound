/*
 * Rebound, Multiply tool.
 * Bulk-duplicates each selected layer into a stack of N copies, each copy
 * progressively offset in position, rotation, scale, opacity, and time.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  R.tools.register({
    id: 'multiply',
    title: 'Multiply',
    group: 'Generators',
    order: 0,
    keywords: ['multiply', 'duplicate', 'stack', 'clone', 'copies', 'repeat', 'offset'],
    mount: mount
  });

  function mount(ctx) {
    var copies = 5;
    var offsetX = 0;
    var offsetY = 0;
    var rotation = 0;
    var scale = 0;
    var opacity = 0;
    var delayFrames = 0;

    // Live stack sketch: sample copies with the offsets compounded, so the fan
    // direction, rotation, shrink, and fade are all visible before Apply.
    var stackHost = el('div');
    function renderStack() {
      R.dom.clear(stackHost);
      var n = Math.max(1, Math.min(10, Math.round(copies)));
      var maxOff = Math.max(Math.abs(offsetX), Math.abs(offsetY)) * (n - 1);
      var k = maxOff > 0 ? Math.min(0.14, 46 / maxOff) : 0.14;
      var cx = 62, cy = 58, base = 15, kids = [];
      for (var i = n - 1; i >= 0; i--) {
        var tx = cx + i * offsetX * k, ty = cy + i * offsetY * k;
        var s = base * Math.max(0.2, 1 + i * scale / 100);
        var op = Math.max(0.06, Math.min(1, 1 + i * opacity / 100));
        kids.push(svg('rect', { x: (-s / 2).toFixed(1), y: (-s / 2).toFixed(1), width: s.toFixed(1), height: s.toFixed(1), rx: 2,
          fill: 'var(--rb-accent)', opacity: op.toFixed(2),
          transform: 'translate(' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ') rotate(' + (i * rotation) + ')' }));
      }
      stackHost.appendChild(svg('svg', { viewBox: '0 0 124 116', width: '100%', height: 120 }, kids));
    }
    var stackBox = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stackHost]);

    var copiesField = ui.numberField({ label: 'Copies', value: copies, min: 1, max: 50, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { copies = v; renderStack(); } });

    var offsetXSlider = ui.slider({ label: 'Position X', min: -500, max: 500, step: 1, value: offsetX,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { offsetX = v; renderStack(); } });
    var offsetYSlider = ui.slider({ label: 'Position Y', min: -500, max: 500, step: 1, value: offsetY,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { offsetY = v; renderStack(); } });
    var rotationSlider = ui.slider({ label: 'Rotation', min: -180, max: 180, step: 1, value: rotation,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { rotation = v; renderStack(); } });
    var scaleSlider = ui.slider({ label: 'Scale', min: -50, max: 50, step: 1, value: scale,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { scale = v; renderStack(); } });
    var opacitySlider = ui.slider({ label: 'Opacity', min: -100, max: 100, step: 1, value: opacity,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { opacity = v; renderStack(); } });
    var delaySlider = ui.slider({ label: 'Time delay', min: -30, max: 30, step: 1, value: delayFrames,
      title: 'Staggers each copy in time (shown on the timeline, not in this sketch).',
      format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { delayFrames = v; } });

    renderStack();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Duplicates each selected layer into a stack of copies, compounding these offsets on each successive copy. Time delay staggers them in time.' }),
      stackBox,
      copiesField.el,
      offsetXSlider.el,
      offsetYSlider.el,
      rotationSlider.el,
      scaleSlider.el,
      opacitySlider.el,
      delaySlider.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('multiply.apply', {
        copies: copies,
        offsetX: offsetX,
        offsetY: offsetY,
        rotation: rotation,
        scale: scale,
        opacity: opacity,
        delayFrames: delayFrames
      })
        .then(function (res) { ctx.toast('Created ' + res.created + ' cop' + (res.created === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not multiply', { kind: 'error' }); });
    }

    function getState() {
      return {
        copies: copies,
        offsetX: offsetX,
        offsetY: offsetY,
        rotation: rotation,
        scale: scale,
        opacity: opacity,
        delayFrames: delayFrames
      };
    }
    function applyState(s) {
      if (!s) return;
      if (s.copies != null) { copies = s.copies; copiesField.set(s.copies); }
      if (s.offsetX != null) { offsetX = s.offsetX; offsetXSlider.set(s.offsetX); }
      if (s.offsetY != null) { offsetY = s.offsetY; offsetYSlider.set(s.offsetY); }
      if (s.rotation != null) { rotation = s.rotation; rotationSlider.set(s.rotation); }
      if (s.scale != null) { scale = s.scale; scaleSlider.set(s.scale); }
      if (s.opacity != null) { opacity = s.opacity; opacitySlider.set(s.opacity); }
      if (s.delayFrames != null) { delayFrames = s.delayFrames; delaySlider.set(s.delayFrames); }
      renderStack();
    }

    return {
      presets: {
        toolId: 'multiply',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Trail', state: { copies: 8, offsetX: 20, offsetY: 0, rotation: 0, scale: 0, opacity: -10, delayFrames: 2 } },
          { name: 'Echo fade', state: { copies: 6, offsetX: 0, offsetY: 0, rotation: 0, scale: -5, opacity: -15, delayFrames: 0 } },
          { name: 'Spiral', state: { copies: 12, offsetX: 12, offsetY: 12, rotation: 15, scale: -3, opacity: 0, delayFrames: 1 } },
          { name: 'Cascade', state: { copies: 10, offsetX: 30, offsetY: 30, rotation: 0, scale: 0, opacity: -8, delayFrames: 3 } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to multiply';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
