/*
 * Rebound, curve chip.
 * Draws a normalized easing curve into a small SVG, the same way the Ease tool's
 * preset tiles do, so the Context Home inspector and the Ease editor render an
 * identical shape. Also exposes a tiny classifier that names a curve.
 */
;(function (R) {
  'use strict';

  // A dot that rides `pathD` on hover, so the easing can be felt before
  // applying. The SMIL animations are dormant (begin:'indefinite') until
  // attachHoverDot's mouseenter starts them; a thumbnail that is never hovered
  // renders its static path exactly as before. opts: { r, fill, dur }.
  function hoverDot(pathD, opts) {
    opts = opts || {};
    var dur = opts.dur || '1.1s';
    return R.dom.svg('circle', { r: opts.r || 2.4, fill: opts.fill || 'var(--rb-accent)', opacity: 0 }, [
      R.dom.svg('animateMotion', { dur: dur, repeatCount: 'indefinite', path: pathD, begin: 'indefinite' }),
      R.dom.svg('animate', { attributeName: 'opacity', values: '0;1;1;0', dur: dur, repeatCount: 'indefinite', begin: 'indefinite' })
    ]);
  }

  // Animate every dormant SMIL animation under `node` while it is hovered.
  // begin/end methods can throw in some engines, so each call is guarded.
  function attachHoverDot(node) {
    function each(method) {
      var anims = node.querySelectorAll('animateMotion, animate');
      for (var i = 0; i < anims.length; i++) {
        try { anims[i][method](); } catch (e) { /* SMIL not ready */ }
      }
    }
    node.addEventListener('mouseenter', function () { each('beginElement'); });
    node.addEventListener('mouseleave', function () { each('endElement'); });
    return node;
  }

  // Render `curve` into an SVG of the given size. opts: { width, height, pad,
  // dim (draw in a muted color), dashed (dashed stroke, for hold/linear),
  // hoverDot (add a dormant hover dot riding the curve; pair the chip's
  // container with attachHoverDot to start it on hover) }.
  function curveChip(curve, opts) {
    opts = opts || {};
    var w = opts.width || 120;
    var h = opts.height || 56;
    var pad = opts.pad || 6;
    var stroke = opts.dim ? 'var(--rb-text-faint)' : 'var(--rb-accent)';

    var pts = R.easing.sampler.samplePoints(curve, 48);
    var rng = R.easing.sampler.range(curve, 60);
    var lo = Math.min(0, rng.min);
    var hi = Math.max(1, rng.max);
    var span = (hi - lo) || 1;

    function px(x) { return pad + x * (w - 2 * pad); }
    function py(y) { return (h - pad) - ((y - lo) / span) * (h - 2 * pad); }

    var d = pts.map(function (pt, i) {
      return (i === 0 ? 'M' : 'L') + px(pt.x).toFixed(1) + ' ' + py(pt.y).toFixed(1);
    }).join(' ');

    var baseY = py(0);
    var topY = py(1);
    var children = [
      R.dom.svg('line', { x1: pad, y1: baseY, x2: w - pad, y2: baseY, stroke: 'var(--rb-border)', 'stroke-width': 1 }),
      R.dom.svg('line', { x1: pad, y1: topY, x2: w - pad, y2: topY, stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.5' }),
      R.dom.svg('path', { d: d, fill: 'none', stroke: stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-dasharray': opts.dashed ? '4 3' : null }),
      R.dom.svg('circle', { cx: px(pts[0].x), cy: py(pts[0].y), r: 2.6, fill: stroke }),
      R.dom.svg('circle', { cx: px(pts[pts.length - 1].x), cy: py(pts[pts.length - 1].y), r: 2.6, fill: stroke })
    ];
    if (opts.hoverDot) children.push(hoverDot(d));
    return R.dom.svg('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, 'class': 'rb-curve-chip' }, children);
  }

  // A flat baseline placeholder, for selections that carry no real ease.
  function flatChip(opts) {
    opts = opts || {};
    var w = opts.width || 120;
    var h = opts.height || 56;
    var pad = opts.pad || 6;
    var y = h - pad - (h - 2 * pad) * 0.0;
    return R.dom.svg('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, 'class': 'rb-curve-chip is-empty' }, [
      R.dom.svg('line', { x1: pad, y1: y, x2: w - pad, y2: y, stroke: 'var(--rb-border)', 'stroke-width': 1 })
    ]);
  }

  // Recognize a curve and give it a friendly name. Thresholds are generous and
  // fall back to "Custom" rather than mislabel a hand-tuned curve.
  function curveName(curve) {
    if (!curve) return 'No ease';
    var x1 = curve.x1, y1 = curve.y1, x2 = curve.x2, y2 = curve.y2;
    function near(a, b, e) { return Math.abs(a - b) <= (e || 0.04); }
    if (y1 < -0.02 || y2 > 1.02) return 'Overshoot';
    if (near(y1, x1, 0.03) && near(y2, x2, 0.03)) return 'Linear';
    if (near(x1, 0.33) && near(y1, 0) && near(x2, 0.67) && near(y2, 1)) return 'Easy Ease';
    var startFlat = y1 <= 0.06;
    var endFlat = y2 >= 0.94;
    if (startFlat && endFlat) return 'Ease In Out';
    if (startFlat) return 'Ease In';
    if (endFlat) return 'Ease Out';
    return 'Custom';
  }

  R.ui = R.ui || {};
  R.ui.curveChip = curveChip;
  R.ui.flatChip = flatChip;
  R.ui.curveName = curveName;
  R.ui.hoverDot = hoverDot;
  R.ui.attachHoverDot = attachHoverDot;
})(window.Rebound = window.Rebound || {});
