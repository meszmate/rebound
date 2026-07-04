/*
 * Rebound, Scatter tool.
 * Distributes duplicates of the selected layer in a pattern: a jittered grid, a
 * Fibonacci (phyllotaxis) spiral, or seeded random with optional minimum spacing
 * so copies do not overlap. Each copy can vary in scale and rotation. A live map
 * previews the layout and reacts to every control.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  function makeRng(seed) {
    var s = (seed | 0) || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  function gridPositions(count, w, h, jitter, rng) {
    var cols = Math.max(1, Math.round(Math.sqrt(count * (w / Math.max(1, h)))));
    var rows = Math.ceil(count / cols);
    var pts = [];
    for (var k = 0; k < count; k++) {
      var c = k % cols, r = Math.floor(k / cols);
      var x = cols > 1 ? (-w / 2 + w * c / (cols - 1)) : 0;
      var y = rows > 1 ? (-h / 2 + h * r / (rows - 1)) : 0;
      pts.push([x + (rng() - 0.5) * jitter, y + (rng() - 0.5) * jitter]);
    }
    return pts;
  }
  function fibPositions(count, radius, jitter, rng) {
    var ga = Math.PI * (3 - Math.sqrt(5));
    var pts = [];
    for (var k = 0; k < count; k++) {
      var rr = radius * Math.sqrt((k + 0.5) / count), th = k * ga;
      pts.push([Math.cos(th) * rr + (rng() - 0.5) * jitter, Math.sin(th) * rr + (rng() - 0.5) * jitter]);
    }
    return pts;
  }
  function randomPositions(count, w, h, minDist, rng) {
    var pts = [], cap = count * 40, attempts = 0;
    while (pts.length < count && attempts < cap) {
      attempts++;
      var x = (rng() - 0.5) * w, y = (rng() - 0.5) * h, ok = true;
      if (minDist > 0) {
        for (var i = 0; i < pts.length; i++) { var dx = pts[i][0] - x, dy = pts[i][1] - y; if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; } }
      }
      if (ok) pts.push([x, y]);
    }
    while (pts.length < count) pts.push([(rng() - 0.5) * w, (rng() - 0.5) * h]);
    return pts;
  }

  function positionsFor(st, rng) {
    var count = Math.max(1, Math.min(200, Math.round(st.count || 1)));
    if (st.pattern === 'fibonacci') return fibPositions(count, st.radius || 250, st.jitter || 0, rng);
    if (st.pattern === 'random') return randomPositions(count, st.width || 600, st.height || 400, st.minDist || 0, rng);
    return gridPositions(count, st.width || 600, st.height || 400, st.jitter || 0, rng);
  }

  function scatterSvg(st, h) {
    var W = 160, H = 100, pad = 10;
    var rng = makeRng(st.seed || 1);
    var pts = positionsFor(st, rng);
    // Per-point scale factor (consumes rng like the host, for the dot size).
    var scaleVary = (st.scaleVary || 0) / 100;
    var rotateVary = st.rotateVary || 0;
    var sizes = [];
    for (var k = 0; k < pts.length; k++) {
      var f = scaleVary > 0 ? (1 + (rng() * 2 - 1) * scaleVary) : 1;
      if (rotateVary > 0) rng(); // keep rng in step with the host order
      sizes.push(f);
    }
    var minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (k = 0; k < pts.length; k++) {
      if (pts[k][0] < minX) minX = pts[k][0]; if (pts[k][0] > maxX) maxX = pts[k][0];
      if (pts[k][1] < minY) minY = pts[k][1]; if (pts[k][1] > maxY) maxY = pts[k][1];
    }
    var spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    var span = Math.max(spanX, spanY);
    function tx(x) { return W / 2 + (x - (minX + maxX) / 2) / span * (W - 2 * pad); }
    function ty(y) { return H / 2 + (y - (minY + maxY) / 2) / span * (H - 2 * pad); }

    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    for (k = 0; k < pts.length; k++) {
      kids.push(svg('circle', { cx: tx(pts[k][0]).toFixed(1), cy: ty(pts[k][1]).toFixed(1), r: Math.max(1, 2.4 * sizes[k]).toFixed(1), fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
    }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var SCATTER_DEFAULTS = [
    { name: 'Grid', state: { pattern: 'grid', count: 24, width: 600, height: 400, radius: 250, jitter: 0, minDist: 0, seed: 1, scaleVary: 0, rotateVary: 0 } },
    { name: 'Confetti', state: { pattern: 'random', count: 40, width: 700, height: 500, radius: 250, jitter: 0, minDist: 0, seed: 4, scaleVary: 40, rotateVary: 180 } },
    { name: 'Spaced field', state: { pattern: 'random', count: 30, width: 700, height: 500, radius: 250, jitter: 0, minDist: 90, seed: 2, scaleVary: 15, rotateVary: 0 } },
    { name: 'Sunflower', state: { pattern: 'fibonacci', count: 60, width: 600, height: 400, radius: 260, jitter: 0, minDist: 0, seed: 1, scaleVary: 0, rotateVary: 0 } },
    { name: 'Loose grid', state: { pattern: 'grid', count: 36, width: 640, height: 420, radius: 250, jitter: 40, minDist: 0, seed: 6, scaleVary: 20, rotateVary: 25 } }
  ];
  R.toolPresets.declare('scatter', { defaults: SCATTER_DEFAULTS });

  R.tools.register({
    id: 'scatter',
    title: 'Scatter',
    group: 'Generators',
    order: 2,
    keywords: ['scatter', 'distribute', 'array', 'random', 'fibonacci', 'phyllotaxis', 'grid', 'poisson', 'spread', 'duplicate'],
    mount: mount
  });

  function mount(ctx) {
    var st = { pattern: 'grid', count: 24, width: 600, height: 400, radius: 250, jitter: 0, minDist: 0, seed: 1, scaleVary: 0, rotateVary: 0 };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(scatterSvg(st, 120)); }

    var patternCtl = ui.segmented([
      { value: 'grid', label: 'Grid', title: 'A jittered grid' },
      { value: 'fibonacci', label: 'Fibonacci', title: 'A phyllotaxis spiral' },
      { value: 'random', label: 'Random', title: 'Seeded random with optional spacing' }
    ], { value: st.pattern, onChange: function (v) { st.pattern = v; syncPattern(); renderPreview(); } });

    function nf(label, key, opts) {
      opts = opts || {};
      return ui.numberField({ label: label, value: st[key], min: opts.min, max: opts.max, step: opts.step || 1, decimals: 0, suffix: opts.suffix, width: '120px',
        onChange: function (v) { st[key] = v; renderPreview(); } });
    }
    var countField = nf('Count', 'count', { min: 1, max: 200 });
    var widthField = nf('Width', 'width', { min: 0, suffix: 'px' });
    var heightField = nf('Height', 'height', { min: 0, suffix: 'px' });
    var radiusField = nf('Radius', 'radius', { min: 0, suffix: 'px' });
    var jitterField = nf('Jitter', 'jitter', { min: 0, suffix: 'px' });
    var minDistField = nf('Min spacing', 'minDist', { min: 0, suffix: 'px' });
    var seedField = nf('Seed', 'seed', { min: 1 });
    var scaleVaryField = nf('Scale vary', 'scaleVary', { min: 0, max: 100, suffix: '%' });
    var rotateVaryField = nf('Rotate vary', 'rotateVary', { min: 0, max: 180, suffix: '°' });

    var widthRow = ui.row('Width', widthField.el);
    var heightRow = ui.row('Height', heightField.el);
    var radiusRow = ui.row('Radius', radiusField.el);
    var jitterRow = ui.row('Jitter', jitterField.el);
    var minDistRow = ui.row('Min spacing', minDistField.el);

    function syncPattern() {
      var isFib = st.pattern === 'fibonacci';
      var isRand = st.pattern === 'random';
      widthRow.style.display = isFib ? 'none' : '';
      heightRow.style.display = isFib ? 'none' : '';
      radiusRow.style.display = isFib ? '' : 'none';
      jitterRow.style.display = isRand ? 'none' : '';
      minDistRow.style.display = isRand ? '' : 'none';
    }
    syncPattern();
    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Duplicates the selected layer into a pattern around its position. Originals are left in place.' }),
      previewHost,
      ui.row('Pattern', patternCtl.el),
      ui.row('Count', countField.el),
      widthRow, heightRow, radiusRow, jitterRow, minDistRow,
      ui.row('Seed', seedField.el),
      ui.row('Scale vary', scaleVaryField.el),
      ui.row('Rotate vary', rotateVaryField.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Scatter']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('scatter.apply', st)
        .then(function (res) { ctx.toast('Scattered ' + res.created + ' cop' + (res.created === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not scatter', { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      for (var k in s) if (s.hasOwnProperty(k) && st.hasOwnProperty(k)) st[k] = s[k];
      patternCtl.set(st.pattern);
      countField.set(st.count); widthField.set(st.width); heightField.set(st.height); radiusField.set(st.radius);
      jitterField.set(st.jitter); minDistField.set(st.minDist); seedField.set(st.seed);
      scaleVaryField.set(st.scaleVary); rotateVaryField.set(st.rotateVary);
      syncPattern();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'scatter',
        get: getState,
        set: applyState,
        thumbFor: function (s, opts) { return scatterSvg(s, (opts && opts.height) || 38); },
        defaults: SCATTER_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select a layer to scatter';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
