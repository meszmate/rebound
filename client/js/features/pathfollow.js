/*
 * Rebound, Path Follow tool.
 * Sends the selected layers along a path (the first selected layer's mask is the
 * route). Constant-speed mode arc-length-reparameterizes so the layer keeps an
 * even pace through curves; even-parameter mode does not. Ease presets shape the
 * velocity over time; start/end offset, reverse, loop / ping-pong, orient + angle
 * offset, and stagger round it out. The preview animates a marker traveling the
 * actual path with the same sampler Apply uses, plus equal-time trail dots that
 * make constant vs even speed visible.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;
  function r1(v) { return R.units.round(v, 1); }

  var EASE = {
    linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
    in: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
    out: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
    both: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }
  };
  function easeFnFor(name) {
    var c = EASE[name] || EASE.both;
    return R.easing.sampler.toFunction({ type: 'bezier', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 });
  }
  function easeLut(name) {
    var fn = easeFnFor(name), out = [];
    for (var i = 0; i < 64; i++) out.push(fn(i / 63));
    return out;
  }

  // Fixed demonstrative S-curve (one cubic) sampled densely for the preview.
  var P0 = [16, 60], C0 = [40, 2], C1 = [82, 74], P1 = [104, 16];
  function cubic(t) {
    var u = 1 - t;
    return [u * u * u * P0[0] + 3 * u * u * t * C0[0] + 3 * u * t * t * C1[0] + t * t * t * P1[0],
            u * u * u * P0[1] + 3 * u * u * t * C0[1] + 3 * u * t * t * C1[1] + t * t * t * P1[1]];
  }
  var DENSE = (function () { var a = []; for (var i = 0; i <= 140; i++) a.push(cubic(i / 140)); return a; })();
  var DLEN = (function () { var L = [0]; for (var i = 1; i < DENSE.length; i++) { var dx = DENSE[i][0] - DENSE[i - 1][0], dy = DENSE[i][1] - DENSE[i - 1][1]; L.push(L[i - 1] + Math.sqrt(dx * dx + dy * dy)); } return L; })();
  var DTOTAL = DLEN[DLEN.length - 1];

  function pointAtLen(target) {
    if (target <= 0) return DENSE[0];
    if (target >= DTOTAL) return DENSE[DENSE.length - 1];
    var lo = 0, hi = DLEN.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (DLEN[mid] < target) lo = mid; else hi = mid; }
    var seg = DLEN[hi] - DLEN[lo], f = seg > 0 ? (target - DLEN[lo]) / seg : 0;
    return [DENSE[lo][0] + (DENSE[hi][0] - DENSE[lo][0]) * f, DENSE[lo][1] + (DENSE[hi][1] - DENSE[lo][1]) * f];
  }
  // Always constant-speed (arc-length): an even pace through curves is what
  // users want, and the only thing that read as "doing nothing" was the toggle.
  function sampleAt(st, p) { return pointAtLen(p * DTOTAL); }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var PATHFOLLOW_DEFAULTS = [
    { name: 'Glide', state: { speed: 'arclen', ease: 'both', duration: 2, orient: false, reverse: false, loop: false } },
    { name: 'March', state: { speed: 'arclen', ease: 'linear', duration: 3, orient: true, reverse: false, loop: false } },
    { name: 'Loop', state: { speed: 'arclen', ease: 'linear', duration: 2, orient: true, loop: true, loopCount: 3, pingpong: false } },
    { name: 'Ping-pong', state: { speed: 'arclen', ease: 'both', duration: 1.6, orient: false, loop: true, loopCount: 4, pingpong: true } }
  ];
  R.toolPresets.declare('pathfollow', { defaults: PATHFOLLOW_DEFAULTS });

  R.tools.register({
    id: 'pathfollow',
    title: 'Path Follow',
    group: 'Physics',
    order: 11,
    keywords: ['path', 'follow', 'dynamic sketch', 'mask', 'motion path', 'orient', 'constant speed', 'arc length', 'loop', 'stagger'],
    mount: mount
  });

  function mount(ctx) {
    var st = { speed: 'arclen', ease: 'both', duration: 2, orient: true, angleOffset: 0, smoothness: 24,
      startOffset: 0, endOffset: 100, reverse: false, loop: false, loopCount: 2, pingpong: false, stagger: 0 };

    // ---- preview: static path + trail dots (rebuilt) + persistent marker (rAF)
    // The marker is a rectangle (with a front notch) so orientation and the
    // angle offset are clearly visible as it banks through the path.
    var pathGroup = svg('g');
    var markerRect = svg('rect', { x: -8, y: -5.5, width: 16, height: 11, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' });
    var markerArrow = svg('path', { d: 'M8 0 L3 -3.5 L3 3.5 Z', fill: 'var(--rb-bg)' });
    var markerG = svg('g', null, [markerRect, markerArrow]);
    var stage = svg('svg', { viewBox: '0 0 120 76', width: '100%', height: '90' }, [
      svg('rect', { x: 1, y: 1, width: 118, height: 74, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      pathGroup, markerG
    ]);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);

    function rebuildPath() {
      R.dom.clear(pathGroup);
      var d = 'M' + P0[0] + ' ' + P0[1] + ' C ' + C0[0] + ' ' + C0[1] + ', ' + C1[0] + ' ' + C1[1] + ', ' + P1[0] + ' ' + P1[1];
      var s0 = st.startOffset / 100, s1 = st.endOffset / 100;
      pathGroup.appendChild(svg('path', { d: d, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1.4, opacity: '0.4' }));
      // equal-time trail dots: bunch in curves for even-t, even for arc-length
      var fn = easeFnFor(st.ease);
      for (var i = 0; i <= 10; i++) {
        var ph = i / 10;
        var p = s0 + fn(ph) * (s1 - s0);
        if (st.reverse) p = s0 + (1 - fn(ph)) * (s1 - s0);
        var pt = sampleAt(st, p);
        pathGroup.appendChild(svg('circle', { cx: r1(pt[0]), cy: r1(pt[1]), r: 1.6, fill: 'var(--rb-accent)', opacity: '0.5' }));
      }
    }
    rebuildPath();

    var raf = null, start = (window.performance && performance.now) ? performance.now() : 0, running = true;
    function tick(now) {
      if (!running) return;
      var tsec = ((window.performance && performance.now) ? now : Date.now()) / 1000 - start / 1000;
      var loops = st.loop ? Math.max(1, st.loopCount) : 1;
      var u = (tsec % (st.duration * loops)) / st.duration;
      var cyc = Math.floor(u); if (cyc >= loops) cyc = loops - 1;
      var ph = u - cyc;
      if (st.pingpong && (cyc % 2 === 1)) ph = 1 - ph;
      var eph = easeFnFor(st.ease)(ph);
      if (st.reverse) eph = 1 - eph;
      var p = st.startOffset / 100 + eph * (st.endOffset / 100 - st.startOffset / 100);
      var pt = sampleAt(st, p);
      var ahead = sampleAt(st, Math.min(1, p + 0.01));
      var ang = st.orient ? (Math.atan2(ahead[1] - pt[1], ahead[0] - pt[0]) * 180 / Math.PI + st.angleOffset) : st.angleOffset;
      markerG.setAttribute('transform', 'translate(' + r1(pt[0]) + ',' + r1(pt[1]) + ') rotate(' + r1(ang) + ')');
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // ---- controls ----------------------------------------------------------
    var easeSeg = ui.segmented([{ value: 'linear', label: 'Linear' }, { value: 'in', label: 'In' }, { value: 'out', label: 'Out' }, { value: 'both', label: 'Both' }], { value: st.ease, onChange: function (v) { st.ease = v; rebuildPath(); } });
    var durationS = ui.slider({ label: 'Duration', min: 0.3, max: 8, step: 0.1, value: st.duration, format: function (v) { return R.units.round(v, 1) + 's / pass'; }, onInput: function (v) { st.duration = v; } });
    var orientTog = ui.toggle({ label: 'Orient along the path', value: st.orient, onChange: function (v) { st.orient = v; angleS.el.style.display = v ? '' : 'none'; } });
    var angleS = ui.slider({ label: 'Angle offset', min: -180, max: 180, step: 1, value: st.angleOffset, format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { st.angleOffset = v; } });
    var startS = ui.slider({ label: 'Start', min: 0, max: 100, step: 1, value: st.startOffset, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.startOffset = v; rebuildPath(); } });
    var endS = ui.slider({ label: 'End', min: 0, max: 100, step: 1, value: st.endOffset, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.endOffset = v; rebuildPath(); } });
    var qualityS = ui.slider({ label: 'Quality', min: 8, max: 64, step: 1, value: st.smoothness, format: function (v) { return Math.round(v); }, onInput: function (v) { st.smoothness = v; } });
    var reverseTog = ui.toggle({ label: 'Reverse direction', value: st.reverse, onChange: function (v) { st.reverse = v; rebuildPath(); } });
    var loopCountS = ui.numberField({ label: 'Loops', value: st.loopCount, min: 1, max: 50, step: 1, decimals: 0, onChange: function (v) { st.loopCount = v; } });
    var pingTog = ui.toggle({ label: 'Ping-pong', value: st.pingpong, onChange: function (v) { st.pingpong = v; } });
    var loopBox = el('div.rb-col', null, [el('div.rb-row.rb-wrap', null, [loopCountS.el]), pingTog.el]);
    var loopTog = ui.toggle({ label: 'Loop', value: st.loop, onChange: function (v) { st.loop = v; loopBox.style.display = v ? '' : 'none'; } });
    var staggerS = ui.numberField({ label: 'Stagger', value: st.stagger, min: 0, max: 60, step: 1, decimals: 0, onChange: function (v) { st.stagger = v; }, suffix: 'f' });
    loopBox.style.display = 'none';
    var advanced = el('details.rb-disclosure', null, [el('summary', { text: 'Advanced' }), el('div.rb-col', null, [qualityS.el])]);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Draw your route as a mask, then select that layer first and shift-select the layers to send. They travel the mask at a constant speed. Tip: select only the masked layer to send it along its own path.' }),
      previewHost,
      ui.row('Ease', easeSeg.el),
      durationS.el,
      orientTog.el, angleS.el,
      el('div.rb-section-label', { text: 'Travel window' }),
      startS.el, endS.el, reverseTog.el,
      el('div.rb-section-label', { text: 'Repeat & spread' }),
      loopTog.el, loopBox,
      el('div.rb-row.rb-wrap', null, [staggerS.el]),
      advanced
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Send along path']));

    // Read the actual route (the first selected layer's mask) so the scope text
    // tells the user exactly what will happen, not just a layer count.
    function refreshScope(sel) {
      scopeText.textContent = describe(sel);
      if (!ctx.invoke) return;
      ctx.invoke('pathfollow.read', {}).then(function (r) {
        if (!r) return;
        if (!r.ok) scopeText.textContent = r.reason === 'none' ? 'Select the masked layer, then the layers to send' : ('“' + (r.layerName || 'Layer') + '” has no mask, draw a path on it');
        else if (r.self) scopeText.textContent = 'Self-follow: “' + r.layerName + '” rides its own mask';
        else if (r.targets > 0) scopeText.textContent = 'Route: “' + r.maskName + '” mask, sending ' + r.targets + ' layer' + (r.targets === 1 ? '' : 's');
        else scopeText.textContent = 'Route ready, now also select the layers to move';
      }).catch(function () {});
    }
    var off = ctx.onSelection(refreshScope);
    refreshScope(ctx.getSelection());

    function doApply() {
      var payload = {};
      for (var k in st) if (st.hasOwnProperty(k)) payload[k] = st[k];
      payload.startOffset = st.startOffset / 100;
      payload.endOffset = st.endOffset / 100;
      payload.easeLut = easeLut(st.ease);
      ctx.invoke('pathfollow.apply', payload)
        .then(function (res) {
          ctx.toast('Sent ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's') + ' along the path', { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not follow the path', { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      if (s.ease) { st.ease = s.ease; easeSeg.set(s.ease); }
      if (s.duration != null) { st.duration = s.duration; durationS.set(s.duration); }
      if (s.orient != null) { st.orient = s.orient; orientTog.set(s.orient); angleS.el.style.display = s.orient ? '' : 'none'; }
      if (s.angleOffset != null) { st.angleOffset = s.angleOffset; angleS.set(s.angleOffset); }
      if (s.startOffset != null) { st.startOffset = s.startOffset; startS.set(s.startOffset); }
      if (s.endOffset != null) { st.endOffset = s.endOffset; endS.set(s.endOffset); }
      if (s.smoothness != null) { st.smoothness = s.smoothness; qualityS.set(s.smoothness); }
      if (s.reverse != null) { st.reverse = s.reverse; reverseTog.set(s.reverse); }
      if (s.loop != null) { st.loop = s.loop; loopTog.set(s.loop); loopBox.style.display = s.loop ? '' : 'none'; }
      if (s.loopCount != null) { st.loopCount = s.loopCount; loopCountS.set(s.loopCount); }
      if (s.pingpong != null) { st.pingpong = s.pingpong; pingTog.set(s.pingpong); }
      if (s.stagger != null) { st.stagger = s.stagger; staggerS.set(s.stagger); }
      rebuildPath();
    }

    return {
      presets: {
        toolId: 'pathfollow', get: getState, set: applyState,
        defaults: PATHFOLLOW_DEFAULTS
      },
      destroy: function () { running = false; if (raf) cancelAnimationFrame(raf); off(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select the path layer (+ layers to send)';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
