/*
 * Rebound, Shapes tool.
 * Inserts parametric shape primitives (rectangle, rounded rectangle, ellipse,
 * polygon, star, line) as centered shape layers with a default fill. The line
 * is a real two-point open path with a stroke, so Trim Paths write-ons trace
 * the line itself; its preview glyph is a stroked line to match.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  // A glyph for a shape primitive, centered at (cx, cy) with radius r.
  function shapeGlyph(kind, cx, cy, r) {
    var fill = 'var(--rb-accent)', op = '0.85';
    if (kind === 'rectangle') return [svg('rect', { x: cx - r, y: cy - r * 0.7, width: r * 2, height: r * 1.4, fill: fill, 'fill-opacity': op })];
    if (kind === 'rounded') return [svg('rect', { x: cx - r, y: cy - r * 0.7, width: r * 2, height: r * 1.4, rx: r * 0.4, fill: fill, 'fill-opacity': op })];
    if (kind === 'ellipse') return [svg('ellipse', { cx: cx, cy: cy, rx: r, ry: r * 0.78, fill: fill, 'fill-opacity': op })];
    if (kind === 'line') return [svg('line', { x1: cx - r, y1: cy + r * 0.6, x2: cx + r, y2: cy - r * 0.6, stroke: fill, 'stroke-width': 3, 'stroke-linecap': 'round' })];
    var pts = [], n = kind === 'star' ? 10 : 6, i;
    for (i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + i * Math.PI * 2 / n;
      var rr = (kind === 'star' && i % 2) ? r * 0.45 : r;
      pts.push((cx + Math.cos(ang) * rr).toFixed(1) + ',' + (cy + Math.sin(ang) * rr).toFixed(1));
    }
    return [svg('polygon', { points: pts.join(' '), fill: fill, 'fill-opacity': op })];
  }
  function shapesSvg(kind, h) {
    return svg('svg', { viewBox: '0 0 160 84', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 82, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })
    ].concat(shapeGlyph(kind, 80, 42, 26)));
  }

  var KINDS = [
    { kind: 'rectangle', label: 'Rectangle' },
    { kind: 'rounded', label: 'Rounded' },
    { kind: 'ellipse', label: 'Ellipse' },
    { kind: 'polygon', label: 'Polygon' },
    { kind: 'star', label: 'Star' },
    { kind: 'line', label: 'Line' }
  ];

  R.tools.register({
    id: 'shapes',
    title: 'Shapes',
    group: 'Shapes',
    order: 1,
    keywords: ['shape', 'shapes', 'rectangle', 'rounded', 'ellipse', 'circle', 'polygon', 'star', 'line', 'primitive'],
    mount: mount
  });

  function mount(ctx) {
    var previewKind = 'rectangle';

    // Widget: the shape primitives as a grid of glyph buttons that fills the box;
    // click one to drop that shape into the active comp.
    if (ctx.widget) {
      var grid = el('div.rb-wgt-pick', { style: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '1fr' } });
      KINDS.forEach(function (item) {
        var glyph = svg('svg', { viewBox: '0 0 56 40', width: '100%', height: 'auto' }, shapeGlyph(item.kind, 28, 20, 13));
        grid.appendChild(el('button.rb-wgt-picktile', { type: 'button', title: 'Add a ' + item.label.toLowerCase(),
          onclick: function () { addShape(item.kind, item.label); } },
        [glyph, el('span.rb-wgt-picktile-name', { text: item.label })]));
      });
      ctx.body.appendChild(el('div.rb-wgt', null, [grid]));
      return { destroy: function () {} };
    }

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(shapesSvg(previewKind, 84)); }

    var buttonRow = el('div.rb-row.rb-wrap');
    var kindButtons = [];
    KINDS.forEach(function (item) {
      var b = el('button.rb-btn', {
        title: 'Add a ' + item.label.toLowerCase(),
        onclick: function () { addShape(item.kind, item.label); }
      }, [item.label]);
      b.addEventListener('mouseenter', function () { previewKind = item.kind; renderPreview(); });
      kindButtons.push(b);
      buttonRow.appendChild(b);
    });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Drops a parametric shape primitive into the active composition, centered with a default fill (the line gets a stroke on an open path instead).' }),
      previewHost,
      buttonRow
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    function sync(sel) {
      scopeText.textContent = describe(sel);
      var noComp = !(sel && sel.hasComp);
      for (var i = 0; i < kindButtons.length; i++) kindButtons[i].disabled = noComp;
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function addShape(kind, label) {
      ctx.invoke('shapes.add', { kind: kind })
        .then(function (res) { ctx.toast('Added ' + label.toLowerCase(), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add shape', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    return 'Adds to the active composition';
  }
})(window.Rebound = window.Rebound || {});
