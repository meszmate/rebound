/*
 * Rebound, Bounce tool.
 * Gravitational rebound on keyframed properties: after the last keyframe a
 * property passes, its value rebounds off the target like a ball, each bounce
 * smaller, driven by a live, art-directable expression rig.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'bounce',
    title: 'Bounce',
    group: 'Physics',
    order: 2,
    keywords: ['bounce', 'gravity', 'rebound', 'ball', 'elastic', 'physics', 'drop'],
    mount: mount
  });

  function mount(ctx) {
    var elasticity = 0.7;
    var maxBounces = 4;

    // Preview the REAL motion: a gravitational ball-bounce (rise to target, then
    // a series of decreasing rebounds settling onto it), not a spring overshoot.
    // Parametric in elasticity (how much each rebound keeps) and max bounces.
    function makeBounce(elas, bounces) {
      var e = Math.max(0.15, Math.min(0.85, elas));
      var n = Math.max(1, Math.min(8, Math.round(bounces)));
      var widths = [1.0];
      var drops = [];
      // First rebound dips a modest amount below the target; each later rebound
      // keeps a fraction `e` of the previous depth, so it visibly settles.
      var base = 0.2 + 0.12 * e;
      for (var k = 1; k <= n; k++) { var d = base * Math.pow(e, k - 1); drops.push(d); widths.push(2.4 * Math.sqrt(d)); }
      var total = 0, i;
      for (i = 0; i < widths.length; i++) total += widths[i];
      var nw = widths.map(function (x) { return x / total; });
      var starts = [0];
      for (i = 1; i < nw.length; i++) starts.push(starts[i - 1] + nw[i - 1]);
      return function (t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        if (t < starts[1]) { var u = t / nw[0]; return u * u * (3 - 2 * u); } // smooth rise to target
        for (var s = 1; s <= n; s++) {
          var s0 = starts[s];
          var s1 = (s < n) ? starts[s + 1] : 1;
          if (t < s1 || s === n) {
            var u2 = (t - s0) / (s1 - s0);
            return 1 - drops[s - 1] * 4 * u2 * (1 - u2); // dip below target and return
          }
        }
        return 1;
      };
    }
    function previewCurve() {
      return { type: 'fn', fn: makeBounce(elasticity, maxBounces) };
    }
    // The bounce curve as a read-only graph, the same way Spring shows its shape.
    var editorHost = el('div');
    var editor = ui.CurveEditor(editorHost, { value: previewCurve(), allowOvershoot: true });
    // Live preview as a horizontal position move, consistent with the other
    // tools: the value slides to the target and rebounds off it, settling.
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, { getCurve: previewCurve, property: 'position', sample: 'shape', duration: 1600 });
    function updateReadout() {
      editor.setCurve(previewCurve());
      preview.setReadout('Elasticity ' + Math.round(elasticity * 100) + '% · ' + Math.round(maxBounces) + ' bounce' + (Math.round(maxBounces) === 1 ? '' : 's'));
    }

    var elasticitySlider = ui.slider({ label: 'Elasticity', min: 0, max: 1, step: 0.01, value: elasticity,
      format: function (v) { return Math.round(v * 100) + '%'; }, onInput: function (v) { elasticity = v; updateReadout(); } });
    var bouncesField = ui.numberField({ label: 'Max bounces', value: maxBounces, min: 1, max: 24, step: 1, decimals: 0,
      width: '100%', onChange: function (v) { maxBounces = v; updateReadout(); } });

    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      editorHost,
      el('div.rb-faint', { text: 'Select 2+ keyframes and apply a real ball-bounce. By default it bakes a few editable keyframes you can see in the graph; set Apply as → Expression in Settings for a clean, keyframe-free version.' }),
      elasticitySlider.el,
      bouncesField.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply bounce']));

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.totalSelectedKeys >= 2 ? sel.totalSelectedKeys + ' keys · ' + sel.properties.length + ' propert' + (sel.properties.length === 1 ? 'y' : 'ies') : 'Select 2+ keyframes')
        : 'Open a composition';
    });
    scopeText.textContent = '';

    function doApply() {
      R.easing.applyCurve(ctx, previewCurve(), 'Bounce');
    }

    function getState() {
      return { elasticity: elasticity, maxBounces: maxBounces };
    }
    function applyState(s) {
      if (!s) return;
      if (s.elasticity != null) { elasticity = s.elasticity; elasticitySlider.set(s.elasticity); }
      if (s.maxBounces != null) { maxBounces = s.maxBounces; bouncesField.set(s.maxBounces); }
      updateReadout();
    }

    updateReadout();
    return {
      presets: {
        toolId: 'bounce',
        get: getState,
        set: applyState,
        previewFor: function (s) { return makeBounce(s.elasticity, s.maxBounces); },
        defaults: [
          { name: 'Rubber Ball', state: { elasticity: 0.8, maxBounces: 6 } },
          { name: 'Heavy Drop', state: { elasticity: 0.4, maxBounces: 3 } },
          { name: 'Floaty', state: { elasticity: 0.9, maxBounces: 8 } },
          { name: 'Single Bounce', state: { elasticity: 0.6, maxBounces: 2 } }
        ]
      },
      destroy: function () { off(); preview.destroy(); editor.destroy(); }
    };
  }
})(window.Rebound = window.Rebound || {});
