/*
 * Rebound — Preview Stage.
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
    var showLinearGhost = opts.ghostLinear !== false;
    var slowmo = 1;
    var reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    container.classList.add('rb-preview');

    var dot = el('div.rb-preview-dot');
    var ghost = el('div.rb-preview-dot.rb-preview-ghost');
    var track = el('div.rb-preview-track');
    var ghostTrack = el('div.rb-preview-track.rb-preview-track-ghost');
    var stage = el('div.rb-preview-stage', null, [
      ghostTrack, track,
      el('span.rb-preview-marker.is-start'), el('span.rb-preview-marker.is-end'),
      ghost, dot
    ]);

    // Named setters so both the in-stage controls and the public API drive them.
    function setProperty(p) { property = p; if (propSeg) propSeg.set(p); renderAt(phaseToP()); }
    function setSample(s) { sample = s; setSampleNode(); if (sampleBtn) sampleBtn.textContent = s === 'shape' ? '●' : 'Aa'; }
    function setSlowmo(f) { slowmo = f; if (speedBtn) speedBtn.textContent = f === 1 ? '1×' : '¼×'; }
    function setGhost(on) { showLinearGhost = on; renderAt(phaseToP()); }

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

    var sampleBtn = el('button.rb-btn.is-ghost.is-icon', {
      title: 'Shape / text sample', 'aria-label': 'Toggle shape or text sample',
      onclick: function () { setSample(sample === 'shape' ? 'text' : 'shape'); }
    }, [sample === 'shape' ? '●' : 'Aa']);

    var speedBtn = el('button.rb-btn.is-ghost.is-icon', {
      title: 'Slow motion', 'aria-label': 'Toggle slow motion',
      onclick: function () { setSlowmo(slowmo === 1 ? 4 : 1); }
    }, ['1×']);

    var readout = el('span.rb-preview-readout', { text: '' });

    container.appendChild(stage);
    if (opts.controls !== false) {
      container.appendChild(el('div.rb-preview-controls', null, [playBtn, propSeg.el, sampleBtn, speedBtn]));
    }
    container.appendChild(el('div.rb-preview-controls', null, [readout]));

    var rafId = null;
    var last = 0;
    var phase = 0;
    var paused = reduced; // reduced-motion starts paused on a static frame

    function totalCycle() { return (duration / 1000) * slowmo + holdMs / 1000; }

    function range() { return Math.max(0, stage.clientWidth - 32); }

    // Apply the eased value e (may overshoot) to the sample for the active property.
    function applyTo(node, e, isGhost) {
      var transform = '';
      var opacity = 1;
      switch (property) {
        case 'scale':
          transform = 'translateX(' + (range() / 2) + 'px) scale(' + (0.25 + clamp01ish(e) * 0.75) + ')';
          break;
        case 'rotation':
          transform = 'translateX(' + (range() / 2) + 'px) rotate(' + (e * 180) + 'deg)';
          break;
        case 'opacity':
          transform = 'translateX(' + (range() / 2) + 'px)';
          opacity = clamp01(e);
          break;
        default: // position
          transform = 'translateX(' + (e * range()) + 'px)';
      }
      node.style.transform = transform;
      node.style.opacity = isGhost ? opacity * 0.5 : opacity;
    }

    function renderAt(p) {
      var fn = sampler.toFunction(getCurve());
      applyTo(dot, fn(p), false);
      if (showLinearGhost) applyTo(ghost, p, true);
      ghost.style.display = showLinearGhost ? '' : 'none';
      ghostTrack.style.display = showLinearGhost ? '' : 'none';
    }

    function frame(ts) {
      if (paused) { rafId = null; return; }
      if (!last) last = ts;
      var dt = Math.min((ts - last) / 1000, 1 / 30);
      last = ts;
      phase += dt / totalCycle();
      if (phase >= 1) phase = 0;
      var playFrac = ((duration / 1000) * slowmo) / totalCycle();
      var p = playFrac > 0 && phase < playFrac ? phase / playFrac : 1;
      renderAt(p);
      rafId = requestAnimationFrame(frame);
    }

    function play() {
      if (reduced) { renderAt(1); return; }
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
      setTimeout(function () { reduced = true; pause(); renderAt(1); }, duration + holdMs);
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

    // Initial paint + autostart (unless reduced motion).
    setSampleNode();
    renderAt(reduced ? 0.62 : 0);
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
      setDuration: function (ms) { duration = ms; },
      setSlowmo: setSlowmo,
      setGhost: setGhost,
      setReadout: setReadout,
      play: play,
      pause: pause,
      refresh: function () { renderAt(phaseToP()); },
      destroy: function () {
        pause();
        document.removeEventListener('visibilitychange', onVisibility);
        if (io) io.disconnect();
      }
    };

    function phaseToP() {
      var playFrac = ((duration / 1000) * slowmo) / totalCycle();
      return playFrac > 0 && phase < playFrac ? phase / playFrac : 1;
    }
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // Allow a little overshoot above 1 for scale pop, clamp the floor at 0.
  function clamp01ish(v) { return v < 0 ? 0 : v; }

  R.ui = R.ui || {};
  R.ui.PreviewStage = PreviewStage;
})(window.Rebound = window.Rebound || {});
