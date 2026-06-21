/*
 * Rebound, Radial tool.
 * Duplicates each selected layer into a ring of copies arranged around the
 * layer's own position, optionally rotating each copy to face outward.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  R.tools.register({
    id: 'radial',
    title: 'Radial',
    group: 'Generators',
    order: 1,
    keywords: ['radial', 'ring', 'circle', 'array', 'around', 'duplicate', 'clone', 'orbit', 'arc'],
    mount: mount
  });

  function mount(ctx) {
    var count = 8;
    var radius = 200;
    var startAngle = 0;
    var arc = 360;
    var orient = false;

    // Live ring diagram: dots laid out exactly as Count / Radius / Arc / Start
    // angle place them, with a tick toward centre when Rotate-to-face is on.
    var ringHost = el('div');
    function renderRing() {
      R.dom.clear(ringHost);
      var n = Math.max(1, Math.round(count));
      var step = arc >= 360 ? arc / n : (n > 1 ? arc / (n - 1) : 0);
      var rPx = Math.min(48, radius * 0.12);
      var kids = [
        svg('circle', { cx: 62, cy: 62, r: rPx, fill: 'none', stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3' }),
        svg('circle', { cx: 62, cy: 62, r: 1.5, fill: 'var(--rb-text-faint)' })
      ];
      for (var i = 0; i < n; i++) {
        var a = (startAngle + step * i - 90) * Math.PI / 180;
        var x = 62 + rPx * Math.cos(a), y = 62 + rPx * Math.sin(a);
        if (orient) {
          kids.push(svg('line', { x1: x, y1: y, x2: 62 + (rPx - 7) * Math.cos(a), y2: 62 + (rPx - 7) * Math.sin(a), stroke: 'var(--rb-accent)', 'stroke-width': 1.5 }));
        }
        kids.push(svg('rect', { x: x - 3, y: y - 3, width: 6, height: 6, rx: 1.5, fill: 'var(--rb-accent)' }));
      }
      ringHost.appendChild(svg('svg', { viewBox: '0 0 124 124', width: 132, height: 132 }, kids));
    }
    var ringBox = el('div', { style: { display: 'flex', justifyContent: 'center', padding: '6px', border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)' } }, [ringHost]);

    var countField = ui.numberField({ label: 'Count', value: count, min: 2, max: 60, step: 1, decimals: 0, width: '110px',
      onChange: function (v) { count = v; renderRing(); } });

    var radiusSlider = ui.slider({ label: 'Radius', min: 0, max: 1000, step: 1, value: radius,
      format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { radius = v; renderRing(); } });
    var startSlider = ui.slider({ label: 'Start angle', min: -360, max: 360, step: 1, value: startAngle,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { startAngle = v; renderRing(); } });
    var arcSlider = ui.slider({ label: 'Arc', min: 0, max: 360, step: 1, value: arc,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { arc = v; renderRing(); } });

    var orientToggle = ui.toggle({ label: 'Rotate copies to face center', value: orient,
      title: 'Spin each copy so it points toward the centre of the ring.',
      onChange: function (v) { orient = v; renderRing(); } });

    renderRing();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Duplicates each selected layer into a ring of copies around where the layer sits. Arc sets how much of the circle to fill, Start angle where it begins.' }),
      ringBox,
      countField.el,
      radiusSlider.el,
      startSlider.el,
      arcSlider.el,
      orientToggle.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('radial.apply', {
        count: count,
        radius: radius,
        startAngle: startAngle,
        arc: arc,
        orient: orient
      })
        .then(function (res) { ctx.toast('Created ' + res.created + ' cop' + (res.created === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not build ring', { kind: 'error' }); });
    }

    function getState() {
      return { count: count, radius: radius, startAngle: startAngle, arc: arc, orient: orient };
    }
    function applyState(s) {
      if (!s) return;
      if (s.count != null) { count = s.count; countField.set(s.count); }
      if (s.radius != null) { radius = s.radius; radiusSlider.set(s.radius); }
      if (s.startAngle != null) { startAngle = s.startAngle; startSlider.set(s.startAngle); }
      if (s.arc != null) { arc = s.arc; arcSlider.set(s.arc); }
      if (s.orient != null) { orient = s.orient; orientToggle.set(s.orient); }
      renderRing();
    }

    return {
      presets: {
        toolId: 'radial',
        get: getState,
        set: applyState,
        defaults: [
          { name: 'Full ring', state: { count: 8, radius: 200, startAngle: 0, arc: 360, orient: false } },
          { name: 'Dense circle', state: { count: 24, radius: 300, startAngle: 0, arc: 360, orient: true } },
          { name: 'Half arc', state: { count: 6, radius: 250, startAngle: 0, arc: 180, orient: true } },
          { name: 'Tight orbit', state: { count: 12, radius: 80, startAngle: -90, arc: 360, orient: false } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to array';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});