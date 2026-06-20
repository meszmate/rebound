/*
 * Rebound, Motion tool.
 * Auto-motion rig with three modes (Orbit / Spin / Look At) applied as
 * marker-guarded, art-directable expressions backed by Slider Controls.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

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

    var modeSeg = ui.segmented([
      { value: 'orbit', label: 'Orbit' },
      { value: 'spin', label: 'Spin' },
      { value: 'lookat', label: 'Look At' }
    ], { value: mode, onChange: function (v) { mode = v; refreshControls(); } });

    var spinSpeedSlider = ui.slider({ label: 'Speed', min: -720, max: 720, step: 1, value: spinSpeed,
      format: function (v) { return Math.round(v) + '°/s'; }, onInput: function (v) { spinSpeed = v; } });

    var orbitRadiusSlider = ui.slider({ label: 'Radius', min: 0, max: 1000, step: 1, value: orbitRadius,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { orbitRadius = v; } });
    var orbitSpeedSlider = ui.slider({ label: 'Speed', min: -720, max: 720, step: 1, value: orbitSpeed,
      format: function (v) { return Math.round(v) + '°/s'; }, onInput: function (v) { orbitSpeed = v; } });

    var hint = el('div.rb-faint', { text: '' });

    var spinControls = el('div.rb-col', null, [spinSpeedSlider.el]);
    var orbitControls = el('div.rb-col', null, [orbitRadiusSlider.el, orbitSpeedSlider.el]);
    var lookatControls = el('div.rb-col', null, []);

    ctx.body.appendChild(el('div.rb-col', null, [
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
    }

    return {
      presets: {
        toolId: 'motion',
        get: getState,
        set: applyState,
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