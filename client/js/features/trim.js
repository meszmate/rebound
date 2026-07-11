/*
 * Rebound, Trim tool.
 * Trims each selected layer's in/out points to the span of its keyframes,
 * with optional frame padding on either end. Non-destructive to keyframes.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // The layer span (faint) with two keyframe diamonds, and the trimmed in/out
  // region (accent). When an end is not trimmed it stays at the layer edge;
  // padding pushes the trimmed edge past the keyframes.
  function trimSvg(state, h) {
    var W = 160, H = 70, pad = 10, trackY = H / 2, trackW = W - 2 * pad;
    function X(u) { return pad + Math.max(0, Math.min(1, u)) * trackW; }
    var k0 = 0.32, k1 = 0.74, padU = (state.paddingFrames || 0) * 0.012;
    var inU = state.trimIn ? (k0 - padU) : 0;
    var outU = state.trimOut ? (k1 + padU) : 1;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('rect', { x: X(0), y: trackY - 7, width: trackW, height: 14, rx: 2, fill: 'var(--rb-text-faint)', 'fill-opacity': '0.22' }));
    kids.push(svg('rect', { x: X(inU).toFixed(1), y: trackY - 7, width: (X(outU) - X(inU)).toFixed(1), height: 14, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.7' }));
    [k0, k1].forEach(function (u) { var x = X(u), y = trackY; kids.push(svg('path', { d: 'M' + x + ' ' + (y - 5) + 'L' + (x + 4) + ' ' + y + 'L' + x + ' ' + (y + 5) + 'L' + (x - 4) + ' ' + y + 'Z', fill: '#fff', stroke: 'var(--rb-accent)', 'stroke-width': 1 })); });
    return svg('svg', { viewBox: '0 0 160 70', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var TRIM_DEFAULTS = [
    { name: 'Both ends', state: { trimIn: true, trimOut: true, paddingFrames: 0 } },
    { name: 'In only', state: { trimIn: true, trimOut: false, paddingFrames: 0 } },
    { name: 'Out only', state: { trimIn: false, trimOut: true, paddingFrames: 0 } },
    { name: 'Padded', state: { trimIn: true, trimOut: true, paddingFrames: 2 } }
  ];
  R.toolPresets.declare('trim', { defaults: TRIM_DEFAULTS });

  R.tools.register({
    id: 'trim',
    title: 'Trim',
    group: 'Timing',
    order: 1,
    keywords: ['trim', 'in', 'out', 'keyframes', 'duration', 'timing', 'crop'],
    mount: mount
  });

  function mount(ctx) {
    var trimIn = true;
    var trimOut = true;
    var paddingFrames = 0;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(trimSvg({ trimIn: trimIn, trimOut: trimOut, paddingFrames: paddingFrames }, 70)); }

    var inToggle = ui.toggle({ label: 'Trim in point', value: trimIn,
      onChange: function (v) { trimIn = v; renderPreview(); } });
    var outToggle = ui.toggle({ label: 'Trim out point', value: trimOut,
      onChange: function (v) { trimOut = v; renderPreview(); } });
    var padField = ui.numberField({ label: 'Padding', value: paddingFrames, step: 1, decimals: 0,
      suffix: 'fr', width: '110px', onChange: function (v) { paddingFrames = v; renderPreview(); } });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Sets each layer\'s in and out points to span its keyframes, plus padding. Layers with no keyframes are left alone.' }),
      previewHost,
      inToggle.el,
      outToggle.el,
      ui.row('Padding', padField.el)
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
      ctx.invoke('trim.apply', { trimIn: trimIn, trimOut: trimOut, paddingFrames: paddingFrames })
        .then(function (res) {
          var msg = 'Trimmed ' + res.trimmed + ' layer' + (res.trimmed === 1 ? '' : 's');
          if (res.skipped && res.skipped.length) {
            msg += ', skipped ' + res.skipped.length + ' with no keyframes';
          }
          ctx.toast(msg, { kind: res.trimmed ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not trim', { kind: 'error' }); });
    }

    function getState() {
      return { trimIn: trimIn, trimOut: trimOut, paddingFrames: paddingFrames };
    }

    function applyState(s) {
      if (!s) return;
      if (s.trimIn != null) { trimIn = s.trimIn; inToggle.set(s.trimIn); }
      if (s.trimOut != null) { trimOut = s.trimOut; outToggle.set(s.trimOut); }
      if (s.paddingFrames != null) { paddingFrames = s.paddingFrames; padField.set(s.paddingFrames); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'trim',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return trimSvg(st, (opts && opts.height) || 30); },
        defaults: TRIM_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to trim';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
