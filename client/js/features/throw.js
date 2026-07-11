/*
 * Rebound, Throw tool (physics-baked toss).
 * Real multi-bounce physics: fixed-substep symplectic Euler, air drag, gravity,
 * coefficient-of-restitution bounces (so it bounces many shrinking times and
 * settles), ground friction to roll-to-rest, optional box walls, spin, and
 * squash-on-impact. The preview runs the SAME simulation and animates a ball
 * down the actual trajectory so every control is visible, and the launch
 * vector is draggable right on the stage (drag from anywhere: direction sets
 * Angle, length sets Strength; the sliders follow). Bakes Position
 * (+ Rotation / Scale) keyframes. CEP can't grab a layer in the viewport, so
 * the in-comp part stays parameter-driven.
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
      var sp = Math.sqrt(vx * vx + vy * vy);
      var stretch = Math.min(sp * cfg.stretchSens / 1000, cfg.stretchMax);
      frames.push({ x: x, y: y, ang: ang, s: squashS, st: stretch, va: Math.atan2(vy, vx) * 180 / Math.PI });
      for (var k = 0; k < sub; k++) {
        var damp = Math.exp(-cfg.drag * H);
        vx *= damp; vy *= damp;
        vy += cfg.gravity * H;
        vx += cfg.windX * H; vy += cfg.windY * H;
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
      if (cfg.squash) squashS *= 0.8;
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
      spin: st.spin, spinAmount: st.spinAmount, squash: st.squash, squashStrength: st.squashStrength, radius: 16,
      // Negated sin matches the throw-angle convention: +90 degrees is up.
      windX: (st.windStrength || 0) * Math.cos((st.windAngle || 0) * Math.PI / 180),
      windY: -(st.windStrength || 0) * Math.sin((st.windAngle || 0) * Math.PI / 180),
      stretchSens: st.stretch ? (st.stretchAmt || 60) : 0,
      stretchMax: (st.stretchAmt || 60) / 100
    };
  }

  // Pick a duration that lets the motion play out: the settle time when it
  // bounces, else the moment it has fallen well past the floor.
  function autoDuration(st) {
    var sim = simulateThrow(previewCfg(st, 8));
    if (sim.settledFrame) return Math.max(0.4, Math.min(6, sim.settledFrame / 60 + 0.3));
    var f = sim.frames;
    for (var i = 0; i < f.length; i++) if (f[i].y > 320) return Math.max(0.4, Math.min(6, i / 60 + 0.2));
    return 2.5;
  }

  // Fit the simulation to the preview canvas. fitted[] is one point per comp
  // frame (TIME-ordered), so a player indexing it by elapsed time replays the
  // real physics, accelerating under gravity and pausing at the apex (a
  // constant-speed animateMotion would not, which read as unnatural).
  function computeGeom(st) {
    var W = 160, H = 90, m = 12;
    var sim = simulateThrow(previewCfg(st, st.duration));
    var frames = sim.frames;
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].x < minx) minx = frames[i].x;
      if (frames[i].x > maxx) maxx = frames[i].x;
      if (frames[i].y < miny) miny = frames[i].y;
      if (frames[i].y > maxy) maxy = frames[i].y;
    }
    if (st.bounce && 200 > maxy) maxy = 200;
    var s = Math.min((W - 2 * m) / Math.max(1, maxx - minx), (H - 2 * m) / Math.max(1, maxy - miny));
    function mx(x) { return m + (x - minx) * s; }
    function my(y) { return m + (y - miny) * s; }
    var fitted = [], d = '';
    for (var k = 0; k < frames.length; k++) {
      var px = mx(frames[k].x), py = my(frames[k].y);
      fitted.push({ x: px, y: py, s: frames[k].s, ang: frames[k].ang });
      d += (k === 0 ? 'M' : 'L') + round(px) + ' ' + round(py);
    }
    var ticks = [];
    for (var a = 2; a < frames.length - 2; a++) {
      if (frames[a].y < frames[a - 2].y && frames[a].y <= frames[a + 2].y) ticks.push({ x: mx(frames[a].x), y: my(frames[a].y) });
    }
    return { fitted: fitted, d: d, floorY: st.bounce ? my(200) : null, ticks: ticks, settled: sim.settledFrame };
  }

  // Static thumbnail (preset tiles): the trajectory + a dot at the launch point.
  function throwSvg(st, h) {
    var g = computeGeom(st);
    var kids = [svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (g.floorY != null) kids.push(svg('line', { x1: 2, y1: g.floorY, x2: 158, y2: g.floorY, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }));
    kids.push(svg('path', { d: g.d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4, 'stroke-linejoin': 'round', opacity: '0.5' }));
    if (g.fitted.length) kids.push(svg('circle', { cx: round(g.fitted[0].x), cy: round(g.fitted[0].y), r: 4, fill: 'var(--rb-accent)' }));
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var THROW_DEFAULTS = [
    { name: 'Bouncy ball', state: { angle: 70, strength: 900, gravity: 2000, drag: 0.2, duration: 2.6, bounce: true, elasticity: 0.75, friction: 0.1, bounds: 'floor', spin: 'off', squash: true, squashStrength: 18 } },
    { name: 'Dead drop', state: { angle: 80, strength: 500, gravity: 1800, drag: 0.4, duration: 1.6, bounce: true, elasticity: 0.25, friction: 0.5, bounds: 'floor', spin: 'off', squash: false } },
    { name: 'Roll out', state: { angle: 25, strength: 1100, gravity: 1600, drag: 0.2, duration: 2.4, bounce: true, elasticity: 0.5, friction: 0.4, bounds: 'floor', spin: 'roll', spinAmount: 1, squash: false } },
    { name: 'Lob', state: { angle: 62, strength: 760, gravity: 1500, drag: 0.4, duration: 1.7, bounce: false, spin: 'follow', spinAmount: 1, squash: false } }
  ];
  R.toolPresets.declare('throw', { defaults: THROW_DEFAULTS });

  R.tools.register({
    id: 'throw',
    title: 'Throw',
    group: 'Physics',
    order: 10,
    quick: {
      desc: 'Bake a physics toss into the selected layers, with gravity, drag, and bounces that settle.',
      method: 'throw.apply',
      args: { angle: 45, strength: 700, gravity: 1400, drag: 0.5, duration: 1.8, autoDur: true, bounce: true, elasticity: 0.6, friction: 0.25, bounds: 'floor', useLayerFloor: false, spin: 'off', spinAmount: 1, squash: false, squashStrength: 28, windAngle: 0, windStrength: 0, stretch: false, stretchAmt: 50, motionBlur: false }
    },
    keywords: ['throw', 'dynamic', 'toss', 'momentum', 'gravity', 'bounce', 'restitution', 'friction', 'roll', 'spin', 'physics', 'arc'],
    mount: mount
  });

  function mount(ctx) {
    var st = { angle: 45, strength: 700, gravity: 1400, drag: 0.5, duration: 1.8, autoDur: true, bounce: true, elasticity: 0.6,
      friction: 0.25, bounds: 'floor', useLayerFloor: false, spin: 'off', spinAmount: 1, squash: false, squashStrength: 28,
      windAngle: 0, windStrength: 0, stretch: false, stretchAmt: 50, motionBlur: false };

    // Live preview: static path/floor/ticks rebuilt on change, plus a marker
    // PLAYED by time so the motion accelerates and bounces like the real bake.
    var pathGroup = svg('g');
    var vectorGroup = svg('g'); // the faint, draggable launch vector
    var ghosts = [];
    for (var gi = 0; gi < 4; gi++) ghosts.push(svg('ellipse', { cx: 0, cy: 0, rx: 4.5, ry: 4.5, fill: 'var(--rb-accent)', 'fill-opacity': '0' }));
    var marker = svg('ellipse', { cx: 0, cy: 0, rx: 4.5, ry: 4.5, fill: 'var(--rb-accent)' });
    var stage = svg('svg', { viewBox: '0 0 160 90', width: '100%', height: '90' },
      [svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }), pathGroup, vectorGroup].concat(ghosts, [marker]));
    stage.style.cursor = 'crosshair';
    stage.style.touchAction = 'none';
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);
    var geom = computeGeom(st);
    function renderPreview() {
      if (st.autoDur) { st.duration = autoDuration(st); if (durationS) durationS.set(st.duration); }
      geom = computeGeom(st);
      R.dom.clear(pathGroup);
      if (geom.floorY != null) pathGroup.appendChild(svg('line', { x1: 2, y1: geom.floorY, x2: 158, y2: geom.floorY, stroke: 'var(--rb-text-faint)', 'stroke-width': 1 }));
      for (var i = 0; i < geom.ticks.length; i++) pathGroup.appendChild(svg('line', { x1: geom.ticks[i].x, y1: geom.ticks[i].y - 4, x2: geom.ticks[i].x, y2: geom.ticks[i].y, stroke: 'var(--rb-accent)', 'stroke-width': 1, opacity: '0.5' }));
      pathGroup.appendChild(svg('path', { d: geom.d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4, 'stroke-linejoin': 'round', opacity: '0.4' }));
      renderVector();
    }

    // The current launch vector, drawn faint from the launch point. Screen
    // direction is (cos, -sin): +90 degrees is up, SVG y grows downward.
    function renderVector() {
      R.dom.clear(vectorGroup);
      if (!geom.fitted.length) return;
      var p0 = geom.fitted[0];
      var rad = st.angle * Math.PI / 180;
      var len = 12 + Math.min(1, st.strength / 4000) * 34;
      var tipX = p0.x + Math.cos(rad) * len, tipY = p0.y - Math.sin(rad) * len;
      var ha = Math.atan2(tipY - p0.y, tipX - p0.x);
      var h1x = tipX + Math.cos(ha + 2.6) * 5, h1y = tipY + Math.sin(ha + 2.6) * 5;
      var h2x = tipX + Math.cos(ha - 2.6) * 5, h2y = tipY + Math.sin(ha - 2.6) * 5;
      vectorGroup.appendChild(svg('line', { x1: round(p0.x), y1: round(p0.y), x2: round(tipX), y2: round(tipY), stroke: 'var(--rb-text-faint)', 'stroke-width': 1.2, opacity: '0.65' }));
      vectorGroup.appendChild(svg('path', { d: 'M' + round(h1x) + ' ' + round(h1y) + ' L' + round(tipX) + ' ' + round(tipY) + ' L' + round(h2x) + ' ' + round(h2y), fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1.2, opacity: '0.65' }));
    }

    // Drag the launch vector right on the stage: direction = Angle (atan2),
    // length = Strength; the sliders follow live. Pointer events are bound to
    // the stage (an svg), NOT a button: CEF fires pointerdown on plain
    // elements but swallows it on <button>s.
    function stagePoint(e) {
      var r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: (e.clientX - r.left) / r.width * 160, y: (e.clientY - r.top) / r.height * 90 };
    }
    function dragTo(e) {
      var pt = stagePoint(e);
      if (!pt || !geom.fitted.length) return;
      var p0 = geom.fitted[0];
      var dx = pt.x - p0.x, dy = pt.y - p0.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1.5) return; // a click right on the launch point is not a throw
      st.angle = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI);
      st.strength = Math.round(Math.min(4000, len * 45) / 10) * 10;
      angleS.set(st.angle);
      strengthS.set(st.strength);
      renderPreview();
    }
    var dragging = false;
    function onDragMove(e) { if (dragging) dragTo(e); }
    function onDragEnd() { dragging = false; window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragEnd); }
    stage.addEventListener('pointerdown', function (e) {
      dragging = true;
      dragTo(e);
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
      if (e.preventDefault) e.preventDefault();
    });
    // Place a marker ellipse at a (fractional) frame index, applying squash,
    // stretch and spin so all three are visible in the preview.
    function place(elm, idx, opacity) {
      var f = geom.fitted; if (!f.length) return;
      if (idx < 0) idx = 0; if (idx > f.length - 1) idx = f.length - 1;
      var i = Math.floor(idx), fr = idx - i, a = f[i], b = f[Math.min(f.length - 1, i + 1)];
      var x = a.x + (b.x - a.x) * fr, y = a.y + (b.y - a.y) * fr;
      var stv = st.stretch ? (a.st || 0) : 0;
      var sq = st.squash ? (a.s || 0) : 0; if (sq > 0.8) sq = 0.8;
      var rx, ry, rot;
      if (stv > 0.001) { rx = 4.5 * (1 + stv); ry = 4.5 / (1 + stv); rot = a.va || 0; }
      else { rx = 4.5 / (1 - sq); ry = 4.5 * (1 - sq); rot = (st.spin !== 'off') ? (a.ang || 0) : 0; }
      elm.setAttribute('rx', round(rx)); elm.setAttribute('ry', round(ry));
      elm.setAttribute('transform', 'translate(' + round(x) + ',' + round(y) + ') rotate(' + round(rot) + ')');
      elm.setAttribute('fill-opacity', '' + opacity);
    }
    var sim = R.ui.miniSim({ el: previewHost, draw: function (te) {
      var f = geom.fitted;
      if (!f.length) return;
      var span = (geom.settled != null ? geom.settled / 60 : st.duration);
      var t = te % (span + 0.6);
      var idx = t * 60; if (idx > f.length - 1) idx = f.length - 1;
      place(marker, idx, 1);
      for (var k = 0; k < ghosts.length; k++) {
        if (st.motionBlur) place(ghosts[k], idx - (k + 1) * 2.5, 0.26 - k * 0.06);
        else ghosts[k].setAttribute('fill-opacity', '0');
      }
    } });

    var angleS = ui.slider({ label: 'Angle', min: -180, max: 180, step: 1, value: st.angle, format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { st.angle = v; renderPreview(); } });
    var strengthS = ui.slider({ label: 'Strength', min: 0, max: 4000, step: 10, value: st.strength, format: function (v) { return Math.round(v) + ' px/s'; }, onInput: function (v) { st.strength = v; renderPreview(); } });
    var gravityS = ui.slider({ label: 'Gravity', min: 0, max: 4000, step: 10, value: st.gravity, format: function (v) { return Math.round(v); }, onInput: function (v) { st.gravity = v; renderPreview(); } });
    var dragS = ui.slider({ label: 'Air drag', min: 0, max: 3, step: 0.05, value: st.drag, format: function (v) { return R.units.round(v, 2); }, onInput: function (v) { st.drag = v; renderPreview(); } });
    var durationS = ui.slider({ label: 'Duration', min: 0.2, max: 6, step: 0.1, value: st.duration, format: function (v) { return R.units.round(v, 1) + 's'; }, onInput: function (v) { if (st.autoDur) return; st.duration = v; renderPreview(); } });
    function syncAuto() { durationS.el.style.opacity = st.autoDur ? '0.5' : '1'; durationS.el.style.pointerEvents = st.autoDur ? 'none' : ''; }
    var autoTog = ui.toggle({ label: 'Auto duration', value: st.autoDur, onChange: function (v) { st.autoDur = v; syncAuto(); renderPreview(); } });
    syncAuto();

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

    var stretchAmtS = ui.slider({ label: 'Stretch amount', min: 0, max: 100, step: 1, value: st.stretchAmt, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.stretchAmt = v; renderPreview(); } });
    var stretchTog = ui.toggle({ label: 'Stretch with speed (smear)', value: st.stretch, onChange: function (v) { st.stretch = v; stretchAmtS.el.style.display = v ? '' : 'none'; renderPreview(); } });
    stretchAmtS.el.style.display = 'none';
    var windAngleS = ui.slider({ label: 'Wind angle', min: -180, max: 180, step: 1, value: st.windAngle, format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { st.windAngle = v; renderPreview(); } });
    var windStrengthS = ui.slider({ label: 'Wind strength', min: 0, max: 2000, step: 10, value: st.windStrength, format: function (v) { return Math.round(v); }, onInput: function (v) { st.windStrength = v; renderPreview(); } });
    var mblurTog = ui.toggle({ label: 'Motion blur', value: st.motionBlur, onChange: function (v) { st.motionBlur = v; } });

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Bakes a thrown trajectory into keyframes: momentum, drag, gravity, and bounces that settle.' }),
      previewHost,
      angleS.el, strengthS.el, gravityS.el, dragS.el,
      autoTog.el, durationS.el,
      el('div.rb-section-label', { text: 'Bounce' }),
      bounceTog.el, bounceBox,
      el('div.rb-section-label', { text: 'Wind' }),
      windAngleS.el, windStrengthS.el,
      el('div.rb-section-label', { text: 'Style' }),
      ui.row('Spin', spinSeg.el), spinAmtS.el,
      squashTog.el, squashStrengthS.el,
      stretchTog.el, stretchAmtS.el,
      mblurTog.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Throw']);
    ctx.footer.appendChild(applyBtn);
    function syncButtons(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.selectedLayerCount);
    }
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); syncButtons(sel); });
    scopeText.textContent = describe(ctx.getSelection());
    syncButtons(ctx.getSelection());

    function doApply() {
      ctx.invoke('throw.apply', st)
        .then(function (res) {
          ctx.toast('Threw ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not throw', { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      if (s.angle != null) { st.angle = s.angle; angleS.set(s.angle); }
      if (s.strength != null) { st.strength = s.strength; strengthS.set(s.strength); }
      if (s.gravity != null) { st.gravity = s.gravity; gravityS.set(s.gravity); }
      if (s.drag != null) { st.drag = s.drag; dragS.set(s.drag); }
      if (s.autoDur != null) { st.autoDur = s.autoDur; autoTog.set(s.autoDur); syncAuto(); }
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
      if (s.windAngle != null) { st.windAngle = s.windAngle; windAngleS.set(s.windAngle); }
      if (s.windStrength != null) { st.windStrength = s.windStrength; windStrengthS.set(s.windStrength); }
      if (s.stretch != null) { st.stretch = s.stretch; stretchTog.set(s.stretch); stretchAmtS.el.style.display = s.stretch ? '' : 'none'; }
      if (s.stretchAmt != null) { st.stretchAmt = s.stretchAmt; stretchAmtS.set(s.stretchAmt); }
      if (s.motionBlur != null) { st.motionBlur = s.motionBlur; mblurTog.set(s.motionBlur); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'throw', get: getState, set: applyState,
        thumbFor: function (s, opts) { return throwSvg(s, (opts && opts.height) || 34); },
        defaults: THROW_DEFAULTS
      },
      destroy: function () { sim.destroy(); onDragEnd(); off(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to throw';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
