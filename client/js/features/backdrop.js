/*
 * Rebound, Backdrop (background textures + stylize effects).
 * Generates a procedural background pattern (dots, grid, lines, cross, checker,
 * rings) in any custom color/spacing/size/opacity/angle, and can stamp common
 * stylize effects (Echo, Radial Blur, Chromatic Aberration) onto the selected
 * layers with their key settings. Kept separate from Pin Rig on purpose. The
 * preview renders the texture live.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;
  function r1(v) { return R.units.round(v, 1); }

  var PATTERNS = [
    { value: 'dots', label: 'Dots' }, { value: 'grid', label: 'Grid' }, { value: 'lines', label: 'Lines' },
    { value: 'cross', label: 'Cross' }, { value: 'checker', label: 'Checker' }, { value: 'rings', label: 'Rings' }
  ];

  function patternSvg(st, h) {
    var W = 160, H = 90, col = st.color, op = st.opacity / 100, sp = Math.max(6, st.spacing), sz = st.size;
    var kids = [svg('rect', { x: 0, y: 0, width: W, height: H, fill: st.transparent ? 'var(--rb-bg-sunken)' : st.bg })];
    var g = [], x, y;
    if (st.pattern === 'dots') { for (y = sp / 2; y < H; y += sp) for (x = sp / 2; x < W; x += sp) g.push(svg('circle', { cx: r1(x), cy: r1(y), r: r1(sz * 0.5), fill: col, 'fill-opacity': op })); }
    else if (st.pattern === 'grid') { for (x = 0; x <= W; x += sp) g.push(svg('line', { x1: r1(x), y1: -H, x2: r1(x), y2: 2 * H, stroke: col, 'stroke-width': r1(sz * 0.3), 'stroke-opacity': op })); for (y = 0; y <= H; y += sp) g.push(svg('line', { x1: -W, y1: r1(y), x2: 2 * W, y2: r1(y), stroke: col, 'stroke-width': r1(sz * 0.3), 'stroke-opacity': op })); }
    else if (st.pattern === 'lines') { for (x = -H; x < W + H; x += sp) g.push(svg('line', { x1: r1(x), y1: -H, x2: r1(x), y2: 2 * H, stroke: col, 'stroke-width': r1(sz * 0.45), 'stroke-opacity': op })); }
    else if (st.pattern === 'cross') { for (y = sp / 2; y < H; y += sp) for (x = sp / 2; x < W; x += sp) { g.push(svg('line', { x1: r1(x - sz * 0.5), y1: r1(y), x2: r1(x + sz * 0.5), y2: r1(y), stroke: col, 'stroke-width': r1(sz * 0.25), 'stroke-opacity': op })); g.push(svg('line', { x1: r1(x), y1: r1(y - sz * 0.5), x2: r1(x), y2: r1(y + sz * 0.5), stroke: col, 'stroke-width': r1(sz * 0.25), 'stroke-opacity': op })); } }
    else if (st.pattern === 'checker') { var i = 0; for (y = -H; y < 2 * H; y += sp) { var j = 0; for (x = -W; x < 2 * W; x += sp) { if ((i + j) % 2 === 0) g.push(svg('rect', { x: r1(x), y: r1(y), width: r1(sp), height: r1(sp), fill: col, 'fill-opacity': op })); j++; } i++; } }
    else if (st.pattern === 'rings') { for (y = sp; y < H + sp; y += sp * 1.4) for (x = sp; x < W + sp; x += sp * 1.4) g.push(svg('circle', { cx: r1(x), cy: r1(y), r: r1(sz * 0.6), fill: 'none', stroke: col, 'stroke-width': r1(sz * 0.2), 'stroke-opacity': op })); }
    kids.push(svg('g', { transform: 'rotate(' + r1(st.angle) + ' 80 45)' }, g));
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var BACKDROP_DEFAULTS = [
    { name: 'Blue dots', state: { pattern: 'dots', color: '#39C2FF', transparent: false, bg: '#0E1116', spacing: 16, size: 5, opacity: 70 } },
    { name: 'Blueprint grid', state: { pattern: 'grid', color: '#3A6EA5', transparent: false, bg: '#0B1A2B', spacing: 14, size: 4, opacity: 60 } },
    { name: 'Diagonal lines', state: { pattern: 'lines', color: '#FFFFFF', transparent: false, bg: '#15161A', spacing: 12, size: 4, opacity: 14, angle: 45 } },
    { name: 'Checker', state: { pattern: 'checker', color: '#222', transparent: false, bg: '#1A1B1F', spacing: 20, size: 20, opacity: 100 } },
    { name: 'Rings', state: { pattern: 'rings', color: '#FF5C8A', transparent: true, spacing: 22, size: 16, opacity: 40 } }
  ];
  R.toolPresets.declare('backdrop', { defaults: BACKDROP_DEFAULTS });

  R.tools.register({
    id: 'backdrop',
    title: 'Backdrop',
    group: 'Generators',
    order: 5,
    keywords: ['backdrop', 'background', 'texture', 'pattern', 'dots', 'grid', 'lines', 'checker', 'echo', 'radial blur', 'chromatic aberration', 'effect'],
    mount: mount
  });

  function mount(ctx) {
    var st = { pattern: 'dots', color: '#39C2FF', transparent: true, bg: '#101216', spacing: 18, size: 6, opacity: 60, angle: 0,
      echo: false, echoTime: -0.03, echoes: 6, echoDecay: 0.7,
      rblur: false, rblurAmount: 12, rblurType: 'spin',
      ca: false, caAmount: 6 };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(patternSvg(st, 90)); }

    var pickers = [];
    function picker(key) { var cp = ui.colorPicker({ value: st[key], storageKey: 'backdrop-colors', onChange: function (c) { st[key] = c.hex; renderPreview(); } }); pickers.push(cp); return cp; }
    var colorCp = picker('color');
    var bgCp = picker('bg');

    var patSeg = ui.segmented(PATTERNS, { value: st.pattern, onChange: function (v) { st.pattern = v; renderPreview(); } });
    var transTog = ui.toggle({ label: 'Transparent background', value: st.transparent, onChange: function (v) { st.transparent = v; bgRow.style.display = v ? 'none' : ''; renderPreview(); } });
    var bgRow = ui.row('Background', bgCp.el); bgRow.style.display = st.transparent ? 'none' : '';
    var spacingS = ui.slider({ label: 'Spacing', min: 6, max: 80, step: 1, value: st.spacing, format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { st.spacing = v; renderPreview(); } });
    var sizeS = ui.slider({ label: 'Size', min: 1, max: 30, step: 0.5, value: st.size, format: function (v) { return R.units.round(v, 1) + 'px'; }, onInput: function (v) { st.size = v; renderPreview(); } });
    var opacityS = ui.slider({ label: 'Opacity', min: 5, max: 100, step: 1, value: st.opacity, format: function (v) { return Math.round(v) + '%'; }, onInput: function (v) { st.opacity = v; renderPreview(); } });
    var angleS = ui.slider({ label: 'Angle', min: 0, max: 180, step: 1, value: st.angle, format: function (v) { return Math.round(v) + '°'; }, onInput: function (v) { st.angle = v; renderPreview(); } });

    // Effects
    function effSlider(o) { return ui.slider(o); }
    var echoTimeS = effSlider({ label: 'Echo time', min: -0.2, max: 0, step: 0.005, value: st.echoTime, format: function (v) { return R.units.round(v, 3) + 's'; }, onInput: function (v) { st.echoTime = v; } });
    var echoesS = effSlider({ label: 'Echoes', min: 1, max: 30, step: 1, value: st.echoes, format: function (v) { return Math.round(v); }, onInput: function (v) { st.echoes = v; } });
    var echoDecayS = effSlider({ label: 'Decay', min: 0, max: 1, step: 0.01, value: st.echoDecay, format: function (v) { return R.units.round(v, 2); }, onInput: function (v) { st.echoDecay = v; } });
    var echoBox = el('div.rb-col', null, [echoTimeS.el, echoesS.el, echoDecayS.el]);
    var echoTog = ui.toggle({ label: 'Echo', value: st.echo, onChange: function (v) { st.echo = v; echoBox.style.display = v ? '' : 'none'; } });
    echoBox.style.display = 'none';

    var rblurAmountS = effSlider({ label: 'Blur amount', min: 0, max: 100, step: 1, value: st.rblurAmount, format: function (v) { return Math.round(v); }, onInput: function (v) { st.rblurAmount = v; } });
    var rblurTypeSeg = ui.segmented([{ value: 'spin', label: 'Spin' }, { value: 'zoom', label: 'Zoom' }], { value: st.rblurType, onChange: function (v) { st.rblurType = v; } });
    var rblurBox = el('div.rb-col', null, [rblurAmountS.el, ui.row('Type', rblurTypeSeg.el)]);
    var rblurTog = ui.toggle({ label: 'Radial blur', value: st.rblur, onChange: function (v) { st.rblur = v; rblurBox.style.display = v ? '' : 'none'; } });
    rblurBox.style.display = 'none';

    var caAmountS = effSlider({ label: 'Aberration', min: 0, max: 30, step: 0.5, value: st.caAmount, format: function (v) { return R.units.round(v, 1) + 'px'; }, onInput: function (v) { st.caAmount = v; } });
    var caBox = el('div.rb-col', null, [caAmountS.el]);
    var caTog = ui.toggle({ label: 'Chromatic aberration', value: st.ca, onChange: function (v) { st.ca = v; caBox.style.display = v ? '' : 'none'; } });
    caBox.style.display = 'none';

    var applyFxBtn = el('button.rb-btn', { type: 'button', onclick: doEffects }, ['Apply effects to selection']);

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Make a custom textured background, or stamp stylize effects onto the selected layers.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Texture' }),
      ui.row('Pattern', patSeg.el),
      ui.row('Color', colorCp.el),
      transTog.el, bgRow,
      spacingS.el, sizeS.el, opacityS.el, angleS.el,
      el('div.rb-section-label', { text: 'Effects (on selected layers)' }),
      echoTog.el, echoBox,
      rblurTog.el, rblurBox,
      caTog.el, caBox,
      el('div.rb-row.rb-wrap', null, [applyFxBtn])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doMake }, ['Make background']));
    var off = ctx.onSelection(function (sel) { scopeText.textContent = sel && sel.hasComp ? (sel.selectedLayerCount + ' selected') : 'Open a composition'; });
    scopeText.textContent = 'Open a composition';

    function doMake() {
      ctx.invoke('backdrop.make', st)
        .then(function () { ctx.toast('Added a ' + st.pattern + ' background', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not make the background', { kind: 'error' }); });
    }
    function doEffects() {
      if (!st.echo && !st.rblur && !st.ca) { ctx.toast('Turn on an effect first.', { kind: 'info' }); return; }
      ctx.invoke('backdrop.effects', st)
        .then(function (res) { ctx.toast('Applied effects to ' + res.applied + ' layer' + (res.applied === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not apply effects', { kind: 'error' }); });
    }

    function getState() { var o = {}; for (var k in st) if (st.hasOwnProperty(k)) o[k] = st[k]; return o; }
    function applyState(s) {
      if (!s) return;
      for (var k in s) if (s.hasOwnProperty(k) && st.hasOwnProperty(k)) st[k] = s[k];
      pickers[0].set(st.color); pickers[1].set(st.bg);
      patSeg.set(st.pattern); transTog.set(st.transparent); bgRow.style.display = st.transparent ? 'none' : '';
      spacingS.set(st.spacing); sizeS.set(st.size); opacityS.set(st.opacity); angleS.set(st.angle);
      echoTog.set(st.echo); echoBox.style.display = st.echo ? '' : 'none';
      echoTimeS.set(st.echoTime); echoesS.set(st.echoes); echoDecayS.set(st.echoDecay);
      rblurTog.set(st.rblur); rblurBox.style.display = st.rblur ? '' : 'none'; rblurTypeSeg.set(st.rblurType);
      rblurAmountS.set(st.rblurAmount);
      caTog.set(st.ca); caBox.style.display = st.ca ? '' : 'none';
      caAmountS.set(st.caAmount);
      renderPreview();
    }

    return {
      presets: {
        toolId: 'backdrop', get: getState, set: applyState,
        thumbFor: function (s, opts) { return patternSvg(s, (opts && opts.height) || 34); },
        defaults: BACKDROP_DEFAULTS
      },
      destroy: function () { for (var i = 0; i < pickers.length; i++) pickers[i].destroy(); off(); }
    };
  }
})(window.Rebound = window.Rebound || {});
