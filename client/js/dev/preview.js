/*
 * Rebound, dev-only preview driver (NOT shipped in the extension).
 *
 * Loaded by tools/serve.mjs ONLY when the panel is opened with a `?preview=1`
 * query string, so index.html / main.js stay untouched. It:
 *   - pins #rb-app to a deterministic AE-dock size, so a headless screenshot and
 *     a Figma DOM capture of #rb-app are identical regardless of window size,
 *   - feeds the panel a realistic fake selection (there is no host in a browser),
 *   - drives the shell into one named screen so each screen is a stable URL.
 *
 * URL params (all optional, WORKING as of the harness fix — each screen is
 * driven through the shell's real APIs and verified, and a failure is loud:
 * a red banner, console.error, and data-preview-error on <html>):
 *   screen = home                 the configurable Home board (default)
 *          | browse:<sectionId>   a category, e.g. browse:ease, browse:physics
 *          | search:<query>       search results, e.g. search:spring
 *          | tool:<toolId>        a focused tool, e.g. tool:ease, tool:align
 *          | settings             the in-panel Settings modal
 *          | add                  the Home's "Add to Home" browser sheet
 *   w, h   = panel width / height in px         (default 400 x 880)
 *   sel    = segment | layers | none            (default segment — a live ease)
 *
 * The page marks itself ready with data-preview-ready="1" on <html>, so a
 * headless screenshot (or Figma capture) can wait on it.
 *
 * Figma capture params travel in the hash (#figmacapture=...&figmadelay=...) and
 * are read by Figma's own capture.js, so they never collide with these.
 */
