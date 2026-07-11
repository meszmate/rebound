/*
 * Rebound, Velocity tool.
 * Numeric speed + influence editor for the selected keyframes. Set the incoming
 * and outgoing influence (and optionally the speed) directly, or read the first
 * selected keyframe's ease back into the fields.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clampY(v) { return v < -0.3 ? -0.3 : v > 1.3 ? 1.3 : v; }

  // The ease curve the current fields describe: influence sets the handle
  // x-positions (flatness), speed lifts the handles (slope / overshoot).
  //
  // With a live segment (avg = its real dv/dt, from the selection summary) the
  // speed handles are exact — the inverse of the host formula speed =
  // (y/x) * avg, so y1 = (outSpeed / avg) * x1 and y2 = 1 - (inSpeed / avg) *
  // (1 - x2). Without one we fall back to a representative sample scale so the
  // preview still reacts (the old fixed 0.004 factor).
  function velocityCurve(st, seg) {
    var x1 = clamp01((st.outInfluence || 0) / 100);
    var x2 = clamp01(1 - (st.inInfluence || 0) / 100);
    var y1 = 0, y2 = 1;
    if (st.setSpeed) {
      if (seg && Math.abs(seg.avg) > 1e-6) {
        y1 = clampY(((st.outSpeed || 0) / seg.avg) * x1);
        y2 = clampY(1 - ((st.inSpeed || 0) / seg.avg) * (1 - x2));
      } else {
        y1 = clampY((st.outSpeed || 0) * 0.004);
        y2 = clampY(1 - (st.inSpeed || 0) * 0.004);
      }
    }
    return { type: 'bezier', x1: x1, y1: y1, x2: x2, y2: y2 };
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var VELOCITY_DEFAULTS = [
    { name: 'Easy Ease', state: { inInfluence: 33.33, outInfluence: 33.33, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: true, applyIn: true, applyOut: true } },
    { name: 'Soft', state: { inInfluence: 75, outInfluence: 75, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: true, applyIn: true, applyOut: true } },
    { name: 'Snappy out', state: { inInfluence: 90, outInfluence: 15, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: false, applyIn: true, applyOut: true } },
    { name: 'In side only', state: { inInfluence: 80, outInfluence: 33.33, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: false, applyIn: true, applyOut: false } }
  ];
  R.toolPresets.declare('velocity', { defaults: VELOCITY_DEFAULTS });

  R.tools.register({
    id: 'velocity',
    title: 'Velocity',
    group: 'Easing',
    order: 3,
    quick: {
      desc: 'Set 33.33% ease influence on both sides of the selected keyframes.',
      method: 'velocity.apply',
      args: { inInfluence: 33.33, outInfluence: 33.33, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, applyIn: true, applyOut: true }
    },
    keywords: ['velocity', 'speed', 'influence', 'ease', 'keyframe', 'temporal'],
    mount: mount
  });

  function mount(ctx) {
    var setInfluence = true;
    var setSpeed = false;
    var linked = true;
    var applyIn = true;
    var applyOut = true;

    // When the in and out sides are linked, editing an "in" field mirrors its
    // value to the matching "out" field so the ease stays symmetric.
    var inInfluence = ui.numberField({ label: 'Influence In', value: 33.33, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%',
      onChange: function (v) { if (linked) outInfluence.set(v); renderPreview(); } });
    var outInfluence = ui.numberField({ label: 'Influence Out', value: 33.33, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%', onChange: function () { renderPreview(); } });
    var inSpeed = ui.numberField({ label: 'Speed In', value: 0, step: 1, decimals: 2, suffix: '/s', width: '100%',
      onChange: function (v) { if (linked) outSpeed.set(v); renderPreview(); } });
    var outSpeed = ui.numberField({ label: 'Speed Out', value: 0, step: 1, decimals: 2, suffix: '/s', width: '100%', onChange: function () { renderPreview(); } });

    // The live selection drives the preview scale: with a moving segment the
    // speed handles are drawn in its real units, otherwise at a sample scale.
    var lastSel = ctx.getSelection();
    function currentSegment() {
      if (!lastSel || !lastSel.hasComp || !lastSel.properties) return null;
      for (var i = 0; i < lastSel.properties.length; i++) {
        var p = lastSel.properties[i];
        if (p && p.segment && Math.abs(p.segment.avg) > 1e-6) return p.segment;
      }
      return null;
    }
    function setSpeedSuffix(unit) {
      var text = (unit || '') + '/s';
      var nodes = [inSpeed.el, outSpeed.el];
      for (var i = 0; i < nodes.length; i++) {
        var s = nodes[i].querySelector('.rb-suffix');
        if (s) s.textContent = text;
      }
    }

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    var curveLabel = el('div.rb-faint', { style: { textAlign: 'center', fontSize: '11px', marginTop: '2px' }, text: '' });
    function curState() { return { inInfluence: inInfluence.get(), outInfluence: outInfluence.get(), inSpeed: inSpeed.get(), outSpeed: outSpeed.get(), setInfluence: setInfluence, setSpeed: setSpeed }; }
    function renderPreview() {
      var seg = currentSegment();
      var c = velocityCurve(curState(), seg);
      R.dom.clear(previewHost);
      var chip = R.ui.curveChip(c, { width: 240, height: 92, pad: 8 });
      chip.setAttribute('width', '100%'); chip.style.height = 'auto';
      previewHost.appendChild(chip);
      var label = R.ui.curveName(c);
      // Without a selected moving segment the speed handles are only a sketch.
      if (setSpeed && !seg) label += ' · sample scale';
      curveLabel.textContent = label;
      setSpeedSuffix(seg ? seg.unit : '');
    }

    var linkToggle = ui.toggle({ label: 'Link in and out', value: linked,
      title: 'Mirror the in values to the out side so the ease stays symmetric.',
      onChange: function (v) {
        linked = v;
        if (linked) { outInfluence.set(inInfluence.get()); outSpeed.set(inSpeed.get()); }
        renderPreview();
      } });
    var influenceToggle = ui.toggle({ label: 'Set influence', value: setInfluence,
      onChange: function (v) { setInfluence = v; renderPreview(); } });
    var speedToggle = ui.toggle({ label: 'Set speed', value: setSpeed,
      onChange: function (v) { setSpeed = v; renderPreview(); } });
    var inSideToggle = ui.toggle({ label: 'Apply to in side', value: applyIn,
      onChange: function (v) { applyIn = v; } });
    var outSideToggle = ui.toggle({ label: 'Apply to out side', value: applyOut,
      onChange: function (v) { applyOut = v; } });

    function half(node) {
      return el('div', { style: { flex: '1 1 96px', minWidth: '96px' } }, [node]);
    }

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Sets the incoming and outgoing influence (and optionally speed) of the selected keyframes directly.' }),
      previewHost,
      curveLabel,
      el('div.rb-section-label', { text: 'Influence' }),
      el('div.rb-row.rb-wrap', null, [half(inInfluence.el), half(outInfluence.el)]),
      el('div.rb-section-label', { text: 'Speed' }),
      el('div.rb-row.rb-wrap', null, [half(inSpeed.el), half(outSpeed.el)]),
      el('div.rb-section-label', { text: 'Options' }),
      linkToggle.el,
      influenceToggle.el,
      speedToggle.el,
      inSideToggle.el,
      outSideToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    var readBtn = el('button.rb-btn', {
      title: 'Read the first selected keyframe’s ease into the fields',
      onclick: doRead
    }, ['Read']);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(R.easing.removeButton(ctx));
    ctx.footer.appendChild(readBtn);
    ctx.footer.appendChild(applyBtn);

    function syncButtons(sel) {
      applyBtn.disabled = !(sel && sel.hasComp && sel.totalSelectedKeys);
    }
    var off = ctx.onSelection(function (sel) {
      lastSel = sel;
      scopeText.textContent = describe(sel);
      syncButtons(sel);
      renderPreview();
    });
    scopeText.textContent = describe(ctx.getSelection());
    syncButtons(ctx.getSelection());

    function doApply() {
      ctx.invoke('velocity.apply', {
        inInfluence: inInfluence.get(),
        outInfluence: outInfluence.get(),
        inSpeed: inSpeed.get(),
        outSpeed: outSpeed.get(),
        setInfluence: setInfluence,
        setSpeed: setSpeed,
        applyIn: applyIn,
        applyOut: applyOut
      })
        .then(function (res) {
          ctx.toast('Set ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not set velocity', { kind: 'error' }); });
    }

    function getState() {
      return {
        inInfluence: inInfluence.get(), outInfluence: outInfluence.get(),
        inSpeed: inSpeed.get(), outSpeed: outSpeed.get(),
        setInfluence: setInfluence, setSpeed: setSpeed,
        linked: linked, applyIn: applyIn, applyOut: applyOut
      };
    }
    function applyState(s) {
      if (!s) return;
      if (s.inInfluence != null) inInfluence.set(s.inInfluence);
      if (s.outInfluence != null) outInfluence.set(s.outInfluence);
      if (s.inSpeed != null) inSpeed.set(s.inSpeed);
      if (s.outSpeed != null) outSpeed.set(s.outSpeed);
      if (s.setInfluence != null) { setInfluence = s.setInfluence; influenceToggle.set(s.setInfluence); }
      if (s.setSpeed != null) { setSpeed = s.setSpeed; speedToggle.set(s.setSpeed); }
      if (s.linked != null) { linked = s.linked; linkToggle.set(s.linked); }
      if (s.applyIn != null) { applyIn = s.applyIn; inSideToggle.set(s.applyIn); }
      if (s.applyOut != null) { applyOut = s.applyOut; outSideToggle.set(s.applyOut); }
      renderPreview();
    }

    function doRead() {
      ctx.invoke('velocity.read', {})
        .then(function (res) {
          if (!res.found) { ctx.toast('Select a keyframe to read', { kind: 'error' }); return; }
          inInfluence.set(res.inInfluence);
          outInfluence.set(res.outInfluence);
          inSpeed.set(res.inSpeed);
          outSpeed.set(res.outSpeed);
          ctx.toast('Read velocity from ' + res.propertyName, { kind: 'info' });
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not read velocity', { kind: 'error' }); });
    }

    return {
      presets: {
        toolId: 'velocity',
        get: getState,
        set: applyState,
        defaults: VELOCITY_DEFAULTS
      },
      // Selecting a keyframe segment shows its live in/out influence + speed,
      // read from the cached selection summary (no host round-trip).
      selectionRead: {
        matches: function (sel) { return !!firstEased(sel); },
        apply: function (_res, sel) {
          var p = firstEased(sel);
          if (!p || !p.currentEase) return;
          var e = p.currentEase;
          inInfluence.set(e.inInfluence); outInfluence.set(e.outInfluence);
          inSpeed.set(e.inSpeed); outSpeed.set(e.outSpeed);
          renderPreview();
        }
      },
      destroy: off
    };

    function firstEased(sel) {
      if (!sel || !sel.hasComp || !sel.properties) return null;
      for (var i = 0; i < sel.properties.length; i++) { var p = sel.properties[i]; if (p && p.currentEase) return p; }
      return null;
    }
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});