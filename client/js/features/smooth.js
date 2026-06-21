/*
 * Rebound, Smooth tool.
 * Smooths the selected keyframes into a flowing curve by switching them to
 * bezier interpolation, with optional auto-bezier shaping and roving of the
 * interior keys so they redistribute by velocity.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'smooth',
    title: 'Smooth',
    group: 'Easing',
    order: 2,
    keywords: ['smooth', 'roving', 'auto bezier', 'flowing', 'curve', 'keyframe', 'velocity'],
    mount: mount
  });

  function mount(ctx) {
    var roving = true;
    var autoBezier = true;

    var rovingToggle = ui.toggle({ label: 'Roving interior keys', value: roving,
      onChange: function (v) { roving = v; } });
    var autoBezierToggle = ui.toggle({ label: 'Auto-bezier', value: autoBezier,
      onChange: function (v) { autoBezier = v; } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Eases the selected keyframes into a flowing curve. Roving lets the interior keys redistribute by velocity.' }),
      autoBezierToggle.el,
      rovingToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('smooth.apply', { roving: roving, autoBezier: autoBezier })
        .then(function (res) { ctx.toast('Smoothed ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not smooth', { kind: 'error' }); });
    }

    function getState() {
      return { roving: roving, autoBezier: autoBezier };
    }

    function applyState(s) {
      if (!s) return;
      if (s.roving != null) { roving = s.roving; rovingToggle.set(s.roving); }
      if (s.autoBezier != null) { autoBezier = s.autoBezier; autoBezierToggle.set(s.autoBezier); }
    }

    return {
      presets: {
        toolId: 'smooth',
        // Smooth has no single fixed curve (it depends on the keyframes); show
        // the flowing ease-in-out shape it produces, so the tiles read as curves.
        previewFor: function () { return { type: 'bezier', x1: 0.37, y1: 0, x2: 0.63, y2: 1 }; },
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Smooth', state: { roving: false, autoBezier: true } },
          { name: 'Smooth + rove', state: { roving: true, autoBezier: true } },
          { name: 'Auto bezier', state: { roving: false, autoBezier: true } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes to smooth';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});