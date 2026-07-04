/*
 * Rebound, Bake tool.
 * Bakes each selected property's live animation, whether it is driven by an
 * expression or by keyframes, into clean, evenly spaced keyframes by sampling
 * the value at a fixed frame step across a chosen time range.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A smooth source curve sampled into keyframe ticks spaced by the step: a small
  // step hugs the curve densely, a large step samples it coarsely.
  function bakeSvg(state, h) {
    var W = 160, H = 80, pad = 10, trackW = W - 2 * pad, total = 48;
    var step = Math.max(1, Math.min(60, state.stepFrames || 1));
    function cy(u) { return H / 2 - Math.sin(u * Math.PI * 1.7) * (H / 2 - pad) * 0.72; }
    var d = '', i;
    for (i = 0; i <= 60; i++) { var u = i / 60, x = pad + u * trackW; d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + cy(u).toFixed(1); }
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('path', { d: d, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1.5 })];
    var n = Math.floor(total / step);
    for (var k = 0; k <= n; k++) {
      var fr = k * step; if (fr > total) break;
      var uu = fr / total, xx = pad + uu * trackW, yy = cy(uu);
      kids.push(svg('line', { x1: xx.toFixed(1), y1: H - pad, x2: xx.toFixed(1), y2: yy.toFixed(1), stroke: 'var(--rb-accent)', 'stroke-width': 1, opacity: '0.35' }));
      kids.push(svg('circle', { cx: xx.toFixed(1), cy: yy.toFixed(1), r: 2.3, fill: 'var(--rb-accent)' }));
    }
    return svg('svg', { viewBox: '0 0 160 80', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var BAKE_DEFAULTS = [
    { name: 'Every frame', state: { range: 'work', stepFrames: 1, includeExpressions: false } },
    { name: 'Coarse sample', state: { range: 'work', stepFrames: 4, includeExpressions: false } },
    { name: 'Layer span', state: { range: 'layer', stepFrames: 1, includeExpressions: false } },
    { name: 'With expressions', state: { range: 'work', stepFrames: 1, includeExpressions: true } }
  ];
  R.toolPresets.declare('bake', { defaults: BAKE_DEFAULTS });

  R.tools.register({
    id: 'bake',
    title: 'Bake',
    group: 'Easing',
    order: 5,
    keywords: ['bake', 'sample', 'expression', 'keyframe', 'convert', 'flatten', 'frame'],
    mount: mount
  });

  function mount(ctx) {
    var range = 'work';
    var stepFrames = 1;
    var includeExpressions = false;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(bakeSvg({ stepFrames: stepFrames }, 80)); }

    var rangeCtl = ui.segmented([
      { value: 'work', label: 'Work area', title: 'Sample across the composition work area' },
      { value: 'layer', label: 'Layer duration', title: 'Sample across each layer’s in-to-out span' }
    ], { value: range, onChange: function (v) { range = v; } });

    var stepField = ui.numberField({
      label: 'Step',
      value: stepFrames,
      min: 1,
      max: 60,
      step: 1,
      decimals: 0,
      suffix: 'f',
      width: '110px',
      onChange: function (v) { stepFrames = v; renderPreview(); }
    });

    var exprToggle = ui.toggle({
      label: 'Include expressions',
      value: includeExpressions,
      title: 'Also bake properties driven by a hand-written expression. The expression is disabled, not deleted, so you can re-enable it later.',
      onChange: function (v) { includeExpressions = v; }
    });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Samples each selected property’s animation into clean keyframes, one every few frames. Works on expression-driven and keyframed properties alike.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Range' }),
      rangeCtl.el,
      el('div.rb-section-label', { text: 'Sample step' }),
      stepField.el,
      exprToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('bake.apply', { range: range, stepFrames: stepFrames, includeExpressions: includeExpressions })
        .then(function (res) {
          var msg = 'Baked ' + res.properties + ' propert' + (res.properties === 1 ? 'y' : 'ies') +
            ' into ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's');
          if (res.skipped) {
            msg += '. Skipped ' + res.skipped + ' with a user expression';
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not bake', { kind: 'error' }); });
    }

    function getState() {
      return { range: range, stepFrames: stepFrames, includeExpressions: includeExpressions };
    }

    function applyState(s) {
      if (!s) return;
      if (s.range != null) { range = s.range; rangeCtl.set(s.range); }
      if (s.stepFrames != null) { stepFrames = s.stepFrames; stepField.set(s.stepFrames); }
      if (s.includeExpressions != null) { includeExpressions = s.includeExpressions; exprToggle.set(s.includeExpressions); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'bake',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return bakeSvg(st, (opts && opts.height) || 30); },
        defaults: BAKE_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    var count = 0;
    var props = sel.properties || [];
    for (var i = 0; i < props.length; i++) {
      if (props[i].isTimeVarying) count++;
    }
    if (!count) return 'Select animated properties to bake';
    return count + ' animated propert' + (count === 1 ? 'y' : 'ies');
  }
})(window.Rebound = window.Rebound || {});