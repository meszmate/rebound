/*
 * Rebound, Anchor tool.
 * A big visual anchor-point picker: drag anywhere in the layer box to place the
 * anchor freely (snapping to the 9 bounding-box points), or click a handle. The
 * layer never moves, the host compensates Position. Plus center-in-comp helpers.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  var POINTS = [
    [0, 0], [0.5, 0], [1, 0],
    [0, 0.5], [0.5, 0.5], [1, 0.5],
    [0, 1], [0.5, 1], [1, 1]
  ];
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  R.tools.register({
    id: 'anchor',
    title: 'Anchor',
    group: 'Transform',
    order: 0,
    keywords: ['anchor', 'anchor point', 'pivot', 'center', 'origin'],
    mount: mountAnchor,
    commands: [
      { id: 'center', title: 'Center anchor', run: function (ctx) { move(ctx, 0.5, 0.5); } }
    ]
  });

  function mountAnchor(ctx) {
    var target = { x: 0.5, y: 0.5 };
    var extents = false;

    var box = el('div.rb-anchor-box');
    box.appendChild(el('div.rb-anchor-cross'));
    var crosshair = el('div.rb-anchor-target');
    box.appendChild(crosshair);

    POINTS.forEach(function (pt) {
      var d = el('button.rb-anchor-dot', { style: { left: (pt[0] * 100) + '%', top: (pt[1] * 100) + '%' }, title: labelFor(pt) });
      d.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); setTarget(pt[0], pt[1]); move(ctx, pt[0], pt[1], extents); });
      box.appendChild(d);
    });

    var readout = el('div.rb-anchor-readout', { text: '' });
    var extentsToggle = ui.toggle({ label: 'Include masks & effects', value: extents,
      title: 'Use the bounds grown to include masks, strokes, and effects, instead of the raw layer geometry.',
      onChange: function (v) { extents = v; } });

    function place() {
      crosshair.style.left = (target.x * 100) + '%';
      crosshair.style.top = (target.y * 100) + '%';
      var dots = box.querySelectorAll('.rb-anchor-dot');
      POINTS.forEach(function (pt, i) { dots[i].classList.toggle('is-active', pt[0] === target.x && pt[1] === target.y); });
      var named = labelExact();
      readout.textContent = 'Anchor ' + Math.round(target.x * 100) + '% , ' + Math.round(target.y * 100) + '%' + (named ? '  (' + named + ')' : '');
    }
    function setTarget(x, y) { target.x = x; target.y = y; place(); }
    function labelExact() {
      for (var i = 0; i < POINTS.length; i++) { if (POINTS[i][0] === target.x && POINTS[i][1] === target.y) return labelFor(POINTS[i]); }
      return '';
    }

    // Drag anywhere in the box to place the anchor freely; it snaps near a point.
    box.addEventListener('pointerdown', function (e) {
      var r = box.getBoundingClientRect();
      function setFromEvent(ev) {
        var x = clamp01((ev.clientX - r.left) / (r.width || 1));
        var y = clamp01((ev.clientY - r.top) / (r.height || 1));
        POINTS.forEach(function (p) { if (Math.abs(x - p[0]) < 0.05 && Math.abs(y - p[1]) < 0.05) { x = p[0]; y = p[1]; } });
        target.x = x; target.y = y; place();
      }
      setFromEvent(e);
      function mv(ev) { setFromEvent(ev); }
      function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); move(ctx, target.x, target.y, extents); }
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
    });

    var centerRow = el('div.rb-row', null, [
      el('button.rb-btn', { onclick: function () { centerInComp(ctx, true, true); } }, ['Center in comp']),
      el('button.rb-btn.is-ghost', { onclick: function () { centerInComp(ctx, true, false); } }, ['X only']),
      el('button.rb-btn.is-ghost', { onclick: function () { centerInComp(ctx, false, true); } }, ['Y only'])
    ]);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-section-label', { text: 'Anchor point' }),
      el('div.rb-faint', { text: 'Click a handle or drag anywhere in the box to move the anchor without moving the layer. Position keyframes are compensated.' }),
      el('div.rb-anchor-stage', null, [box]),
      readout,
      extentsToggle.el,
      el('div.rb-section-label', { text: 'Center layer in composition' }),
      centerRow
    ]));

    place();

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select one or more layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }

  function labelFor(pt) {
    var ny = pt[1] === 0 ? 'Top' : pt[1] === 1 ? 'Bottom' : 'Middle';
    var nx = pt[0] === 0 ? 'Left' : pt[0] === 1 ? 'Right' : 'Center';
    return ny + ' ' + nx;
  }

  function move(ctx, gx, gy, extents) {
    ctx.invoke('anchor.move', { gx: gx, gy: gy, extents: !!extents })
      .then(function (res) {
        var msg = 'Moved anchor on ' + res.moved + ' layer' + (res.moved === 1 ? '' : 's');
        if (res.skipped && res.skipped.length) {
          ctx.toast(msg + ' · skipped ' + res.skipped.length, { kind: 'info', action: 'why?', onAction: function () {
            ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info', duration: 6000 });
          } });
        } else {
          ctx.toast(msg, { kind: 'success' });
        }
        ctx.refreshSelection();
      })
      .catch(function (err) { ctx.toast(err.message || 'Could not move anchor', { kind: 'error' }); });
  }

  function centerInComp(ctx, x, y) {
    ctx.invoke('anchor.centerInComp', { x: x, y: y })
      .then(function (res) { ctx.toast('Centered ' + res.moved + ' layer' + (res.moved === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
      .catch(function (err) { ctx.toast(err.message || 'Could not center', { kind: 'error' }); });
  }
})(window.Rebound = window.Rebound || {});
