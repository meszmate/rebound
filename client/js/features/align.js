/*
 * Rebound, Align & Distribute tool.
 * Per-direction align buttons (left / center / right and top / middle / bottom)
 * relative to the composition, the selection bounds, or a key layer (the last
 * selected); distribute spreads three or more layers evenly, or two or more by
 * a fixed gap. Also home of the shared selection minimap (R.layoutPreview):
 * the REAL selected layers' comp-space boxes, read via the host's layout.read,
 * with hover animation of each box to its computed target.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // ---- Shared selection minimap (R.layoutPreview) --------------------------
  // Renders the selected layers' true comp-space boxes (host 'layout.read')
  // scaled into the preview frame. Tools call preview(deltas) on hover to
  // animate every box to its computed target (WAAPI, forwards-filled) and
  // rest() on leave to play it back. When there is no comp / selection the
  // element hides itself and reports null via onChange so the tool can show
  // its illustrative sample instead.
  function createLayoutPreview(ctx, opts) {
    opts = opts || {};
    var height = opts.height || 96;
    var data = null;    // { width, height, boxes: [{ name, index, x, y, w, h }] }
    var rects = [];     // SVG rects, index-matched to data.boxes
    var anims = [];
    var watchers = [];
    var pending = false;
    var queued = false;
    var dead = false;

    var host = el('div', { style: { display: 'none' } });

    function notify() {
      for (var i = 0; i < watchers.length; i++) {
        try { watchers[i](data); } catch (e) { /* watcher errors stay local */ }
      }
    }

    function stopAnims() {
      for (var i = 0; i < anims.length; i++) {
        try { anims[i].cancel(); } catch (e) { /* already gone */ }
      }
      anims = [];
      for (var j = 0; j < rects.length; j++) rects[j].style.transform = '';
    }

    function render() {
      stopAnims();
      R.dom.clear(host);
      rects = [];
      if (!data) { host.style.display = 'none'; return; }
      host.style.display = '';
      var W = data.width || 1;
      var H = data.height || 1;
      var kids = [svg('rect', {
        x: 0, y: 0, width: W, height: H,
        fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke'
      })];
      for (var i = 0; i < data.boxes.length; i++) {
        var b = data.boxes[i];
        var r = svg('rect', {
          x: b.x, y: b.y, width: Math.max(b.w, 1), height: Math.max(b.h, 1),
          fill: 'var(--rb-accent)', 'fill-opacity': '0.75',
          stroke: 'var(--rb-accent)', 'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke'
        });
        // Center-origin transforms so a mirror preview (scale -1) flips the
        // box in place instead of around the comp origin.
        r.style.transformBox = 'fill-box';
        r.style.transformOrigin = '50% 50%';
        kids.push(r);
        rects.push(r);
      }
      host.appendChild(svg('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        width: '100%', height: height,
        preserveAspectRatio: 'xMidYMid meet'
      }, kids));
    }

    function refresh() {
      if (dead) return;
      if (pending) { queued = true; return; }
      pending = true;
      ctx.invoke('layout.read', {})
        .then(function (res) { settle(res && res.found ? res : null); })
        .catch(function () { settle(null); });
    }
    function settle(d) {
      pending = false;
      if (dead) return;
      data = d;
      render();
      notify();
      if (queued) { queued = false; refresh(); }
    }

    // deltas: array index-matched to boxes, entries { dx, dy, sx, sy } (all
    // optional). Animates each box from rest to its target, forwards-filled.
    function preview(deltas) {
      if (!data || !deltas) return;
      stopAnims();
      for (var i = 0; i < rects.length; i++) {
        var t = deltas[i] || {};
        var to = 'translate(' + (t.dx || 0) + 'px,' + (t.dy || 0) + 'px)' +
          ' scale(' + (t.sx != null ? t.sx : 1) + ',' + (t.sy != null ? t.sy : 1) + ')';
        if (rects[i].animate) {
          anims.push(rects[i].animate(
            [{ transform: 'translate(0px,0px) scale(1,1)' }, { transform: to }],
            { duration: 360, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)', fill: 'forwards' }
          ));
        } else {
          rects[i].style.transform = to; // no WAAPI (headless preview): jump
        }
      }
    }

    // Play the hover preview back to rest.
    function rest() {
      if (!anims.length) {
        for (var j = 0; j < rects.length; j++) rects[j].style.transform = '';
        return;
      }
      for (var i = 0; i < anims.length; i++) {
        try { anims[i].reverse(); } catch (e) { try { anims[i].cancel(); } catch (e2) { /* gone */ } }
      }
    }

    refresh();

    return {
      el: host,
      refresh: refresh,
      preview: preview,
      rest: rest,
      hasData: function () { return !!data; },
      data: function () { return data; },
      onChange: function (fn) { watchers.push(fn); },
      destroy: function () { dead = true; stopAnims(); }
    };
  }

  // Box math shared by the hover-target computations (boxes are the
  // layout.read shape: { x, y, w, h }).
  function featureOf(b, g, axis) {
    var lo = axis === 'x' ? b.x : b.y;
    var size = axis === 'x' ? b.w : b.h;
    return g === 0 ? lo : g === 1 ? lo + size : lo + size / 2;
  }
  function unionOf(boxes) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  R.layoutPreview = {
    create: createLayoutPreview,
    featureOf: featureOf,
    unionOf: unionOf
  };

  // Three sample layers laid into the chosen reference frame (comp or a dashed
  // selection box), snapped to the hovered alignment or spread for distribute.
  // For 'key', two layers line up with a dashed KEY box that stays put.
  function alignSvg(state, h) {
    var W = 160, H = 90, pad = 12;
    var fx = pad, fy = pad, fw = W - 2 * pad, fh = H - 2 * pad;
    var a = state.align || 'centerH';
    var horiz = (a === 'left' || a === 'centerH' || a === 'right' || a === 'distH');
    var dist = (a === 'distH' || a === 'distV');
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    var i, w, hh, x, y;

    // Key layer (distribute ignores the reference, so fall through for dist).
    if (state.relativeTo === 'key' && !dist) {
      var kx = 60, ky = 32, kw = 40, kh = 26;
      kids.push(svg('rect', { x: kx, y: ky, width: kw, height: kh, rx: 2, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
      var sizes2 = [[26, 12], [18, 16]];
      for (i = 0; i < 2; i++) {
        w = sizes2[i][0]; hh = sizes2[i][1];
        if (horiz) {
          y = i === 0 ? ky - hh - 9 : ky + kh + 9;
          x = a === 'left' ? kx : a === 'right' ? kx + kw - w : kx + (kw - w) / 2;
        } else {
          x = i === 0 ? kx - w - 11 : kx + kw + 11;
          y = a === 'top' ? ky : a === 'bottom' ? ky + kh - hh : ky + (kh - hh) / 2;
        }
        kids.push(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: w, height: hh, rx: 2, fill: 'var(--rb-accent)', 'fill-opacity': '0.85' }));
      }
      return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
    }

    var inset = state.relativeTo === 'selection' || state.relativeTo === 'key';
    if (inset) { fx = pad + 16; fy = pad + 8; fw = W - 2 * pad - 32; fh = H - 2 * pad - 16; }
    if (inset) kids.push(svg('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'none', stroke: 'var(--rb-text-faint)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: '0.55' }));
    var sizes = [[30, 15], [20, 20], [36, 12]];
    for (i = 0; i < 3; i++) {
      w = sizes[i][0]; hh = sizes[i][1];
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
    keywords: ['align', 'distribute', 'arrange', 'center', 'layout', 'spread', 'left', 'right', 'top', 'bottom', 'key'],
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

    // The align widget is just the six align buttons, big and filling the box:
    // click to align the selection perfectly. Relative-to, group, distribute
    // and gap live in the full tool, via the open control.
    function wBtn(iconKey, args, title) {
      var b = el('button.rb-wgt-alignbtn', { type: 'button', title: title, 'aria-label': title, onclick: function () { doAlign(args); } });
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="none">' + ICON[iconKey] + '</svg>';
      return b;
    }

    if (ctx.widget) {
      var wBtns = [
        wBtn('left', { gx: 0, axes: 'x' }, 'Align left'),
        wBtn('centerH', { gx: 0.5, axes: 'x' }, 'Align horizontal center'),
        wBtn('right', { gx: 1, axes: 'x' }, 'Align right'),
        wBtn('top', { gy: 0, axes: 'y' }, 'Align top'),
        wBtn('middleV', { gy: 0.5, axes: 'y' }, 'Align vertical middle'),
        wBtn('bottom', { gy: 1, axes: 'y' }, 'Align bottom')
      ];
      ctx.body.appendChild(el('div.rb-wgt.rb-wgt-aligngrid', null, wBtns));
      var syncWidget = function (sel) {
        var n = sel && sel.hasComp ? (sel.selectedLayerCount || 0) : 0;
        for (var i = 0; i < wBtns.length; i++) wBtns[i].disabled = n < 1;
      };
      var offW = ctx.onSelection(syncWidget);
      syncWidget(ctx.getSelection());
      return { destroy: offW };
    }

    // Live minimap of the real selection; the illustrative sample is the
    // fallback when nothing is selected (or the read is unavailable).
    var map = createLayoutPreview(ctx, { height: 96 });
    var fallback = el('div');
    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } }, [map.el, fallback]);
    function renderPreview() {
      R.dom.clear(fallback);
      if (!map.hasData()) fallback.appendChild(alignSvg({ align: previewAlign, relativeTo: relativeTo }, 90));
    }
    map.onChange(function (d) {
      fallback.style.display = d ? 'none' : '';
      renderPreview();
    });

    // Hover targets, mirroring host align: reference from comp / union / key
    // (the LAST selected layer, which stays put), per-layer or as a group.
    function alignDeltas(opts) {
      var d = map.data();
      if (!d) return null;
      var boxes = d.boxes;
      var n = boxes.length;
      var doX = opts.axes === 'x' || opts.axes === 'both' || !opts.axes;
      var doY = opts.axes === 'y' || opts.axes === 'both' || !opts.axes;
      var gx = opts.gx != null ? opts.gx : null;
      var gy = opts.gy != null ? opts.gy : null;
      var keyIdx = -1;
      var ref;
      if (relativeTo === 'key' && n > 1) { keyIdx = n - 1; ref = boxes[keyIdx]; }
      else if (relativeTo === 'selection' && n > 1) ref = unionOf(boxes);
      else ref = { x: 0, y: 0, w: d.width, h: d.height };
      var movable = [];
      var i;
      for (i = 0; i < n; i++) { if (i !== keyIdx) movable.push(boxes[i]); }
      var out = [];
      if (group && movable.length) {
        var u = unionOf(movable);
        var dx = doX && gx != null ? featureOf(ref, gx, 'x') - featureOf(u, gx, 'x') : 0;
        var dy = doY && gy != null ? featureOf(ref, gy, 'y') - featureOf(u, gy, 'y') : 0;
        for (i = 0; i < n; i++) out.push(i === keyIdx ? {} : { dx: dx, dy: dy });
      } else {
        for (i = 0; i < n; i++) {
          if (i === keyIdx) { out.push({}); continue; }
          var b = boxes[i];
          out.push({
            dx: doX && gx != null ? featureOf(ref, gx, 'x') - featureOf(b, gx, 'x') : 0,
            dy: doY && gy != null ? featureOf(ref, gy, 'y') - featureOf(b, gy, 'y') : 0
          });
        }
      }
      return out;
    }

    // Hover targets mirroring host distribute (sorted by leading edge, then a
    // cursor walk: auto spreads the slack, gap chains at a fixed spacing).
    function distDeltas(axis, mode) {
      var d = map.data();
      if (!d) return null;
      var boxes = d.boxes;
      var n = boxes.length;
      if (mode === 'gap' ? n < 2 : n < 3) return null;
      var idx = [];
      var i;
      for (i = 0; i < n; i++) idx.push(i);
      idx.sort(function (a, b) { return featureOf(boxes[a], 0, axis) - featureOf(boxes[b], 0, axis); });
      var sizes = [];
      var sum = 0;
      for (i = 0; i < n; i++) {
        var s = axis === 'x' ? boxes[idx[i]].w : boxes[idx[i]].h;
        sizes.push(s); sum += s;
      }
      var first = featureOf(boxes[idx[0]], 0, axis);
      var last = featureOf(boxes[idx[n - 1]], 1, axis);
      var gap = mode === 'gap' ? (gapField.get() || 0) : (last - first - sum) / (n - 1);
      var out = [];
      for (i = 0; i < n; i++) out.push({});
      var cursor = first;
      for (i = 0; i < n; i++) {
        var delta = cursor - featureOf(boxes[idx[i]], 0, axis);
        out[idx[i]] = axis === 'x' ? { dx: delta } : { dy: delta };
        cursor += sizes[i] + gap;
      }
      return out;
    }

    // An icon align button that also previews its alignment on hover.
    function aBtn(iconKey, alignKey, title, args) {
      var b = iconBtn(ICON[iconKey], title, function () { doAlign(args); });
      b.addEventListener('mouseenter', function () {
        previewAlign = alignKey; renderPreview();
        map.preview(alignDeltas(args));
      });
      b.addEventListener('mouseleave', function () { map.rest(); });
      return b;
    }
    function distBtn(label, ghost, axis, mode, alignKey) {
      var b = el('button.rb-btn' + (ghost ? '.is-ghost' : ''), { onclick: function () { distribute(axis, mode); } }, [label]);
      b.addEventListener('mouseenter', function () {
        previewAlign = alignKey; renderPreview();
        map.preview(distDeltas(axis, mode));
      });
      b.addEventListener('mouseleave', function () { map.rest(); });
      return b;
    }

    var alignBtns = [
      aBtn('left', 'left', 'Align left', { gx: 0, axes: 'x' }),
      aBtn('centerH', 'centerH', 'Align horizontal center', { gx: 0.5, axes: 'x' }),
      aBtn('right', 'right', 'Align right', { gx: 1, axes: 'x' }),
      aBtn('top', 'top', 'Align top', { gy: 0, axes: 'y' }),
      aBtn('middleV', 'middleV', 'Align vertical center', { gy: 0.5, axes: 'y' }),
      aBtn('bottom', 'bottom', 'Align bottom', { gy: 1, axes: 'y' })
    ];
    var hBar = el('div.rb-iconbar', null, [alignBtns[0], alignBtns[1], alignBtns[2]]);
    var vBar = el('div.rb-iconbar', null, [alignBtns[3], alignBtns[4], alignBtns[5]]);

    var relCtl = ui.segmented([
      { value: 'comp', label: 'Composition' },
      { value: 'selection', label: 'Selection' },
      { value: 'key', label: 'Key layer', title: 'Line everything up with the LAST selected layer; the key layer stays put' }
    ], { value: relativeTo, onChange: function (v) { relativeTo = v; renderPreview(); } });

    var groupToggle = ui.toggle({ label: 'Move selection as a group', value: group,
      onChange: function (v) { group = v; } });

    var gapField = ui.numberField({ label: 'Gap', value: 0, step: 1, decimals: 0, suffix: 'px', width: '110px' });

    var autoBtns = [
      distBtn('Horizontal', false, 'x', 'auto', 'distH'),
      distBtn('Vertical', false, 'y', 'auto', 'distV')
    ];
    var gapBtns = [
      distBtn('H by gap', true, 'x', 'gap', 'distH'),
      distBtn('V by gap', true, 'y', 'gap', 'distV')
    ];

    renderPreview();
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      el('div.rb-section-label', { text: 'Align to' }),
      relCtl.el,
      el('div.rb-faint', { text: 'Selection lines the layers up with each other; Composition aligns them to the frame; Key layer lines everything up with the last selected layer, which stays put.' }),
      el('div.rb-row.rb-wrap', { style: { gap: '10px' } }, [hBar, vBar]),
      groupToggle.el,
      el('div.rb-section-label', { text: 'Distribute' }),
      el('div.rb-row.rb-wrap', null, autoBtns),
      el('div.rb-row.rb-wrap', null, [gapField.el].concat(gapBtns)),
      el('div.rb-faint', { text: 'Even needs three or more layers; a fixed gap works from two.' })
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    function syncEnabled(sel) {
      var n = sel && sel.hasComp ? (sel.selectedLayerCount || 0) : 0;
      var i;
      for (i = 0; i < alignBtns.length; i++) alignBtns[i].disabled = n < 1;
      for (i = 0; i < autoBtns.length; i++) autoBtns[i].disabled = n < 3;
      for (i = 0; i < gapBtns.length; i++) gapBtns[i].disabled = n < 2;
    }

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = describe(sel);
      syncEnabled(sel);
      map.refresh();
    });
    scopeText.textContent = describe(ctx.getSelection());
    syncEnabled(ctx.getSelection());

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

    return { destroy: function () { off(); map.destroy(); } };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select layers to align';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
