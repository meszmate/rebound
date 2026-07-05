/*
 * Rebound, Separate tool.
 * Toggles Separate Dimensions on the selected layers' Position so each axis can
 * be keyed or expressed on its own. Separate splits Position into X/Y(/Z); Join
 * recombines them back into a single Position property.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  function row(x, y, w, label) {
    return svg('g', null, [
      svg('rect', { x: x, y: y, width: w, height: 18, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }),
      svg('text', { x: x + 8, y: y + 13, 'font-size': 9, 'font-weight': 700, fill: '#fff' }, [label])
    ]);
  }
  // One Position property, or split into X and Y rows, per the hovered action.
  function separateSvg(mode, h) {
    var W = 160, H = 76, pad = 12;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (mode === 'join') {
      kids.push(row(pad, H / 2 - 9, 96, 'Position'));
    } else {
      kids.push(row(pad, 14, 70, 'Position X'));
      kids.push(row(pad, 42, 70, 'Position Y'));
    }
    return svg('svg', { viewBox: '0 0 160 76', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'separate',
    title: 'Separate',
    group: 'Transform',
    order: 3,
    quick: {
      desc: 'Split Position into separate X and Y properties on the selected layers.',
      method: 'separate.apply',
      args: { separate: true }
    },
    keywords: ['separate', 'dimensions', 'position', 'split', 'join', 'combine', 'xyz', 'axis'],
    mount: mount
  });

  function mount(ctx) {
    var previewMode = 'separate';
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(separateSvg(previewMode, 76)); }

    var separateBtn = el('button.rb-btn', { onclick: function () { run(true); } }, ['Separate']);
    var joinBtn = el('button.rb-btn', { onclick: function () { run(false); } }, ['Join']);
    separateBtn.addEventListener('mouseenter', function () { previewMode = 'separate'; renderPreview(); });
    joinBtn.addEventListener('mouseenter', function () { previewMode = 'join'; renderPreview(); });

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Splits each selected layer’s Position into separate X/Y(/Z) values, or joins them back into one.' }),
      previewHost,
      el('div.rb-row.rb-wrap', null, [separateBtn, joinBtn])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function run(separate) {
      ctx.invoke('separate.apply', { separate: separate })
        .then(function (res) {
          ctx.toast((separate ? 'Separated ' : 'Joined ') + res.changed + ' layer' + (res.changed === 1 ? '' : 's'),
            { kind: res.changed ? 'success' : 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not change dimensions', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});