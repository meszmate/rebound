/*
 * Rebound, Spring tool.
 * Design a physical spring (bouncy / overshoot easing) and bake it onto the
 * selected keyframe pairs. The curve editor previews the spring; sliders drive
 * either friendly (Bounce + Settle) or physical (Mass / Stiffness / Damping)
 * parameters. The physics lives in the unit-tested spring engine; the host only
 * writes the sampled values.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  // Built-in presets and the state->curve mapping live at module level so every
  // spring preset is a pinnable, one-click Home action at load (R.toolPresets),
  // without the tool ever having been opened.
  var SPRING_DEFAULTS = [
    { name: 'Smooth', state: { mode: 'simple', response: 0.5, bounce: 0, velocity: 0 } },
    { name: 'Snappy', state: { mode: 'simple', response: 0.42, bounce: 0.15, velocity: 0 } },
    { name: 'Bouncy', state: { mode: 'simple', response: 0.5, bounce: 0.3, velocity: 0 } },
    { name: 'Gentle', state: { mode: 'simple', response: 0.7, bounce: 0.1, velocity: 0 } },
    { name: 'Heavy', state: { mode: 'physical', mass: 2.4, stiffness: 180, damping: 26, velocity: 0 } }
  ];
  function springCurveOf(s) {
    return s.mode === 'physical'
      ? { type: 'spring', mass: s.mass, stiffness: s.stiffness, damping: s.damping, velocity: s.velocity || 0 }
      : { type: 'spring', response: s.response, bounce: s.bounce, velocity: s.velocity || 0 };
  }
  R.toolPresets.declare('spring', {
    defaults: SPRING_DEFAULTS,
    previewFor: springCurveOf,
    applyBuild: function (s, args) {
      return R.toolPresets.curveApplyBuild(springCurveOf(s), (args && args.mode) || 'keys');
    },
    modes: true
  });

  R.tools.register({
    id: 'spring',
    title: 'Spring',
    group: 'Springs',
    order: 0,
    keywords: ['spring', 'bounce', 'overshoot', 'elastic', 'physics', 'bouncy'],
    mount: mountSpring
  });

  function mountSpring(ctx) {
    var mode = 'simple'; // simple | physical
    // Default to Snappy, the buttery iOS-style feel.
    var simple = { response: 0.42, bounce: 0.15, velocity: 0 };
    var physical = { mass: 1, stiffness: 120, damping: 12, velocity: 0 };

    function curve() {
      return mode === 'simple'
        ? { type: 'spring', response: simple.response, bounce: simple.bounce, velocity: simple.velocity }
        : { type: 'spring', mass: physical.mass, stiffness: physical.stiffness, damping: physical.damping, velocity: physical.velocity };
    }

    var editorHost = el('div');
    var editor = ui.CurveEditor(editorHost, {
      value: curve(),
      swatch: true,
      allowOvershoot: true
    });
    // Resizable, remembered graph height (consistent with the Ease editor).
    var editorResizer = ctx.widget ? null : ui.resizeHandle(editorHost, {
      persistKey: 'spring-graph', min: 150, max: 560, initial: 220, onResize: function () { editor.refresh(); }
    });

    // Live preview, springs read best on Scale (the overshoot pops).
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, {
      getCurve: curve,
      property: 'position',
      sample: 'shape'
    });

    var overshootChip = el('span.rb-chip', { text: '' });
    var settleChip = el('span.rb-chip', { text: '' });
    var regimeChip = el('span.rb-chip', { text: '' });

    // Peak overshoot fraction past the target, from the damping ratio (v0=0).
    function overshootOf(spec) {
      var z = spec.zeta;
      if (z >= 1) return 0;
      return Math.exp(-Math.PI * z / Math.sqrt(1 - z * z));
    }

    function refresh() {
      var c = curve();
      editor.setCurve(c);
      var spec = R.easing.spring.spring(c);
      var settle = isFinite(spec.settleTime) ? spec.settleTime : 0;
      var over = overshootOf(spec);

      overshootChip.textContent = over > 0.001 ? 'Overshoot ' + Math.round(over * 100) + '%' : 'No overshoot';
      settleChip.textContent = 'Settle ' + R.units.round(settle, 2) + 's';
      regimeChip.textContent = spec.regime === 'underdamped' ? 'Springy'
        : spec.regime === 'critical' ? 'Critically damped' : 'Overdamped';
      // Only a genuinely sluggish (slow, no-overshoot) spring is a warning;
      // critical damping is the smoothest, most desirable case.
      regimeChip.classList.toggle('is-warning', spec.regime === 'overdamped' && settle > 1.2);

      // Pace the preview by the real settle time so a slow spring reads slow.
      if (preview.setDuration) preview.setDuration(Math.max(280, Math.round(settle * 1000)));
      preview.setReadout((over > 0.001 ? Math.round(over * 100) + '% overshoot · ' : 'no overshoot · ') + 'settle ' + R.units.round(settle, 2) + 's');
    }

    // --- Simple controls ---
    var bounceSlider = ui.slider({
      label: 'Bounce / overshoot', min: 0, max: 0.8, step: 0.01, value: simple.bounce,
      format: function (v) { return Math.round(v * 100) + '%'; },
      onInput: function (v) { simple.bounce = v; refresh(); }
    });
    var settleSlider = ui.slider({
      label: 'Response', min: 0.15, max: 1.5, step: 0.01, value: simple.response,
      format: function (v) { return R.units.round(v, 2) + 's'; },
      onInput: function (v) { simple.response = v; refresh(); }
    });
    var simpleBox = el('div.rb-col', null, [bounceSlider.el, settleSlider.el]);

    // --- Physical controls ---
    var massSlider = ui.slider({ label: 'Mass', min: 0.2, max: 4, step: 0.05, value: physical.mass,
      onInput: function (v) { physical.mass = v; refresh(); } });
    var stiffSlider = ui.slider({ label: 'Stiffness', min: 5, max: 400, step: 1, value: physical.stiffness,
      format: function (v) { return Math.round(v); }, onInput: function (v) { physical.stiffness = v; refresh(); } });
    var dampSlider = ui.slider({ label: 'Damping', min: 1, max: 50, step: 0.5, value: physical.damping,
      onInput: function (v) { physical.damping = v; refresh(); } });
    var physicalBox = el('div.rb-col.rb-hidden', null, [massSlider.el, stiffSlider.el, dampSlider.el]);

    var velSlider = ui.slider({
      label: 'Initial velocity', min: -8, max: 8, step: 0.1, value: 0,
      onInput: function (v) { simple.velocity = v; physical.velocity = v; refresh(); }
    });

    var modeCtl = ui.segmented([
      { value: 'simple', label: 'Simple', title: 'Bounce + Settle (perceptual)' },
      { value: 'physical', label: 'Physical', title: 'Mass / Stiffness / Damping' }
    ], { value: mode, onChange: function (v) {
      mode = v;
      simpleBox.classList.toggle('rb-hidden', v !== 'simple');
      physicalBox.classList.toggle('rb-hidden', v !== 'physical');
      refresh();
    } });
    // Presets live in the gallery the shell mounts at the top of the tool.
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      editorHost,
      editorResizer && editorResizer.el,
      el('div.rb-row', null, [overshootChip, settleChip, regimeChip]),
      el('div.rb-section-label', { text: 'Spring' }),
      modeCtl.el,
      simpleBox,
      physicalBox,
      velSlider.el
    ]));

    // --- Footer ---
    var scopeText = el('span.rb-scope', { text: '' });
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply spring']);
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('span.rb-spacer'));
    ctx.footer.appendChild(R.easing.removeButton(ctx));
    ctx.footer.appendChild(applyBtn);

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    // Reads what is currently applied on the selected keyframes, so you can see
    // it before changing or removing it.
    function describe(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      if (sel.totalSelectedKeys < 2) return 'Select 2+ keyframes';
      var base = sel.totalSelectedKeys + ' key' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' · ' + sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies');
      var props = sel.properties || [];
      for (var i = 0; i < props.length; i++) {
        if ((props[i].selectedKeys || []).length >= 2 && props[i].currentEase && R.ui.curveName) { base += ' · ' + R.ui.curveName(props[i].currentEase.curve); break; }
      }
      return base;
    }

    function doApply() {
      R.easing.applyCurve(ctx, curve(), 'Spring');
    }

    function getState() {
      return {
        mode: mode, response: simple.response, bounce: simple.bounce,
        mass: physical.mass, stiffness: physical.stiffness, damping: physical.damping, velocity: simple.velocity
      };
    }
    function applyState(s) {
      if (!s) return;
      mode = s.mode === 'physical' ? 'physical' : 'simple';
      modeCtl.set(mode);
      simpleBox.classList.toggle('rb-hidden', mode !== 'simple');
      physicalBox.classList.toggle('rb-hidden', mode !== 'physical');
      if (s.response != null) { simple.response = s.response; settleSlider.set(s.response); }
      if (s.bounce != null) { simple.bounce = s.bounce; bounceSlider.set(s.bounce); }
      if (s.mass != null) { physical.mass = s.mass; massSlider.set(s.mass); }
      if (s.stiffness != null) { physical.stiffness = s.stiffness; stiffSlider.set(s.stiffness); }
      if (s.damping != null) { physical.damping = s.damping; dampSlider.set(s.damping); }
      if (s.velocity != null) { simple.velocity = s.velocity; physical.velocity = s.velocity; velSlider.set(s.velocity); }
      refresh();
    }

    refresh();
    return {
      presets: {
        toolId: 'spring',
        get: getState,
        set: applyState,
        previewFor: springCurveOf,
        defaults: SPRING_DEFAULTS
      },
      destroy: function () { off(); preview.destroy(); editor.destroy(); if (editorResizer) editorResizer.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
