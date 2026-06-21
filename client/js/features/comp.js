/*
 * Rebound, Composition tool.
 * Edits the active composition's settings in place: frame rate, duration,
 * width, and height. Fields are pre-filled from the current comp on mount.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var RES = [
    { name: 'HD 1080p', w: 1920, h: 1080 },
    { name: '4K UHD', w: 3840, h: 2160 },
    { name: 'DCI 4K', w: 4096, h: 2160 },
    { name: 'HD 720p', w: 1280, h: 720 },
    { name: 'Square', w: 1080, h: 1080 },
    { name: 'Vertical 9:16', w: 1080, h: 1920 },
    { name: 'Cinema 2.39', w: 1920, h: 803 }
  ];
  var FPS = [23.976, 24, 25, 29.97, 30, 50, 60];

  function gcd(a, b) { a = Math.round(a); b = Math.round(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }
  function ratioLabel(w, h) {
    w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return '';
    var g = gcd(w, h), rw = w / g, rh = h / g;
    if (rw <= 40 && rh <= 40) return rw + ':' + rh;
    return (w / h).toFixed(2) + ':1';
  }
  // A scaled frame rectangle showing the comp aspect ratio + its dimensions.
  function aspectPreview(w, h) {
    var maxW = 150, maxH = 84, box;
    if (w > 0 && h > 0) {
      var ratio = w / h, rw, rh;
      if (ratio >= maxW / maxH) { rw = maxW; rh = maxW / ratio; } else { rh = maxH; rw = maxH * ratio; }
      box = el('div', { style: { width: rw.toFixed(0) + 'px', height: rh.toFixed(0) + 'px', background: 'var(--rb-accent)', opacity: '0.85', borderRadius: '3px' } });
    } else {
      box = el('div', { style: { width: '120px', height: '68px', border: '1px dashed var(--rb-border-strong)', borderRadius: '3px' } });
    }
    return el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' } }, [
      box,
      el('div.rb-faint', { style: { fontSize: '11px' }, text: (w > 0 && h > 0) ? (Math.round(w) + ' × ' + Math.round(h) + '   ' + ratioLabel(w, h)) : 'No composition' })
    ]);
  }

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
    var cropScope = 'selected';
    var cropPadding = 0;

    var frameRateField = ui.numberField({ label: 'Frame rate', value: frameRate, min: 1, max: 999, step: 1, decimals: 3, suffix: 'fps', width: '160px',
      onChange: function (v) { frameRate = v; } });
    var durationField = ui.numberField({ label: 'Duration', value: duration, min: 0, max: 86400, step: 0.1, decimals: 3, suffix: 's', width: '160px',
      onChange: function (v) { duration = v; } });
    var widthField = ui.numberField({ label: 'Width', value: width, min: 1, max: 30000, step: 1, decimals: 0, suffix: 'px', width: '160px',
      onChange: function (v) { width = v; renderPreview(); } });
    var heightField = ui.numberField({ label: 'Height', value: height, min: 1, max: 30000, step: 1, decimals: 0, suffix: 'px', width: '160px',
      onChange: function (v) { height = v; renderPreview(); } });
    var recenterToggle = ui.toggle({ label: 'Keep content centered', value: recenter,
      title: 'When changing resolution, shift every layer so the existing framing stays centered instead of drifting toward a corner.',
      onChange: function (v) { recenter = v; } });

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '10px', display: 'flex', justifyContent: 'center' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(aspectPreview(width, height)); }
    renderPreview();

    var cropScopeCtl = ui.segmented([
      { value: 'selected', label: 'Selected', title: 'Fit the frame to the selected layers' },
      { value: 'all', label: 'All layers', title: 'Fit the frame to every layer in the comp' }
    ], { value: cropScope, onChange: function (v) { cropScope = v; } });
    var cropPadField = ui.numberField({ label: 'Margin', value: cropPadding, min: 0, step: 1, decimals: 0, suffix: 'px', width: '160px',
      onChange: function (v) { cropPadding = v; } });
    var cropBtn = el('button.rb-btn', { title: 'Resize the composition to fit the content', onclick: doCrop }, ['Crop comp to content']);

    var resRow = el('div.rb-row.rb-wrap', null, RES.map(function (r) {
      return el('button.rb-btn.is-ghost', { title: r.w + ' × ' + r.h, onclick: function () { width = r.w; height = r.h; widthField.set(r.w); heightField.set(r.h); renderPreview(); } }, [r.name]);
    }));
    var fpsRow = el('div.rb-row.rb-wrap', null, FPS.map(function (f) {
      return el('button.rb-btn.is-ghost', { onclick: function () { frameRate = f; frameRateField.set(f); } }, [String(f)]);
    }));

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Edits the active composition in place. Fields are pre-filled from the current comp; Apply writes back any value above zero.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Resolution presets' }),
      resRow,
      ui.row('Width', widthField.el),
      ui.row('Height', heightField.el),
      el('div.rb-section-label', { text: 'Frame rate' }),
      fpsRow,
      ui.row('Frame rate', frameRateField.el),
      ui.row('Duration', durationField.el),
      recenterToggle.el,
      el('div.rb-section-label', { text: 'Crop to content' }),
      ui.row('Fit to', cropScopeCtl.el),
      ui.row('Margin', cropPadField.el),
      el('div.rb-row', null, [cropBtn])
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
          renderPreview();
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

    function doCrop() {
      ctx.invoke('comp.cropToContent', { scope: cropScope, padding: cropPadding })
        .then(function (res) {
          ctx.toast('Cropped to ' + res.width + ' × ' + res.height, { kind: 'success' });
          ctx.refreshSelection(); prefill();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not crop composition', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return sel.compName ? 'Editing ' + sel.compName : 'Editing active composition';
  }
})(window.Rebound = window.Rebound || {});
