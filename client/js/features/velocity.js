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

    var inInfluence = ui.numberField({ label: 'Influence In', value: 33.33, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%' });
    var outInfluence = ui.numberField({ label: 'Influence Out', value: 33.33, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%' });
    var inSpeed = ui.numberField({ label: 'Speed In', value: 0, step: 1, decimals: 2, width: '100%' });
    var outSpeed = ui.numberField({ label: 'Speed Out', value: 0, step: 1, decimals: 2, width: '100%' });

    var influenceToggle = ui.toggle({ label: 'Set influence', value: setInfluence,
      onChange: function (v) { setInfluence = v; } });
    var speedToggle = ui.toggle({ label: 'Set speed', value: setSpeed,
      onChange: function (v) { setSpeed = v; } });

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
      influenceToggle.el,
      speedToggle.el
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
        setSpeed: setSpeed
      })
        .then(function (res) {
          ctx.toast('Set ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not set velocity', { kind: 'error' }); });
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

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});