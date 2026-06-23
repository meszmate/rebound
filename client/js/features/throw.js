/*
 * Rebound, Throw tool (Dynamic-style physics toss).
 * Bakes a trajectory into Position keyframes from an initial velocity, drag,
 * gravity, and an optional floor bounce. The preview runs the same simulation
 * in JS and draws the predicted arc, so it reacts to every control. (A CEP panel
 * cannot grab a layer in the viewport, so this is parameter-driven rather than a
 * literal drag-to-throw.)
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Integrate the same model the host bakes, in synthetic world units, so the
  // preview arc matches the result's shape. Floor is synthetic for the preview.
  function simulate(st) {
    var fps = 60, dt = 1 / fps;
    var rad = (st.angle || 0) * Math.PI / 180;
    var vx = (st.strength || 0) * Math.cos(rad);
    var vy = -(st.strength || 0) * Math.sin(rad);
    var x = 0, y = 0, floor = 240;
    var pts = [[0, 0]];
    var frames = Math.round((st.duration || 1) * fps);
    for (var f = 1; f <= frames; f++) {
      var damp = Math.exp(-(st.drag || 0) * dt);
      vx *= damp; vy *= damp;
      vy += (st.gravity || 0) * dt;
      x += vx * dt; y += vy * dt;
      if (st.bounce && y > floor) { y = floor; vy = -vy * (st.elasticity || 0); vx *= 0.9; }
      pts.push([x, y]);
    }
    return pts;
  }

  function throwSvg(st, h) {
    var W = 160, H = 90, m = 12;
    var pts = simulate(st);
    var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][0] < minx) minx = pts[i][0];
      if (pts[i][0] > maxx) maxx = pts[i][0];
      if (pts[i][1] < miny) miny = pts[i][1];
      if (pts[i][1] > maxy) maxy = pts[i][1];
    }
    var sx = (W - 2 * m) / Math.max(1, maxx - minx);
    var sy = (H - 2 * m) / Math.max(1, maxy - miny);
    var s = Math.min(sx, sy);
    function mapx(x) { return m + (x - minx) * s; }
    function mapy(y) { return m + (y - miny) * s; }
    var d = '';
    for (var k = 0; k < pts.length; k++) d += (k === 0 ? 'M' : 'L') + R.units.round(mapx(pts[k][0]), 1) + ' ' + R.units.round(mapy(pts[k][1]), 1);
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('path', { d: d, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.85' }));
    kids.push(svg('circle', { cx: mapx(pts[0][0]), cy: mapy(pts[0][1]), r: 4.5, fill: 'var(--rb-accent)' }));
    var last = pts[pts.length - 1];
    kids.push(svg('circle', { cx: mapx(last[0]), cy: mapy(last[1]), r: 3, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4 }));
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'throw',
    title: 'Throw',
    group: 'Physics',
    order: 10,
    keywords: ['throw', 'dynamic', 'toss', 'momentum', 'gravity', 'drag', 'physics', 'launch', 'arc'],
    mount: mount
  });

  function mount(ctx) {
    var st = { angle: 45, strength: 700, gravity: 1400, drag: 0.5, duration: 1.6, bounce: false, elasticity: 0.5 };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(throwSvg(st, 90)); }

    var angleSlider = ui.slider({ label: 'Angle', min: -180, max: 180, step: 1, value: st.angle,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { st.angle = v; renderPreview(); } });
    var strengthSlider = ui.slider({ label: 'Strength', min: 0, max: 2000, step: 10, value: st.strength,
      format: function (v) { return Math.round(v) + ' px/s'; }, onInput: function (v) { st.strength = v; renderPreview(); } });
    var gravitySlider = ui.slider({ label: 'Gravity', min: 0, max: 3000, step: 10, value: st.gravity,
      format: function (v) { return Math.round(v); }, onInput: function (v) { st.gravity = v; renderPreview(); } });
    var dragSlider = ui.slider({ label: 'Drag', min: 0, max: 3, step: 0.05, value: st.drag,
      format: function (v) { return R.units.round(v, 2); }, onInput: function (v) { st.drag = v; renderPreview(); } });
    var durationSlider = ui.slider({ label: 'Duration', min: 0.2, max: 4, step: 0.1, value: st.duration,
      format: function (v) { return R.units.round(v, 1) + 's'; }, onInput: function (v) { st.duration = v; renderPreview(); } });

    var elasticitySlider = ui.slider({ label: 'Bounciness', min: 0, max: 0.95, step: 0.05, value: st.elasticity,
      format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { st.elasticity = v; renderPreview(); } });
    var bounceTog = ui.toggle({ label: 'Bounce off the floor', value: st.bounce, onChange: function (v) { st.bounce = v; elasticitySlider.el.style.display = v ? '' : 'none'; renderPreview(); } });
    elasticitySlider.el.style.display = st.bounce ? '' : 'none';

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Bakes a thrown trajectory into Position keyframes from the playhead, momentum, drag, and gravity.' }),
      previewHost,
      angleSlider.el,
      strengthSlider.el,
      gravitySlider.el,
      dragSlider.el,
      durationSlider.el,
      bounceTog.el,
      elasticitySlider.el
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

    function getState() { return { angle: st.angle, strength: st.strength, gravity: st.gravity, drag: st.drag, duration: st.duration, bounce: st.bounce, elasticity: st.elasticity }; }
    function applyState(s) {
      if (!s) return;
      if (s.angle != null) { st.angle = s.angle; angleSlider.set(s.angle); }
      if (s.strength != null) { st.strength = s.strength; strengthSlider.set(s.strength); }
      if (s.gravity != null) { st.gravity = s.gravity; gravitySlider.set(s.gravity); }
      if (s.drag != null) { st.drag = s.drag; dragSlider.set(s.drag); }
      if (s.duration != null) { st.duration = s.duration; durationSlider.set(s.duration); }
      if (s.bounce != null) { st.bounce = s.bounce; bounceTog.set(s.bounce); elasticitySlider.el.style.display = s.bounce ? '' : 'none'; }
      if (s.elasticity != null) { st.elasticity = s.elasticity; elasticitySlider.set(s.elasticity); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'throw',
        get: getState,
        set: applyState,
        thumbFor: function (s, opts) { return throwSvg(s, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Lob', state: { angle: 62, strength: 760, gravity: 1500, drag: 0.4, duration: 1.7, bounce: false } },
          { name: 'Flat throw', state: { angle: 14, strength: 1100, gravity: 700, drag: 0.8, duration: 1.3, bounce: false } },
          { name: 'Bounce', state: { angle: 72, strength: 820, gravity: 1900, drag: 0.3, duration: 2.4, bounce: true, elasticity: 0.5 } },
          { name: 'Drift', state: { angle: 40, strength: 420, gravity: 0, drag: 1.4, duration: 2, bounce: false } }
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
