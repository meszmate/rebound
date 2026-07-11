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

  // Preview-side RDP (same math as host/commands/bake.jsx): which sample
  // indices survive simplifying the polyline (xs, ys) at tolerance eps, with
  // both axes normalized to [0, 1]. Endpoints always survive.
  function rdpKeep(xs, ys, eps) {
    var n = xs.length, keep = [], i;
    for (i = 0; i < n; i++) keep.push(false);
    keep[0] = true; keep[n - 1] = true;
    var stack = [[0, n - 1]];
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1];
      if (b - a < 2) continue;
      var ax = xs[a], ay = ys[a], dx = xs[b] - ax, dy = ys[b] - ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      var maxD = -1, maxI = -1;
      for (i = a + 1; i < b; i++) {
        var d = len < 1e-12
          ? Math.sqrt((xs[i] - ax) * (xs[i] - ax) + (ys[i] - ay) * (ys[i] - ay))
          : Math.abs(dx * (ay - ys[i]) - (ax - xs[i]) * dy) / len;
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > eps) { keep[maxI] = true; stack.push([a, maxI]); stack.push([maxI, b]); }
    }
    return keep;
  }

  // A smooth source curve sampled into keyframe ticks spaced by the step: a small
  // step hugs the curve densely, a large step samples it coarsely. In Reduce mode
  // the ticks are the RDP survivors instead — sparse where the curve is flat,
  // dense where it bends — so the toggle's effect is visible before applying.
  function bakeSvg(state, h) {
    var W = 160, H = 80, pad = 10, trackW = W - 2 * pad, total = 48;
    var step = Math.max(1, Math.min(60, state.stepFrames || 1));
    function cy(u) { return H / 2 - Math.sin(u * Math.PI * 1.7) * (H / 2 - pad) * 0.72; }
    var d = '', i;
    for (i = 0; i <= 60; i++) { var u = i / 60, x = pad + u * trackW; d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + cy(u).toFixed(1); }
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('path', { d: d, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1.5 })];
    var marks = [];
    if (state.reduce) {
      // Sample every frame (as the host does), normalize Y by its own range,
      // keep the RDP survivors at the chosen tolerance.
      var xs = [], ys = [], lo = 0, hi = 0;
      for (i = 0; i <= total; i++) {
        var ur = i / total, vy = cy(ur);
        xs.push(ur); ys.push(vy);
        if (i === 0 || vy < lo) lo = vy;
        if (i === 0 || vy > hi) hi = vy;
      }
      var span = (hi - lo) || 1;
      var yn = [];
      for (i = 0; i < ys.length; i++) yn.push((ys[i] - lo) / span);
      var keep = rdpKeep(xs, yn, (state.tolerance || 1) / 100);
      for (i = 0; i < xs.length; i++) if (keep[i]) marks.push(xs[i]);
    } else {
      var n = Math.floor(total / step);
      for (var k = 0; k <= n; k++) {
        var fr = k * step; if (fr > total) break;
        marks.push(fr / total);
      }
    }
    for (var m = 0; m < marks.length; m++) {
      var uu = marks[m], xx = pad + uu * trackW, yy = cy(uu);
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
    { name: 'With expressions', state: { range: 'work', stepFrames: 1, includeExpressions: true } },
    { name: 'Clean bake', state: { range: 'work', stepFrames: 1, includeExpressions: false, reduce: true, tolerance: 1 } }
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
    var reduce = false;
    var tolerance = 1;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(bakeSvg({ stepFrames: stepFrames, reduce: reduce, tolerance: tolerance }, 80)); }

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

    // Reduce mode: keep only the samples that shape the motion (RDP), written as
    // auto-bezier keys — a clean, editable bake instead of a key on every frame.
    var reduceToggle = ui.toggle({
      label: 'Reduce keys',
      value: reduce,
      title: 'Keep only the keyframes that shape the motion (sparse where flat, dense where curvy), written as auto-bezier keys.',
      onChange: function (v) { reduce = v; syncTolerance(); renderPreview(); }
    });
    var toleranceSlider = ui.slider({
      label: 'Tolerance', min: 0.1, max: 5, step: 0.1, value: tolerance,
      format: function (v) { return R.units.round(v, 1) + '%'; },
      onInput: function (v) { tolerance = v; renderPreview(); }
    });
    var toleranceWrap = el('div', null, [toleranceSlider.el]);
    function syncTolerance() { toleranceWrap.style.display = reduce ? '' : 'none'; }
    syncTolerance();

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Samples each selected property’s animation into clean keyframes, one every few frames. Works on expression-driven and keyframed properties alike.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Range' }),
      rangeCtl.el,
      el('div.rb-section-label', { text: 'Sample step' }),
      stepField.el,
      exprToggle.el,
      reduceToggle.el,
      toleranceWrap
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(applyBtn);

    function canApply(sel) {
      if (!sel || !sel.hasComp) return false;
      var props = sel.properties || [];
      for (var i = 0; i < props.length; i++) if (props[i].isTimeVarying) return true;
      return false;
    }
    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = describe(sel);
      applyBtn.disabled = !canApply(sel);
    });
    scopeText.textContent = describe(ctx.getSelection());
    applyBtn.disabled = !canApply(ctx.getSelection());

    function doApply() {
      ctx.invoke('bake.apply', {
        range: range, stepFrames: stepFrames, includeExpressions: includeExpressions,
        simplify: reduce ? tolerance / 100 : 0
      })
        .then(function (res) {
          var msg = 'Baked ' + res.properties + ' propert' + (res.properties === 1 ? 'y' : 'ies') +
            ' into ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's');
          if (reduce && res.sampled && res.sampled > res.keys) {
            msg += ' (reduced from ' + res.sampled + ' samples)';
          }
          if (res.skipped) {
            msg += '. Skipped ' + res.skipped + ' with a user expression';
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not bake', { kind: 'error' }); });
    }

    function getState() {
      return { range: range, stepFrames: stepFrames, includeExpressions: includeExpressions, reduce: reduce, tolerance: tolerance };
    }

    function applyState(s) {
      if (!s) return;
      if (s.range != null) { range = s.range; rangeCtl.set(s.range); }
      if (s.stepFrames != null) { stepFrames = s.stepFrames; stepField.set(s.stepFrames); }
      if (s.includeExpressions != null) { includeExpressions = s.includeExpressions; exprToggle.set(s.includeExpressions); }
      reduce = !!s.reduce; reduceToggle.set(reduce);
      if (s.tolerance != null) { tolerance = s.tolerance; toleranceSlider.set(s.tolerance); }
      syncTolerance();
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