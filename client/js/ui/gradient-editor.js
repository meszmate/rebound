/*
 * Rebound, gradient editor.
 * A Figma-style gradient editor laid out as three zones: a hero canvas (the only
 * 2D surface, with the draggable gradient line and a Shape/Text preview toggle),
 * a fused 1D stop bar (the canonical place to add/order/select stops), and one
 * control card (recolor / position / delete / type / reverse / distribute).
 * Aim on the canvas, order on the bar, edit in the card. Value model:
 *   { type:'linear'|'radial', start:{x,y}, end:{x,y}, stops:[{pos,color}] }
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clone(o) { return o ? JSON.parse(JSON.stringify(o)) : o; }
  function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  function projectT(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    return clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2);
  }

  function hex2rgb(h) {
    h = ('' + h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    function c(x) { x = Math.max(0, Math.min(255, Math.round(x))); return (x < 16 ? '0' : '') + x.toString(16); }
    return '#' + c(r) + c(g) + c(b);
  }
  function lerpHex(a, b, t) { var x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }

  function sortedStops(stops) { return stops.slice().sort(function (a, b) { return a.pos - b.pos; }); }
  function stopsCss(stops) { return sortedStops(stops).map(function (s) { return s.color + ' ' + (s.pos * 100).toFixed(1) + '%'; }).join(', '); }
  function colorAt(stops, p) {
    var s = sortedStops(stops);
    if (p <= s[0].pos) return s[0].color;
    if (p >= s[s.length - 1].pos) return s[s.length - 1].color;
    for (var i = 0; i < s.length - 1; i++) {
      if (p >= s[i].pos && p <= s[i + 1].pos) { var span = (s[i + 1].pos - s[i].pos) || 1; return lerpHex(s[i].color, s[i + 1].color, (p - s[i].pos) / span); }
    }
    return s[0].color;
  }

  function lineOf(m) {
    if (m.start && m.end) return { a: m.start, b: m.end };
    var ang = (m.angle || 0) * Math.PI / 180, h = 0.42;
    return { a: { x: 0.5 - h * Math.cos(ang), y: 0.5 - h * Math.sin(ang) }, b: { x: 0.5 + h * Math.cos(ang), y: 0.5 + h * Math.sin(ang) } };
  }
  function gradCss(m) {
    var L = lineOf(m), a = L.a, b = L.b;
    if (m.type === 'radial') return 'radial-gradient(circle at ' + (a.x * 100).toFixed(1) + '% ' + (a.y * 100).toFixed(1) + '%, ' + stopsCss(m.stops) + ')';
    // Remap the stops onto the box so the line's actual length and position
    // matter: dragging an endpoint outside the box zooms/offsets the ramp, the
    // same way Figma shows the gradient line extending past the shape.
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    var ux = dx / len, uy = dy / len;
    var pmin = Infinity, pmax = -Infinity;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (c) { var p = c[0] * ux + c[1] * uy; if (p < pmin) pmin = p; if (p > pmax) pmax = p; });
    var plen = (pmax - pmin) || 1;
    var sproj = a.x * ux + a.y * uy;
    var ang = Math.atan2(dx, -dy) * 180 / Math.PI;
    var cs = sortedStops(m.stops).map(function (s) {
      return s.color + ' ' + (((sproj + s.pos * len - pmin) / plen) * 100).toFixed(1) + '%';
    }).join(', ');
    return 'linear-gradient(' + ang.toFixed(1) + 'deg, ' + cs + ')';
  }

  function normalize(v) {
    var m = clone(v) || {};
    if (!m.type) m.type = 'linear';
    if (!m.stops || m.stops.length < 2) m.stops = [{ pos: 0, color: '#1e63ff' }, { pos: 1, color: '#16e0c0' }];
    if (!m.start || !m.end) { var L = lineOf(m); m.start = clone(L.a); m.end = clone(L.b); }
    delete m.angle;
    return m;
  }

  function gradientEditor(opts) {
    opts = opts || {};
    var model = normalize(opts.value);
    var onChange = opts.onChange || function () {};
    var selected = model.stops[0];
    var previewMode = 'shape';

    function emit() { onChange(clone(model)); }
    function selIndex() { return model.stops.indexOf(selected); }
    function endStop(which) { var s = sortedStops(model.stops); return which === 'start' ? s[0] : s[s.length - 1]; }

    // ---- hero canvas ----
    var stage = el('div.rb-grad-canvas');
    var line = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'class': 'rb-grad-line' });
    var handles = el('div.rb-grad-handles');
    var textOv = el('div.rb-grad-text', { text: 'Ag' });
    var modeSeg = ui.segmented([
      { value: 'shape', label: 'Shape', title: 'Preview as a shape fill.' },
      { value: 'text', label: 'Text', title: 'Preview clipped to type.' }
    ], { value: previewMode, onChange: function (v) { previewMode = v; renderStage(); } });
    stage.appendChild(line);
    stage.appendChild(handles);
    stage.appendChild(textOv);
    stage.appendChild(el('div.rb-grad-toolbar', null, [modeSeg.el]));

    // ---- fused 1D stop bar ----
    var barFill = el('div.rb-grad-bar-fill');
    var barChips = el('div.rb-grad-bar-chips');
    var bar = el('div.rb-grad-bar', null, [barFill, barChips]);

    function clampR(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function ptFromEvent(e) {
      var r = stage.getBoundingClientRect();
      return { x: (e.clientX - r.left) / (r.width || 1), y: (e.clientY - r.top) / (r.height || 1) };
    }

    function renderStage() {
      var css = gradCss(model);
      var isText = previewMode === 'text';
      stage.classList.toggle('is-text', isText);
      stage.style.backgroundImage = isText ? '' : css; // dim the fill in text mode so the glyph reads
      textOv.style.backgroundImage = css;
      barFill.style.backgroundImage = 'linear-gradient(90deg, ' + stopsCss(model.stops) + ')';

      var a = model.start, b = model.end;
      R.dom.clear(line);
      line.appendChild(svg('line', { x1: a.x * 100, y1: a.y * 100, x2: b.x * 100, y2: b.y * 100, stroke: '#fff', 'stroke-width': 0.8, opacity: 0.85 }));
      R.dom.clear(handles);
      model.stops.forEach(function (s) { handles.appendChild(stopHandle(s, lerp(a, b, s.pos))); });
      handles.appendChild(endpoint(a, 'start'));
      handles.appendChild(endpoint(b, 'end'));

      R.dom.clear(barChips);
      model.stops.forEach(function (s) { barChips.appendChild(barChip(s)); });
    }

    function endpoint(pt, which) {
      var h = el('div.rb-grad-h.is-end', { style: { left: (pt.x * 100) + '%', top: (pt.y * 100) + '%' }, title: (which === 'start' ? 'Start' : 'End') + ' of the line, drag to aim it' });
      h.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); selected = endStop(which); renderSelected(); dragEndpoint(which); });
      return h;
    }
    function stopHandle(s, pt) {
      var h = el('div.rb-grad-h.is-stop' + (s === selected ? '.is-selected' : ''), { style: { left: (pt.x * 100) + '%', top: (pt.y * 100) + '%', background: s.color }, title: Math.round(s.pos * 100) + '%' });
      h.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); dragStop(s); });
      return h;
    }
    function barChip(s) {
      var c = el('div.rb-grad-chip' + (s === selected ? '.is-selected' : ''), { style: { left: (s.pos * 100) + '%', background: s.color }, title: Math.round(s.pos * 100) + '%' });
      c.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); dragChip(s); });
      return c;
    }

    function dragEndpoint(which) {
      // Allow the endpoints a little past the box edges (Figma-style) but only
      // as far as the canvas margin, so a handle dragged out stays visible and
      // grabbable (never clipped by the panel) and can always be dragged back.
      function move(ev) { var p = ptFromEvent(ev); model[which] = { x: clampR(p.x, -0.07, 1.07), y: clampR(p.y, -0.07, 1.07) }; renderStage(); }
      function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); emit(); }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }
    function dragStop(s) {
      selected = s; renderStage(); renderSelected();
      function move(ev) { s.pos = projectT(ptFromEvent(ev), model.start, model.end); renderStage(); renderSelected(); }
      function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); emit(); }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }
    function dragChip(s) {
      selected = s; renderStage(); renderSelected();
      function move(ev) { var r = bar.getBoundingClientRect(); s.pos = clamp01((ev.clientX - r.left) / (r.width || 1)); renderStage(); renderSelected(); }
      function up() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); emit(); }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }
    // Click the canvas to add a stop on the line; click the bar to add at that pos.
    stage.addEventListener('pointerdown', function (e) {
      var t = projectT(ptFromEvent(e), model.start, model.end);
      var s = { pos: t, color: colorAt(model.stops, t) };
      model.stops.push(s); selected = s; renderStage(); renderSelected(); dragStop(s);
    });
    bar.addEventListener('pointerdown', function (e) {
      var r = bar.getBoundingClientRect();
      var t = clamp01((e.clientX - r.left) / (r.width || 1));
      var s = { pos: t, color: colorAt(model.stops, t) };
      model.stops.push(s); selected = s; renderStage(); renderSelected(); dragChip(s);
    });

    // ---- control card ----
    var colorInput = el('input.rb-color-input', { type: 'color',
      oninput: function (e) { selected.color = e.target.value; renderStage(); emit(); } });
    var posInput = ui.numberField({ label: 'Position', value: 0, min: 0, max: 100, step: 1, decimals: 0, suffix: '%', width: '92px',
      onChange: function (v) { selected.pos = clamp01(v / 100); renderStage(); emit(); } });
    var delBtn = el('button.rb-btn.is-ghost', { title: 'Delete the selected stop', onclick: function () {
      if (model.stops.length > 2) { var i = selIndex(); model.stops.splice(i, 1); selected = model.stops[Math.max(0, i - 1)]; renderStage(); renderSelected(); emit(); }
    } }, ['Delete']);
    function renderSelected() {
      if (model.stops.indexOf(selected) < 0) selected = model.stops[0];
      colorInput.value = selected.color;
      posInput.set(Math.round(selected.pos * 100));
      delBtn.disabled = model.stops.length <= 2;
    }

    var typeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'A straight ramp along the line.' },
      { value: 'radial', label: 'Radial', title: 'A circular ramp from the start handle outward.' }
    ], { value: model.type, onChange: function (v) { model.type = v; renderStage(); emit(); } });
    var reverseBtn = el('button.rb-btn.is-ghost', { title: 'Reverse the stop order', onclick: function () {
      model.stops.forEach(function (s) { s.pos = clamp01(1 - s.pos); }); renderStage(); renderSelected(); emit();
    } }, ['Reverse']);
    var distributeBtn = el('button.rb-btn.is-ghost', { title: 'Space the stops evenly', onclick: function () {
      var s = sortedStops(model.stops); for (var i = 0; i < s.length; i++) s[i].pos = i / (s.length - 1); renderStage(); renderSelected(); emit();
    } }, ['Distribute']);

    var root = el('div.rb-grad-editor', null, [
      stage,
      bar,
      el('div.rb-grad-panel', null, [
        el('div.rb-row.rb-grad-stoprow', null, [colorInput, posInput.el, el('span.rb-grad-spacer'), delBtn]),
        ui.row('Type', typeCtl.el),
        el('div.rb-row.rb-grad-utils', null, [el('span.rb-grad-spacer'), reverseBtn, distributeBtn])
      ])
    ]);

    renderStage();
    renderSelected();

    return {
      el: root,
      getValue: function () { return clone(model); },
      setValue: function (v) {
        if (!v) return;
        model = normalize(v);
        selected = model.stops[0];
        typeCtl.set(model.type);
        renderStage();
        renderSelected();
      }
    };
  }

  R.ui = R.ui || {};
  R.ui.gradientEditor = gradientEditor;
  R.ui.gradientCss = gradCss;
  R.ui.gradientLineOf = lineOf;
})(window.Rebound = window.Rebound || {});
