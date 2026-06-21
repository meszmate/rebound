/*
 * Rebound, gradient editor.
 * A Figma-style multi-stop gradient editor: a gradient bar with draggable color
 * stops (click the bar to add one, drag to move, select to recolor / reposition,
 * delete down to two), a type switch and angle, reverse, and a live preview on
 * both a shape and text. The value is a model:
 *   { type:'linear'|'radial', angle:0..360, stops:[{ pos:0..1, color:'#rrggbb' }] }
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clone(o) { return o ? JSON.parse(JSON.stringify(o)) : o; }

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
  function lerpHex(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }

  function sortedStops(stops) { return stops.slice().sort(function (a, b) { return a.pos - b.pos; }); }
  function stopsCss(stops) {
    return sortedStops(stops).map(function (s) { return s.color + ' ' + (s.pos * 100).toFixed(1) + '%'; }).join(', ');
  }
  // CSS for the model; forBar renders a flat left-to-right ramp regardless of type.
  function gradCss(model, forBar) {
    var cs = stopsCss(model.stops);
    if (forBar || model.type !== 'radial') {
      return 'linear-gradient(' + (forBar ? 90 : (90 + (model.angle || 0))) + 'deg, ' + cs + ')';
    }
    return 'radial-gradient(circle at 50% 50%, ' + cs + ')';
  }

  function colorAt(stops, p) {
    var s = sortedStops(stops);
    if (p <= s[0].pos) return s[0].color;
    if (p >= s[s.length - 1].pos) return s[s.length - 1].color;
    for (var i = 0; i < s.length - 1; i++) {
      if (p >= s[i].pos && p <= s[i + 1].pos) {
        var span = (s[i + 1].pos - s[i].pos) || 1;
        return lerpHex(s[i].color, s[i + 1].color, (p - s[i].pos) / span);
      }
    }
    return s[0].color;
  }

  function gradientEditor(opts) {
    opts = opts || {};
    var model = clone(opts.value) || { type: 'linear', angle: 0, stops: [{ pos: 0, color: '#1e63ff' }, { pos: 1, color: '#16e0c0' }] };
    var onChange = opts.onChange || function () {};
    var selected = 0;

    function emit() { onChange(clone(model)); }

    var shapePrev = el('div.rb-grad-prev-shape');
    var textPrev = el('div.rb-grad-prev-text', { text: 'Gradient' });
    function renderPreviews() {
      var css = gradCss(model);
      // Set background-image (not the background shorthand) so the text preview
      // keeps its background-clip:text from CSS (the shorthand would reset it).
      shapePrev.style.backgroundImage = css;
      textPrev.style.backgroundImage = css;
    }

    var bar = el('div.rb-grad-bar');
    var stopsLayer = el('div.rb-grad-stops');
    var barWrap = el('div.rb-grad-barwrap', null, [bar, stopsLayer]);

    function renderBar() {
      bar.style.background = gradCss(model, true);
      R.dom.clear(stopsLayer);
      model.stops.forEach(function (s, i) {
        var h = el('div.rb-grad-stop' + (i === selected ? '.is-selected' : ''), {
          style: { left: (s.pos * 100) + '%' }, title: Math.round(s.pos * 100) + '%'
        }, [el('span.rb-grad-stop-dot', { style: { background: s.color } })]);
        h.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); startDrag(i); });
        stopsLayer.appendChild(h);
      });
    }

    function startDrag(i) {
      selected = i;
      renderBar();
      renderSelected();
      var rect = bar.getBoundingClientRect();
      function move(ev) {
        model.stops[i].pos = clamp01((ev.clientX - rect.left) / (rect.width || 1));
        renderBar();
        renderPreviews();
        renderSelected();
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        emit();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }

    bar.addEventListener('pointerdown', function (e) {
      var rect = bar.getBoundingClientRect();
      var p = clamp01((e.clientX - rect.left) / (rect.width || 1));
      model.stops.push({ pos: p, color: colorAt(model.stops, p) });
      selected = model.stops.length - 1;
      renderBar();
      renderPreviews();
      renderSelected();
      startDrag(selected);
    });

    var colorInput = el('input.rb-color-input', { type: 'color',
      oninput: function (e) { model.stops[selected].color = e.target.value; renderBar(); renderPreviews(); emit(); } });
    var posInput = ui.numberField({ label: 'Position', value: 0, min: 0, max: 100, step: 1, decimals: 0, suffix: '%', width: '92px',
      onChange: function (v) { model.stops[selected].pos = clamp01(v / 100); renderBar(); renderPreviews(); emit(); } });
    var delBtn = el('button.rb-btn.is-ghost', { title: 'Delete the selected stop', onclick: function () {
      if (model.stops.length > 2) { model.stops.splice(selected, 1); selected = Math.max(0, selected - 1); renderBar(); renderPreviews(); renderSelected(); emit(); }
    } }, ['Delete']);
    function renderSelected() {
      var s = model.stops[selected];
      if (!s) return;
      colorInput.value = s.color;
      posInput.set(Math.round(s.pos * 100));
      delBtn.disabled = model.stops.length <= 2;
    }

    var typeCtl = ui.segmented([
      { value: 'linear', label: 'Linear', title: 'A straight ramp.' },
      { value: 'radial', label: 'Radial', title: 'A circular ramp.' }
    ], { value: model.type, onChange: function (v) { model.type = v; angleSlider.el.style.display = v === 'linear' ? '' : 'none'; renderPreviews(); emit(); } });
    var angleSlider = ui.slider({ label: 'Angle', min: 0, max: 360, step: 1, value: model.angle || 0,
      format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { model.angle = v; renderPreviews(); emit(); } });
    angleSlider.el.style.display = model.type === 'linear' ? '' : 'none';
    var reverseBtn = el('button.rb-btn.is-ghost', { title: 'Reverse the stop order', onclick: function () {
      model.stops.forEach(function (s) { s.pos = clamp01(1 - s.pos); });
      renderBar(); renderPreviews(); renderSelected(); emit();
    } }, ['Reverse']);

    var root = el('div.rb-grad-editor', null, [
      el('div.rb-grad-previews', null, [shapePrev, textPrev]),
      barWrap,
      el('div.rb-row.rb-grad-stoprow', null, [colorInput, posInput.el, delBtn, reverseBtn]),
      ui.row('Type', typeCtl.el),
      angleSlider.el
    ]);

    renderBar();
    renderPreviews();
    renderSelected();

    return {
      el: root,
      getValue: function () { return clone(model); },
      setValue: function (v) {
        if (!v) return;
        model = clone(v);
        selected = 0;
        typeCtl.set(model.type);
        angleSlider.set(model.angle || 0);
        angleSlider.el.style.display = model.type === 'linear' ? '' : 'none';
        renderBar();
        renderPreviews();
        renderSelected();
      }
    };
  }

  R.ui = R.ui || {};
  R.ui.gradientEditor = gradientEditor;
  R.ui.gradientCss = gradCss; // reused by the tool's preset thumbnails
})(window.Rebound = window.Rebound || {});
