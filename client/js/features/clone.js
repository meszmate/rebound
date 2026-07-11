/*
 * Rebound, Clone tool.
 * Capture a property's keyframe sequence (timing, values, eases, tangents) and
 * stamp the whole animation onto other layers or properties, anchored at the
 * playhead or the layer start, optionally reversed and time-scaled. Unlike Copy
 * Ease (ease only) or Reverse (mirror in place), this clones the entire move.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // A track of ticks for the captured key pattern. Reverse mirrors it; timeScale
  // widens or narrows the spread. Faint when nothing is captured yet.
  function cloneSvg(offsets, reverse, timeScale, placeholder, h) {
    var W = 160, H = 64, padX = 14, trackW = W - 2 * padX;
    var y = 36;
    var span = 0, i;
    for (i = 0; i < offsets.length; i++) if (offsets[i] > span) span = offsets[i];
    var widthFrac = clamp((timeScale || 1) / 2, 0.12, 1);

    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('line', { x1: padX, y1: y, x2: W - padX, y2: y, stroke: 'var(--rb-border-strong)', 'stroke-width': 1 }));
    // anchor marker
    kids.push(svg('path', { d: 'M' + padX + ' ' + (y - 9) + ' L' + padX + ' ' + (y + 9), stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-dasharray': '2 2', opacity: '0.7' }));

    var on = !placeholder;
    for (i = 0; i < offsets.length; i++) {
      var u = span > 0 ? offsets[i] / span : 0;
      if (reverse) u = 1 - u;
      var x = padX + u * trackW * widthFrac;
      kids.push(svg('rect', { x: (x - 1.5).toFixed(1), y: (y - 7).toFixed(1), width: 3, height: 14, rx: 1,
        fill: on ? 'var(--rb-accent)' : 'var(--rb-text-faint)', 'fill-opacity': on ? '0.95' : '0.5' }));
    }
    kids.push(svg('text', { x: W / 2, y: H - 7, 'font-size': 9, 'text-anchor': 'middle', fill: 'var(--rb-text-faint)' },
      [placeholder ? 'Capture a sequence' : (offsets.length + ' keys')]));
    return svg('svg', { viewBox: '0 0 160 64', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'clone',
    title: 'Clone',
    group: 'Timing',
    order: 8,
    keywords: ['clone', 'copy', 'paste', 'animation', 'stamp', 'duplicate', 'keyframes', 'sequence', 'transfer'],
    mount: mount
  });

  var PLACEHOLDER = [0, 0.2, 0.45, 0.7, 1];

  function mount(ctx) {
    var bundle = null;
    var anchor = 'playhead';
    var reverse = false;
    var timeScale = 1;
    var replace = true;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function offsets() { return bundle ? bundle.keys.map(function (k) { return k.dt; }) : PLACEHOLDER; }
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(cloneSvg(offsets(), reverse, timeScale, !bundle, 72)); }

    var captureBtn = el('button.rb-btn', { title: 'Capture the selected property keyframes', onclick: doCapture }, ['Capture']);
    var capturedText = el('div.rb-faint', { text: 'Nothing captured yet.' });

    var anchorCtl = ui.segmented([
      { value: 'playhead', label: 'Playhead', title: 'Stamp starting at the current time' },
      { value: 'layerStart', label: 'Layer start', title: 'Stamp starting at each target layer in-point' }
    ], { value: anchor, onChange: function (v) { anchor = v; } });

    var reverseToggle = ui.toggle({ label: 'Reverse', value: reverse,
      title: 'Stamp the sequence backwards.', onChange: function (v) { reverse = v; renderPreview(); } });
    var scaleField = ui.numberField({ label: 'Time scale', value: timeScale, min: 0.1, max: 4, step: 0.05, decimals: 2, suffix: 'x', width: '120px',
      onChange: function (v) { timeScale = v; renderPreview(); } });
    var replaceToggle = ui.toggle({ label: 'Replace existing keys', value: replace,
      title: 'Clear the target property keyframes first so the clone lands clean.', onChange: function (v) { replace = v; } });

    var stampBtn = el('button.rb-btn.is-primary.is-disabled', { title: 'Stamp the captured sequence onto the selected properties', onclick: doStamp }, ['Stamp']);
    var lastSel = ctx.getSelection();
    // Stamp needs BOTH a captured bundle and selected target properties.
    function canTarget(sel) { return !!(sel && sel.hasComp && sel.properties && sel.properties.length); }
    function syncStamp() {
      var on = !!bundle && canTarget(lastSel);
      stampBtn.classList.toggle('is-disabled', !on);
      stampBtn.disabled = !on;
    }

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Copy a whole keyframe sequence and stamp it onto other layers or properties.' }),
      el('div.rb-row', null, [captureBtn]),
      capturedText,
      previewHost,
      el('div.rb-section-label', { text: 'Stamp' }),
      ui.row('Anchor', anchorCtl.el),
      reverseToggle.el,
      ui.row('Time scale', scaleField.el),
      replaceToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(stampBtn);

    function sync(sel) {
      lastSel = sel;
      scopeText.textContent = describe(sel);
      syncStamp();
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function doCapture() {
      ctx.invoke('clone.capture', {})
        .then(function (res) {
          bundle = res;
          capturedText.textContent = 'Captured ' + res.count + ' key' + (res.count === 1 ? '' : 's') + ' from ' + res.sourceName + '.';
          syncStamp();
          renderPreview();
          ctx.toast('Captured ' + res.count + ' keyframe' + (res.count === 1 ? '' : 's'), { kind: 'success' });
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not capture', { kind: 'error' }); });
    }

    function doStamp() {
      if (!bundle) { ctx.toast('Capture a sequence first', { kind: 'error' }); return; }
      ctx.invoke('clone.stamp', { bundle: bundle, anchor: anchor, reverse: reverse, timeScale: timeScale, replace: replace })
        .then(function (res) {
          var msg = 'Cloned onto ' + res.properties + ' propert' + (res.properties === 1 ? 'y' : 'ies') + ' (' + res.keys + ' key' + (res.keys === 1 ? '' : 's') + ')';
          ctx.toast(msg, { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not stamp', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Select a property to capture or stamp';
  }
})(window.Rebound = window.Rebound || {});
