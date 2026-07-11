/*
 * Rebound, Motion tool.
 * Auto-motion rig with three modes (Orbit / Spin / Look At) applied as
 * marker-guarded, art-directable expressions backed by Slider Controls.
 * Orbit and Look At can aim at the comp center (captured sliders) or the last
 * selected layer (live), and Orbit's Distribute spreads the selection into a
 * ring. The preview animates: the orbiter orbits, the spinner spins, and the
 * look-at card tracks a moving target, all live against the sliders. Selecting
 * an already-rigged layer loads its values back and flips Apply into Update.
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

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var MOTION_DEFAULTS = [
    { name: 'Slow Spin', state: { mode: 'spin', spinSpeed: 45, orbitRadius: 150, orbitSpeed: 60 } },
    { name: 'Fast Spin', state: { mode: 'spin', spinSpeed: 360, orbitRadius: 150, orbitSpeed: 60 } },
    { name: 'Wide Orbit', state: { mode: 'orbit', spinSpeed: 90, orbitRadius: 400, orbitSpeed: 45 } },
    { name: 'Tight Orbit', state: { mode: 'orbit', spinSpeed: 90, orbitRadius: 80, orbitSpeed: 180 } }
  ];
  R.toolPresets.declare('motion', { defaults: MOTION_DEFAULTS });

  R.tools.register({
    id: 'motion',
    title: 'Motion',
    group: 'Physics',
    order: 3,
    // One-click Home tile: the tool's primary apply with its defaults; the
    // per-tile customizer can retarget the mode.
    quick: {
      desc: 'Spin each selected layer continuously at 90 degrees per second.',
      method: 'motion.apply',
      args: { mode: 'spin', spinSpeed: 90, orbitRadius: 150, orbitSpeed: 60 },
      config: [{ arg: 'mode', label: 'Mode', type: 'select', options: [
        { value: 'orbit', label: 'Orbit' },
        { value: 'spin', label: 'Spin' },
        { value: 'lookat', label: 'Look At' }
      ] }]
    },
    keywords: ['motion', 'orbit', 'spin', 'rotate', 'look at', 'auto', 'rig', 'circle', 'aim'],
    mount: mount
  });

  function mount(ctx) {
    var mode = 'spin';
    var spinSpeed = 90;
    var orbitRadius = 150;
    var orbitSpeed = 60;
    var target = 'comp';      // 'comp' | 'layer' (Orbit center / Look At aim)
    var distribute = false;   // Orbit: spread the selection into a ring

    // ---- live preview: orbit orbits, spin spins, look-at tracks --------------
    var W = 160, H = 100, CX = W / 2, CY = H / 2;
    var orbitRing = svg('circle', { cx: CX, cy: CY, r: 30, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0.6' });
    var orbitCenter = svg('circle', { cx: CX, cy: CY, r: 2, fill: 'var(--rb-text-faint)' });
    var orbiters = [];
    for (var oi = 0; oi < 3; oi++) {
      orbiters.push(svg('rect', { x: -6, y: -6, width: 12, height: 12, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': oi === 0 ? '0.95' : '0.55' }));
    }
    var orbitGroup = svg('g', null, [orbitRing, orbitCenter].concat(orbiters));

    var spinCard = svg('g', null, [
      svg('rect', { x: -20, y: -13, width: 40, height: 26, rx: 3, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' }),
      svg('rect', { x: -20, y: -13, width: 7, height: 26, rx: 1, fill: '#fff', 'fill-opacity': '0.3' })
    ]);
    var spinGroup = svg('g', null, [spinCard]);

    var LX = CX - 46, LY = CY + 14;
    var lookLine = svg('line', { x1: LX, y1: LY, x2: CX + 34, y2: CY - 8, stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
    var lookTarget = svg('g', null, [
      svg('circle', { cx: 0, cy: 0, r: 4, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }),
      svg('line', { x1: -7, y1: 0, x2: 7, y2: 0, stroke: 'var(--rb-accent)', 'stroke-width': 1 }),
      svg('line', { x1: 0, y1: -7, x2: 0, y2: 7, stroke: 'var(--rb-accent)', 'stroke-width': 1 })
    ]);
    var lookCard = svg('g', null, [
      svg('rect', { x: -16, y: -10, width: 32, height: 20, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.9' }),
      svg('path', { d: 'M16 0 L25 0 M20 -3 L26 0 L20 3', fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4 })
    ]);
    var lookGroup = svg('g', null, [lookLine, lookTarget, lookCard]);

    var stage = svg('svg', { viewBox: '0 0 160 100', width: '100%', height: 100 }, [
      svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      orbitGroup, spinGroup, lookGroup
    ]);
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [stage]);

    function orbitR() { return Math.max(8, Math.min(40, orbitRadius / 1000 * 40 + 8)); }
    function renderPreview() {
      orbitGroup.style.display = mode === 'orbit' ? '' : 'none';
      spinGroup.style.display = mode === 'spin' ? '' : 'none';
      lookGroup.style.display = mode === 'lookat' ? '' : 'none';
      orbitRing.setAttribute('r', orbitR().toFixed(1));
      for (var i = 1; i < orbiters.length; i++) orbiters[i].style.display = (mode === 'orbit' && distribute) ? '' : 'none';
      sim.redraw();
    }

    var sim = R.ui.miniSim({ el: previewHost, draw: function (t) {
      if (mode === 'orbit') {
        var r = orbitR();
        var n = distribute ? orbiters.length : 1;
        for (var i = 0; i < orbiters.length; i++) {
          var a = (t * orbitSpeed + (i < n ? i * 360 / n : 0)) * Math.PI / 180;
          orbiters[i].setAttribute('transform', 'translate(' + (CX + Math.cos(a) * r).toFixed(1) + ',' + (CY + Math.sin(a) * r).toFixed(1) + ')');
        }
      } else if (mode === 'spin') {
        spinCard.setAttribute('transform', 'translate(' + CX + ',' + CY + ') rotate(' + (t * spinSpeed % 360).toFixed(1) + ')');
      } else {
        // The aim point wanders (a gentle lissajous) and the card tracks it,
        // exactly what the look-at expression does with a moving target layer.
        var tx = CX + 20 + 26 * Math.cos(t * 0.9), ty = CY - 6 + 20 * Math.sin(t * 1.4);
        var ang = Math.atan2(ty - LY, tx - LX) * 180 / Math.PI;
        lookTarget.setAttribute('transform', 'translate(' + tx.toFixed(1) + ',' + ty.toFixed(1) + ')');
        lookLine.setAttribute('x2', tx.toFixed(1)); lookLine.setAttribute('y2', ty.toFixed(1));
        lookCard.setAttribute('transform', 'translate(' + LX + ',' + LY + ') rotate(' + ang.toFixed(1) + ')');
      }
    } });

    // ---- controls ------------------------------------------------------------
    var modeSeg = ui.segmented([
      { value: 'orbit', label: 'Orbit' },
      { value: 'spin', label: 'Spin' },
      { value: 'lookat', label: 'Look At' }
    ], { value: mode, onChange: function (v) { mode = v; refreshControls(); renderPreview(); syncButtons(lastSel); } });

    var spinSpeedSlider = ui.slider({ label: 'Speed', min: -720, max: 720, step: 1, value: spinSpeed,
      format: function (v) { return Math.round(v) + '°/s'; }, onInput: function (v) { spinSpeed = v; } });

    var orbitRadiusSlider = ui.slider({ label: 'Radius', min: 0, max: 1000, step: 1, value: orbitRadius,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { orbitRadius = v; renderPreview(); } });
    var orbitSpeedSlider = ui.slider({ label: 'Speed', min: -720, max: 720, step: 1, value: orbitSpeed,
      format: function (v) { return Math.round(v) + '°/s'; }, onInput: function (v) { orbitSpeed = v; } });
    var distributeTog = ui.toggle({ label: 'Distribute around the circle', value: distribute,
      onChange: function (v) { distribute = v; renderPreview(); } });

    // Orbit's center / Look At's aim point: the comp center (captured into
    // sliders) or the LAST selected layer's live position.
    var targetSeg = ui.segmented([
      { value: 'comp', label: 'Comp center' },
      { value: 'layer', label: 'Last selected layer' }
    ], { value: target, onChange: function (v) { target = v; refreshControls(); syncButtons(lastSel); } });
    var targetRow = ui.row('Target', targetSeg.el);

    var hint = el('div.rb-faint', { text: '' });

    var spinControls = el('div.rb-col', null, [spinSpeedSlider.el]);
    var orbitControls = el('div.rb-col', null, [orbitRadiusSlider.el, orbitSpeedSlider.el, distributeTog.el]);

    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      hint,
      modeSeg.el,
      targetRow,
      spinControls,
      orbitControls
    ]));

    function refreshControls() {
      spinControls.style.display = mode === 'spin' ? '' : 'none';
      orbitControls.style.display = mode === 'orbit' ? '' : 'none';
      targetRow.style.display = mode === 'spin' ? 'none' : '';
      if (mode === 'spin') {
        hint.textContent = 'Adds continuous self-rotation. Speed drives the turn rate in degrees per second.';
      } else if (mode === 'orbit') {
        hint.textContent = target === 'layer'
          ? 'Sweeps each layer around the LAST selected layer, live. Select the layers to rig, then the center layer last.'
          : 'Sweeps each layer around a captured center point. Center starts at the composition center.';
      } else {
        hint.textContent = target === 'layer'
          ? 'Aims each layer at the LAST selected layer, live. Select the layers to rig, then the target layer last.'
          : 'Aims each layer at a captured target point. Target starts at the composition center.';
      }
    }
    refreshControls();
    renderPreview();

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove']));
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    // A layer target needs the reference layer on top of the rigged ones.
    function syncButtons(sel) {
      var need = (mode !== 'spin' && target === 'layer') ? 2 : 1;
      applyBtn.disabled = !(sel && sel.hasComp && sel.selectedLayerCount >= need);
    }
    var lastSel = ctx.getSelection();
    var off = ctx.onSelection(function (sel) { lastSel = sel; scopeText.textContent = describe(sel); syncButtons(sel); syncRig(); });
    scopeText.textContent = describe(lastSel);
    syncButtons(lastSel);

    // ---- rig read-back: selecting a rigged layer loads its values -----------
    var riggedCount = 0, rigSig = null, rigBusy = false;
    function syncRig() {
      applyBtn.textContent = riggedCount > 0 ? 'Update' : 'Apply';
      if (riggedCount > 0) scopeText.textContent = 'Motion on ' + riggedCount + ' layer' + (riggedCount === 1 ? '' : 's');
    }
    function readRig(sel) {
      if (!sel || !sel.hasComp || !sel.selectedLayerCount) { riggedCount = 0; rigSig = null; syncRig(); return; }
      var sig = (sel.layers || []).map(function (l) { return l.index + ':' + l.name + ':' + l.effectCount; }).join('|');
      if (sig === rigSig || rigBusy) return;
      rigBusy = true;
      ctx.invoke('rig.read', { tag: 'motion', sliders: ['Spin Speed', 'Orbit Radius', 'Orbit Speed', 'Look Target X'] })
        .then(function (r) {
          rigBusy = false;
          rigSig = sig;
          riggedCount = (r && r.rigged) || 0;
          if (riggedCount > 0 && r.values) {
            var s = {};
            if (r.values['Orbit Radius'] != null) {
              s.mode = 'orbit';
              s.orbitRadius = r.values['Orbit Radius'];
              if (r.values['Orbit Speed'] != null) s.orbitSpeed = r.values['Orbit Speed'];
            } else if (r.values['Spin Speed'] != null) {
              s.mode = 'spin';
              s.spinSpeed = r.values['Spin Speed'];
            } else if (r.values['Look Target X'] != null) {
              s.mode = 'lookat';
            }
            applyState(s);
          }
          syncRig();
        })
        .catch(function () { rigBusy = false; });
    }

    function doApply() {
      ctx.invoke('motion.apply', {
        mode: mode,
        spinSpeed: spinSpeed,
        orbitRadius: orbitRadius,
        orbitSpeed: orbitSpeed,
        target: target,
        distribute: distribute
      })
        .then(function (res) {
          var skip = (res.skipped && res.skipped.length) ? ' (skipped ' + res.skipped.length + ')' : '';
          ctx.toast('Motion on ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's') + skip, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply Motion', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('motion.remove', {})
        .then(function (res) { ctx.toast('Removed Motion from ' + res.cleared + ' layer' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() {
      return { mode: mode, spinSpeed: spinSpeed, orbitRadius: orbitRadius, orbitSpeed: orbitSpeed, target: target, distribute: distribute };
    }
    function applyState(s) {
      if (!s) return;
      if (s.mode != null) { mode = s.mode; modeSeg.set(s.mode); }
      if (s.spinSpeed != null) { spinSpeed = s.spinSpeed; spinSpeedSlider.set(s.spinSpeed); }
      if (s.orbitRadius != null) { orbitRadius = s.orbitRadius; orbitRadiusSlider.set(s.orbitRadius); }
      if (s.orbitSpeed != null) { orbitSpeed = s.orbitSpeed; orbitSpeedSlider.set(s.orbitSpeed); }
      if (s.target != null) { target = s.target; targetSeg.set(s.target); }
      if (s.distribute != null) { distribute = s.distribute; distributeTog.set(s.distribute); }
      refreshControls();
      renderPreview();
      syncButtons(lastSel);
    }

    return {
      presets: {
        toolId: 'motion',
        get: getState,
        set: applyState,
        thumbFor: function (st, opts) { return motionSvg(st, (opts && opts.height) || 34); },
        defaults: MOTION_DEFAULTS
      },
      // Selecting an already-rigged layer loads its Motion back into the tool
      // (the shell only fires this for the visible tool, so no host spam).
      selectionRead: {
        matches: function (sel) { return !!(sel && sel.hasComp); },
        apply: function (res, sel) { readRig(sel); }
      },
      destroy: function () { sim.destroy(); off(); }
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});