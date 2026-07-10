/*
 * Rebound, Smooth tool.
 * Eases the selected keyframes so motion flows through them. The headline
 * control is a Smoothness amount (how soft the ease is at each key); Apply to
 * chooses which side to ease, and auto-bezier / roving are secondary options.
 * A before/after sketch reacts to the amount so the effect is always visible.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A jagged sample path (keyframe values over time) used by the before/after.
  var PTS = [{ x: 10, y: 44 }, { x: 44, y: 12 }, { x: 78, y: 40 }, { x: 112, y: 14 }];

  R.tools.register({
    id: 'smooth',
    title: 'Smooth',
    group: 'Easing',
    order: 2,
    quick: {
      desc: 'Ease the selected keyframes at 60% smoothness so motion flows through them.',
      method: 'smooth.apply',
      args: { amount: 60, sides: 'inout', autoBezier: false, roving: false },
      config: [{ arg: 'sides', label: 'Apply to', type: 'select', options: [
        { value: 'inout', label: 'In & Out' },
        { value: 'in', label: 'In' },
        { value: 'out', label: 'Out' }
      ] }]
    },
    keywords: ['smooth', 'roving', 'auto bezier', 'flowing', 'curve', 'keyframe', 'velocity', 'influence', 'ease'],
    mount: mount
  });

  // Catmull-Rom through the points as cubic beziers, with a roundness 0..1 that
  // blends from straight segments (0) to a fully rounded curve (1).
  function smoothPath(pts, round) {
    var d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6 * round, c1y = p1.y + (p2.y - p0.y) / 6 * round;
      var c2x = p2.x - (p3.x - p1.x) / 6 * round, c2y = p2.y - (p3.y - p1.y) / 6 * round;
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x + ' ' + p2.y;
    }
    return d;
  }
  // Roving redistributes the interior keys in time, so even out their x spacing.
  function rove(pts) {
    var n = pts.length, x0 = pts[0].x, xn = pts[n - 1].x;
    return pts.map(function (p, i) { return { x: x0 + (xn - x0) * i / (n - 1), y: p.y }; });
  }
  function sketch(pts, round, stroke) {
    var kids = [svg('path', { d: smoothPath(pts, round), fill: 'none', stroke: stroke, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })];
    pts.forEach(function (p) { kids.push(svg('circle', { cx: p.x, cy: p.y, r: 2.6, fill: stroke })); });
    return svg('svg', { viewBox: '0 0 122 56', width: '100%', height: 56 }, kids);
  }

  function mount(ctx) {
    var smoothness = 60;
    var sides = 'inout';
    var autoBezier = false;
    var roving = false;

    var afterHost = el('div');
    function renderAfter() {
      R.dom.clear(afterHost);
      var pts = roving ? rove(PTS) : PTS;
      var round = autoBezier ? 1 : smoothness / 100;
      afterHost.appendChild(sketch(pts, round, 'var(--rb-accent)'));
    }
    renderAfter();

    function panel(cap, node) {
      return el('div', { style: { flex: '1 1 0', minWidth: '0', border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '8px' } }, [
        el('div', { text: cap, style: { color: 'var(--rb-text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' } }),
        node
      ]);
    }
    var beforeAfter = el('div.rb-row', { style: { gap: '8px', alignItems: 'stretch' } }, [
      panel('Before', sketch(PTS, 0, 'var(--rb-text-faint)')),
      panel('After', afterHost)
    ]);

    var smoothnessSlider = ui.slider({ label: 'Smoothness', min: 0, max: 100, step: 1, value: smoothness,
      format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { smoothness = v; renderAfter(); } });
    var sidesCtl = ui.segmented([
      { value: 'inout', label: 'In & Out', title: 'Ease both sides of each keyframe.' },
      { value: 'in', label: 'In', title: 'Ease only the incoming side (soften landings).' },
      { value: 'out', label: 'Out', title: 'Ease only the outgoing side (soften departures).' }
    ], { value: sides, onChange: function (v) { sides = v; } });

    var autoBezierToggle = ui.toggle({ label: 'Round corners automatically (auto-bezier)', value: autoBezier,
      title: 'Let After Effects round the tangents through each key. This overrides the Smoothness amount.',
      onChange: function (v) { autoBezier = v; renderAfter(); } });
    var rovingToggle = ui.toggle({ label: 'Even out timing (roving)', value: roving,
      title: 'Let the middle keyframes slide in time so the speed stays even. The first and last keys stay put.',
      onChange: function (v) { roving = v; renderAfter(); } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Eases the selected keyframes so motion flows smoothly through them instead of changing direction abruptly. Smoothness sets how soft the ease is at each key. Select the keyframes, set it, then Apply.' }),
      beforeAfter,
      el('div.rb-section-label', { text: 'Smoothness' }),
      smoothnessSlider.el,
      sidesCtl.el,
      el('div.rb-section-label', { text: 'Options' }),
      autoBezierToggle.el,
      rovingToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(R.easing.removeButton(ctx));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('smooth.apply', { amount: smoothness, sides: sides, autoBezier: autoBezier, roving: roving })
        .then(function (res) {
          var rs = res.rovingSkipped || 0;
          var rovingNote = rs ? ' · roving skipped on ' + rs + ' key' + (rs === 1 ? '' : 's') + ' (roving only applies to Position/Anchor)' : '';
          if (!res.keys) {
            ctx.toast('Nothing smoothed' + rovingNote, { kind: 'info' });
          } else {
            ctx.toast('Smoothed ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's') + rovingNote, { kind: 'success' });
          }
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not smooth', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes to smooth';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
