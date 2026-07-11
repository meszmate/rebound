/*
 * Rebound, Keyframe utilities.
 * Interpolation-type setters for the selected (or all) keyframes: Linear, Hold,
 * Bezier, Easy Ease (both / in only / out only with a settable influence), Auto
 * Bezier, Continuous Bezier, and Rove.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // A small inline glyph per interpolation type, echoing AE's keyframe icons:
  // diamond = linear, half diamond = ease in/out, hourglass = easy ease,
  // square = hold, circle = auto bezier, circle + line = continuous, dashed
  // diamond = rove. Rendered before the label in the widget grid and the
  // full-tool buttons so the types can be told apart at a glance.
  function glyph(type) {
    var kids;
    var stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2, 'stroke-linejoin': 'round' };
    var fill = { fill: 'currentColor' };
    function shape(name, attrs, base) {
      var a = { }, k;
      for (k in base) { if (base.hasOwnProperty(k)) a[k] = base[k]; }
      for (k in attrs) { if (attrs.hasOwnProperty(k)) a[k] = attrs[k]; }
      return svg(name, a);
    }
    var DIAMOND = 'M7 1.8 L12.2 7 L7 12.2 L1.8 7 Z';
    switch (type) {
      case 'linear':
        kids = [shape('path', { d: DIAMOND }, stroke)];
        break;
      case 'hold':
        kids = [shape('rect', { x: 2.8, y: 2.8, width: 8.4, height: 8.4 }, stroke)];
        break;
      case 'bezier':
        kids = [shape('path', { d: DIAMOND }, stroke), shape('circle', { cx: 7, cy: 7, r: 1.6 }, fill)];
        break;
      case 'easyEase':
        // The AE easy-ease hourglass: two triangles pointing into the key.
        kids = [shape('path', { d: 'M1.8 7 L6 3.2 L6 10.8 Z' }, fill), shape('path', { d: 'M12.2 7 L8 3.2 L8 10.8 Z' }, fill)];
        break;
      case 'easyEaseIn':
        // The incoming (left) half of the diamond is eased.
        kids = [shape('path', { d: DIAMOND }, stroke), shape('path', { d: 'M7 1.8 L7 12.2 L1.8 7 Z' }, fill)];
        break;
      case 'easyEaseOut':
        // The outgoing (right) half of the diamond is eased.
        kids = [shape('path', { d: DIAMOND }, stroke), shape('path', { d: 'M7 1.8 L12.2 7 L7 12.2 Z' }, fill)];
        break;
      case 'autoBezier':
        kids = [shape('circle', { cx: 7, cy: 7, r: 4.6 }, stroke)];
        break;
      case 'continuous':
        kids = [shape('circle', { cx: 7, cy: 7, r: 4.6 }, stroke), shape('line', { x1: 1, y1: 7, x2: 13, y2: 7 }, stroke)];
        break;
      case 'roving':
        kids = [shape('path', { d: DIAMOND, 'stroke-dasharray': '2 2' }, stroke)];
        break;
      default:
        kids = [shape('path', { d: DIAMOND }, stroke)];
    }
    return svg('svg', {
      viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': 'true',
      style: 'flex: 0 0 auto; vertical-align: -2px; margin-right: 5px;'
    }, kids);
  }

  R.tools.register({
    id: 'keys',
    title: 'Keyframes',
    group: 'Timing',
    order: 2,
    keywords: ['keyframe', 'interpolation', 'linear', 'hold', 'easy ease', 'bezier', 'rove', 'auto', 'continuous'],
    mount: mount,
    commands: [
      { id: 'easyEase', title: 'Easy ease selected keys', run: function (ctx) { set(ctx, 'easyEase'); } }
    ]
  });

  // Grouped so the panel reads as Basic / Ease / Smooth rows.
  var GROUPS = [
    { label: 'Basic', types: [
      { type: 'linear', label: 'Linear' },
      { type: 'hold', label: 'Hold' },
      { type: 'bezier', label: 'Bezier' }
    ] },
    { label: 'Ease', types: [
      { type: 'easyEase', label: 'Easy Ease' },
      { type: 'easyEaseIn', label: 'Ease In' },
      { type: 'easyEaseOut', label: 'Ease Out' }
    ] },
    { label: 'Smooth', types: [
      { type: 'autoBezier', label: 'Auto Bezier' },
      { type: 'continuous', label: 'Continuous' },
      { type: 'roving', label: 'Rove' }
    ] }
  ];

  function mount(ctx) {
    var inInfluence = 33.33;
    var outInfluence = 33.33;
    var allKeys = false;

    // Widget: the interpolation types as a 3x3 grid of buttons that fills the box;
    // click one to set the selected keyframes. The curve preview, influence fields
    // and the All-keys toggle live in the full tool, via the open control.
    if (ctx.widget) {
      var types = [];
      GROUPS.forEach(function (g) { g.types.forEach(function (t) { types.push(t); }); });
      var grid = el('div.rb-wgt-pick', { style: { gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '1fr' } });
      types.forEach(function (t) {
        grid.appendChild(el('button.rb-wgt-picktile', { type: 'button', title: 'Set ' + t.label,
          onclick: function () { set(ctx, t.type, { inInfluence: inInfluence, outInfluence: outInfluence, allKeys: allKeys }); } },
        [glyph(t.type), el('span.rb-wgt-picktile-name', { text: t.label })]));
      });
      ctx.body.appendChild(el('div.rb-wgt', null, [grid]));
      return { destroy: function () {} };
    }

    // A preview of how the keyframe interpolation behaves. It shows the easy-ease
    // shape the influences produce, and previews any type you hover so you can
    // see how it animates before applying.
    var curveHost = el('div', { style: { display: 'flex', justifyContent: 'center' } });
    var curveCaption = el('div', { text: 'Easy Ease', style: { textAlign: 'center', color: 'var(--rb-text-muted)', fontSize: '11px', marginTop: '4px' } });
    var previewBox = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '8px' } }, [curveHost, curveCaption]);

    function influenceCurve() { return { type: 'bezier', x1: outInfluence / 100, y1: 0, x2: 1 - inInfluence / 100, y2: 1 }; }
    function keyCurve(type) {
      switch (type) {
        case 'linear': return { type: 'bezier', x1: 0, y1: 0, x2: 1, y2: 1 };
        case 'hold': return { type: 'fn', fn: function (t) { return t < 1 ? 0 : 1; } };
        case 'bezier': return { type: 'bezier', x1: 0.4, y1: 0.2, x2: 0.6, y2: 0.8 };
        case 'easyEaseIn': return { type: 'bezier', x1: 0, y1: 0, x2: 1 - inInfluence / 100, y2: 1 };
        case 'easyEaseOut': return { type: 'bezier', x1: outInfluence / 100, y1: 0, x2: 1, y2: 1 };
        case 'autoBezier': return { type: 'bezier', x1: 0.33, y1: 0, x2: 0.67, y2: 1 };
        case 'continuous': return { type: 'bezier', x1: 0.25, y1: 0.1, x2: 0.75, y2: 0.9 };
        case 'roving': return { type: 'bezier', x1: 0, y1: 0, x2: 1, y2: 1 };
        default: return influenceCurve();
      }
    }
    function renderCurve(c, caption) {
      R.dom.clear(curveHost);
      curveHost.appendChild(R.ui.curveChip(c || influenceCurve(), { width: 240, height: 92 }));
      curveCaption.textContent = caption || 'Easy Ease';
    }

    var inField = ui.numberField({ label: 'Influence In', value: inInfluence, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%', onChange: function (v) { inInfluence = v; renderCurve(); } });
    var outField = ui.numberField({ label: 'Influence Out', value: outInfluence, min: 0.1, max: 100,
      step: 0.1, decimals: 2, suffix: '%', width: '100%', onChange: function (v) { outInfluence = v; renderCurve(); } });

    var PROFILES = [
      { label: 'Soft', inI: 75, outI: 75 },
      { label: 'Natural', inI: 50, outI: 50 },
      { label: 'Snappy', inI: 90, outI: 20 }
    ];
    var profileRow = el('div.rb-row.rb-wrap', null, PROFILES.map(function (pf) {
      return el('button.rb-btn.is-ghost', { title: 'Set influence to ' + pf.inI + ' / ' + pf.outI, onclick: function () {
        inInfluence = pf.inI; outInfluence = pf.outI; inField.set(pf.inI); outField.set(pf.outI); renderCurve();
      } }, [pf.label]);
    }));

    var allToggle = ui.toggle({ label: 'All keys (not just selected)', value: allKeys,
      title: 'Apply to every keyframe on the selected properties, not only the ones you picked.',
      onChange: function (v) { allKeys = v; } });

    function half(node) { return el('div', { style: { flex: '1 1 96px', minWidth: '96px' } }, [node]); }

    var body = el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Set the interpolation of the selected keyframes. Hover a type to see how it animates; the influence below shapes the eased types.' }),
      previewBox
    ]);
    GROUPS.forEach(function (g) {
      body.appendChild(el('div.rb-section-label', { text: g.label }));
      body.appendChild(el('div.rb-row.rb-wrap', null, g.types.map(function (t) {
        var b = el('button.rb-btn', { title: t.label, onclick: function () {
          set(ctx, t.type, { inInfluence: inInfluence, outInfluence: outInfluence, allKeys: allKeys });
        } }, [glyph(t.type), t.label]);
        b.addEventListener('pointerenter', function () { renderCurve(keyCurve(t.type), t.label); });
        b.addEventListener('pointerleave', function () { renderCurve(); });
        return b;
      })));
    });
    body.appendChild(el('div.rb-section-label', { text: 'Easy Ease influence' }));
    body.appendChild(profileRow);
    body.appendChild(el('div.rb-row.rb-wrap', null, [half(inField.el), half(outField.el)]));
    body.appendChild(allToggle.el);
    renderCurve();
    ctx.body.appendChild(body);

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = sel && sel.hasComp
        ? (sel.totalSelectedKeys ? sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected' : (allKeys ? 'Targeting all keys' : 'Select keyframes'))
        : 'Open a composition';
    });
    return { destroy: off };
  }

  function set(ctx, type, opts) {
    var args = { type: type };
    if (opts) {
      args.inInfluence = opts.inInfluence;
      args.outInfluence = opts.outInfluence;
      args.allKeys = opts.allKeys;
    }
    ctx.invoke('keys.setInterp', args)
      .then(function (res) { ctx.toast('Set ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' }); })
      .catch(function (err) { ctx.toast(err.message || 'Could not set keyframes', { kind: 'error' }); });
  }
})(window.Rebound = window.Rebound || {});
