/*
 * Rebound, reusable UI controls.
 * Small factory functions returning a DOM node plus a tiny imperative API.
 * Built on Rebound.dom; no framework.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var on = R.dom.on;

  // ---- Toast --------------------------------------------------------------
  // Active toasts, oldest first. We cap the stack and collapse immediate repeats
  // so rapid actions (tapping anchor handles, recoloring layers) don't bury the
  // panel in popups. Successes are brief; errors linger a little longer.
  var activeToasts = [];
  var MAX_TOASTS = 3;
  var TOAST_MS = { error: 5000, warn: 3500, success: 2000, info: 1900 };

  function toast(message, opts) {
    opts = opts || {};
    var host = document.getElementById('rb-toasts');
    if (!host) {
      host = el('div#rb-toasts');
      document.body.appendChild(host);
    }
    var kind = opts.kind || 'info';
    var dur = opts.duration || TOAST_MS[kind] || 2400;

    // Collapse an immediate repeat: if the newest toast says the same thing, just
    // refresh its timer instead of stacking another identical popup.
    var last = activeToasts[activeToasts.length - 1];
    if (last && last.message === message && last.kind === kind && !opts.action) {
      last.refresh(dur);
      return { dismiss: last.dismiss };
    }

    var entry;
    var children = [el('span.rb-grow', { text: message })];
    if (opts.action && opts.onAction) {
      children.push(el('span.rb-toast-action', { text: opts.action, onclick: function () {
        opts.onAction();
        entry.dismiss();
      } }));
    }
    var node = el('div.rb-toast.is-' + kind, null, children);
    host.appendChild(node);

    var timer = null;
    entry = {
      message: message, kind: kind,
      dismiss: function () {
        if (timer) { clearTimeout(timer); timer = null; }
        if (node.parentNode) node.parentNode.removeChild(node);
        var i = activeToasts.indexOf(entry);
        if (i !== -1) activeToasts.splice(i, 1);
      },
      refresh: function (ms) { if (timer) clearTimeout(timer); timer = setTimeout(entry.dismiss, ms); }
    };
    entry.refresh(dur);
    activeToasts.push(entry);

    // Cap the stack: drop the oldest beyond the limit so popups never pile up.
    while (activeToasts.length > MAX_TOASTS) activeToasts[0].dismiss();

    return { dismiss: entry.dismiss };
  }

  // ---- Segmented control --------------------------------------------------
  function segmented(options, opts) {
    opts = opts || {};
    var value = opts.value != null ? opts.value : (options[0] && options[0].value);
    var buttons = {};
    var root = el('div.rb-segmented', { role: 'tablist' });
    options.forEach(function (o) {
      var b = el('button', {
        type: 'button',
        title: o.title || o.label,
        onclick: function () { set(o.value, true); }
      }, [o.label]);
      buttons[o.value] = b;
      root.appendChild(b);
    });
    function set(v, fire) {
      value = v;
      for (var k in buttons) {
        if (buttons.hasOwnProperty(k)) buttons[k].classList.toggle('is-active', k === String(v));
      }
      if (fire && opts.onChange) opts.onChange(v);
    }
    set(value, false);
    return { el: root, set: function (v) { set(v, false); }, get: function () { return value; } };
  }

  // ---- Numeric field (with scrubbable label) ------------------------------
  function numberField(opts) {
    opts = opts || {};
    var value = opts.value != null ? opts.value : 0;
    var min = opts.min != null ? opts.min : -Infinity;
    var max = opts.max != null ? opts.max : Infinity;
    var step = opts.step || 0.01;
    var decimals = opts.decimals != null ? opts.decimals : 2;

    var input = el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: format(value),
      'aria-label': opts.label || 'value'
    });
    var children = [];
    if (opts.label) {
      children.push(el('label', { text: opts.label, title: 'Drag to scrub' }));
    }
    children.push(input);
    if (opts.suffix) children.push(el('span.rb-suffix', { text: opts.suffix }));
    var root = el('div.rb-field', { style: opts.width ? { width: opts.width } : null }, children);

    function format(v) {
      return R.units.round(v, decimals);
    }
    function clamp(v) { return v < min ? min : v > max ? max : v; }
    function commit(v, fire) {
      value = clamp(v);
      input.value = format(value);
      root.classList.remove('is-invalid');
      if (fire && opts.onChange) opts.onChange(value);
    }

    on(input, 'change', function () {
      var n = R.units.parseNumber(input.value);
      if (n == null) { root.classList.add('is-invalid'); return; }
      commit(n, true);
    });
    on(input, 'keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
        var n = (R.units.parseNumber(input.value) || 0) + d;
        commit(n, true);
      }
    });

    // Drag the label to scrub the value. Pointer Lock hides the cursor and
    // reports unbounded relative motion, so scrubbing never stalls when the
    // pointer reaches the edge of the screen (the way After Effects and Flow
    // scrub their fields). movementX works with or without the lock, so this
    // still scrubs if the lock is refused. We track on the document so a fast
    // drag that leaves the small label keeps scrubbing.
    if (opts.label) {
      var labelEl = root.querySelector('label');
      var dragging = false;

      function onMove(e) {
        if (!dragging) return;
        var dx = e.movementX || 0;
        if (!dx) return;
        commit((R.units.parseNumber(input.value) || 0) + dx * step * (e.shiftKey ? 10 : 1), true);
      }
      function onLockChange() {
        if (dragging && !document.pointerLockElement) endDrag();
      }
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', endDrag, true);
        document.removeEventListener('pointerlockchange', onLockChange, false);
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        root.classList.remove('is-scrubbing');
      }
      on(labelEl, 'pointerdown', function (e) {
        e.preventDefault();
        dragging = true;
        root.classList.add('is-scrubbing');
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', endDrag, true);
        document.addEventListener('pointerlockchange', onLockChange, false);
        if (labelEl.requestPointerLock) {
          try { labelEl.requestPointerLock(); } catch (err) { /* lock refused; movementX still scrubs */ }
        }
      });
    }

    return {
      el: root,
      get: function () { return value; },
      set: function (v) { commit(v, false); }
    };
  }

  // ---- Slider (range + value readout) -------------------------------------
  function slider(opts) {
    opts = opts || {};
    var value = opts.value != null ? opts.value : 0;
    var fmt = opts.format || function (v) { return R.units.round(v, 2); };
    var valEl = el('span.rb-slider-val', { text: fmt(value) });
    var range = el('input', {
      type: 'range',
      min: opts.min != null ? opts.min : 0,
      max: opts.max != null ? opts.max : 1,
      step: opts.step || 0.01,
      value: value
    });
    var root = el('div.rb-slider', null, [
      el('div.rb-slider-head', null, [
        el('span.rb-slider-name', { text: opts.label || '' }),
        valEl
      ]),
      range
    ]);
    on(range, 'input', function () {
      value = parseFloat(range.value);
      valEl.textContent = fmt(value);
      if (opts.onInput) opts.onInput(value);
    });
    on(range, 'change', function () {
      if (opts.onChange) opts.onChange(value);
    });
    return {
      el: root,
      get: function () { return value; },
      set: function (v) { value = v; range.value = v; valEl.textContent = fmt(v); }
    };
  }

  // ---- Toggle -------------------------------------------------------------
  function toggle(opts) {
    opts = opts || {};
    var value = !!opts.value;
    var root = el('label.rb-toggle', null, [
      el('span.rb-toggle-track'),
      opts.label ? el('span', { text: opts.label }) : null
    ]);
    function set(v, fire) {
      value = !!v;
      root.classList.toggle('is-on', value);
      if (fire && opts.onChange) opts.onChange(value);
    }
    on(root, 'click', function () { set(!value, true); });
    set(value, false);
    return { el: root, get: function () { return value; }, set: function (v) { set(v, false); } };
  }

  // ---- Labelled control row ----------------------------------------------
  function row(label, control) {
    return el('div.rb-control-row', null, [el('label', { text: label }), control]);
  }

  R.ui = R.ui || {};
  R.ui.toast = toast;
  R.ui.segmented = segmented;
  R.ui.numberField = numberField;
  R.ui.slider = slider;
  R.ui.toggle = toggle;
  R.ui.row = row;
})(window.Rebound = window.Rebound || {});
