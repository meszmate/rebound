/*
 * Rebound, custom color picker (R.ui.colorPicker).
 * A real picker: a saturation/value square, a hue strip, an optional alpha
 * strip, a hex field, and recent swatches. No native <input type=color> (CEP's
 * is unreliable and unthemeable). Returns { r, g, b } in 0..1 for AE setValue,
 * plus hex and a. Shared by any tool that needs full theming, and also
 * intercepts clicks on <input type="color"> across the app so CEP always gets
 * an active, working color picker popover.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el, on = R.dom.on;
  var activeClose = null;

  function clamp(v, a, b) {
    if (v == null || isNaN(v)) return a;
    return v < a ? a : (v > b ? b : v);
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * (((b - r) / d) + 2);
      else h = 60 * (((r - g) / d) + 4);
      if (h < 0) h += 360;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  function rgbToHex(r, g, b) {
    function h(n) { var s = clamp(Math.round(n), 0, 255).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(r) + h(g) + h(b);
  }

  function hexToRgb(hex) {
    var s = String(hex == null ? '' : hex).trim().replace(/^#+/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) {
      s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    } else if (/^[0-9a-f]{8}$/i.test(s)) {
      s = s.substring(0, 6);
    } else if (!/^[0-9a-f]{6}$/i.test(s)) {
      return null;
    }
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function normHex(hex) {
    var c = hexToRgb(hex);
    return c ? rgbToHex(c[0], c[1], c[2]) : null;
  }

  function isValidHex(hex) {
    return !!hexToRgb(hex);
  }

  function selectAllOnFocus(inp) {
    var justFocused = false;
    on(inp, 'focus', function () {
      justFocused = true;
      try { inp.select(); } catch (e) { /* ignore */ }
    });
    on(inp, 'mouseup', function (e) {
      if (justFocused) {
        justFocused = false;
        e.preventDefault();
        try { inp.select(); } catch (err) { /* ignore */ }
      }
    });
    on(inp, 'blur', function () { justFocused = false; });
  }

  function colorPicker(opts) {
    opts = opts || {};
    var state = { h: 200, s: 0.7, v: 1, a: 1 };
    function setFromHex(hexStr) {
      var c = hexToRgb(hexStr);
      if (!c) return false;
      var hsv = rgbToHsv(c[0], c[1], c[2]);
      if (hsv[1] > 0 && hsv[2] > 0) state.h = hsv[0];
      state.s = hsv[1];
      state.v = hsv[2];
      return true;
    }
    if (opts.value) {
      if (typeof opts.value === 'string') setFromHex(opts.value);
      else if (opts.value.hex) { setFromHex(opts.value.hex); if (opts.value.a != null) state.a = opts.value.a; }
    }

    var sv = el('div.rb-cp-sv'); var svThumb = el('div.rb-cp-sv-thumb'); sv.appendChild(svThumb);
    var hue = el('div.rb-cp-hue'); var hueThumb = el('div.rb-cp-hue-thumb'); hue.appendChild(hueThumb);
    var alphaEl = opts.alpha ? el('div.rb-cp-alpha') : null;
    var alphaThumb = opts.alpha ? el('div.rb-cp-alpha-thumb') : null; if (alphaEl) alphaEl.appendChild(alphaThumb);
    var hexInput = el('input.rb-cp-hex', { type: 'text', spellcheck: 'false', 'aria-label': 'Hex color' });
    var recentsRow = el('div.rb-cp-recents');
    var popKids = [sv, hue]; if (alphaEl) popKids.push(alphaEl); popKids.push(el('div.rb-cp-row', null, [hexInput]), recentsRow);
    var pop = el('div.rb-cp-pop', null, popKids); pop.style.display = 'none';
    var swatch = el('span.rb-cp-swatch');
    var trigText = el('input.rb-cp-hex-text', { type: 'text', spellcheck: 'false', 'aria-label': 'Hex color' });
    var trigger = el('div.rb-cp-trigger', {
      role: 'button',
      tabindex: '0',
      'aria-expanded': 'false',
      title: opts.title || 'Pick a color'
    }, [swatch, trigText]);
    var root = el('div.rb-cp', null, [trigger, pop]);

    var open = false;
    var currentAnchor = null;
    var currentTargetInput = null;
    var onCloseCallback = null;

    function rgb() { return hsvToRgb(state.h, state.s, state.v); }
    function hex() { var c = rgb(); return rgbToHex(c[0], c[1], c[2]); }
    function valueObj() {
      var c = rgb();
      return { r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, hex: hex(), a: state.a };
    }
    function emit() { if (opts.onChange) opts.onChange(valueObj()); }
    function emitCommit() { if (opts.onCommit) opts.onCommit(valueObj()); }

    function paint(activeInput) {
      var hxv = hex();
      swatch.style.background = hxv;
      if (opts.alpha) swatch.style.opacity = state.a;
      if (activeInput !== trigText) {
        trigText.value = hxv;
        trigText.textContent = hxv;
        trigText.classList.remove('is-invalid');
      }
      sv.style.background = 'linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,hsl(' + Math.round(state.h) + ',100%,50%))';
      svThumb.style.left = (state.s * 100) + '%';
      svThumb.style.top = ((1 - state.v) * 100) + '%';
      svThumb.style.background = hxv;
      hueThumb.style.left = ((state.h / 360) * 100) + '%';
      if (alphaEl) {
        alphaEl.style.backgroundImage = 'linear-gradient(to right, rgba(0,0,0,0), ' + hxv + ')';
        alphaThumb.style.left = (state.a * 100) + '%';
      }
      if (activeInput !== hexInput) {
        hexInput.value = hxv;
        hexInput.classList.remove('is-invalid');
      }
    }

    function positionPop() {
      var a = currentAnchor || trigger;
      if (!a || !a.getBoundingClientRect) return;
      var r = a.getBoundingClientRect();
      var vw = window.innerWidth || document.documentElement.clientWidth || 320;
      var vh = window.innerHeight || document.documentElement.clientHeight || 520;
      var pw = Math.max(pop.offsetWidth || 0, 184);
      var ph = Math.max(pop.offsetHeight || 0, 196);
      var left = r.left;
      if (left + pw > vw - 8) left = r.right - pw;
      if (left + pw > vw - 8) left = vw - pw - 8;
      if (left < 8) left = 8;
      var top = r.bottom + 4;
      if (top + ph > vh - 8 && r.top - ph - 4 >= 8) {
        top = r.top - ph - 4;
      } else if (top + ph > vh - 8) {
        top = Math.max(8, vh - ph - 8);
      }
      pop.style.position = 'fixed';
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
      pop.style.zIndex = '1500';
    }

    function bindDrag(elm, handler) {
      if (!elm) return;
      var dragging = false;
      function start(e) {
        if (e.button != null && e.button !== 0) return;
        if (dragging) return;
        dragging = true;
        e.preventDefault();
        e.stopPropagation();
        handler(e);
        function move(ev) { handler(ev); }
        function up() {
          if (!dragging) return;
          dragging = false;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('mousemove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('mouseup', up);
          window.removeEventListener('pointercancel', up);
          pushRecent(hex());
          emitCommit();
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('mousemove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('mouseup', up);
        window.addEventListener('pointercancel', up);
      }
      on(elm, 'pointerdown', start);
      on(elm, 'mousedown', start);
    }

    function dragSV(e) {
      var r = sv.getBoundingClientRect();
      var w = r.width || 1, h = r.height || 1;
      state.s = clamp((e.clientX - r.left) / w, 0, 1);
      state.v = 1 - clamp((e.clientY - r.top) / h, 0, 1);
      paint(); emit();
    }
    function dragHue(e) {
      var r = hue.getBoundingClientRect();
      var w = r.width || 1;
      state.h = clamp((e.clientX - r.left) / w, 0, 1) * 360;
      paint(); emit();
    }
    function dragAlpha(e) {
      var r = alphaEl.getBoundingClientRect();
      var w = r.width || 1;
      state.a = Math.round(clamp((e.clientX - r.left) / w, 0, 1) * 100) / 100;
      paint(); emit();
    }
    bindDrag(sv, dragSV);
    bindDrag(hue, dragHue);
    if (alphaEl) bindDrag(alphaEl, dragAlpha);

    function wireHexField(inp) {
      selectAllOnFocus(inp);
      on(inp, 'input', function () {
        var raw = String(inp.value || '').trim();
        if (setFromHex(raw)) {
          inp.classList.remove('is-invalid');
          paint(inp);
          emit();
        } else if (/^#*([0-9a-f]{0,6})$/i.test(raw)) {
          inp.classList.remove('is-invalid');
        } else {
          inp.classList.add('is-invalid');
        }
      });
      function commitField() {
        if (setFromHex(inp.value)) {
          paint();
          emit();
          emitCommit();
          pushRecent(hex());
        } else {
          paint();
        }
      }
      on(inp, 'change', commitField);
      on(inp, 'blur', function () {
        if (setFromHex(inp.value)) {
          paint();
          pushRecent(hex());
        } else {
          paint();
        }
      });
      on(inp, 'keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commitField();
          closePop();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          paint();
          closePop();
        } else {
          e.stopPropagation();
        }
      });
    }
    wireHexField(hexInput);
    wireHexField(trigText);

    var recentKey = opts.storageKey || 'cp-recents';
    function recents() { return (R.store && R.store.get(recentKey, [])) || []; }
    function pushRecent(hxv) {
      if (!R.store) return;
      var list = recents().filter(function (x) { return x !== hxv; });
      list.unshift(hxv);
      if (list.length > 8) list.length = 8;
      R.store.set(recentKey, list);
      renderRecents();
    }
    function renderRecents() {
      R.dom.clear(recentsRow);
      recents().forEach(function (hxv) {
        recentsRow.appendChild(el('button.rb-cp-recent', {
          type: 'button',
          title: hxv,
          style: { background: hxv },
          onclick: function () { setFromHex(hxv); paint(); emit(); emitCommit(); }
        }));
      });
    }

    function openPop(openOpts) {
      openOpts = openOpts || {};
      if (activeClose && activeClose !== closePop) activeClose();
      activeClose = closePop;
      open = true;
      currentAnchor = openOpts.anchor || null;
      currentTargetInput = openOpts.targetInput || null;
      onCloseCallback = openOpts.onClose || null;
      root.classList.add('is-open');
      trigger.classList.add('is-active');
      trigger.setAttribute('aria-expanded', 'true');
      if (currentAnchor && currentAnchor.classList) currentAnchor.classList.add('is-active');
      if (currentTargetInput && currentTargetInput.classList) currentTargetInput.classList.add('is-active');
      if (document.body && pop.parentNode !== document.body) document.body.appendChild(pop);
      pop.style.display = '';
      paint(openOpts.keepFocus ? trigText : null);
      renderRecents();
      positionPop();
      if (!openOpts.keepFocus) {
        try { hexInput.focus(); hexInput.select(); } catch (e) { /* ignore */ }
      }
    }

    function closePop() {
      if (!open) return;
      open = false;
      if (activeClose === closePop) activeClose = null;
      pop.style.display = 'none';
      if (pop.parentNode !== root) root.appendChild(pop);
      root.classList.remove('is-open');
      trigger.classList.remove('is-active');
      trigger.setAttribute('aria-expanded', 'false');
      if (currentAnchor && currentAnchor.classList) currentAnchor.classList.remove('is-active');
      if (currentTargetInput && currentTargetInput.classList) currentTargetInput.classList.remove('is-active');
      currentAnchor = null;
      currentTargetInput = null;
      var cb = onCloseCallback;
      onCloseCallback = null;
      paint();
      if (cb) cb();
    }

    function toggle(openOpts) {
      if (open) closePop();
      else openPop(openOpts);
    }

    on(trigger, 'click', function (e) {
      if (e.target === trigText) {
        if (!open) openPop({ keepFocus: true });
        return;
      }
      toggle();
    });

    on(trigger, 'keydown', function (e) {
      if (e.target === trigText) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && /^#[0-9a-f]?$|^[0-9a-f]$/i.test(e.key)) {
        if (!open) openPop();
      }
    });

    function onDocDown(e) {
      if (!open) return;
      var t = e.target;
      if (root.contains(t) || pop.contains(t)) return;
      if (currentAnchor && currentAnchor.contains && currentAnchor.contains(t)) return;
      if (currentTargetInput && t === currentTargetInput) return;
      closePop();
    }
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('mousedown', onDocDown, true);

    function onWinKeyDown(e) {
      if (open && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        closePop();
      }
    }
    function onWinResize() {
      if (open) positionPop();
    }
    window.addEventListener('keydown', onWinKeyDown, true);
    window.addEventListener('resize', onWinResize);

    paint(); renderRecents();

    return {
      el: root,
      pop: pop,
      get: function () { return valueObj(); },
      set: function (v) {
        if (typeof v === 'string') setFromHex(v);
        else if (v) { if (v.hex) setFromHex(v.hex); if (v.a != null) state.a = v.a; }
        paint();
      },
      open: openPop,
      close: closePop,
      isOpen: function () { return open; },
      destroy: function () {
        closePop();
        if (pop.parentNode) pop.parentNode.removeChild(pop);
        document.removeEventListener('pointerdown', onDocDown, true);
        document.removeEventListener('mousedown', onDocDown, true);
        window.removeEventListener('keydown', onWinKeyDown, true);
        window.removeEventListener('resize', onWinResize);
      },
      _setCallbacks: function (cbs) {
        opts.onChange = cbs && cbs.onChange;
        opts.onCommit = cbs && cbs.onCommit;
      }
    };
  }

  // Shared floating picker for <input type="color"> elements and programmatic
  // popover callers (Palette modal, Color widget, Gradient stops, Appearance, Home).
  var sharedInstance = null;
  var sharedAnchor = null;
  var sharedTargetInput = null;

  function ensureShared() {
    if (sharedInstance) return sharedInstance;
    sharedInstance = colorPicker({ value: '#1fa6e0', storageKey: 'color-recents' });
    return sharedInstance;
  }

  function openColorPopover(anchorEl, popOpts) {
    popOpts = popOpts || {};
    var inst = ensureShared();
    var targetInp = popOpts.targetInput || null;
    if (inst.isOpen() && ((anchorEl && sharedAnchor === anchorEl) || (targetInp && sharedTargetInput === targetInp))) {
      inst.close();
      return inst;
    }
    sharedAnchor = anchorEl || null;
    sharedTargetInput = targetInp;
    inst._setCallbacks({
      onChange: function (c) {
        if (popOpts.onInput) popOpts.onInput(c);
        if (popOpts.onChange) popOpts.onChange(c);
      },
      onCommit: function (c) {
        if (popOpts.onCommit) popOpts.onCommit(c);
      }
    });
    if (popOpts.value) inst.set(popOpts.value);
    inst.open({
      anchor: anchorEl,
      targetInput: targetInp,
      onClose: function () {
        if (popOpts.onCommit) popOpts.onCommit(inst.get());
        if (popOpts.onClose) popOpts.onClose(inst.get());
        sharedAnchor = null;
        sharedTargetInput = null;
      }
    });
    return inst;
  }

  // Intercept clicks on any <input type="color"> so CEP never invokes the
  // broken/unimplemented native OS color chooser.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || String(t.type).toLowerCase() !== 'color') return;
    if (t.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    var anchor = t;
    if ((t.classList.contains('rb-wgt-cinput') || t.offsetWidth <= 2) && t.parentElement) {
      anchor = t.parentElement;
    }
    openColorPopover(anchor, {
      targetInput: t,
      value: t.value || '#1fa6e0',
      onInput: function (c) {
        t.value = c.hex;
        if (!t.classList.contains('rb-wgt-cinput')) t.style.backgroundColor = c.hex;
        t.dispatchEvent(new window.Event('input', { bubbles: true }));
      },
      onCommit: function (c) {
        t.value = c.hex;
        if (!t.classList.contains('rb-wgt-cinput')) t.style.backgroundColor = c.hex;
        t.dispatchEvent(new window.Event('change', { bubbles: true }));
      }
    });
  }, true);

  R.ui = R.ui || {};
  R.ui.colorPicker = colorPicker;
  R.ui.openColorPopover = openColorPopover;
  R.ui.selectAllOnFocus = selectAllOnFocus;
  R.ui.colorUtil = {
    hsvToRgb: hsvToRgb,
    rgbToHsv: rgbToHsv,
    rgbToHex: rgbToHex,
    hexToRgb: hexToRgb,
    normHex: normHex,
    isValidHex: isValidHex
  };
})(window.Rebound = window.Rebound || {});
