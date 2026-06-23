/*
 * Rebound, Pin Rig (design / construction overlay generator).
 * Modeled on What? Studio's PinRig: select artwork and generate an editable
 * construction overlay, pins at vertices, bounding box, selection bounds, bezier
 * handles, edge-length / coordinate / angle measurements, grid / circle / margin
 * construction guides, and a background dot field, all in one custom color theme
 * at any scale. The live preview renders the enabled overlays on a sample mark
 * so you see the real look (and each preset thumbnail shows its own look).
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;
  function r1(v) { return R.units.round(v, 1); }

  // Sample mark: a point-up hexagon, enough geometry to show every overlay.
  var CX = 80, CY = 56, RAD = 30;
  function sampleVerts() {
    var v = [];
    for (var i = 0; i < 6; i++) { var a = (Math.PI / 180) * (60 * i - 90); v.push([CX + RAD * Math.cos(a), CY + RAD * Math.sin(a)]); }
    return v;
  }
  function bboxOf(verts) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (var i = 0; i < verts.length; i++) { var p = verts[i]; if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    return { minx: minx, miny: miny, maxx: maxx, maxy: maxy, w: maxx - minx, h: maxy - miny, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
  }

  function txt(x, y, str, color, fs, anchor) {
    var t = svg('text', { x: r1(x), y: r1(y), fill: color, 'font-size': fs, 'text-anchor': anchor || 'middle', 'font-family': 'monospace' });
    t.textContent = str; return t;
  }

  // Render the enabled overlays on the sample mark, themed + scaled.
  function overlaySvg(st, h) {
    var verts = sampleVerts(), bb = bboxOf(verts);
    var ac = st.accent, lab = st.label, sc = st.scale || 1;
    var sw = 1 * sc, mr = 2.6 * sc, fs = 5.5 * sc;
    var kids = [svg('rect', { x: 1, y: 1, width: 158, height: 108, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];

    if (st.dotgrid) {
      var dots = [];
      for (var gy = 8; gy < 110; gy += 9) for (var gx = 8; gx < 160; gx += 9) dots.push(svg('circle', { cx: gx, cy: gy, r: 0.7 * sc, fill: ac, 'fill-opacity': '0.18' }));
      kids.push(svg('g', null, dots));
    }
    if (st.circles) for (var c = 0; c < 3; c++) kids.push(svg('ellipse', { cx: CX, cy: CY, rx: RAD * (0.6 + c * 0.32), ry: RAD * (0.6 + c * 0.32), fill: 'none', stroke: ac, 'stroke-width': sw * 0.7, 'stroke-opacity': '0.4' }));
    if (st.grid) {
      var gl = [];
      for (var x = bb.minx; x <= bb.maxx + 0.1; x += bb.w / 4) gl.push(svg('line', { x1: r1(x), y1: r1(bb.miny), x2: r1(x), y2: r1(bb.maxy), stroke: ac, 'stroke-width': sw * 0.6, 'stroke-opacity': '0.35' }));
      for (var y = bb.miny; y <= bb.maxy + 0.1; y += bb.h / 4) gl.push(svg('line', { x1: r1(bb.minx), y1: r1(y), x2: r1(bb.maxx), y2: r1(y), stroke: ac, 'stroke-width': sw * 0.6, 'stroke-opacity': '0.35' }));
      kids.push(svg('g', null, gl));
    }
    if (st.margin) { var mg = 8; kids.push(svg('rect', { x: r1(bb.minx - mg), y: r1(bb.miny - mg), width: r1(bb.w + 2 * mg), height: r1(bb.h + 2 * mg), fill: 'none', stroke: ac, 'stroke-width': sw, 'stroke-dasharray': (3 * sc) + ' ' + (3 * sc), 'stroke-opacity': '0.55' })); }

    // the mark itself
    var d = 'M' + verts.map(function (p) { return r1(p[0]) + ' ' + r1(p[1]); }).join(' L') + ' Z';
    kids.push(svg('path', { d: d, fill: ac, 'fill-opacity': '0.12', stroke: ac, 'stroke-width': sw, 'stroke-opacity': '0.7' }));

    if (st.bbox) {
      kids.push(svg('rect', { x: r1(bb.minx), y: r1(bb.miny), width: r1(bb.w), height: r1(bb.h), fill: 'none', stroke: ac, 'stroke-width': sw, 'stroke-opacity': '0.55' }));
      var corners = [[bb.minx, bb.miny], [bb.maxx, bb.miny], [bb.maxx, bb.maxy], [bb.minx, bb.maxy]];
      for (var k = 0; k < 4; k++) kids.push(svg('rect', { x: r1(corners[k][0] - mr), y: r1(corners[k][1] - mr), width: r1(mr * 2), height: r1(mr * 2), fill: 'var(--rb-bg)', stroke: ac, 'stroke-width': sw }));
    }
    if (st.selbounds) kids.push(svg('rect', { x: r1(bb.minx - 2), y: r1(bb.miny - 2), width: r1(bb.w + 4), height: r1(bb.h + 4), fill: 'none', stroke: ac, 'stroke-width': sw * 0.8, 'stroke-dasharray': (2 * sc) + ' ' + (2 * sc), 'stroke-opacity': '0.6' }));

    if (st.edges) {
      for (var e = 0; e < verts.length; e++) {
        var a0 = verts[e], a1 = verts[(e + 1) % verts.length];
        var mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2;
        var len = Math.round(Math.sqrt((a1[0] - a0[0]) * (a1[0] - a0[0]) + (a1[1] - a0[1]) * (a1[1] - a0[1])));
        var ox = (mx - CX) * 0.22, oy = (my - CY) * 0.22;
        if (st.infographic) kids.push(svg('line', { x1: r1(a0[0] + ox), y1: r1(a0[1] + oy), x2: r1(a1[0] + ox), y2: r1(a1[1] + oy), stroke: lab, 'stroke-width': sw * 0.5, 'stroke-opacity': '0.5' }));
        kids.push(txt(mx + ox, my + oy + 1, '' + len, lab, fs));
      }
    }
    if (st.angles) for (var g = 0; g < verts.length; g++) kids.push(txt(CX + (verts[g][0] - CX) * 0.72, CY + (verts[g][1] - CY) * 0.72, '120°', lab, fs * 0.9));
    if (st.coords) for (var q = 0; q < verts.length; q++) kids.push(txt(verts[q][0] + (verts[q][0] - CX) * 0.18, verts[q][1] + (verts[q][1] - CY) * 0.18 - 2, Math.round(verts[q][0]) + ',' + Math.round(verts[q][1]), lab, fs * 0.85));
    if (st.bezier) for (var z = 0; z < verts.length; z++) { var hx = verts[z][0] + (verts[z][0] - CX) * 0.18, hy = verts[z][1] + (verts[z][1] - CY) * 0.18; kids.push(svg('line', { x1: r1(verts[z][0]), y1: r1(verts[z][1]), x2: r1(hx), y2: r1(hy), stroke: ac, 'stroke-width': sw * 0.6, 'stroke-opacity': '0.5' })); kids.push(svg('circle', { cx: r1(hx), cy: r1(hy), r: mr * 0.55, fill: 'none', stroke: ac, 'stroke-width': sw * 0.6 })); }

    if (st.pins) for (var p = 0; p < verts.length; p++) kids.push(pinShape(verts[p][0], verts[p][1], mr * 1.15, st, ac, sc));

    return svg('svg', { viewBox: '0 0 160 110', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'pinrig',
    title: 'Pin Rig',
    group: 'Layout',
    order: 7,
    keywords: ['pinrig', 'pin', 'rig', 'construction', 'guides', 'measurements', 'bounding box', 'logo', 'blueprint', 'bezier', 'grid', 'dots', 'overlay', 'design'],
    mount: mount
  });

  function defaultState() {
    return { accent: '#39C2FF', label: '#E6F4FF', scale: 1, infographic: false,
      pins: true, bbox: true, selbounds: false, bezier: false,
      edges: true, coords: false, angles: false,
      grid: false, circles: false, margin: false, dotgrid: true,
      controller: 'master',
      pinShape: 'dot', pinStroke: 1, pinFill: true, fillColor: '#39C2FF', pinRound: 40 };
  }

  // Render one pin in the chosen style (stroke = accent, fill = fillColor).
  function pinShape(cx, cy, r, st, ac, sc) {
    var fill = st.pinFill ? st.fillColor : 'none';
    var sw = (st.pinStroke != null ? st.pinStroke : 1) * sc;
    cx = r1(cx); cy = r1(cy); r = r1(r); sw = r1(sw);
    if (st.pinShape === 'ring') return svg('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: ac, 'stroke-width': sw });
    if (st.pinShape === 'square') { var rr = r1((st.pinRound / 100) * r); return svg('rect', { x: r1(cx - r), y: r1(cy - r), width: r1(2 * r), height: r1(2 * r), rx: rr, fill: fill, stroke: ac, 'stroke-width': sw }); }
    if (st.pinShape === 'cross') return svg('path', { d: 'M' + r1(cx - r) + ' ' + cy + 'H' + r1(cx + r) + 'M' + cx + ' ' + r1(cy - r) + 'V' + r1(cy + r), stroke: ac, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round' });
    if (st.pinShape === 'diamond') return svg('path', { d: 'M' + cx + ' ' + r1(cy - r) + 'L' + r1(cx + r) + ' ' + cy + 'L' + cx + ' ' + r1(cy + r) + 'L' + r1(cx - r) + ' ' + cy + 'Z', fill: fill, stroke: ac, 'stroke-width': sw });
    return svg('circle', { cx: cx, cy: cy, r: r, fill: fill, stroke: ac, 'stroke-width': sw });
  }

  function mount(ctx) {
    var st = defaultState();

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(overlaySvg(st, 110)); }

    var pickers = [];
    function colorRow(labelText, key) {
      var cp = ui.colorPicker({ value: st[key], storageKey: 'pinrig-colors', onChange: function (c) { st[key] = c.hex; renderPreview(); } });
      pickers.push(cp);
      return ui.row(labelText, cp.el);
    }
    var accentRow = colorRow('Accent', 'accent');
    var labelRow = colorRow('Labels', 'label');
    var fillRow = colorRow('Pin fill', 'fillColor');
    var scaleS = ui.slider({ label: 'Overlay scale', min: 0.4, max: 3, step: 0.1, value: st.scale, format: function (v) { return R.units.round(v, 1) + '×'; }, onInput: function (v) { st.scale = v; renderPreview(); } });
    var infoTog = ui.toggle({ label: 'Infographic look', value: st.infographic, onChange: function (v) { st.infographic = v; renderPreview(); } });

    // Pin appearance editor
    var pinShapeSeg = ui.segmented([{ value: 'dot', label: 'Dot' }, { value: 'ring', label: 'Ring' }, { value: 'square', label: 'Square' }, { value: 'cross', label: 'Cross' }, { value: 'diamond', label: 'Diamond' }],
      { value: st.pinShape, onChange: function (v) { st.pinShape = v; roundS.el.style.display = v === 'square' ? '' : 'none'; renderPreview(); } });
    var pinStrokeS = ui.slider({ label: 'Stroke width', min: 0, max: 6, step: 0.5, value: st.pinStroke, format: function (v) { return R.units.round(v, 1); }, onInput: function (v) { st.pinStroke = v; renderPreview(); } });
    var roundS = ui.slider({ label: 'Roundness', min: 0, max: 100, step: 1, value: st.pinRound, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.pinRound = v; renderPreview(); } });
    var pinFillTog = ui.toggle({ label: 'Fill', value: st.pinFill, onChange: function (v) { st.pinFill = v; fillRow.style.display = v ? '' : 'none'; renderPreview(); } });
    roundS.el.style.display = st.pinShape === 'square' ? '' : 'none';
    fillRow.style.display = st.pinFill ? '' : 'none';

    function tog(labelText, key) { return ui.toggle({ label: labelText, value: st[key], onChange: function (v) { st[key] = v; renderPreview(); } }); }
    var pinsTog = tog('Pins', 'pins'), bezTog = tog('Bezier handles', 'bezier'), selTog = tog('Selection bounds', 'selbounds'), bboxTog = tog('Bounding box', 'bbox');
    var edgesTog = tog('Edge lengths', 'edges'), coordsTog = tog('Vertex coords', 'coords'), anglesTog = tog('Vertex angles', 'angles');
    var gridTog = tog('Grid', 'grid'), circTog = tog('Circles', 'circles'), marginTog = tog('Margin', 'margin'), dotTog = tog('Dot grid', 'dotgrid');
    var ctrlSeg = ui.segmented([{ value: 'master', label: 'Master null' }, { value: 'individual', label: 'Per layer' }], { value: st.controller, onChange: function (v) { st.controller = v; } });

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Select your artwork, choose what to draw, and Pin Rig builds an editable construction overlay that tracks the layer, all in one color theme.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Theme' }),
      accentRow, labelRow, scaleS.el, infoTog.el,
      el('div.rb-section-label', { text: 'Pins & bounds' }),
      el('div.rb-row.rb-wrap', null, [pinsTog.el, bboxTog.el]),
      el('div.rb-row.rb-wrap', null, [bezTog.el, selTog.el]),
      el('div.rb-section-label', { text: 'Pin style' }),
      ui.row('Shape', pinShapeSeg.el),
      pinStrokeS.el, roundS.el, pinFillTog.el, fillRow,
      el('div.rb-section-label', { text: 'Measurements' }),
      el('div.rb-row.rb-wrap', null, [edgesTog.el, coordsTog.el, anglesTog.el]),
      el('div.rb-section-label', { text: 'Guides' }),
      el('div.rb-row.rb-wrap', null, [gridTog.el, circTog.el, marginTog.el, dotTog.el]),
      el('div.rb-section-label', { text: 'Controllers' }),
      ui.row('Rig with', ctrlSeg.el)
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove rig']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doBuild }, ['Build rig']));

    function refreshScope(sel) {
      scopeText.textContent = describe(sel);
      if (!ctx.invoke) return;
      ctx.invoke('pinrig.read', {}).then(function (r) {
        if (!r) return;
        if (!r.ok) scopeText.textContent = 'Select artwork to rig';
        else scopeText.textContent = 'Source: “' + r.name + '” · ' + r.kind + (r.vertexCount ? ' · ' + r.vertexCount + ' vertices' : '');
      }).catch(function () {});
    }
    var off = ctx.onSelection(refreshScope);
    refreshScope(ctx.getSelection());

    function doBuild() {
      ctx.invoke('pinrig.build', st)
        .then(function (res) { ctx.toast('Built rig: ' + res.layers + ' layer' + (res.layers === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not build the rig', { kind: 'error' }); });
    }
    function doRemove() {
      ctx.invoke('pinrig.remove', {})
        .then(function (res) { ctx.toast('Removed ' + res.removed + ' overlay layer' + (res.removed === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      for (var k in s) if (s.hasOwnProperty(k) && st.hasOwnProperty(k)) st[k] = s[k];
      pickers[0].set(st.accent); pickers[1].set(st.label); pickers[2].set(st.fillColor);
      scaleS.set(st.scale); infoTog.set(st.infographic);
      pinShapeSeg.set(st.pinShape); pinStrokeS.set(st.pinStroke); roundS.set(st.pinRound); pinFillTog.set(st.pinFill);
      roundS.el.style.display = st.pinShape === 'square' ? '' : 'none'; fillRow.style.display = st.pinFill ? '' : 'none';
      pinsTog.set(st.pins); bezTog.set(st.bezier); selTog.set(st.selbounds); bboxTog.set(st.bbox);
      edgesTog.set(st.edges); coordsTog.set(st.coords); anglesTog.set(st.angles);
      gridTog.set(st.grid); circTog.set(st.circles); marginTog.set(st.margin); dotTog.set(st.dotgrid);
      ctrlSeg.set(st.controller);
      renderPreview();
    }

    return {
      presets: {
        toolId: 'pinrig', get: getState, set: applyState,
        thumbFor: function (s, opts) { return overlaySvg(mergeDefaults(s), (opts && opts.height) || 40); },
        defaults: [
          { name: 'Blueprint', state: over({ accent: '#39C2FF', pins: true, bbox: true, grid: true, circles: true, edges: true, dotgrid: false }) },
          { name: 'Construction', state: over({ accent: '#7CE0A0', pins: true, bbox: false, margin: true, grid: true, edges: false, dotgrid: false, infographic: true }) },
          { name: 'Minimal pins', state: over({ accent: '#FF9F1C', pins: true, bbox: true, edges: false, dotgrid: false }) },
          { name: 'Type specimen', state: over({ accent: '#C792EA', pins: false, bbox: true, coords: true, edges: true, dotgrid: false }) },
          { name: 'Infographic', state: over({ accent: '#FF5C8A', pins: true, bbox: false, edges: true, angles: true, dotgrid: true, infographic: true }) },
          { name: 'Dotted backdrop', state: over({ accent: '#39C2FF', pins: false, bbox: true, edges: false, dotgrid: true }) }
        ]
      },
      destroy: function () { for (var i = 0; i < pickers.length; i++) pickers[i].destroy(); off(); }
    };
  }

  function over(o) { var s = defaultState(); for (var k in o) if (o.hasOwnProperty(k)) s[k] = o[k]; return s; }
  function mergeDefaults(s) { var d = defaultState(); for (var k in s) if (s && s.hasOwnProperty(k)) d[k] = s[k]; return d; }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select artwork to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
