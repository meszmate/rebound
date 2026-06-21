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

    // The easy-ease shape these influences produce (out handle = outInfluence,
    // in handle = 1 - inInfluence), redrawn whenever the fields change.
    var curveHost = el('div', { style: { display: 'flex', justifyContent: 'center', padding: '6px', border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)' } });
    function renderCurve() {
      R.dom.clear(curveHost);
      curveHost.appendChild(R.ui.curveChip({ type: 'bezier', x1: outInfluence / 100, y1: 0, x2: 1 - inInfluence / 100, y2: 1 }, { width: 220, height: 72 }));
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
      el('div.rb-faint', { text: 'Set the interpolation of the selected keyframes. Ease In and Ease Out shape just one side; the influence below drives the eased side.' })
    ]);
    GROUPS.forEach(function (g) {
      body.appendChild(el('div.rb-section-label', { text: g.label }));
      body.appendChild(el('div.rb-row.rb-wrap', null, g.types.map(function (t) {
        return el('button.rb-btn', { title: t.label, onclick: function () {
          set(ctx, t.type, { inInfluence: inInfluence, outInfluence: outInfluence, allKeys: allKeys });
        } }, [t.label]);
      })));
    });
    body.appendChild(el('div.rb-section-label', { text: 'Easy Ease influence' }));
    body.appendChild(curveHost);
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
