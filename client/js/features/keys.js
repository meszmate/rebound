/*
 * Rebound, Keyframe utilities.
 * Interpolation-type setters for the selected (or all) keyframes: Linear, Hold,
 * Bezier, Easy Ease (both / in only / out only with a settable influence), Auto
 * Bezier, Continuous Bezier, and Rove.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

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
      var grid = el('div.rb-wgt-pick', { style: { gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', gridAutoRows: '1fr' } });
      types.forEach(function (t) {
        grid.appendChild(el('button.rb-wgt-picktile', { type: 'button', title: 'Set ' + t.label,
          onclick: function () { set(ctx, t.type, { inInfluence: inInfluence, outInfluence: outInfluence, allKeys: allKeys }); } },
        [el('span.rb-wgt-picktile-name', { text: t.label })]));
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
        case 'easyEaseIn': return { type: 'bezier', x1: outInfluence / 100, y1: 0, x2: 1, y2: 1 };
        case 'easyEaseOut': return { type: 'bezier', x1: 0, y1: 0, x2: 1 - inInfluence / 100, y2: 1 };
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
        } }, [t.label]);
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
