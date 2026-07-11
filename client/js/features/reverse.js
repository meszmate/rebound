/*
 * Rebound, Reverse tool.
 * Reverses the selected keyframes in time, mirroring them within their own
 * span: a key originally at one end of the range lands at the other, with its
 * value preserved and its ease and interpolation direction swapped.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;

  // Two keyframe tracks: the original spacing on top, mirrored within its span on
  // the bottom, with a flip arrow between.
  function reverseSvg(h) {
    var W = 160, H = 80, pad = 12, trackW = W - 2 * pad, y1 = 24, y2 = 58;
    var ks = [0.1, 0.34, 0.5, 0.9];
    function X(u) { return pad + u * trackW; }
    function diamond(x, y) { return svg('path', { d: 'M' + x + ' ' + (y - 5) + 'L' + (x + 4) + ' ' + y + 'L' + x + ' ' + (y + 5) + 'L' + (x - 4) + ' ' + y + 'Z', fill: '#fff', stroke: 'var(--rb-accent)', 'stroke-width': 1 }); }
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      svg('line', { x1: pad, y1: y1, x2: W - pad, y2: y1, stroke: 'var(--rb-border-strong)', 'stroke-width': 1 }),
      svg('line', { x1: pad, y1: y2, x2: W - pad, y2: y2, stroke: 'var(--rb-border-strong)', 'stroke-width': 1 })];
    ks.forEach(function (u) { kids.push(diamond(X(u).toFixed(1), y1)); });
    ks.forEach(function (u) { kids.push(diamond(X(1 - u).toFixed(1), y2)); });
    kids.push(svg('path', { d: 'M' + (W - pad - 4) + ' ' + (y1 + 7) + ' Q' + (W - pad + 4) + ' ' + ((y1 + y2) / 2) + ' ' + (pad + 4) + ' ' + (y2 - 7), fill: 'none', stroke: 'var(--rb-text-muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    return svg('svg', { viewBox: '0 0 160 80', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'reverse',
    title: 'Reverse',
    group: 'Timing',
    order: 5,
    keywords: ['reverse', 'mirror', 'flip', 'invert', 'keyframe', 'time', 'timing', 'reorder'],
    mount: mount
  });

  function mount(ctx) {
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Mirrors the selected keyframes within their own span, so the animation plays back in reverse. Select at least two keyframes on a property; with none selected, the whole property is reversed.' }),
      el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [reverseSvg(80)])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(applyBtn);

    // The host reverses selected keys, or a whole selected property when no
    // keys are selected, so a selected property is what makes Apply valid.
    function canApply(sel) { return !!(sel && sel.hasComp && sel.properties && sel.properties.length); }
    function sync(sel) {
      scopeText.textContent = describe(sel);
      applyBtn.disabled = !canApply(sel);
    }
    var off = ctx.onSelection(sync);
    sync(ctx.getSelection());

    function doApply() {
      ctx.invoke('reverse.apply', {})
        .then(function (res) { ctx.toast('Reversed ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: res.keys ? 'success' : 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not reverse', { kind: 'error' }); });
    }

    return { destroy: off };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.totalSelectedKeys) return 'Select keyframes to reverse';
    return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
