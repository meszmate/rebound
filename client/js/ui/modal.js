/*
 * Rebound, modal dialog primitive.
 * A centered, themed dialog over a scrim, mirroring the command-palette overlay.
 * Handles the scrim, focus trap, Escape (stopping propagation so the detail-view
 * back handler does not also fire), backdrop click, body-scroll lock, and a
 * fade/scale enter-exit. A module-level singleton guarantees at most one dialog,
 * so reopening or switching tools tears down a stale dialog (and anything it
 * owns, like a live preview) reliably, since tools are never unmounted.
 *
 * Usage:
 *   var dlg = Rebound.ui.modal({
 *     title: 'Save preset',
 *     body: node,                 // Node, or function(handle) -> Node
 *     footer: [cancelBtn, saveBtn],
 *     width: 360,
 *     initialFocus: input,
 *     onClose: function (reason) { ... }
 *   });
 *   dlg.close();
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var current = null;

  function modal(opts) {
    opts = opts || {};
    if (current) current.close('programmatic'); // only ever one dialog

    var seq = (modal._seq = (modal._seq || 0) + 1);
    var titleId = 'rb-modal-title-' + seq;
    var closed = false;
    var handle;

    var overlay = el('div.rb-modal-overlay.is-entering');
    var box = el('div.rb-modal' + (opts.className ? '.' + opts.className.replace(/^\./, '') : ''), {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1',
      style: { width: 'min(' + (opts.width || 360) + 'px, calc(100vw - 32px))' }
    });

    var head = el('div.rb-modal-head', null, [
      el('h2.rb-modal-title#' + titleId, { text: opts.title || '' }),
      el('button.rb-modal-x.rb-btn.is-ghost.is-icon', {
        type: 'button', 'aria-label': 'Close', title: 'Close',
        onclick: function () { close('close'); }
      }, ['×'])
    ]);
    box.appendChild(head);

    var bodyNode = (typeof opts.body === 'function') ? opts.body(getHandle()) : opts.body;
    box.appendChild(el('div.rb-modal-body', null, bodyNode ? [bodyNode] : []));
    if (opts.footer) box.appendChild(el('div.rb-modal-foot', null, [].concat(opts.footer)));
    overlay.appendChild(box);

    // Backdrop: only close when both the press and the release land on the scrim,
    // so a text drag that ends on the scrim does not dismiss the dialog.
    var downOnScrim = false;
    overlay.addEventListener('mousedown', function (e) { downOnScrim = (e.target === overlay); });
    overlay.addEventListener('mouseup', function (e) {
      if (downOnScrim && e.target === overlay && opts.closeOnBackdrop !== false) close('backdrop');
      downOnScrim = false;
    });

    function focusable() {
      var sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
      return Array.prototype.filter.call(box.querySelectorAll(sel), function (n) {
        return n.offsetParent !== null || n === document.activeElement;
      });
    }

    // Capture phase so this runs before the document-level shortcut handler.
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (opts.closeOnEscape !== false) { e.preventDefault(); e.stopPropagation(); close('escape'); }
        return;
      }
      if (e.key === 'Tab') {
        var f = focusable();
        if (!f.length) { e.preventDefault(); box.focus(); return; }
        var first = f[0], lastEl = f[f.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || a === box)) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && a === lastEl) { e.preventDefault(); first.focus(); }
      }
    }, true);

    var prevFocus = document.activeElement;
    var prevOverflow = document.body.style.overflow;
    var app = document.getElementById('rb-app');
    document.body.style.overflow = 'hidden';
    if (app) app.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    current = getHandle();

    // Double rAF so the is-entering from-state paints before transitioning.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.remove('is-entering');
        var t = (typeof opts.initialFocus === 'function') ? opts.initialFocus(box) : opts.initialFocus;
        if (!t) t = box.querySelector('[data-autofocus]') || focusable()[0] || box;
        try { t.focus(); if (t.tagName === 'INPUT') t.select(); } catch (err) { /* ignore */ }
      });
    });

    function close(reason) {
      if (closed) return;
      closed = true;
      if (current === handle) current = null;
      overlay.classList.add('is-leaving');
      var reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      var done = false;
      function teardown() {
        if (done) return;
        done = true;
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        document.body.style.overflow = prevOverflow;
        if (app) app.removeAttribute('aria-hidden');
        if (prevFocus && document.contains(prevFocus)) { try { prevFocus.focus(); } catch (err) { /* ignore */ } }
        if (typeof opts.onClose === 'function') opts.onClose(reason);
      }
      if (reduced) { teardown(); return; }
      overlay.addEventListener('transitionend', function te(ev) {
        if (ev.target === overlay && ev.propertyName === 'opacity') { overlay.removeEventListener('transitionend', te); teardown(); }
      });
      setTimeout(teardown, 260); // safety net if transitionend is missed
    }

    function getHandle() {
      if (!handle) {
        handle = {
          el: overlay, box: box, close: close,
          setBusy: function (b) { box.classList.toggle('is-busy', !!b); box.setAttribute('aria-busy', b ? 'true' : 'false'); },
          isOpen: function () { return !closed; }
        };
      }
      return handle;
    }

    return getHandle();
  }

  R.ui = R.ui || {};
  R.ui.modal = modal;
})(window.Rebound = window.Rebound || {});
