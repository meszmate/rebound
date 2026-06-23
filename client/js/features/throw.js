/*
 * Rebound, Throw tool (physics-baked toss).
 * Real multi-bounce physics: fixed-substep symplectic Euler, air drag, gravity,
 * coefficient-of-restitution bounces (so it bounces many shrinking times and
 * settles), ground friction to roll-to-rest, optional box walls, spin, and
 * squash-on-impact. The preview runs the SAME simulation and animates a ball
 * down the actual trajectory so every control is visible. Bakes Position
 * (+ Rotation / Scale) keyframes. CEP can't grab a layer in the viewport, so
 * this is parameter-driven rather than a literal drag-throw.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;
  var round = function (v) { return R.units.round(v, 1); };

  // Keep byte-identical to host/commands/throw.jsx simulateThrow.
  function simulateThrow(cfg) {
    var H = 1 / 360;
    var sub = Math.ceil(360 / cfg.fps); if (sub < 1) sub = 1;
    var rad = cfg.angle * Math.PI / 180;
    var vx = cfg.strength * Math.cos(rad);
    var vy = -cfg.strength * Math.sin(rad);
    var x = 0, y = 0, ang = 0, omega = 0, squashS = 0;
    var rest = cfg.gravity * H * 4 + 4;
    var total = Math.round(cfg.duration * cfg.fps);
    var frames = [];
    var settledFrame = null;
    for (var f = 0; f <= total; f++) {
      frames.push({ x: x, y: y, ang: ang, s: squashS });
      for (var k = 0; k < sub; k++) {
        var damp = Math.exp(-cfg.drag * H);
        vx *= damp; vy *= damp;
        vy += cfg.gravity * H;
        var nx = x + vx * H, ny = y + vy * H;
        var hit = false, impact = 0;
        if (cfg.bounce && ny > cfg.floor) {
          var tHit = (cfg.floor - y) / (ny - y);
          if (!(tHit >= 0 && tHit <= 1)) tHit = 0;
          x += vx * H * tHit; y = cfg.floor;
          impact = Math.abs(vy);
          if (Math.abs(vy) < rest) { vy = 0; }
          else { vy = -cfg.e * vy; hit = true; }
          vx *= (1 - cfg.friction);
          x += vx * H * (1 - tHit); y += vy * H * (1 - tHit);
        } else { x = nx; y = ny; }
        if (cfg.bounds === 'box') {
          if (x < cfg.wallMin) { x = cfg.wallMin; vx = -cfg.e * vx; }
          if (x > cfg.wallMax) { x = cfg.wallMax; vx = -cfg.e * vx; }
          if (y < cfg.ceiling) { y = cfg.ceiling; vy = -cfg.e * vy; }
        }
        if (cfg.bounce && y >= cfg.floor - 0.001 && Math.abs(vy) < rest) {
          var dec = cfg.friction * cfg.gravity * H;
          if (Math.abs(vx) <= dec) vx = 0; else vx -= (vx > 0 ? dec : -dec);
        }
        if (cfg.spin === 'roll') {
          if (cfg.bounce && y >= cfg.floor - 0.001) omega = -vx / (cfg.radius < 1 ? 1 : cfg.radius);
          ang += omega * H * 180 / Math.PI * cfg.spinAmount;
        }
        if (cfg.squash && hit) {
          var imp = Math.min(1, impact / (cfg.strength * 0.5 + 1));
          var s2 = cfg.squashStrength / 100 * imp;
          if (s2 > squashS) squashS = s2;
        }
      }
      if (cfg.squash) squashS *= 0.6;
      if (cfg.spin === 'follow') ang = Math.atan2(vy, vx) * 180 / Math.PI * cfg.spinAmount;
      if (settledFrame === null && cfg.bounce && y >= cfg.floor - 0.5 && Math.abs(vx) < 1 && Math.abs(vy) < rest && f > 1) settledFrame = f;
    }
    return { frames: frames, settledFrame: settledFrame };
  }

  // Preview config: a synthetic floor/box below the start so bounces are visible.
  function previewCfg(st, duration) {
    return {
      fps: 60, duration: duration, angle: st.angle, strength: st.strength, gravity: st.gravity,
      drag: st.drag, bounce: st.bounce, e: Math.min(0.98, st.elasticity), friction: st.friction,
      bounds: st.bounds, floor: 200, wallMin: -150, wallMax: 150, ceiling: -240,
      spin: st.spin, spinAmount: st.spinAmount, squash: st.squash, squashStrength: st.squashStrength, radius: 16
    };
  }

  function throwSvg(st, h) {
    var W = 160, H = 90, m = 12;
    var frames = simulateThrow(previewCfg(st, st.duration)).frames;
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].x < minx) minx = frames[i].x;
      if (frames[i].x > maxx) maxx = frames[i].x;
      if (frames[i].y < miny) miny = frames[i].y;
      if (frames[i].y > maxy) maxy = frames[i].y;
    }
    if (st.bounce && 200 > maxy) maxy = 200; // keep the floor in view
    var s = Math.min((W - 2 * m) / Math.max(1, maxx - minx), (H - 2 * m) / Math.max(1, maxy - miny));
    function mx(x) { return m + (x - minx) * s; }
    function my(y) { return m + (y - miny) * s; }
    var d = '';
    for (var k = 0; k < frames.length; k++) d += (k === 0 ? 'M' : 'L') + round(mx(frames[k].x)) + ' ' + round(my(frames[k].y));
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (st.bounce) kids.push(svg('line', { x1: 2, y1: my(200), x2: W - 2, y2: my(200), stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }));
    // apex ticks: local minima of y (highest points), show shrinking bounces
    for (var a = 2; a < frames.length - 2; a++) {
      if (frames[a].y < frames[a - 2].y && frames[a].y <= frames[a + 2].y) {
        kids.push(svg('line', { x1: mx(frames[a].x), y1: my(frames[a].y) - 4, x2: mx(frames[a].x), y2: my(frames[a].y), stroke: 'var(--rb-accent)', 'stroke-width': 1, opacity: '0.5' }));
      }
    }
    kids.push(svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4, 'stroke-linejoin': 'round', opacity: '0.45' }));
    var ball = svg('circle', { r: 4.5, fill: 'var(--rb-accent)' }, [
      svg('animateMotion', { dur: Math.max(0.4, st.duration) + 's', repeatCount: 'indefinite', path: d, calcMode: 'linear' })
    ]);
    kids.push(ball);
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'throw',
    title: 'Throw',
    group: 'Physics',
    order: 10,
    keywords: ['throw', 'dynamic', 'toss', 'momentum', 'gravity', 'bounce', 'restitution', 'friction', 'roll', 'spin', 'physics', 'arc'],
    mount: mount
  });

  function mount(ctx) {
    var st = { angle: 45, strength: 700, gravity: 1400, drag: 0.5, duration: 1.8, bounce: true, elasticity: 0.6,
      friction: 0.25, bounds: 'floor', useLayerFloor: false, spin: 'off', spinAmount: 1, squash: false, squashStrength: 12 };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(throwSvg(st, 90)); }

    var angleS = ui.slider({ label: 'Angle', min: -180, max: 180, step: 1, value: st.angle, format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { st.angle = v; renderPreview(); } });
    var strengthS = ui.slider({ label: 'Strength', min: 0, max: 4000, step: 10, value: st.strength, format: function (v) { return Math.round(v) + ' px/s'; }, onInput: function (v) { st.strength = v; renderPreview(); } });
    var gravityS = ui.slider({ label: 'Gravity', min: 0, max: 4000, step: 10, value: st.gravity, format: function (v) { return Math.round(v); }, onInput: function (v) { st.gravity = v; renderPreview(); } });
    var dragS = ui.slider({ label: 'Air drag', min: 0, max: 3, step: 0.05, value: st.drag, format: function (v) { return R.units.round(v, 2); }, onInput: function (v) { st.drag = v; renderPreview(); } });
    var durationS = ui.slider({ label: 'Duration', min: 0.2, max: 6, step: 0.1, value: st.duration, format: function (v) { return R.units.round(v, 1) + 's'; }, onInput: function (v) { st.duration = v; renderPreview(); } });
    var autofit = el('button.rb-btn.is-ghost', { type: 'button', title: 'Set the duration so the bounces play out and settle',
      onclick: function () {
        var sim = simulateThrow(previewCfg(st, 8));
        if (sim.settledFrame) { st.duration = Math.max(0.2, Math.min(6, sim.settledFrame / 60 + 0.2)); durationS.set(st.duration); renderPreview(); }
        else ctx.toast('It never settles at these settings (try more drag or friction).', { kind: 'info' });
      } }, ['Auto-fit']);

    var elasticityS = ui.slider({ label: 'Bounciness', min: 0, max: 0.98, step: 0.01, value: st.elasticity, format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { st.elasticity = v; renderPreview(); } });
    var frictionS = ui.slider({ label: 'Ground friction', min: 0, max: 1, step: 0.01, value: st.friction, format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { st.friction = v; renderPreview(); } });
    var boundsSeg = ui.segmented([{ value: 'floor', label: 'Floor' }, { value: 'box', label: 'Box' }], { value: st.bounds, onChange: function (v) { st.bounds = v; renderPreview(); } });
    var floorTog = ui.toggle({ label: "Bounce on the layer's start line", value: st.useLayerFloor, onChange: function (v) { st.useLayerFloor = v; } });
    var bounceBox = el('div.rb-col', null, [elasticityS.el, frictionS.el, ui.row('Bounds', boundsSeg.el), floorTog.el]);
    var bounceTog = ui.toggle({ label: 'Bounce', value: st.bounce, onChange: function (v) { st.bounce = v; bounceBox.style.display = v ? '' : 'none'; renderPreview(); } });

    var spinSeg = ui.segmented([{ value: 'off', label: 'Off' }, { value: 'follow', label: 'Follow' }, { value: 'roll', label: 'Roll' }], { value: st.spin, onChange: function (v) { st.spin = v; spinAmtS.el.style.display = v === 'off' ? 'none' : ''; renderPreview(); } });
    var spinAmtS = ui.slider({ label: 'Spin amount', min: 0, max: 3, step: 0.05, value: st.spinAmount, format: function (v) { return R.units.round(v, 2) + '×'; }, onInput: function (v) { st.spinAmount = v; renderPreview(); } });
    spinAmtS.el.style.display = 'none';

    var squashStrengthS = ui.slider({ label: 'Squash strength', min: 0, max: 40, step: 1, value: st.squashStrength, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.squashStrength = v; renderPreview(); } });
    var squashTog = ui.toggle({ label: 'Squash on impact', value: st.squash, onChange: function (v) { st.squash = v; squashStrengthS.el.style.display = v ? '' : 'none'; renderPreview(); } });
    squashStrengthS.el.style.display = 'none';

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Bakes a thrown trajectory into keyframes: momentum, drag, gravity, and bounces that settle.' }),
      previewHost,
      angleS.el, strengthS.el, gravityS.el, dragS.el,
      el('div.rb-row.rb-wrap', null, [durationS.el]),
      el('div.rb-row.rb-wrap', null, [autofit]),
      el('div.rb-section-label', { text: 'Bounce' }),
      bounceTog.el, bounceBox,
      el('div.rb-section-label', { text: 'Extras' }),
      ui.row('Spin', spinSeg.el), spinAmtS.el,
      squashTog.el, squashStrengthS.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Throw']));
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('throw.apply', st)
        .then(function (res) { ctx.toast('Threw ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not throw', { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      if (s.angle != null) { st.angle = s.angle; angleS.set(s.angle); }
      if (s.strength != null) { st.strength = s.strength; strengthS.set(s.strength); }
      if (s.gravity != null) { st.gravity = s.gravity; gravityS.set(s.gravity); }
      if (s.drag != null) { st.drag = s.drag; dragS.set(s.drag); }
      if (s.duration != null) { st.duration = s.duration; durationS.set(s.duration); }
      if (s.bounce != null) { st.bounce = s.bounce; bounceTog.set(s.bounce); bounceBox.style.display = s.bounce ? '' : 'none'; }
      if (s.elasticity != null) { st.elasticity = s.elasticity; elasticityS.set(s.elasticity); }
      if (s.friction != null) { st.friction = s.friction; frictionS.set(s.friction); }
      if (s.bounds) { st.bounds = s.bounds; boundsSeg.set(s.bounds); }
      if (s.spin) { st.spin = s.spin; spinSeg.set(s.spin); spinAmtS.el.style.display = s.spin === 'off' ? 'none' : ''; }
      if (s.spinAmount != null) { st.spinAmount = s.spinAmount; spinAmtS.set(s.spinAmount); }
      if (s.squash != null) { st.squash = s.squash; squashTog.set(s.squash); squashStrengthS.el.style.display = s.squash ? '' : 'none'; }
      if (s.squashStrength != null) { st.squashStrength = s.squashStrength; squashStrengthS.set(s.squashStrength); }
      if (s.useLayerFloor != null) { st.useLayerFloor = s.useLayerFloor; floorTog.set(s.useLayerFloor); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'throw', get: getState, set: applyState,
        thumbFor: function (s, opts) { return throwSvg(s, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Bouncy ball', state: { angle: 70, strength: 900, gravity: 2000, drag: 0.2, duration: 2.6, bounce: true, elasticity: 0.75, friction: 0.1, bounds: 'floor', spin: 'off', squash: true, squashStrength: 18 } },
          { name: 'Dead drop', state: { angle: 80, strength: 500, gravity: 1800, drag: 0.4, duration: 1.6, bounce: true, elasticity: 0.25, friction: 0.5, bounds: 'floor', spin: 'off', squash: false } },
          { name: 'Roll out', state: { angle: 25, strength: 1100, gravity: 1600, drag: 0.2, duration: 2.4, bounce: true, elasticity: 0.5, friction: 0.4, bounds: 'floor', spin: 'roll', spinAmount: 1, squash: false } },
          { name: 'Lob', state: { angle: 62, strength: 760, gravity: 1500, drag: 0.4, duration: 1.7, bounce: false, spin: 'follow', spinAmount: 1, squash: false } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to throw';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
