/*
 * Rebound, Copy Ease.
 * Copy the temporal ease (speed + influence) off one keyframe and paste it
 * onto others. The Mode picker chooses which part of the stored ease to write:
 * just the influence, just the speed, or both, the untouched part is kept from
 * each target key's current ease.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  function clampY(v) { return v < -0.3 ? -0.3 : v > 1.3 ? 1.3 : v; }

  // A representative ease, and the same ease after the current transform, so the
  // preview shows what Mirror and Scale do to a copied ease.
  var SAMPLE = { type: 'bezier', x1: 0.3, y1: 0, x2: 0.6, y2: 1 };
  function transformed(state) {
    var c = { x1: SAMPLE.x1, y1: SAMPLE.y1, x2: SAMPLE.x2, y2: SAMPLE.y2 };
    if (state.mirror) c = { x1: 1 - c.x2, y1: 1 - c.y2, x2: 1 - c.x1, y2: 1 - c.y1 };
    var s = state.scale || 1;
    return { type: 'bezier', x1: c.x1, y1: clampY(c.y1 * s), x2: c.x2, y2: clampY(1 - (1 - c.y2) * s) };
  }

  function copyeaseSvg(result, h) {
    var W = 240, H = 92, pad = 8;
    var rs = R.easing.sampler.range(SAMPLE, 60), rr = R.easing.sampler.range(result, 60);
    var lo = Math.min(0, rs.min, rr.min), hi = Math.max(1, rs.max, rr.max), span = (hi - lo) || 1;
    function px(x) { return pad + x * (W - 2 * pad); }
    function py(y) { return (H - pad) - ((y - lo) / span) * (H - 2 * pad); }
    function path(curve, stroke, dash) {
      var pts = R.easing.sampler.samplePoints(curve, 48);
      var d = pts.map(function (pt, i) { return (i === 0 ? 'M' : 'L') + px(pt.x).toFixed(1) + ' ' + py(pt.y).toFixed(1); }).join(' ');
      return svg('path', { d: d, fill: 'none', stroke: stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-dasharray': dash || null });
    }
    return svg('svg', { viewBox: '0 0 240 92', width: '100%', height: h }, [
      svg('line', { x1: pad, y1: py(0), x2: W - pad, y2: py(0), stroke: 'var(--rb-border)', 'stroke-width': 1 }),
      svg('line', { x1: pad, y1: py(1), x2: W - pad, y2: py(1), stroke: 'var(--rb-border)', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: '0.5' }),
      path(SAMPLE, 'var(--rb-text-faint)', '4 3'),
      path(result, 'var(--rb-accent)')
    ]);
  }

  R.tools.register({
    id: 'copyease',
    title: 'Copy Ease',
    group: 'Easing',
    order: 4,
    keywords: ['copy', 'paste', 'ease', 'influence', 'speed', 'temporal', 'keyframe'],
    mount: mount
  });

  function mount(ctx) {
    var stored = null;
    var mode = 'both';
    var mirror = false;
    var scale = 1;

    // --- Copy / Mode / Paste controls ---
    var copyBtn = el('button.rb-btn', {
      title: 'Copy the ease from the first selected keyframe',
      onclick: doCopy
    }, ['Copy']);

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(copyeaseSvg(transformed({ mirror: mirror, scale: scale }), 92)); }

    var modeCtl = ui.segmented([
      { value: 'influence', label: 'Influence', title: 'Paste only the influence' },
      { value: 'speed', label: 'Speed', title: 'Paste only the speed' },
      { value: 'both', label: 'Both', title: 'Paste both influence and speed' }
    ], { value: mode, onChange: function (v) { mode = v; } });

    var mirrorToggle = ui.toggle({ label: 'Mirror in and out', value: mirror,
      title: 'Paste the copied out-ease onto the target in-side and vice versa, for a symmetric flip.',
      onChange: function (v) { mirror = v; renderPreview(); } });
    var scaleField = ui.numberField({ label: 'Scale', value: scale, min: 0.1, max: 4, step: 0.05,
      decimals: 2, suffix: 'x', width: '110px', onChange: function (v) { scale = v; renderPreview(); } });

    var pasteBtn = el('button.rb-btn.is-disabled', {
      title: 'Paste the copied ease onto the selected keyframes',
      onclick: doPaste
    }, ['Paste']);

    function setPasteEnabled(on) {
      pasteBtn.classList.toggle('is-disabled', !on);
    }

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Copy the ease from one keyframe and paste it onto others. The preview shows a sample ease (dashed) and how Mirror and Scale transform it (solid).' }),
      el('div.rb-row', null, [copyBtn]),
      previewHost,
      el('div.rb-section-label', { text: 'Paste' }),
      modeCtl.el,
      mirrorToggle.el,
      ui.row('Scale', scaleField.el),
      el('div.rb-row', null, [pasteBtn])
    ]));

    // --- Footer ---
    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    function describeSelection(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      if (!sel.totalSelectedKeys) return 'Select keyframes';
      return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
    }

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = describeSelection(sel);
    });
    scopeText.textContent = describeSelection(ctx.getSelection());

    function doCopy() {
      ctx.invoke('copyease.copy', {})
        .then(function (res) {
          stored = res;
          setPasteEnabled(true);
          ctx.toast('Ease copied', { kind: 'success' });
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not copy ease', { kind: 'error' });
        });
    }

    function doPaste() {
      if (!stored) { ctx.toast('Copy an ease first', { kind: 'error' }); return; }
      ctx.invoke('copyease.paste', { ease: stored, mode: mode, mirror: mirror, scale: scale })
        .then(function (res) {
          ctx.toast('Pasted onto ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not paste ease', { kind: 'error' });
        });
    }

    return { destroy: off };
  }
})(window.Rebound = window.Rebound || {});