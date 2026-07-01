/*
 * Rebound, curve editor widget.
 *
 * An SVG editor for a normalized easing curve. For bezier curves the two
 * interior control points are draggable; for spring / penner curves the
 * resulting shape is rendered read-only (those are driven by their own
 * sliders). The view auto-expands to reveal overshoot above 1 or below 0.
 *
 * Usage:
 *   var editor = Rebound.ui.CurveEditor(container, {
 *     value: { type: 'bezier', x1, y1, x2, y2 },
 *     onChange: function (curve) { ... },
 *     allowOvershoot: true,
 *     swatch: true,
 *     readout: { dv: 200, dt: 1 }   // optional: show influence/speed in units
 *   });
 *   editor.setCurve(curve); editor.getCurve(); editor.destroy();
 */
;(function (R) {
  'use strict';

  var svg = R.dom.svg;
  var sampler = R.easing.sampler;
  var speedgraph = R.easing.speedgraph;
  var bezier = R.easing.bezier;

  // Keep a bezier curve inside the AE-representable domain (X in [0.001,0.999],
  // x1<=x2); pass non-bezier (spring/penner) curves through untouched.
  function sanitize(c) {
    if (!c || c.type !== 'bezier') return c;
    var s = bezier.sanitizeHandles(c);
    return { type: 'bezier', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
  }

  function CurveEditor(container, opts) {
    opts = opts || {};
    var curve = sanitize(clone(opts.value)) || { type: 'bezier', x1: 0.33, y1: 0, x2: 0.67, y2: 1 };
    // 'value' = progress/value curve (CSS cubic-bezier). 'speed' = velocity over
    // time, exactly like After Effects' Graph Editor (so the editor mirrors AE
    // instead of forcing a mental S-curve↔hump translation). Both edit the SAME
    // {x1,y1,x2,y2}; only the view and what a handle's height means differ.
    var space = opts.space === 'speed' ? 'speed' : 'value';
    var onChange = opts.onChange || function () {};
    var allowOvershoot = opts.allowOvershoot !== false;
    var height = opts.height || 220;
    var reducedMotion = typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    container.classList.add('rb-curve');
    container.style.height = height + 'px';
    var svgEl = svg('svg', { preserveAspectRatio: 'none' });
    container.appendChild(svgEl);
    var readoutEl = R.dom.el('div.rb-curve-readout.rb-hidden');
    container.appendChild(readoutEl);

    var pad = opts.pad != null ? opts.pad : 16;
    var W = 300;
    var H = height;
    var view = computeView(curve);
    var frozenView = null; // value range held stable during a drag
    var dragging = false;  // while true, the pixel geometry (viewBox/H) is frozen too
    var dragGeom = null;   // frozen screen rect, so pointer mapping ignores reflow
    var ghost = opts.ghost ? clone(opts.ghost) : null;
    var rafToken = null;
    var swatchPhase = 0;
    var lastTs = 0;

    function measure() {
      W = container.clientWidth || 300;
      H = container.clientHeight || height;
      svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }

    function left() { return pad; }
    function right() { return W - pad; }
    function top() { return pad; }
    function bottom() { return H - pad; }

    function mapX(x) { return left() + x * (right() - left()); }
    function mapV(v) {
      return bottom() - ((v - view.vMin) / (view.vMax - view.vMin)) * (bottom() - top());
    }
    function domX(px) { return (px - left()) / (right() - left()); }
    function domV(py) { return view.vMin + ((bottom() - py) / (bottom() - top())) * (view.vMax - view.vMin); }

    function computeView(c) {
      var r = (space === 'speed' && c.type === 'bezier')
        ? speedgraph.speedRange(c, 160)
        : sampler.range(c, 160);
      var lo = Math.min(0, r.min);
      var hi = Math.max(1, r.max);
      var span = (hi - lo) || 1;
      // Headroom above/below so the curve does not touch the frame. Full-bleed
      // (widget) mode uses almost none so the curve fills edge to edge; overshoot
      // drags stay grabbable via the edge clamp and the view re-expands on commit.
      var mf = opts.marginFactor != null ? opts.marginFactor : 0.1;
      var mm = opts.marginMin != null ? opts.marginMin : 0.14;
      var m = Math.max(span * mf, mm);
      return { vMin: lo - m, vMax: hi + m };
    }


    function pathFor(c) {
      var d = '';
      if (space === 'speed' && c.type === 'bezier') {
        var sp = speedgraph.sampleSpeed(c, 90);
        for (var k = 0; k < sp.length; k++) {
          d += (k === 0 ? 'M' : 'L') + mapX(sp[k].x).toFixed(2) + ' ' + mapV(sp[k].s).toFixed(2) + ' ';
        }
        return d;
      }
      var pts = sampler.samplePoints(c, 90);
      for (var i = 0; i < pts.length; i++) {
        d += (i === 0 ? 'M' : 'L') + mapX(pts[i].x).toFixed(2) + ' ' + mapV(pts[i].y).toFixed(2) + ' ';
      }
      return d;
    }

    function render() {
      if (!dragging) measure(); // keep the pixel space fixed during a drag
      view = frozenView || computeView(curve);
      R.dom.clear(svgEl);

      // Grid: thirds.
      for (var t = 0; t <= 3; t++) {
        var gx = left() + (t / 3) * (right() - left());
        svgEl.appendChild(svg('line', {
          x1: gx, y1: top(), x2: gx, y2: bottom(),
          class: 'rb-grid-line' + (t === 0 || t === 3 ? ' is-mid' : '')
        }));
      }
      // Horizontal guides at value 0 and 1.
      [0, 1].forEach(function (v) {
        svgEl.appendChild(svg('line', {
          x1: left(), y1: mapV(v), x2: right(), y2: mapV(v),
          class: 'rb-grid-line' + (v === 0 || v === 1 ? ' is-mid' : '')
        }));
      });

      // Overshoot bands (value outside [0,1]). In speed space, above-average
      // speed (>1) is normal for any ease, so only flag negative speed (moving
      // backwards) as overshoot; the upper band would tint half the chart.
      if (view.vMax > 1 && space !== 'speed') {
        svgEl.appendChild(svg('rect', {
          x: left(), y: top(), width: right() - left(), height: Math.max(0, mapV(1) - top()),
          class: 'rb-overshoot-band'
        }));
      }
      if (view.vMin < 0) {
        svgEl.appendChild(svg('rect', {
          x: left(), y: mapV(0), width: right() - left(), height: Math.max(0, bottom() - mapV(0)),
          class: 'rb-overshoot-band'
        }));
      }

      // Reference line. Value space: the linear diagonal. Speed space: the
      // constant-average-speed line (speed == 1) is already drawn by the value-1
      // guide above, so a diagonal would be misleading — skip it.
      if (space !== 'speed') {
        svgEl.appendChild(svg('line', {
          x1: mapX(0), y1: mapV(0), x2: mapX(1), y2: mapV(1), class: 'rb-ref-line'
        }));
      }

      // Ghost (before) curve.
      if (ghost) {
        svgEl.appendChild(svg('path', { d: pathFor(ghost), class: 'rb-curve-ghost' }));
      }

      // The curve itself.
      svgEl.appendChild(svg('path', { d: pathFor(curve), class: 'rb-curve-path' }));

      // Bezier handles (only editable for bezier curves). In speed space a handle
      // sits at (influence, endpoint-speed): its X is the influence and its height
      // is the keyframe's speed, so the tangent to its anchor is horizontal — 1:1
      // with how an ease handle looks in AE's speed graph.
      if (curve.type === 'bezier') {
        if (space === 'speed') {
          var ends = speedgraph.endpointSpeeds(curve);
          drawHandle(0, ends.start, curve.x1, ends.start, 'h1');
          drawHandle(1, ends.end, curve.x2, ends.end, 'h2');
          svgEl.appendChild(svg('circle', { cx: mapX(0), cy: clamp(mapV(ends.start), 9, H - 9), r: 3, class: 'rb-anchor-dot' }));
          svgEl.appendChild(svg('circle', { cx: mapX(1), cy: clamp(mapV(ends.end), 9, H - 9), r: 3, class: 'rb-anchor-dot' }));
        } else {
          drawHandle(0, 0, curve.x1, curve.y1, 'h1');
          drawHandle(1, 1, curve.x2, curve.y2, 'h2');
          svgEl.appendChild(svg('circle', { cx: mapX(0), cy: mapV(0), r: 3, class: 'rb-anchor-dot' }));
          svgEl.appendChild(svg('circle', { cx: mapX(1), cy: mapV(1), r: 3, class: 'rb-anchor-dot' }));
        }
      }

      // Motion swatch dot track (along the top).
      if (opts.swatch) {
        var trackY = top() - 12;
        if (trackY < 8) trackY = 8;
        svgEl.appendChild(svg('line', {
          x1: left(), y1: trackY, x2: right(), y2: trackY, class: 'rb-swatch-track'
        }));
        var prog = sampler.toFunction(curve)(swatchPhase);
        var dotX = left() + clamp01(prog) * (right() - left());
        swatchDot = svg('circle', { cx: dotX, cy: trackY, r: 4, class: 'rb-swatch-dot' });
        svgEl.appendChild(swatchDot);
      }
    }

    var swatchDot = null;

    function drawHandle(anchorX, anchorY, hx, hy, key) {
      // Keep the handle on-screen even in extreme overshoot, so it is always
      // grabbable and you can drag it straight back; only the dot is clamped, the
      // value it carries is untouched.
      var hxPix = mapX(hx);
      var hyPix = clamp(mapV(hy), 9, H - 9);
      svgEl.appendChild(svg('line', {
        x1: mapX(anchorX), y1: mapV(anchorY), x2: hxPix, y2: hyPix, class: 'rb-tangent'
      }));
      var circle = svg('circle', {
        cx: hxPix, cy: hyPix, r: 7, class: 'rb-handle', 'data-handle': key,
        tabindex: 0, role: 'slider', 'aria-label': key === 'h1' ? 'Out handle' : 'In handle'
      });
      // CEF (After Effects) can drop POINTER events on SVG sub-elements while still
      // firing MOUSE events (same quirk that makes <button> get click but not
      // pointerdown). Bind both families; the drag-state guard dedupes the pair.
      var startHandle = startDrag(key, circle);
      circle.addEventListener('mousedown', startHandle);
      circle.addEventListener('pointerdown', startHandle);
      circle.addEventListener('keydown', handleKey(key));
      svgEl.appendChild(circle);
    }

    function startDrag(key, circle) {
      return function (e) {
        if (dragging) return; // ignore the paired mousedown+pointerdown (one drag)
        e.preventDefault();
        circle.classList.add('is-dragging');
        // Freeze both the value range and the pixel geometry for the whole drag,
        // so the value maps to the pointer 1:1 and the drag is always reversible
        // (pull a handle back the exact way it came). For extreme overshoot the
        // handle can travel above the plot, but it returns the moment you drag in.
        frozenView = computeView(curve);
        measure();
        dragging = true;
        // Freeze the exact screen->SVG transform at grab time. It encodes the real
        // scale and position, so the mapping stays correct and constant no matter
        // how the layout reflows mid-drag (the live preview re-rendering, etc.).
        dragGeom = svgEl.getScreenCTM();
        render();
        var ended = false;
        var move = function (ev) {
          var p = toPlot(ev);
          applyHandle(key, domX(p.x), domV(p.y), ev);
        };
        var up = function () {
          if (ended) return; // mouseup + pointerup both fire; run cleanup once
          ended = true;
          circle.classList.remove('is-dragging');
          frozenView = null;
          dragging = false;
          dragGeom = null;
          render();
          hideReadout();
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          if (opts.onCommit) opts.onCommit(clone(curve));
        };
        // Listen on both families: whichever the runtime delivers drives the drag
        // (CEF mouse events are reliable on SVG; pointer events may not be). The
        // moves are idempotent and `ended` dedupes the up, so doubling is harmless.
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        move(e);
      };
    }

    function handleKey(key) {
      return function (e) {
        var stepX = e.shiftKey ? 0.1 : 0.01;
        var hx = key === 'h1' ? curve.x1 : curve.x2;
        var hy = key === 'h1' ? curve.y1 : curve.y2;
        var changed = true;
        if (e.key === 'ArrowLeft') hx -= stepX;
        else if (e.key === 'ArrowRight') hx += stepX;
        else if (e.key === 'ArrowUp') hy += stepX;
        else if (e.key === 'ArrowDown') hy -= stepX;
        else changed = false;
        if (changed) {
          e.preventDefault();
          applyHandle(key, hx, hy, e);
          if (opts.onCommit) opts.onCommit(clone(curve));
        }
      };
    }

    function applyHandle(key, x, y, ev) {
      // Keep X in [0.001, 0.999] and x1 <= x2 so the curve stays exactly what AE
      // can reproduce (monotonic time, handles never overlap). The dragged handle
      // clamps against the other's current position; Y is left free so overshoot
      // and anticipation are still drawable (AE renders them via handle speed).
      if (key === 'h1') x = clamp(x, 0.001, Math.max(0.001, curve.x2));
      else x = clamp(x, Math.min(curve.x1, 0.999), 0.999);
      if (space === 'speed') {
        // y is a normalized speed (avg == 1). X stays the influence; convert the
        // height back into the stored value-curve y so {x1,y1,x2,y2} is exact and
        // Apply/Read are unaffected. Negative speed (backwards) only when allowed.
        var s = allowOvershoot ? clamp(y, -8, 16) : (y < 0 ? 0 : clamp(y, 0, 16));
        if (key === 'h1') { curve.x1 = x; curve.y1 = s * x; }
        else { curve.x2 = x; curve.y2 = 1 - s * (1 - x); }
      } else {
        if (!allowOvershoot) y = clamp01(y);
        else y = clamp(y, -3, 4);
        if (key === 'h1') { curve.x1 = x; curve.y1 = y; }
        else { curve.x2 = x; curve.y2 = y; }
      }
      onChange(clone(curve));
      render();
      showReadout(key, ev);
    }

    function showReadout(key, ev) {
      var infl, slope;
      if (key === 'h1') {
        infl = curve.x1 * 100;
        slope = curve.x1 === 0 ? 0 : curve.y1 / curve.x1;
      } else {
        infl = (1 - curve.x2) * 100;
        slope = (1 - curve.x2) === 0 ? 0 : (1 - curve.y2) / (1 - curve.x2);
      }
      var text = 'Influence ' + Math.round(infl) + '%';
      if (opts.readout && opts.readout.dv != null && opts.readout.dt) {
        var speed = slope * (opts.readout.dv / opts.readout.dt);
        text += ' · ' + R.units.round(speed, 1) + (opts.readout.unit || '/s');
      } else if (space === 'speed') {
        text = 'Speed ' + R.units.round(slope, 2) + '× avg · ' + text;
      }
      readoutEl.textContent = text;
      readoutEl.classList.remove('rb-hidden');
      if (ev && ev.clientX != null) {
        var rect = container.getBoundingClientRect();
        readoutEl.style.left = (ev.clientX - rect.left) + 'px';
        readoutEl.style.top = (ev.clientY - rect.top) + 'px';
      }
    }
    function hideReadout() { readoutEl.classList.add('rb-hidden'); }

    function toPlot(evt) {
      var pt = svgEl.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      // Use the transform frozen at grab time during a drag, so a reflow cannot
      // shift the mapping under the pointer; otherwise read it live.
      var ctm = dragGeom || svgEl.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      var p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    // Swatch animation loop.
    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var dt = (ts - lastTs) / 1000;
      lastTs = ts;
      swatchPhase += dt / 1.4; // ~1.4s loop incl. pause
      if (swatchPhase > 1.25) swatchPhase = 0; // brief hold at end
      var p = clamp01(swatchPhase);
      if (swatchDot) {
        var prog = sampler.toFunction(curve)(p);
        swatchDot.setAttribute('cx', (left() + clamp01(prog) * (right() - left())).toFixed(2));
      }
      rafToken = requestAnimationFrame(tick);
    }

    function startSwatch() {
      if (!opts.swatch || reducedMotion) return;
      if (rafToken == null) rafToken = requestAnimationFrame(tick);
    }
    function stopSwatch() {
      if (rafToken != null) { cancelAnimationFrame(rafToken); rafToken = null; lastTs = 0; }
    }

    var ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(function () { render(); });
      ro.observe(container);
    }

    render();
    startSwatch();

    return {
      el: container,
      getCurve: function () { return clone(curve); },
      setCurve: function (c) { curve = sanitize(clone(c)); render(); },
      setGhost: function (c) { ghost = c ? clone(c) : null; render(); },
      getSpace: function () { return space; },
      setSpace: function (s) {
        var next = s === 'speed' ? 'speed' : 'value';
        if (next === space) return;
        space = next;
        frozenView = null; // value and speed have different Y ranges
        render();
      },
      refresh: render,
      destroy: function () {
        stopSwatch();
        if (ro) ro.disconnect();
        R.dom.clear(svgEl);
      }
    };
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  // Deep-clone the serializable fields, but carry a function-curve's fn across
  // (JSON would drop it), so read-only fn curves can be rendered.
  function clone(o) {
    if (!o) return o;
    var fn = o.fn;
    var c = JSON.parse(JSON.stringify(o));
    if (typeof fn === 'function') c.fn = fn;
    return c;
  }

  R.ui = R.ui || {};
  R.ui.CurveEditor = CurveEditor;
})(window.Rebound = window.Rebound || {});
