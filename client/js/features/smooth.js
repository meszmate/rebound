/*
 * Rebound, Smooth tool.
 * Reshapes the selected keyframes so motion flows smoothly through them instead
 * of changing direction abruptly (bezier + optional auto-bezier and roving).
 * It is a one-shot operation, so instead of a live curve it shows a before/after
 * sketch that reacts to the two options, making clear what each one does.
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
    keywords: ['smooth', 'roving', 'auto bezier', 'flowing', 'curve', 'keyframe', 'velocity'],
    mount: mount
  });

  function linearPath(pts) {
    return 'M' + pts.map(function (p) { return p.x + ' ' + p.y; }).join(' L');
  }
  // Catmull-Rom through the points, as cubic beziers, for the smooth version.
  function smoothPath(pts) {
    var d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
        ' ' + p2.x + ' ' + p2.y;
    }
    return d;
  }
  // Roving redistributes the interior keys in time, so even out their x spacing.
  function rove(pts) {
    var n = pts.length, x0 = pts[0].x, xn = pts[n - 1].x;
    return pts.map(function (p, i) { return { x: x0 + (xn - x0) * i / (n - 1), y: p.y }; });
  }

  function sketch(pts, smoothed, stroke) {
    var d = smoothed ? smoothPath(pts) : linearPath(pts);
    var kids = [svg('path', { d: d, fill: 'none', stroke: stroke, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })];
    pts.forEach(function (p) { kids.push(svg('circle', { cx: p.x, cy: p.y, r: 2.6, fill: stroke })); });
    return svg('svg', { viewBox: '0 0 122 56', width: '100%', height: 56 }, kids);
  }

  function mount(ctx) {
    var roving = true;
    var autoBezier = true;

    var afterHost = el('div');
    function renderAfter() {
      R.dom.clear(afterHost);
      var pts = roving ? rove(PTS) : PTS;
      afterHost.appendChild(sketch(pts, autoBezier, 'var(--rb-accent)'));
    }
    renderAfter();

    function panel(cap, node) {
      return el('div', { style: { flex: '1 1 0', minWidth: '0', border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '8px' } }, [
        el('div', { text: cap, style: { color: 'var(--rb-text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' } }),
        node
      ]);
    }
    var beforeAfter = el('div.rb-row', { style: { gap: '8px', alignItems: 'stretch' } }, [
      panel('Before', sketch(PTS, false, 'var(--rb-text-faint)')),
      panel('After', afterHost)
    ]);

    var autoBezierToggle = ui.toggle({ label: 'Smooth the curve (auto-bezier)', value: autoBezier,
      title: 'Rounds the motion so it curves through each keyframe instead of snapping to a sharp corner. Turn off to keep the keyframes angular.',
      onChange: function (v) { autoBezier = v; renderAfter(); } });
    var rovingToggle = ui.toggle({ label: 'Even out timing (roving)', value: roving,
      title: 'Lets the middle keyframes slide in time so the speed stays even across the move. The first and last keys stay put.',
      onChange: function (v) { roving = v; renderAfter(); } });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Reshapes the selected keyframes so motion flows smoothly through them instead of changing direction abruptly. Good for fixing robotic or jerky movement. Select the keyframes, choose the options below, then Apply.' }),
      beforeAfter,
      el('div.rb-section-label', { text: 'Options' }),
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

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes to smooth';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
