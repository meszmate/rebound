/*
 * Rebound, Squash & Stretch tool.
 * Volume-preserving squash on Scale, in two modes: One-shot (a triggered impact
 * that springs back with a decaying-sine follow-through) and Smart (stretch
 * driven live by the layer's speed). Optional base/contact pivot squashes onto
 * the ground instead of toward the center. The preview is a live bouncing blob
 * that actually drops, squashes on contact, and jiggles to rest, reacting to
 * every control, so you can watch the result before applying.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;
  function r1(v) { return R.units.round(v, 1); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // Static tile thumbnail (the in-panel preview animates; tiles can't).
  function squashThumb(s, h) {
    s = s || {};
    var amt = clamp(((s.mode === 'smart' ? (s.max || 40) : (s.amount || 30)) / 100), 0, 0.8);
    var fy = 1 - amt, fx = 1 / (1 - amt);
    var horiz = s.axis === 'horizontal';
    var rx = 14 * (horiz ? fy : fx), ry = 14 * (horiz ? fx : fy);
    var floorY = 44, cx = 30;
    var cy = (s.pivot === 'center') ? (floorY - 14) : (floorY - ry);
    return svg('svg', { viewBox: '0 0 60 50', width: '100%', height: h }, [
      svg('line', { x1: 6, y1: floorY, x2: 54, y2: floorY, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }),
      svg('ellipse', { cx: cx, cy: r1(cy), rx: r1(rx), ry: r1(ry), fill: 'var(--rb-accent)', 'fill-opacity': '0.9' })
    ]);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var SQUASH_DEFAULTS = [
    { name: 'Impact', state: { mode: 'oneshot', amount: 45, follow: true, wobbles: 3, decay: 7, pivot: 'base', axis: 'vertical', volume: 100 } },
    { name: 'Jelly', state: { mode: 'oneshot', amount: 35, follow: true, wobbles: 5, decay: 3, pivot: 'base', axis: 'vertical', volume: 100 } },
    { name: 'Clean hit', state: { mode: 'oneshot', amount: 40, follow: false, decay: 9, pivot: 'base', axis: 'vertical', volume: 100 } },
    { name: 'Smart', state: { mode: 'smart', sensitivity: 80, max: 50, smoothing: 3, pivot: 'center', axis: 'auto', volume: 100 } }
  ];
  R.toolPresets.declare('squash', { defaults: SQUASH_DEFAULTS });

  R.tools.register({
    id: 'squash',
    title: 'Squash',
    group: 'Physics',
    order: 9,
    quick: {
      desc: 'Squash and stretch the selected layers with a one-shot impact at the playhead.',
      method: 'squash.apply',
      args: { mode: 'oneshot', amount: 35, pivot: 'base', axis: 'vertical', volume: 100, follow: true, wobbles: 2.5, decay: 6, sensitivity: 60, max: 40, smoothing: 3 },
      config: [{ arg: 'mode', label: 'Mode', type: 'select', options: [
        { value: 'oneshot', label: 'One-shot' },
        { value: 'smart', label: 'Smart' }
      ] }]
    },
    keywords: ['squash', 'stretch', 'smart', 'jiggle', 'wobble', 'follow through', 'bounce', 'impact', 'volume', 'deform', 'physics'],
    mount: mount
  });

  function mount(ctx) {
    var st = { mode: 'oneshot', amount: 35, pivot: 'base', axis: 'vertical', volume: 100,
      follow: true, wobbles: 2.5, decay: 6, sensitivity: 60, max: 40, smoothing: 3 };

    // ---- live bouncing-blob preview (rAF) ----------------------------------
    var FLOOR = 72, BASE = 15, AMP = 34, P = 1.5, CX = 80;
    var floorLine = svg('line', { x1: 18, y1: FLOOR, x2: 142, y2: FLOOR, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 });
    var ghost = svg('ellipse', { cx: CX, cy: FLOOR - BASE, rx: BASE, ry: BASE, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-dasharray': '2 3', opacity: '0.35' });
    var shadow = svg('ellipse', { cx: CX, cy: FLOOR + 2, rx: BASE, ry: 2.5, fill: 'var(--rb-text-faint)', opacity: '0.25' });
    var blob = svg('ellipse', { cx: CX, cy: FLOOR - BASE, rx: BASE, ry: BASE, fill: 'var(--rb-accent)', 'fill-opacity': '0.92' });
    var stage = svg('svg', { viewBox: '0 0 160 90', width: '100%', height: '90' }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      floorLine, ghost, shadow, blob
    ]);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);

    var raf = null, start = (window.performance && performance.now) ? performance.now() : 0, running = true;
    function tick(now) {
      if (!running) return;
      var tsec = ((window.performance && performance.now) ? now : Date.now()) / 1000 - start / 1000;
      var u = (tsec % P) / P;
      var H = AMP * Math.pow(2 * u - 1, 2);          // height above floor (parabolic bounce)
      var speed = Math.abs(4 * AMP * (2 * u - 1)) / P; // |dH/dt|
      var primary, off; // primary = squash-axis factor, off = perpendicular
      if (st.mode === 'oneshot') {
        var tSince = (u >= 0.5 ? (u - 0.5) : (u + 0.5)) * P;
        var amp = st.amount / 100;
        var s = st.follow ? amp * Math.cos(tSince * st.wobbles * 2 * Math.PI) * Math.exp(-tSince * st.decay)
                          : amp * Math.exp(-tSince * st.decay);
        s = clamp(s, -0.9, 0.9);
        primary = 1 - s; off = 1 + (1 / (1 - s) - 1) * (st.volume / 100);
      } else {
        var str = clamp(speed * st.sensitivity / 1400, 0, st.max / 100);
        primary = 1 + str; off = 1 + (1 / (1 + str) - 1) * (st.volume / 100);
        ghost.setAttribute('opacity', '0.35');
      }
      ghost.setAttribute('opacity', st.mode === 'smart' ? '0.3' : '0');
      var horiz = st.axis === 'horizontal';
      var rx = BASE * (horiz ? primary : off);
      var ry = BASE * (horiz ? off : primary);
      var cy = st.pivot === 'base' ? (FLOOR - H - ry) : (FLOOR - H - BASE);
      blob.setAttribute('cx', CX); blob.setAttribute('cy', r1(cy));
      blob.setAttribute('rx', r1(rx)); blob.setAttribute('ry', r1(ry));
      var near = clamp(1 - H / AMP, 0, 1); // 1 at floor contact
      shadow.setAttribute('rx', r1(BASE * (0.6 + 0.5 * near) * (rx / BASE)));
      shadow.setAttribute('opacity', (0.12 + 0.18 * near).toFixed(2));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // ---- controls ----------------------------------------------------------
    var modeSeg = ui.segmented([{ value: 'oneshot', label: 'One-shot' }, { value: 'smart', label: 'Smart' }],
      { value: st.mode, onChange: function (v) { st.mode = v; syncMode(); } });

    var amountS = ui.slider({ label: 'Amount', min: 0, max: 100, step: 1, value: st.amount, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.amount = v; } });
    var followTog = ui.toggle({ label: 'Follow-through (jiggle)', value: st.follow, onChange: function (v) { st.follow = v; wobBox.style.display = v ? '' : 'none'; } });
    var wobblesS = ui.slider({ label: 'Wobbles', min: 0.5, max: 8, step: 0.1, value: st.wobbles, format: function (v) { return R.units.round(v, 1) + '/s'; }, onInput: function (v) { st.wobbles = v; } });
    var decayS = ui.slider({ label: 'Settle', min: 1, max: 20, step: 0.5, value: st.decay, format: function (v) { return R.units.round(v, 1); }, onInput: function (v) { st.decay = v; } });
    var wobBox = el('div.rb-col', null, [wobblesS.el, decayS.el]);
    var oneShotBox = el('div.rb-col', null, [amountS.el, followTog.el, wobBox]);

    var sensS = ui.slider({ label: 'Sensitivity', min: 0, max: 200, step: 1, value: st.sensitivity, format: function (v) { return Math.round(v); }, onInput: function (v) { st.sensitivity = v; } });
    var maxS = ui.slider({ label: 'Max stretch', min: 0, max: 90, step: 1, value: st.max, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.max = v; } });
    var smoothS = ui.slider({ label: 'Smoothing', min: 0, max: 12, step: 1, value: st.smoothing, format: function (v) { return Math.round(v) + 'f'; }, onInput: function (v) { st.smoothing = v; } });
    var smartBox = el('div.rb-col', null, [sensS.el, maxS.el, smoothS.el]);

    var pivotSeg = ui.segmented([{ value: 'base', label: 'Base' }, { value: 'center', label: 'Center' }], { value: st.pivot, onChange: function (v) { st.pivot = v; } });
    var axisSeg = ui.segmented([{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'auto', label: 'Auto' }], { value: st.axis, onChange: function (v) { st.axis = v; } });
    var volumeS = ui.slider({ label: 'Volume preservation', min: 0, max: 100, step: 1, value: st.volume, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.volume = v; } });

    function syncMode() {
      oneShotBox.style.display = st.mode === 'oneshot' ? '' : 'none';
      smartBox.style.display = st.mode === 'smart' ? '' : 'none';
    }
    syncMode();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Volume-preserving squash. One-shot springs and settles on a trigger; Smart reacts to the layer’s motion.' }),
      previewHost,
      ui.row('Mode', modeSeg.el),
      oneShotBox,
      smartBox,
      el('div.rb-section-label', { text: 'Shape' }),
      ui.row('Pivot', pivotSeg.el),
      ui.row('Axis', axisSeg.el),
      volumeS.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, [st.mode === 'oneshot' ? 'Apply at playhead' : 'Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('squash.apply', st)
        .then(function (res) { ctx.toast((res.mode === 'smart' ? 'Smart squash' : 'Squash') + ' on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Squash', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('squash.remove', {})
        .then(function (res) { ctx.toast('Removed Squash from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      if (s.mode) { st.mode = s.mode; modeSeg.set(s.mode); }
      if (s.amount != null) { st.amount = s.amount; amountS.set(s.amount); }
      if (s.follow != null) { st.follow = s.follow; followTog.set(s.follow); wobBox.style.display = s.follow ? '' : 'none'; }
      if (s.wobbles != null) { st.wobbles = s.wobbles; wobblesS.set(s.wobbles); }
      if (s.decay != null) { st.decay = s.decay; decayS.set(s.decay); }
      if (s.sensitivity != null) { st.sensitivity = s.sensitivity; sensS.set(s.sensitivity); }
      if (s.max != null) { st.max = s.max; maxS.set(s.max); }
      if (s.smoothing != null) { st.smoothing = s.smoothing; smoothS.set(s.smoothing); }
      if (s.pivot) { st.pivot = s.pivot; pivotSeg.set(s.pivot); }
      if (s.axis) { st.axis = s.axis; axisSeg.set(s.axis); }
      if (s.volume != null) { st.volume = s.volume; volumeS.set(s.volume); }
      syncMode();
    }

    return {
      presets: {
        toolId: 'squash', get: getState, set: applyState,
        thumbFor: function (s, opts) { return squashThumb(s, (opts && opts.height) || 34); },
        defaults: SQUASH_DEFAULTS
      },
      destroy: function () { running = false; if (raf) cancelAnimationFrame(raf); off(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
