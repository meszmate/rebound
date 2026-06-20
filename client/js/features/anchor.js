/*
 * Rebound, Anchor tool.
 * A 9-point grid moves the anchor to a bounding-box point without moving the
 * layer (Position is compensated by the host). Plus center-in-comp helpers.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  var POINTS = [
    [0, 0], [0.5, 0], [1, 0],
    [0, 0.5], [0.5, 0.5], [1, 0.5],
    [0, 1], [0.5, 1], [1, 1]
  ];

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
    var grid = el('div.rb-anchor-grid');
    POINTS.forEach(function (pt) {
      grid.appendChild(el('button', {
        title: labelFor(pt),
        onclick: function () { move(ctx, pt[0], pt[1]); }
      }));
    });

    var centerRow = el('div.rb-row', null, [
      el('button.rb-btn', { onclick: function () { centerInComp(ctx, true, true); } }, ['Center in comp']),
      el('button.rb-btn.is-ghost', { onclick: function () { centerInComp(ctx, true, false); } }, ['X']),
      el('button.rb-btn.is-ghost', { onclick: function () { centerInComp(ctx, false, true); } }, ['Y'])
    ]);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-section-label', { text: 'Move anchor to' }),
      el('div.rb-row', null, [grid, el('div.rb-faint.rb-grow', {
        text: 'Click a point to move the anchor there without moving the layer. Position keyframes are compensated.'
      })]),
      el('div.rb-section-label', { text: 'Center layer in composition' }),
      centerRow
    ]));

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

  function move(ctx, gx, gy) {
    ctx.invoke('anchor.move', { gx: gx, gy: gy })
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
