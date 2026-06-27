/*
 * Rebound, Align & Distribute tool.
 * Per-direction align buttons (left / center / right and top / middle / bottom)
 * relative to the composition or the selection bounds; distribute spreads three
 * or more layers evenly or by a fixed gap.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Three sample layers laid into the chosen reference frame (comp or a dashed
  // selection box), snapped to the hovered alignment or spread for distribute.
  function alignSvg(state, h) {
    var W = 160, H = 90, pad = 12;
    var fx = pad, fy = pad, fw = W - 2 * pad, fh = H - 2 * pad;
    if (state.relativeTo === 'selection') { fx = pad + 16; fy = pad + 8; fw = W - 2 * pad - 32; fh = H - 2 * pad - 16; }
    var a = state.align || 'centerH';
    var horiz = (a === 'left' || a === 'centerH' || a === 'right' || a === 'distH');
    var sizes = [[30, 15], [20, 20], [36, 12]];
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    if (state.relativeTo === 'selection') kids.push(svg('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0.55' }));
    for (var i = 0; i < 3; i++) {
      var w = sizes[i][0], hh = sizes[i][1], x, y;
      if (horiz) {
        var rowH = fh / 3; y = fy + i * rowH + (rowH - hh) / 2;
        if (a === 'left') x = fx; else if (a === 'right') x = fx + fw - w; else if (a === 'distH') x = fx + (fw - w) * (i / 2); else x = fx + (fw - w) / 2;
      } else {
        var colW = fw / 3; x = fx + i * colW + (colW - w) / 2;
        if (a === 'top') y = fy; else if (a === 'bottom') y = fy + fh - hh; else if (a === 'distV') y = fy + (fh - hh) * (i / 2); else y = fy + (fh - hh) / 2;
      }
      kids.push(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: w, height: hh, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
    }
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  var ICON = {
    left: '<line x1="4.5" y1="4" x2="4.5" y2="20" stroke="currentColor" stroke-width="1.6"/><rect x="6.5" y="7" width="12" height="3.6" rx="1" fill="currentColor"/><rect x="6.5" y="13.4" width="7.5" height="3.6" rx="1" fill="currentColor"/>',
    centerH: '<line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1.6"/><rect x="6" y="7" width="12" height="3.6" rx="1" fill="currentColor"/><rect x="8.25" y="13.4" width="7.5" height="3.6" rx="1" fill="currentColor"/>',
    right: '<line x1="19.5" y1="4" x2="19.5" y2="20" stroke="currentColor" stroke-width="1.6"/><rect x="5.5" y="7" width="12" height="3.6" rx="1" fill="currentColor"/><rect x="10" y="13.4" width="7.5" height="3.6" rx="1" fill="currentColor"/>',
    top: '<line x1="4" y1="4.5" x2="20" y2="4.5" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="6.5" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="6.5" width="3.6" height="7.5" rx="1" fill="currentColor"/>',
    middleV: '<line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="6" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="8.25" width="3.6" height="7.5" rx="1" fill="currentColor"/>',
    bottom: '<line x1="4" y1="19.5" x2="20" y2="19.5" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="5.5" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="13.4" y="10" width="3.6" height="7.5" rx="1" fill="currentColor"/>'
  };

  R.tools.register({
    id: 'align',
    title: 'Align',
    group: 'Layout',
    order: 0,
    keywords: ['align', 'distribute', 'arrange', 'center', 'layout', 'spread', 'left', 'right', 'top', 'bottom'],
    mount: mountAlign
  });

  function iconBtn(inner, title, onClick) {
    var b = el('button', { type: 'button', title: title, 'aria-label': title, onclick: onClick });
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="none">' + inner + '</svg>';
    return b;
  }

  function mountAlign(ctx) {
    // Default to lining the selected layers up with EACH OTHER (like AE/Figma).
    // With a single layer the host falls back to the composition, so one layer
    // still centers in the frame.
    var relativeTo = 'selection';
    var group = false;
    var previewAlign = 'centerH';

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(alignSvg({ align: previewAlign, relativeTo: relativeTo }, 90)); }

    // An icon align button that also previews its alignment on hover.
    function aBtn(iconKey, alignKey, title, onClick) {
      var b = iconBtn(ICON[iconKey], title, onClick);
      b.addEventListener('mouseenter', function () { previewAlign = alignKey; renderPreview(); });
      return b;
    }
    function distBtn(label, ghost, axis, mode, alignKey) {
      var b = el('button.rb-btn' + (ghost ? '.is-ghost' : ''), { onclick: function () { distribute(axis, mode); } }, [label]);
      b.addEventListener('mouseenter', function () { previewAlign = alignKey; renderPreview(); });
      return b;
    }

    var hBar = el('div.rb-iconbar', null, [
      aBtn('left', 'left', 'Align left', function () { doAlign({ gx: 0, axes: 'x' }); }),
      aBtn('centerH', 'centerH', 'Align horizontal center', function () { doAlign({ gx: 0.5, axes: 'x' }); }),
      aBtn('right', 'right', 'Align right', function () { doAlign({ gx: 1, axes: 'x' }); })
    ]);
    var vBar = el('div.rb-iconbar', null, [
      aBtn('top', 'top', 'Align top', function () { doAlign({ gy: 0, axes: 'y' }); }),
      aBtn('middleV', 'middleV', 'Align vertical center', function () { doAlign({ gy: 0.5, axes: 'y' }); }),
      aBtn('bottom', 'bottom', 'Align bottom', function () { doAlign({ gy: 1, axes: 'y' }); })
    ]);

    var relCtl = ui.segmented([
      { value: 'comp', label: 'Composition' },
      { value: 'selection', label: 'Selection' }
    ], { value: relativeTo, onChange: function (v) { relativeTo = v; renderPreview(); } });

    var groupToggle = ui.toggle({ label: 'Move selection as a group', value: group,
      onChange: function (v) { group = v; } });

    var gapField = ui.numberField({ label: 'Gap', value: 0, step: 1, decimals: 0, suffix: 'px', width: '110px' });

    // The align widget is just the six align buttons, big and filling the box:
    // click to align the selection perfectly (to the composition). Relative-to,
    // group, distribute and gap live in the full tool, via the open control.
    function wBtn(iconKey, args, title) {
      var b = el('button.rb-wgt-alignbtn', { type: 'button', title: title, 'aria-label': title, onclick: function () { doAlign(args); } });
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="none">' + ICON[iconKey] + '</svg>';
      return b;
    }

    if (ctx.widget) {
      ctx.body.appendChild(el('div.rb-wgt.rb-wgt-aligngrid', null, [
        wBtn('left', { gx: 0, axes: 'x' }, 'Align left'),
        wBtn('centerH', { gx: 0.5, axes: 'x' }, 'Align horizontal center'),
        wBtn('right', { gx: 1, axes: 'x' }, 'Align right'),
        wBtn('top', { gy: 0, axes: 'y' }, 'Align top'),
        wBtn('middleV', { gy: 0.5, axes: 'y' }, 'Align vertical middle'),
        wBtn('bottom', { gy: 1, axes: 'y' }, 'Align bottom')
      ]));
    } else {
      renderPreview();
      ctx.body.appendChild(el('div.rb-col', null, [
        previewHost,
        el('div.rb-section-label', { text: 'Align to' }),
        relCtl.el,
        el('div.rb-faint', { text: 'Selection lines the layers up with each other; Composition aligns them to the frame.' }),
        el('div.rb-row.rb-wrap', { style: { gap: '10px' } }, [hBar, vBar]),
        groupToggle.el,
        el('div.rb-section-label', { text: 'Distribute' }),
        el('div.rb-row.rb-wrap', null, [
          distBtn('Horizontal', false, 'x', 'auto', 'distH'),
          distBtn('Vertical', false, 'y', 'auto', 'distV')
        ]),
        el('div.rb-row.rb-wrap', null, [
          gapField.el,
          distBtn('H by gap', true, 'x', 'gap', 'distH'),
          distBtn('V by gap', true, 'y', 'gap', 'distV')
        ])
      ]));
    }

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doAlign(opts) {
      var args = {
        gx: opts.gx != null ? opts.gx : null,
        gy: opts.gy != null ? opts.gy : null,
        axes: opts.axes, relativeTo: relativeTo, mode: group ? 'group' : 'each'
      };
      ctx.invoke('align.layers', args)
        .then(function (res) { ctx.toast('Aligned ' + res.moved + ' layer' + (res.moved === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not align', { kind: 'error' }); });
    }

    function distribute(axis, mode) {
      ctx.invoke('align.distribute', { axis: axis, mode: mode, gap: gapField.get() })
        .then(function (res) { ctx.toast('Distributed ' + res.moved + ' layers' + (mode === 'auto' ? ' (gap ' + res.gap + 'px)' : ''), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not distribute', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to align';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
