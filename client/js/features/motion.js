/*
 * Rebound, Motion tool.
 * Auto-motion rig with three modes (Orbit / Spin / Look At) applied as
 * marker-guarded, art-directable expressions backed by Slider Controls.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A ~270° arc with an arrowhead, clockwise for dir>0.
  function spinGlyph(cx, cy, r, dir) {
    var a0 = -Math.PI / 2, a1 = a0 + dir * Math.PI * 1.5;
    var p0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
    var p1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    var sweep = dir > 0 ? 1 : 0;
    var d = 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 1 ' + sweep + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1);
    var ta = a1 + dir * Math.PI / 2;
    var h1 = [p1[0] + Math.cos(ta + 2.4) * 5, p1[1] + Math.sin(ta + 2.4) * 5];
    var h2 = [p1[0] + Math.cos(ta - 2.4) * 5, p1[1] + Math.sin(ta - 2.4) * 5];
    return d + ' M' + h1[0].toFixed(1) + ' ' + h1[1].toFixed(1) + ' L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' L' + h2[0].toFixed(1) + ' ' + h2[1].toFixed(1);
  }

  function motionSvg(state, h) {
    var W = 160, H = 100, cx = W / 2, cy = H / 2;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (state.mode === 'orbit') {
      var r = Math.max(8, Math.min(40, (state.orbitRadius || 0) / 1000 * 40 + 8));
      var dir = (state.orbitSpeed || 0) >= 0 ? 1 : -1;
      kids.push(svg('circle', { cx: cx, cy: cy, r: r.toFixed(1), fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0.6' }));
      kids.push(svg('path', { d: spinGlyph(cx, cy, r, dir), fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.3, opacity: '0.75' }));
      kids.push(svg('circle', { cx: cx, cy: cy, r: 2, fill: 'var(--rb-text-faint)' }));
      var dx = cx + Math.cos(-0.7) * r, dy = cy + Math.sin(-0.7) * r;
      kids.push(svg('rect', { x: (dx - 7).toFixed(1), y: (dy - 7).toFixed(1), width: 14, height: 14, rx: 2, fill: 'var(--rb-accent)' }));
    } else if (state.mode === 'spin') {
      var spd = state.spinSpeed || 0, rot = Math.max(-46, Math.min(46, spd * 0.06));
      kids.push(svg('path', { d: spinGlyph(cx, cy, 32, spd >= 0 ? 1 : -1), fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.3, opacity: '0.7' }));
      kids.push(svg('g', { transform: 'translate(' + cx + ',' + cy + ') rotate(' + rot + ')' }, [
        svg('rect', { x: -20, y: -13, width: 40, height: 26, rx: 3, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' }),
        svg('rect', { x: -20, y: -13, width: 7, height: 26, rx: 1, fill: '#fff', 'fill-opacity': '0.3' })
      ]));
    } else {
      var lx = cx - 42, ly = cy + 12, tx = cx + 44, ty = cy - 24;
      var ang = Math.atan2(ty - ly, tx - lx) * 180 / Math.PI;
      kids.push(svg('line', { x1: lx, y1: ly, x2: tx, y2: ty, stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
      kids.push(svg('circle', { cx: tx, cy: ty, r: 4, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }));
      kids.push(svg('line', { x1: tx - 7, y1: ty, x2: tx + 7, y2: ty, stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
      kids.push(svg('line', { x1: tx, y1: ty - 7, x2: tx, y2: ty + 7, stroke: 'var(--rb-accent)', 'stroke-width': 1 }));
      kids.push(svg('g', { transform: 'translate(' + lx + ',' + ly + ') rotate(' + ang.toFixed(1) + ')' }, [
        svg('rect', { x: -16, y: -10, width: 32, height: 20, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' }),
        svg('path', { d: 'M16 0 L25 0 M20 -3 L26 0 L20 3', fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4 })
      ]));
    }
    return svg('svg', { viewBox: '0 0 160 100', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'motion',
    title: 'Motion',
    group: 'Physics',
    order: 3,
    keywords: ['motion', 'orbit', 'spin', 'rotate', 'look at', 'auto', 'rig', 'circle', 'aim'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'spin';
    var spinSpeed = 90;
    var orbitRadius = 150;
    var orbitSpeed = 60;

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(motionSvg({ mode: mode, spinSpeed: spinSpeed, orbitRadius: orbitRadius, orbitSpeed: orbitSpeed }, 100)); }

    var modeSeg = ui.segmented([
      { value: 'orbit', label: 'Orbit' },
      { value: 'spin', label: 'Spin' },
      { value: 'lookat', label: 'Look At' }
    ], { value: mode, onChange: function (v) { mode = v; refreshControls(); renderPreview(); } });

    var spinSpeedSlider = ui.slider({ label: 'Speed', min: -720, max: 720, step: 1, value: spinSpeed,
      format: function (v) { return Math.round(v) + '°/s'; }, onInput: function (v) { spinSpeed = v; renderPreview(); } });

    var orbitRadiusSlider = ui.slider({ label: 'Radius', min: 0, max: 1000, step: 1, value: orbitRadius,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { orbitRadius = v; renderPreview(); } });
    var orbitSpeedSlider = ui.slider({ label: 'Speed', min: -720, max: 720, step: 1, value: orbitSpeed,
      format: function (v) { return Math.round(v) + '°/s'; }, onInput: function (v) { orbitSpeed = v; renderPreview(); } });

    var hint = el('div.rb-faint', { text: '' });

    var spinControls = el('div.rb-col', null, [spinSpeedSlider.el]);
    var orbitControls = el('div.rb-col', null, [orbitRadiusSlider.el, orbitSpeedSlider.el]);
    var lookatControls = el('div.rb-col', null, []);

    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      hint,
      modeSeg.el,
      spinControls,
      orbitControls,
      lookatControls
    ]));

    function refreshControls() {
      spinControls.style.display = mode === 'spin' ? '' : 'none';
      orbitControls.style.display = mode === 'orbit' ? '' : 'none';
      lookatControls.style.display = mode === 'lookat' ? '' : 'none';
      if (mode === 'spin') {
        hint.textContent = 'Adds continuous self-rotation. Speed drives the turn rate in degrees per second.';
      } else if (mode === 'orbit') {
        hint.textContent = 'Sweeps each layer around a captured center point. Center starts at the composition center.';
      } else {
        hint.textContent = 'Aims each layer at a captured target point. Target starts at the composition center.';
      }
    }
    refreshControls();
    renderPreview();

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('motion.apply', {
        mode: mode,
        spinSpeed: spinSpeed,
        orbitRadius: orbitRadius,
        orbitSpeed: orbitSpeed
      })
        .then(function (res) { ctx.toast('Motion on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Motion', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('motion.remove', {})
        .then(function (res) { ctx.toast('Removed Motion from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { mode: mode, spinSpeed: spinSpeed, orbitRadius: orbitRadius, orbitSpeed: orbitSpeed };
    }
    function applyState(s) {
      if (!s) return;
      if (s.mode != null) { mode = s.mode; modeSeg.set(s.mode); }
      if (s.spinSpeed != null) { spinSpeed = s.spinSpeed; spinSpeedSlider.set(s.spinSpeed); }
      if (s.orbitRadius != null) { orbitRadius = s.orbitRadius; orbitRadiusSlider.set(s.orbitRadius); }
      if (s.orbitSpeed != null) { orbitSpeed = s.orbitSpeed; orbitSpeedSlider.set(s.orbitSpeed); }
      refreshControls();
      renderPreview();
    }

    return {
      presets: {
        toolId: 'motion',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return motionSvg(st, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Slow Spin', state: { mode: 'spin', spinSpeed: 45, orbitRadius: 150, orbitSpeed: 60 } },
          { name: 'Fast Spin', state: { mode: 'spin', spinSpeed: 360, orbitRadius: 150, orbitSpeed: 60 } },
          { name: 'Wide Orbit', state: { mode: 'orbit', spinSpeed: 90, orbitRadius: 400, orbitSpeed: 45 } },
          { name: 'Tight Orbit', state: { mode: 'orbit', spinSpeed: 90, orbitRadius: 80, orbitSpeed: 180 } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});