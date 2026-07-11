/*
 * Rebound, Preview Stage.
 *
 * A live, looping sample that shows what an easing/spring curve actually feels
 * like. It is driven by the SAME Rebound.easing.sampler.toFunction(curve) the
 * curve editor and Apply use, so the motion you see is exactly what gets
 * written. It reads the curve fresh every frame via getCurve(), so slider and
 * handle edits update the motion instantly with no loop restart.
 *
 * The loop plays at the real target duration, holds briefly at the end state
 * (so ease-in vs ease-out stays legible), then resets. It honors
 * prefers-reduced-motion (static frame + manual play), and pauses when the
 * panel is hidden.
 *
 * Usage:
 *   var stage = Rebound.ui.PreviewStage(container, {
 *     getCurve: function () { return curve; },
 *     duration: 600,          // ms of the animated portion
 *     property: 'position',   // position | scale | rotation | opacity
 *     sample: 'shape'         // shape | text
 *   });
 *   stage.setProperty('scale'); stage.setSample('text'); stage.destroy();
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var sampler = R.easing.sampler;

  function PreviewStage(container, opts) {
    opts = opts || {};
    var getCurve = opts.getCurve || function () { return { type: 'bezier', x1: 0.33, y1: 0, x2: 0.67, y2: 1 }; };
    var duration = opts.duration || 600;
    var holdMs = opts.hold != null ? opts.hold : 480;
    var property = opts.property || 'position';
    var sample = opts.sample || 'shape';
    // 'horizontal' (a value sliding along a track) or 'vertical' (an object
    // dropping onto a floor, for gravity bounces). Vertical matches the bounce
    // card so the preview and the showcase read as the same motion.
    var axis = opts.axis === 'vertical' ? 'vertical' : 'horizontal';
    var showLinearGhost = opts.ghostLinear !== false;
    var slowmo = 1;
    var reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    container.classList.add('rb-preview');

    var dot = el('div.rb-preview-dot');
    var ghost = el('div.rb-preview-dot.rb-preview-ghost');
    var track = el('div.rb-preview-track');
    var ghostTrack = el('div.rb-preview-track.rb-preview-track-ghost');
    // Destination ghost: an outlined square at the end of the track, so the
    // motion always reads as "from here to THERE" even while the dot rests.
    var dest = el('span.rb-preview-dest', { 'aria-hidden': 'true' });
    // Loop-duration chip: how long the animated portion of the loop is.
    var durChip = el('span.rb-preview-durchip');
    var stage = el('div.rb-preview-stage', null, [
      ghostTrack, track,
      el('span.rb-preview-marker.is-start'), el('span.rb-preview-marker.is-end'),
      dest, ghost, dot, durChip
    ]);
    function syncDest() {
      // The ghost target only makes sense for a horizontal position move; the
      // other properties animate in place at the center.
      dest.style.display = (property === 'position' && axis !== 'vertical') ? '' : 'none';
    }
    function syncDurChip() {
      durChip.textContent = (Math.round(duration / 10) / 100) + 's loop';
    }
    if (axis === 'vertical') {
      stage.classList.add('is-vertical');
      stage.appendChild(el('span.rb-preview-floor'));
    }

    // Named setters so both the in-stage controls and the public API drive them.
    function setProperty(p) { property = p; if (propSeg) propSeg.set(p); syncDest(); renderAt(computeState(phase)); }
    function setSample(s) { sample = s; setSampleNode(); }
    function setSlowmo(f) { slowmo = f; if (speedBtn) speedBtn.textContent = f === 1 ? '1×' : '¼×'; }
    function setGhost(on) { showLinearGhost = on; renderAt(computeState(phase)); }

    var playBtn = el('button.rb-btn.is-ghost.is-icon', {
      'aria-label': 'Play or pause the preview', title: 'Play / pause',
      onclick: togglePlay
    }, [reduced ? '▶' : '❚❚']);

    var propSeg = R.ui.segmented([
      { value: 'position', label: 'Pos', title: 'Position' },
      { value: 'scale', label: 'Scale', title: 'Scale' },
      { value: 'rotation', label: 'Rot', title: 'Rotation' },
      { value: 'opacity', label: 'Fade', title: 'Opacity' }
    ], { value: property, onChange: function (v) { setProperty(v); } });

    var speedBtn = el('button.rb-btn.is-ghost.is-icon', {
      title: 'Slow motion', 'aria-label': 'Toggle slow motion',
      onclick: function () { setSlowmo(slowmo === 1 ? 4 : 1); }
    }, ['1×']);

    var readout = el('span.rb-preview-readout', { text: '' });

    container.appendChild(stage);
    if (opts.controls !== false) {
      container.appendChild(el('div.rb-preview-controls.rb-preview-opts', null, [playBtn, propSeg.el, speedBtn]));
    }
    container.appendChild(el('div.rb-preview-controls', null, [readout]));

    var rafId = null;
    var last = 0;
    var phase = 0;
    var paused = reduced; // reduced-motion starts paused on a static frame

    var returnMs = 520; // gentle glide from the end state back to the start
    function totalCycle() { return (duration / 1000) * slowmo + holdMs / 1000 + returnMs / 1000; }

    // Cached sampler fn, rebuilt only when the curve actually changes, so the
    // per-frame path is a single fn(p) call.
    var cachedFn = null;
    var cachedSig = null;
    function curveFn() {
      var c = getCurve();
      // A function curve cannot be serialized (JSON.stringify drops it), so it
      // must never be cached, otherwise live slider changes would be ignored.
      // Return its fn fresh every frame; cache only serializable curves.
      if (c && c.type === 'fn') return typeof c.fn === 'function' ? c.fn : function (t) { return t; };
      var sig = JSON.stringify(c);
      if (sig !== cachedSig) { cachedSig = sig; cachedFn = sampler.toFunction(c); }
      return cachedFn;
    }

    // Map a phase in [0,1) to a render state. Bands: play (the curve, p 0->1),
    // hold (rest at the end), return (a gentle smoothstep glide from the end
    // value back to the start value). The return ends exactly at the start, so
    // the loop is continuous with no fade and no jump.
    function computeState(ph) {
      var play = (duration / 1000) * slowmo;
      var hold = holdMs / 1000;
      var ret = returnMs / 1000;
      var t = ph * totalCycle();
      if (t < play) return { mode: 'play', p: play > 0 ? t / play : 1 };
      t -= play;
      if (t < hold) return { mode: 'hold' };
      t -= hold;
      return { mode: 'return', rp: ret > 0 ? Math.min(1, t / ret) : 1 };
    }

    function smoothstep(x) { return x * x * (3 - 2 * x); }

    function hrange() { return Math.max(0, stage.clientWidth - 32); }
    function vrange() { return Math.max(0, stage.clientHeight - 50); }
    function centerX() { return stage.clientWidth / 2 - 16; }

    // Apply the eased value e (may overshoot) to the sample for the active
    // property. Horizontal slides along the track; vertical drops onto the floor
    // (value 1 = resting on the floor, dips above it = bounces).
    function applyTo(node, e, isGhost) {
      var baseX = axis === 'vertical' ? centerX() : hrange() / 2;
      var tx = baseX;
      var ty = 0;
      var scale = 1;
      var rot = 0;
      var opacity = 1;
      switch (property) {
        case 'scale': scale = 0.25 + clamp01ish(e) * 0.75; break;
        case 'rotation': rot = e * 180; break;
        case 'opacity': opacity = clamp01(e); break;
        default: // position
          if (axis === 'vertical') ty = (e - 0.5) * vrange();
          else tx = e * hrange();
      }
      var t = 'translate(' + tx + 'px,' + ty + 'px)';
      if (scale !== 1) t += ' scale(' + scale + ')';
      if (rot) t += ' rotate(' + rot + 'deg)';
      node.style.transform = t;
      node.style.opacity = isGhost ? opacity * 0.5 : opacity;
    }

    // Render one state. The dot follows the curve while playing, rests at the
    // end, then glides smoothly back to the start; the ghost mirrors it linearly.
    function renderAt(state) {
      var fn = curveFn();
      var e, eg;
      if (state.mode === 'return') {
        var k = smoothstep(state.rp);
        e = fn(1) + (fn(0) - fn(1)) * k;
        eg = 1 - k;
      } else if (state.mode === 'hold') {
        e = fn(1); eg = 1;
      } else {
        e = fn(state.p); eg = state.p;
      }
      applyTo(dot, e, false);
      var ghostOn = showLinearGhost && axis !== 'vertical';
      if (ghostOn) applyTo(ghost, eg, true);
      ghost.style.display = ghostOn ? '' : 'none';
      ghostTrack.style.display = ghostOn ? '' : 'none';
    }

    function frame(ts) {
      if (paused) { rafId = null; return; }
      if (!last) last = ts;
      var dt = Math.min((ts - last) / 1000, 1 / 30);
      last = ts;
      phase += dt / totalCycle();
      if (phase >= 1) phase -= 1; // keep the sub-frame remainder, never snap to 0
      renderAt(computeState(phase));
      rafId = requestAnimationFrame(frame);
    }

    function play() {
      if (reduced) { renderAt({ mode: 'hold' }); return; }
      paused = false;
      playBtn.textContent = '❚❚';
      if (rafId == null) { last = 0; rafId = requestAnimationFrame(frame); }
    }
    function pause() {
      paused = true;
      playBtn.textContent = '▶';
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    }
    function togglePlay() {
      if (reduced) { runOnce(); return; }
      if (paused) play(); else pause();
    }

    // Reduced-motion: a single eased run on demand, then rest at the end.
    function runOnce() {
      reduced = false;
      phase = 0;
      play();
      setTimeout(function () { reduced = true; pause(); renderAt({ mode: 'hold' }); }, duration + holdMs);
    }

    function onVisibility() {
      if (document.hidden) { if (!paused) { wasPlaying = true; pause(); } }
      else if (wasPlaying) { wasPlaying = false; play(); }
    }
    var wasPlaying = false;
    document.addEventListener('visibilitychange', onVisibility);

    // Pause when the stage scrolls/toggles off-screen (e.g. its tool is hidden
    // behind another), so mounted-but-unseen tools don't keep animating.
    var io = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(function (entries) {
        var visible = entries[0] && entries[0].isIntersecting;
        if (!visible) {
          if (!paused) { wasPlaying = true; pause(); }
        } else if (wasPlaying) {
          wasPlaying = false;
          play();
        }
      });
      io.observe(stage);
    }

    function setReadout(text) { readout.textContent = text || ''; }

    // Initial paint + autostart (unless reduced motion). The idle frame rests
    // the dot at the START marker (the destination ghost marks the end), so a
    // parked stage reads as "about to move", not stopped mid-flight.
    setSampleNode();
    syncDest();
    syncDurChip();
    renderAt(computeState(0));
    if (!reduced) play();

    function setSampleNode() {
      dot.classList.toggle('is-text', sample === 'text');
      ghost.classList.toggle('is-text', sample === 'text');
      dot.textContent = sample === 'text' ? 'Aa' : '';
      ghost.textContent = sample === 'text' ? 'Aa' : '';
    }

    return {
      el: container,
      setProperty: setProperty,
      setSample: setSample,
      setDuration: function (ms) { duration = ms; syncDurChip(); },
      setSlowmo: setSlowmo,
      setGhost: setGhost,
      setReadout: setReadout,
      play: play,
      pause: pause,
      refresh: function () { renderAt(computeState(phase)); },
      destroy: function () {
        pause();
        document.removeEventListener('visibilitychange', onVisibility);
        if (io) io.disconnect();
      }
    };
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // Allow a little overshoot above 1 for scale pop, clamp the floor at 0.
  function clamp01ish(v) { return v < 0 ? 0 : v; }

  R.ui = R.ui || {};
  R.ui.PreviewStage = PreviewStage;
})(window.Rebound = window.Rebound || {});
