/*
 * Rebound, mini simulation loop.
 *
 * The tiny rAF driver behind every animated in-tool preview that is NOT a
 * PreviewStage (the physics rigs: squash, throw, path follow, drift, follow,
 * lean, kinetic, motion). One shared implementation instead of a hand-rolled
 * loop per tool, with the same manners as preview-stage.js:
 *
 *   - the draw callback receives elapsed seconds (monotonic, pause-aware);
 *   - pauses while the panel is hidden (visibilitychange);
 *   - pauses while the watched element is scrolled/toggled off-screen
 *     (IntersectionObserver), so mounted-but-unseen tools don't animate;
 *   - honors prefers-reduced-motion: draws ONE static frame and stays parked;
 *   - destroy() releases the rAF, the listener, and the observer.
 *
 * Usage:
 *   var sim = R.ui.miniSim({ el: stageSvg, draw: function (t) { ... } });
 *   // or R.ui.miniSim(function (t) { ... }) when there is nothing to observe
 *   sim.destroy();
 */
;(function (R) {
  'use strict';

  function miniSim(optsOrDraw) {
    var opts = typeof optsOrDraw === 'function' ? { draw: optsOrDraw } : (optsOrDraw || {});
    var draw = opts.draw || function () {};
    var reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var elapsed = 0;    // seconds shown so far; preserved across pauses
    var epoch = 0;      // wall-clock ms that maps to elapsed = 0
    var rafId = null;
    var stopped = !!opts.paused;
    var offscreen = false;
    var destroyed = false;

    function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function frame() {
      if (rafId == null) return;
      elapsed = (nowMs() - epoch) / 1000;
      draw(elapsed);
      rafId = requestAnimationFrame(frame);
    }

    // One source of truth for "should we be animating right now". Resuming
    // rebases the epoch so the motion continues where it paused, no jump.
    function sync() {
      var should = !destroyed && !stopped && !reduced && !document.hidden && !offscreen;
      if (should && rafId == null) {
        epoch = nowMs() - elapsed * 1000;
        rafId = requestAnimationFrame(frame);
      } else if (!should && rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function onVisibility() { sync(); }
    document.addEventListener('visibilitychange', onVisibility);

    var io = null;
    if (opts.el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(function (entries) {
        offscreen = !(entries[0] && entries[0].isIntersecting);
        sync();
      });
      io.observe(opts.el);
    }

    draw(0); // static first frame (all a reduced-motion user ever sees)
    sync();

    return {
      play: function () { stopped = false; sync(); },
      pause: function () { stopped = true; sync(); },
      redraw: function () { draw(elapsed); },
      destroy: function () {
        destroyed = true;
        sync();
        document.removeEventListener('visibilitychange', onVisibility);
        if (io) { io.disconnect(); io = null; }
      }
    };
  }

  R.ui = R.ui || {};
  R.ui.miniSim = miniSim;
})(window.Rebound = window.Rebound || {});
