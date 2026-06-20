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

  R.tools.register({
    id: 'velocity',
    title: 'Velocity',
    group: 'Easing',
    order: 3,
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
      onChange: function (v) { if (linked) outInfluence.set(v); } });
    var outInfluence = ui.numberField({ label: 'Influence Out', value: 33.33, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%' });
    var inSpeed = ui.numberField({ label: 'Speed In', value: 0, step: 1, decimals: 2, width: '100%',
      onChange: function (v) { if (linked) outSpeed.set(v); } });
    var outSpeed = ui.numberField({ label: 'Speed Out', value: 0, step: 1, decimals: 2, width: '100%' });

    var linkToggle = ui.toggle({ label: 'Link in and out', value: linked,
      title: 'Mirror the in values to the out side so the ease stays symmetric.',
      onChange: function (v) {
        linked = v;
        if (linked) { outInfluence.set(inInfluence.get()); outSpeed.set(inSpeed.get()); }
      } });
    var influenceToggle = ui.toggle({ label: 'Set influence', value: setInfluence,
      onChange: function (v) { setInfluence = v; } });
    var speedToggle = ui.toggle({ label: 'Set speed', value: setSpeed,
      onChange: function (v) { setSpeed = v; } });
    var inSideToggle = ui.toggle({ label: 'Apply to in side', value: applyIn,
      onChange: function (v) { applyIn = v; } });
    var outSideToggle = ui.toggle({ label: 'Apply to out side', value: applyOut,
      onChange: function (v) { applyOut = v; } });

    function half(node) {
      return el('div', { style: { flex: '1 1 96px', minWidth: '96px' } }, [node]);
    }

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Sets the incoming and outgoing influence (and optionally speed) of the selected keyframes directly.' }),
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
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(readBtn);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

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
        defaults: [
          { name: 'Easy Ease', state: { inInfluence: 33.33, outInfluence: 33.33, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: true, applyIn: true, applyOut: true } },
          { name: 'Soft', state: { inInfluence: 75, outInfluence: 75, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: true, applyIn: true, applyOut: true } },
          { name: 'Snappy out', state: { inInfluence: 90, outInfluence: 15, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: false, applyIn: true, applyOut: true } },
          { name: 'In side only', state: { inInfluence: 80, outInfluence: 33.33, inSpeed: 0, outSpeed: 0, setInfluence: true, setSpeed: false, linked: false, applyIn: true, applyOut: false } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});