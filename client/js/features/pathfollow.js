/*
 * Rebound, Path Follow tool (Dynamic Sketch-style).
 * Sends the selected layers along a path: the first selected layer's mask is the
 * route, the rest travel it as baked Position keyframes (with optional
 * auto-orient). A live preview samples a representative path so the density and
 * orientation react to the controls. Draw the route as a mask, no freehand
 * viewport sketching from a CEP panel.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Fixed representative S-curve for the preview (one cubic segment).
  var P0 = [16, 58], C0 = [40, 4], C1 = [80, 72], P1 = [104, 18];

  function cubic(t) {
    var u = 1 - t;
    return [
      u * u * u * P0[0] + 3 * u * u * t * C0[0] + 3 * u * t * t * C1[0] + t * t * t * P1[0],
      u * u * u * P0[1] + 3 * u * u * t * C0[1] + 3 * u * t * t * C1[1] + t * t * t * P1[1]
    ];
  }

  function pathSvg(st, h) {
    var per = Math.max(1, Math.round(st.smoothness || 6));
    var kids = [
      svg('path', { d: 'M' + P0[0] + ' ' + P0[1] + ' C ' + C0[0] + ' ' + C0[1] + ', ' + C1[0] + ' ' + C1[1] + ', ' + P1[0] + ' ' + P1[1],
        fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: '0.5' })
    ];
    for (var k = 0; k <= per; k++) {
      var p = cubic(k / per);
      kids.push(svg('circle', { cx: R.units.round(p[0], 1), cy: R.units.round(p[1], 1), r: 2.4, fill: 'var(--rb-accent)' }));
    }
    // a small layer marker, oriented along the tangent when orient is on
    var mid = cubic(0.55), a = cubic(0.5), b = cubic(0.6);
    var ang = st.orient ? Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI : 0;
    kids.push(svg('g', { transform: 'translate(' + R.units.round(mid[0], 1) + ',' + R.units.round(mid[1], 1) + ') rotate(' + R.units.round(ang, 1) + ')' }, [
      svg('rect', { x: -7, y: -5, width: 14, height: 10, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.95' })
    ]));
    return svg('svg', { viewBox: '0 0 120 72', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'pathfollow',
    title: 'Path Follow',
    group: 'Physics',
    order: 11,
    keywords: ['path', 'follow', 'dynamic sketch', 'mask', 'motion path', 'orient', 'route', 'along'],
    mount: mount
  });

  function mount(ctx) {
    var st = { duration: 1.5, ease: 'smooth', smoothness: 6, orient: true };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(pathSvg(st, 90)); }

    var durationSlider = ui.slider({ label: 'Duration', min: 0.2, max: 6, step: 0.1, value: st.duration,
      format: function (v) { return R.units.round(v, 1) + 's'; }, onInput: function (v) { st.duration = v; } });
    var easeSeg = ui.segmented([{ value: 'linear', label: 'Linear' }, { value: 'smooth', label: 'Smooth' }],
      { value: st.ease, onChange: function (v) { st.ease = v; } });
    var qualitySlider = ui.slider({ label: 'Quality', min: 2, max: 16, step: 1, value: st.smoothness,
      format: function (v) { return Math.round(v) + '/seg'; }, onInput: function (v) { st.smoothness = v; renderPreview(); } });
    var orientTog = ui.toggle({ label: 'Orient along the path', value: st.orient, onChange: function (v) { st.orient = v; renderPreview(); } });

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'The first selected layer’s mask is the path; the other selected layers are baked along it. Draw the route as a mask first.' }),
      previewHost,
      durationSlider.el,
      ui.row('Timing', easeSeg.el),
      qualitySlider.el,
      orientTog.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Send along path']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('pathfollow.apply', st)
        .then(function (res) { ctx.toast('Sent ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's') + ' along the path', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not follow the path', { kind: 'error' }); });
    }

    function getState() { return { duration: st.duration, ease: st.ease, smoothness: st.smoothness, orient: st.orient }; }
    function applyState(s) {
      if (!s) return;
      if (s.duration != null) { st.duration = s.duration; durationSlider.set(s.duration); }
      if (s.ease) { st.ease = s.ease; easeSeg.set(s.ease); }
      if (s.smoothness != null) { st.smoothness = s.smoothness; qualitySlider.set(s.smoothness); }
      if (s.orient != null) { st.orient = s.orient; orientTog.set(s.orient); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'pathfollow',
        get: getState,
        set: applyState,
        thumbFor: function (s, opts) { return pathSvg(s, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Glide', state: { duration: 1.5, ease: 'smooth', smoothness: 8, orient: false } },
          { name: 'March', state: { duration: 2, ease: 'linear', smoothness: 5, orient: true } },
          { name: 'Fly', state: { duration: 1, ease: 'smooth', smoothness: 10, orient: true } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select the path layer (+ layers to send)';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
