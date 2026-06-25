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

    if (st.pins) {
      var pinPts = placePinsPreview(verts, bb, st);
      for (var p = 0; p < pinPts.length; p++) {
        if (st.pinSource === 'layer') kids.push(layerPinMarker(pinPts[p][0], pinPts[p][1], mr * 1.6, st, sc));
        else kids.push(pinShape(pinPts[p][0], pinPts[p][1], mr * 1.15, st, ac, sc));
      }
    }

    return svg('svg', { viewBox: '0 0 160 110', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'pinrig',
    title: 'Pin Rig',
    group: 'Layout',
    order: 7,
    keywords: ['pinrig', 'pin', 'rig', 'construction', 'guides', 'measurements', 'bounding box', 'logo', 'blueprint', 'bezier', 'grid', 'dots', 'overlay', 'design', 'image', 'photo', 'star', 'hexagon', 'triangle', 'marker'],
    mount: mount
  });

  function defaultState() {
    return { accent: '#39C2FF', label: '#E6F4FF', scale: 1, infographic: false,
      pins: true, bbox: true, selbounds: false, bezier: false,
      edges: true, coords: false, angles: false,
      grid: false, circles: false, margin: false, dotgrid: true,
      controller: 'master',
      pinShape: 'dot', pinStroke: 1, pinFill: true, fillColor: '#39C2FF', strokeColor: '#0E1116', pinRound: 40,
      pinPlacement: 'auto', pinGrid: 3,
      pinSource: 'shape', pinLayerName: '', pinLayerScale: 100 };
  }

  // Vertices for a closed polygon pin (mirrors the host's polyPoints).
  function pinPoly(shape, cx, cy, r) {
    var pts = [], i, a, rr;
    if (shape === 'triangle') return [[cx, cy - r], [cx + r * 0.866, cy + r * 0.5], [cx - r * 0.866, cy + r * 0.5]];
    if (shape === 'hexagon') { for (i = 0; i < 6; i++) { a = Math.PI / 180 * (60 * i - 90); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return pts; }
    if (shape === 'star') { for (i = 0; i < 10; i++) { rr = (i % 2 === 0) ? r : r * 0.45; a = Math.PI / 180 * (36 * i - 90); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return pts; }
    return [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  }
  function polyD(shape, cx, cy, r) { return 'M' + pinPoly(shape, cx, cy, r).map(function (p) { return r1(p[0]) + ' ' + r1(p[1]); }).join('L') + 'Z'; }

  // Render one pin in the chosen style (its own stroke + fill colors).
  function pinShape(cx, cy, r, st, ac, sc) {
    var fill = st.pinFill ? st.fillColor : 'none';
    ac = st.strokeColor || ac;
    var sw = (st.pinStroke != null ? st.pinStroke : 1) * sc;
    cx = r1(cx); cy = r1(cy); r = r1(r); sw = r1(sw);
    if (st.pinShape === 'ring') return svg('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: ac, 'stroke-width': sw });
    if (st.pinShape === 'square') { var rr = r1((st.pinRound / 100) * r); return svg('rect', { x: r1(cx - r), y: r1(cy - r), width: r1(2 * r), height: r1(2 * r), rx: rr, fill: fill, stroke: ac, 'stroke-width': sw }); }
    if (st.pinShape === 'cross') return svg('path', { d: 'M' + r1(cx - r) + ' ' + cy + 'H' + r1(cx + r) + 'M' + cx + ' ' + r1(cy - r) + 'V' + r1(cy + r), stroke: ac, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round' });
    if (st.pinShape === 'target') return svg('g', null, [
      svg('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: ac, 'stroke-width': sw }),
      svg('path', { d: 'M' + r1(cx - r * 0.5) + ' ' + cy + 'H' + r1(cx + r * 0.5) + 'M' + cx + ' ' + r1(cy - r * 0.5) + 'V' + r1(cy + r * 0.5), stroke: ac, 'stroke-width': sw, fill: 'none', 'stroke-linecap': 'round' })
    ]);
    if (st.pinShape === 'triangle' || st.pinShape === 'hexagon' || st.pinShape === 'star' || st.pinShape === 'diamond') return svg('path', { d: polyD(st.pinShape, cx, cy, r), fill: fill, stroke: ac, 'stroke-width': sw });
    return svg('circle', { cx: cx, cy: cy, r: r, fill: fill, stroke: ac, 'stroke-width': sw });
  }

  // Where pins sit, for the preview (mirrors the host's placePins).
  function placePinsPreview(verts, bb, st) {
    var mode = st.pinPlacement || 'auto';
    if (mode === 'corners') return [[bb.minx, bb.miny], [bb.maxx, bb.miny], [bb.maxx, bb.maxy], [bb.minx, bb.maxy]];
    if (mode === 'midpoints') return [[bb.minx, bb.miny], [bb.cx, bb.miny], [bb.maxx, bb.miny], [bb.maxx, bb.cy], [bb.maxx, bb.maxy], [bb.cx, bb.maxy], [bb.minx, bb.maxy], [bb.minx, bb.cy]];
    if (mode === 'center') return [[bb.cx, bb.cy]];
    if (mode === 'grid') {
      var n = Math.round(st.pinGrid || 3); if (n < 2) n = 2; if (n > 8) n = 8;
      var pts = [];
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) pts.push([bb.minx + bb.w * c / (n - 1), bb.miny + bb.h * r / (n - 1)]);
      return pts;
    }
    return verts;
  }

  // Placeholder marker shown when pins are a custom layer: a small picture frame
  // glyph, so the preview signals "your own layer is stamped here".
  function layerPinMarker(cx, cy, r, st, sc) {
    var ac = st.accent;
    var sw = r1((st.pinStroke != null ? st.pinStroke : 1) * sc);
    return svg('g', null, [
      svg('rect', { x: r1(cx - r), y: r1(cy - r), width: r1(2 * r), height: r1(2 * r), rx: r1(r * 0.28), fill: 'var(--rb-bg)', stroke: ac, 'stroke-width': sw }),
      svg('circle', { cx: r1(cx - r * 0.32), cy: r1(cy - r * 0.32), r: r1(r * 0.22), fill: ac }),
      svg('path', { d: 'M' + r1(cx - r * 0.7) + ' ' + r1(cy + r * 0.6) + 'L' + r1(cx - r * 0.05) + ' ' + r1(cy - r * 0.1) + 'L' + r1(cx + r * 0.3) + ' ' + r1(cy + r * 0.25) + 'L' + r1(cx + r * 0.7) + ' ' + r1(cy - r * 0.15), fill: 'none', stroke: ac, 'stroke-width': r1(sw * 0.8), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })
    ]);
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
    var strokeRow = colorRow('Pin stroke', 'strokeColor');
    var scaleS = ui.slider({ label: 'Overlay scale', min: 0.4, max: 3, step: 0.1, value: st.scale, format: function (v) { return R.units.round(v, 1) + '×'; }, onInput: function (v) { st.scale = v; renderPreview(); } });
    var infoTog = ui.toggle({ label: 'Infographic look', value: st.infographic, onChange: function (v) { st.infographic = v; renderPreview(); } });

    // Pin appearance editor
    var pinShapeSeg = ui.segmented([
      { value: 'dot', label: 'Dot' }, { value: 'ring', label: 'Ring' }, { value: 'square', label: 'Square' },
      { value: 'cross', label: 'Cross' }, { value: 'diamond', label: 'Diamond' }, { value: 'triangle', label: 'Triangle' },
      { value: 'hexagon', label: 'Hexagon' }, { value: 'star', label: 'Star' }, { value: 'target', label: 'Target' }],
      { value: st.pinShape, onChange: function (v) { st.pinShape = v; roundS.el.style.display = v === 'square' ? '' : 'none'; renderPreview(); } });
    pinShapeSeg.el.classList.add('rb-seg-wrap');

    // Where pins are placed, so even a flat image gets a useful set of pins.
    var gridS = ui.slider({ label: 'Grid size', min: 2, max: 8, step: 1, value: st.pinGrid, format: function (v) { var n = Math.round(v); return n + '×' + n; }, onInput: function (v) { st.pinGrid = Math.round(v); renderPreview(); } });
    var placeSeg = ui.segmented([
      { value: 'auto', label: 'Auto', title: 'Shape vertices, or image corners' }, { value: 'corners', label: 'Corners' },
      { value: 'midpoints', label: '+ Mids' }, { value: 'grid', label: 'Grid' }, { value: 'center', label: 'Center' }],
      { value: st.pinPlacement, onChange: function (v) { st.pinPlacement = v; gridS.el.style.display = v === 'grid' ? '' : 'none'; renderPreview(); } });
    placeSeg.el.classList.add('rb-seg-wrap');
    gridS.el.style.display = st.pinPlacement === 'grid' ? '' : 'none';
    var pinStrokeS = ui.slider({ label: 'Stroke width', min: 0, max: 6, step: 0.5, value: st.pinStroke, format: function (v) { return R.units.round(v, 1); }, onInput: function (v) { st.pinStroke = v; renderPreview(); } });
    var roundS = ui.slider({ label: 'Roundness', min: 0, max: 100, step: 1, value: st.pinRound, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.pinRound = v; renderPreview(); } });
    var pinFillTog = ui.toggle({ label: 'Fill', value: st.pinFill, onChange: function (v) { st.pinFill = v; fillRow.style.display = v ? '' : 'none'; renderPreview(); } });
    roundS.el.style.display = st.pinShape === 'square' ? '' : 'none';
    fillRow.style.display = st.pinFill ? '' : 'none';

    // Marker mode: a built-in vector shape, or a copy of one of your own layers
    // (image, icon, precomp) stamped at every pin.
    var markerSeg = ui.segmented([{ value: 'shape', label: 'Shape' }, { value: 'layer', label: 'Custom layer' }],
      { value: st.pinSource, onChange: function (v) { st.pinSource = v; syncMarker(); renderPreview(); } });
    var shapeCtrlWrap = el('div.rb-col', null, [ui.row('Shape', pinShapeSeg.el), pinStrokeS.el, strokeRow, roundS.el, pinFillTog.el, fillRow]);
    var markerName = el('div.rb-faint', { text: markerLabel(st.pinLayerName) });
    var useMarkerBtn = el('button.rb-btn.is-ghost', { onclick: function () {
      if (!ctx.invoke) { ctx.toast('Open this in After Effects to pick a layer', { kind: 'info' }); return; }
      ctx.invoke('pinrig.read', {}).then(function (r) {
        if (r && r.ok) { st.pinLayerName = r.name; markerName.textContent = markerLabel(r.name); ctx.toast('Pin marker: “' + r.name + '”', { kind: 'info' }); }
        else ctx.toast('Select the layer to use as the marker first', { kind: 'warn' });
      }).catch(function () {});
    } }, ['Use selected layer']);
    var markerScaleS = ui.slider({ label: 'Marker scale', min: 10, max: 300, step: 5, value: st.pinLayerScale, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.pinLayerScale = v; } });
    var layerCtrlWrap = el('div.rb-col', null, [el('div.rb-row', null, [useMarkerBtn]), markerName, markerScaleS.el]);
    function syncMarker() { var isL = st.pinSource === 'layer'; shapeCtrlWrap.style.display = isL ? 'none' : ''; layerCtrlWrap.style.display = isL ? '' : 'none'; }
    syncMarker();

    function tog(labelText, key) { return ui.toggle({ label: labelText, value: st[key], onChange: function (v) { st[key] = v; renderPreview(); } }); }
    var pinsTog = tog('Pins', 'pins'), bezTog = tog('Bezier handles', 'bezier'), selTog = tog('Selection bounds', 'selbounds'), bboxTog = tog('Bounding box', 'bbox');
    var edgesTog = tog('Edge lengths', 'edges'), coordsTog = tog('Vertex coords', 'coords'), anglesTog = tog('Vertex angles', 'angles');
    var gridTog = tog('Grid', 'grid'), circTog = tog('Circles', 'circles'), marginTog = tog('Margin', 'margin'), dotTog = tog('Dot grid', 'dotgrid');
    var ctrlSeg = ui.segmented([{ value: 'master', label: 'Master null' }, { value: 'individual', label: 'Per layer' }], { value: st.controller, onChange: function (v) { st.controller = v; } });

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Select any layer (shape, image, photo, precomp), choose what to draw, and Pin Rig builds an editable overlay that tracks it. Pins can be any built-in shape or a copy of your own layer, placed on the vertices, corners, or a grid.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Theme' }),
      accentRow, labelRow, scaleS.el, infoTog.el,
      el('div.rb-section-label', { text: 'Pins & bounds' }),
      el('div.rb-row.rb-wrap', null, [pinsTog.el, bboxTog.el]),
      el('div.rb-row.rb-wrap', null, [bezTog.el, selTog.el]),
      el('div.rb-section-label', { text: 'Pin style' }),
      ui.row('Place', placeSeg.el),
      gridS.el,
      ui.row('Marker', markerSeg.el),
      shapeCtrlWrap, layerCtrlWrap,
      el('div.rb-faint', { text: 'Already built? Change the style above and click Restyle pins to update the rig in place. Size, stroke, fill and color are also live on the Pins layer’s Effect Controls.' }),
      el('div.rb-section-label', { text: 'Measurements' }),
      el('div.rb-row.rb-wrap', null, [edgesTog.el, coordsTog.el, anglesTog.el]),
      el('div.rb-section-label', { text: 'Guides' }),
      el('div.rb-row.rb-wrap', null, [gridTog.el, circTog.el, marginTog.el, dotTog.el]),
      el('div.rb-section-label', { text: 'Controllers' }),
      ui.row('Rig with', ctrlSeg.el),
      el('div.rb-faint', { text: 'The rig is parented to your artwork, so it follows the layer as it moves, scales, and rotates. Master null adds one handle to grab the whole overlay; Per layer parents each piece straight to the source.' })
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRemove }, ['Remove rig']));
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doRestyle, title: 'Update the pins on the already-built rig to the current style' }, ['Restyle pins']));
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
    function doRestyle() {
      ctx.invoke('pinrig.restyle', st)
        .then(function (res) { if (res && res.restyled) ctx.toast('Restyled the pins', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not restyle the pins', { kind: 'error' }); });
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
      pickers[0].set(st.accent); pickers[1].set(st.label); pickers[2].set(st.fillColor); pickers[3].set(st.strokeColor);
      scaleS.set(st.scale); infoTog.set(st.infographic);
      pinShapeSeg.set(st.pinShape); pinStrokeS.set(st.pinStroke); roundS.set(st.pinRound); pinFillTog.set(st.pinFill);
      roundS.el.style.display = st.pinShape === 'square' ? '' : 'none'; fillRow.style.display = st.pinFill ? '' : 'none';
      placeSeg.set(st.pinPlacement); gridS.set(st.pinGrid); gridS.el.style.display = st.pinPlacement === 'grid' ? '' : 'none';
      markerSeg.set(st.pinSource); markerScaleS.set(st.pinLayerScale); markerName.textContent = markerLabel(st.pinLayerName); syncMarker();
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

  function markerLabel(name) { return name ? ('Marker layer: “' + name + '”') : 'Select your marker layer, then click Use selected.'; }
  function over(o) { var s = defaultState(); for (var k in o) if (o.hasOwnProperty(k)) s[k] = o[k]; return s; }
  function mergeDefaults(s) { var d = defaultState(); for (var k in s) if (s && s.hasOwnProperty(k)) d[k] = s[k]; return d; }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select artwork to rig';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
