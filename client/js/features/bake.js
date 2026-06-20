/*
 * Rebound, Bake tool.
 * Bakes each selected property's live animation, whether it is driven by an
 * expression or by keyframes, into clean, evenly spaced keyframes by sampling
 * the value at a fixed frame step across a chosen time range.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'bake',
    title: 'Bake',
    group: 'Easing',
    order: 5,
    keywords: ['bake', 'sample', 'expression', 'keyframe', 'convert', 'flatten', 'frame'],
    mount: mount
  });

  function mount(ctx) {
    var range = 'work';
    var stepFrames = 1;
    var includeExpressions = false;

    var rangeCtl = ui.segmented([
      { value: 'work', label: 'Work area', title: 'Sample across the composition work area' },
      { value: 'layer', label: 'Layer duration', title: 'Sample across each layer’s in-to-out span' }
    ], { value: range, onChange: function (v) { range = v; } });

    var stepField = ui.numberField({
      label: 'Step',
      value: stepFrames,
      min: 1,
      max: 60,
      step: 1,
      decimals: 0,
      suffix: 'f',
      width: '110px',
      onChange: function (v) { stepFrames = v; }
    });

    var exprToggle = ui.toggle({
      label: 'Include expressions',
      value: includeExpressions,
      title: 'Also bake properties driven by a hand-written expression. The expression is disabled, not deleted, so you can re-enable it later.',
      onChange: function (v) { includeExpressions = v; }
    });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Samples each selected property’s animation into clean keyframes, one every few frames. Works on expression-driven and keyframed properties alike.' }),
      el('div.rb-section-label', { text: 'Range' }),
      rangeCtl.el,
      el('div.rb-section-label', { text: 'Sample step' }),
      stepField.el,
      exprToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('bake.apply', { range: range, stepFrames: stepFrames, includeExpressions: includeExpressions })
        .then(function (res) {
          var msg = 'Baked ' + res.properties + ' propert' + (res.properties === 1 ? 'y' : 'ies') +
            ' into ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's');
          if (res.skipped) {
            msg += '. Skipped ' + res.skipped + ' with a user expression';
          }
          ctx.toast(msg, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not bake', { kind: 'error' }); });
    }

    function getState() {
      return { range: range, stepFrames: stepFrames, includeExpressions: includeExpressions };
    }

    function applyState(s) {
      if (!s) return;
      if (s.range != null) { range = s.range; rangeCtl.set(s.range); }
      if (s.stepFrames != null) { stepFrames = s.stepFrames; stepField.set(s.stepFrames); }
      if (s.includeExpressions != null) { includeExpressions = s.includeExpressions; exprToggle.set(s.includeExpressions); }
    }

    return {
      presets: {
        toolId: 'bake',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Every frame', state: { range: 'work', stepFrames: 1, includeExpressions: false } },
          { name: 'Coarse sample', state: { range: 'work', stepFrames: 4, includeExpressions: false } },
          { name: 'Layer span', state: { range: 'layer', stepFrames: 1, includeExpressions: false } },
          { name: 'With expressions', state: { range: 'work', stepFrames: 1, includeExpressions: true } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    var count = 0;
    var props = sel.properties || [];
    for (var i = 0; i < props.length; i++) {
      if (props[i].isTimeVarying) count++;
    }
    if (!count) return 'Select animated properties to bake';
    return count + ' animated propert' + (count === 1 ? 'y' : 'ies');
  }
})(window.Rebound = window.Rebound || {});