;(function () {
  'use strict';

  var q = new window.URLSearchParams(window.location.search);
  if (!q.has('preview')) return;

  var screen = q.get('screen') || 'home';
  var w = parseInt(q.get('w'), 10) || 400;
  var h = parseInt(q.get('h'), 10) || 880;
  var selKey = q.get('sel') || 'segment';

  // Deterministic panel box, top-left. No shadow/border so the captured node is
  // exactly the panel (the Figma page adds its own framing).
  var style = document.createElement('style');
  style.textContent =
    'html,body{background:#0d0e10;margin:0;}' +
    '#rb-app{position:fixed;top:0;left:0;width:' + w + 'px;height:' + h + 'px;overflow:hidden;}';
  document.head.appendChild(style);

  // Selections shaped like system.selectionSummary, so the classifier lights up
  // the same UI it would inside After Effects.
  var SELS = {
    none: { hasComp: true, totalSelectedKeys: 0, selectedLayerCount: 0, properties: [] },
    segment: {
      hasComp: true, totalSelectedKeys: 2, selectedLayerCount: 1,
      layerKind: 'shape', layerKinds: ['shape'],
      layers: [{ name: 'Hero title' }],
      properties: [{
        layerName: 'Hero title', name: 'Position',
        selectedKeys: [0, 1], canVaryOverTime: true, hasExpression: false,
        interpInType: 'BEZIER', interpOutType: 'BEZIER',
        currentEase: {
          curve: { type: 'bezier', x1: 0.33, y1: 0, x2: 0.67, y2: 1 },
          inInfluence: 33, outInfluence: 33
        }
      }]
    },
    layers: {
      hasComp: true, totalSelectedKeys: 0, selectedLayerCount: 3,
      layerKind: 'shape', layerKinds: ['shape', 'shape', 'shape'],
      layers: [{ name: 'Card' }], properties: []
    }
  };

  function railBtn(title) { return document.querySelector('.rb-rail-btn[title="' + title + '"]'); }

  // Figma's capture.js serializes the DOM's *attributes*, but form state lives in
  // live JS properties (input.value, checkbox.checked, the selected <option>), so
  // captured fields come through blank. Mirror the live state back onto attributes
  // so bezier points, the gradient position, the search query, etc. are captured.
  function syncFormValues() {
    var inputs = document.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked');
      } else if (el.value != null) {
        el.setAttribute('value', el.value);
      }
    }
    var tas = document.querySelectorAll('textarea');
    for (var t = 0; t < tas.length; t++) tas[t].textContent = tas[t].value;
    var sels = document.querySelectorAll('select');
    for (var s = 0; s < sels.length; s++) {
      var opts = sels[s].options;
      for (var o = 0; o < opts.length; o++) {
        if (opts[o].selected) opts[o].setAttribute('selected', ''); else opts[o].removeAttribute('selected');
      }
    }
    decorateNativeControls();
  }

  // Native form controls draw their handle in the shadow DOM, which capture.js
  // cannot serialize — a range slider loses its thumb, a colour input its swatch.
  // Draw a real, capture-visible overlay that matches the CSS exactly.
  function decorateNativeControls() {
    var ranges = document.querySelectorAll('.rb-slider input[type="range"]');
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      var box = r.closest('.rb-slider');
      if (!box) continue;
      if (window.getComputedStyle(box).position === 'static') box.style.position = 'relative';
      var thumb = r.__capThumb;
      if (!thumb) {
        thumb = document.createElement('span');
        thumb.style.cssText = 'position:absolute;width:14px;height:14px;border-radius:50%;' +
          'background:var(--rb-accent);border:2px solid var(--rb-bg);box-sizing:border-box;' +
          'pointer-events:none;z-index:2;';
        box.appendChild(thumb);
        r.__capThumb = thumb;
      }
      var min = parseFloat(r.min) || 0;
      var max = parseFloat(r.max);
      if (isNaN(max)) max = 100;
      var val = parseFloat(r.value);
      if (isNaN(val)) val = min;
      var pct = max > min ? (val - min) / (max - min) : 0;
      var w = r.offsetWidth || box.clientWidth;
      thumb.style.left = (r.offsetLeft + pct * (w - 14)) + 'px';
      thumb.style.top = (r.offsetTop + (r.offsetHeight / 2) - 7) + 'px';
    }
    // Native colour inputs: paint the element with its own value so the swatch shows.
    var colors = document.querySelectorAll('input[type="color"]');
    for (var c = 0; c < colors.length; c++) colors[c].style.backgroundColor = colors[c].value;
  }

  // Loud failure: the whole point of the harness is trustworthy screenshots, so
  // a screen that did not actually come up must never pass silently.
  function fail(msg) {
    /* eslint-disable-next-line no-console */
    console.error('[rb-preview] ' + msg);
    document.documentElement.setAttribute('data-preview-error', msg);
    var banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;' +
      'background:#c0392b;color:#fff;font:12px sans-serif;padding:6px 10px;';
    banner.textContent = 'PREVIEW HARNESS FAILED: ' + msg;
    document.body.appendChild(banner);
  }

  function drive() {
    if (!window.Rebound || !Rebound.shell || !Rebound.shell.openTool || !Rebound._debug) {
      fail('panel never booted (Rebound.shell / Rebound._debug missing). Is js/dev/preview.js being injected by tools/serve.mjs?');
      return;
    }
    try {
      Rebound._debug.setSelection(SELS[selKey] || SELS.segment);
    } catch (e) {
      fail('setSelection threw: ' + (e.message || e));
      return;
    }

    var kind = screen.split(':')[0];
    var arg = screen.split(':')[1];
    var verify = null; // () -> true when the requested screen is actually up

    if (kind === 'browse') {
      var list = Rebound.toolMeta.SECTIONS;
      var sect = list.filter(function (s) { return s.id === (arg || 'ease'); })[0] || list[0];
      var b = railBtn(sect.name);
      if (!b) { fail('no rail button for section "' + sect.name + '"'); return; }
      b.click();
      verify = function () { return document.querySelector('#rb-app.is-view-browse .rb-card'); };
    } else if (kind === 'search') {
      var inp = document.querySelector('.rb-topbar input');
      if (!inp) { fail('no topbar search input in the DOM'); return; }
      inp.value = arg || 'spring';
      inp.dispatchEvent(new window.Event('input', { bubbles: true }));
      verify = function () { return document.querySelector('#rb-app.is-view-browse .rb-cat-head'); };
    } else if (kind === 'tool') {
      var toolId = arg || 'ease';
      Rebound.shell.openTool(toolId);
      verify = function () { return document.querySelector('.rb-tool[data-tool="' + toolId + '"]:not(.rb-hidden)'); };
    } else if (kind === 'settings') {
      var s = document.querySelector('.rb-home-head button[title="Settings"]') || railBtn('Settings');
      if (!s) { fail('no Settings button found'); return; }
      s.click();
      verify = function () { return document.querySelector('.rb-modal, .rb-modal-body'); };
    } else if (kind === 'add') {
      var add = document.querySelector('.rb-home-head button[title="Add to Home"]');
      if (!add) { fail('no "Add to Home" button on the Home header'); return; }
      add.click();
      verify = function () { return document.querySelector('.rb-home-browser'); };
    } else if (kind !== 'home') {
      fail('unknown screen "' + screen + '" (see the param list at the top of js/dev/preview.js)');
      return;
    }
    // 'home' is the default landing — nothing to drive.

    if (verify && !verify()) { fail('screen "' + screen + '" did not come up after driving it'); return; }

    // Keep attributes mirrored so capture.js serializes live form values whenever
    // it fires (after figmadelay). Cheap and idempotent; harmless in the browser.
    syncFormValues();
    setInterval(syncFormValues, 120);
    document.documentElement.setAttribute('data-preview-ready', '1');
  }

  var tries = 0;
  (function wait() {
    tries++;
    var ready = window.Rebound && Rebound.shell && Rebound.shell.openTool &&
      Rebound._debug && document.querySelector('.rb-rail');
    if (ready) { drive(); return; }
    if (tries > 240) { drive(); return; } // drive() reports exactly what is missing
    setTimeout(wait, 25);
  })();
})();
