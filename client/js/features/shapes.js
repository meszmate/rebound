/*
 * Rebound, Shapes tool.
 * Inserts parametric shape primitives (rectangle, rounded rectangle, ellipse,
 * polygon, star, line) as centered shape layers with a default fill.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

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
    var buttonRow = el('div.rb-row.rb-wrap');
    KINDS.forEach(function (item) {
      buttonRow.appendChild(el('button.rb-btn', {
        title: 'Add a ' + item.label.toLowerCase(),
        onclick: function () { addShape(item.kind, item.label); }
      }, [item.label]));
    });

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Drops a parametric shape primitive into the active composition, centered with a default fill.' }),
      buttonRow
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

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
