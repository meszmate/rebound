/*
 * Rebound, tooltips.
 * A single themed tooltip that replaces the slow, OS-styled native title popup.
 * It hijacks any element's `title` (stashing it to data-rb-tip and removing the
 * attribute so the browser never shows its own), then renders a fast, styled
 * bubble on hover. Works app-wide with no per-element wiring: anything with a
 * title - the sidebar icons, preview controls, close buttons - gets it for free.
 */
;(function (R) {
  'use strict';

  var tip = null;
  var target = null;

  function ensure() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'rb-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }

  // Move a live `title` onto data-rb-tip (killing the native tooltip) and return
  // the text to show. Re-reads title each time so dynamic labels stay fresh.
  function textFor(el) {
    var t = el.getAttribute('title');
    if (t != null && t !== '') { el.setAttribute('data-rb-tip', t); el.removeAttribute('title'); }
    return el.getAttribute('data-rb-tip') || '';
  }

  function findTarget(node) {
    return (node && node.closest) ? node.closest('[title],[data-rb-tip]') : null;
  }

  function place(el) {
    var r = el.getBoundingClientRect();
    var box = tip.getBoundingClientRect();
    var gap = 8;
    var x, y, placement;
    // Left-rail icons read best with the label to their right; everything else
    // sits below, flipping above when there is no room.
    if (el.closest && el.closest('.rb-rail')) {
      placement = 'right';
      x = r.right + gap;
      y = r.top + r.height / 2 - box.height / 2;
    } else {
      placement = 'below';
      x = r.left + r.width / 2 - box.width / 2;
      y = r.bottom + gap;
      if (y + box.height > window.innerHeight - 4) { y = r.top - gap - box.height; placement = 'above'; }
    }
    x = Math.max(4, Math.min(x, window.innerWidth - box.width - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - box.height - 4));
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(y) + 'px';
    tip.setAttribute('data-placement', placement);
  }

  function show(el) {
    var text = textFor(el);
    if (!text) return;
    ensure();
    tip.textContent = text;
    tip.classList.add('is-visible');
    place(el);
  }

  function hide() {
    target = null;
    if (tip) tip.classList.remove('is-visible');
  }

  function onOver(e) {
    var el = findTarget(e.target);
    if (!el || el === target) return;
    target = el;
    show(el); // instant, no hover delay
  }

  function onOut(e) {
    var el = findTarget(e.target);
    if (el && el === target) {
      var to = e.relatedTarget;
      if (to && el.contains(to)) return; // still within the same target
      hide();
    }
  }

  function init() {
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  R.ui = R.ui || {};
  R.ui.tooltips = { hide: hide };
})(window.Rebound = window.Rebound || {});
