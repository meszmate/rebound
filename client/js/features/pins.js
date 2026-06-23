/*
 * Rebound, Pins tool (puppet / rig-handle assist).
 * Adds the Puppet mesh to the selected layer (best-effort, where AE allows) and
 * drops controller nulls at its bounding-box points as rig handles. A live
 * preview shows where the pins land for the current count and whether the mesh
 * is included. Puppet pins are only partly scriptable; this gets you set up.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  // Candidate pin points on a unit box, same order the host uses.
  function pinUnit(count) {
    var c = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5], [0.5, 0.5]];
    return c.slice(0, Math.max(1, Math.min(9, count)));
  }

  function pinsSvg(st, h) {
    var W = 160, H = 90;
    var bx = 46, by = 24, bw = 68, bh = 42;
    var kids = [svg('rect', { x: 1, y: 1, width: W - 2, height: H - 2, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 })];
    kids.push(svg('rect', { x: bx, y: by, width: bw, height: bh, rx: 4, fill: 'var(--rb-accent)', 'fill-opacity': '0.16', stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-opacity': '0.5' }));
    if (st.puppet) {
      // faint triangulated mesh
      kids.push(svg('path', { d: 'M' + bx + ' ' + by + 'L' + (bx + bw) + ' ' + (by + bh) + 'M' + (bx + bw) + ' ' + by + 'L' + bx + ' ' + (by + bh) + 'M' + (bx + bw / 2) + ' ' + by + 'L' + (bx + bw / 2) + ' ' + (by + bh) + 'M' + bx + ' ' + (by + bh / 2) + 'L' + (bx + bw) + ' ' + (by + bh / 2),
        stroke: 'var(--rb-accent)', 'stroke-width': 0.7, 'stroke-opacity': '0.4', fill: 'none' }));
    }
    var pts = pinUnit(st.count || 4);
    for (var i = 0; i < pts.length; i++) {
      var x = bx + pts[i][0] * bw, y = by + pts[i][1] * bh;
      kids.push(svg('g', { transform: 'translate(' + x + ',' + y + ')' }, [
        svg('circle', { r: 4, fill: 'var(--rb-accent)' }),
        svg('circle', { r: 1.6, fill: 'var(--rb-bg)' })
      ]));
    }
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, kids);
  }

  R.tools.register({
    id: 'pins',
    title: 'Pins',
    group: 'Transform',
    order: 6,
    keywords: ['pins', 'puppet', 'rig', 'handles', 'mesh', 'warp', 'controller', 'null', 'transform'],
    mount: mount
  });

  function mount(ctx) {
    var st = { count: 4, puppet: true };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(pinsSvg(st, 90)); }

    var countSlider = ui.slider({ label: 'Pins', min: 1, max: 9, step: 1, value: st.count,
      format: function (v) { return Math.round(v); }, onInput: function (v) { st.count = v; renderPreview(); } });
    var puppetTog = ui.toggle({ label: 'Add the Puppet mesh (where AE allows)', value: st.puppet, onChange: function (v) { st.puppet = v; renderPreview(); } });

    renderPreview();

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Drops controller nulls at the layer’s bounding-box points and adds the Puppet mesh. Place pins with the Puppet tool, then link them to the nulls.' }),
      previewHost,
      countSlider.el,
      puppetTog.el
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doApply }, ['Add pins']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doApply() {
      ctx.invoke('pins.apply', st)
        .then(function (res) {
          var msg = 'Added ' + res.nulls + ' pin handle' + (res.nulls === 1 ? '' : 's');
          if (res.puppetAdded) msg += ' + Puppet mesh';
          else if (res.puppetFailed) msg += ' (Puppet mesh not scriptable here)';
          ctx.toast(msg, { kind: res.puppetFailed && !res.puppetAdded ? 'info' : 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not add pins', { kind: 'error' }); });
    }

    function getState() { return { count: st.count, puppet: st.puppet }; }
    function applyState(s) {
      if (!s) return;
      if (s.count != null) { st.count = s.count; countSlider.set(s.count); }
      if (s.puppet != null) { st.puppet = s.puppet; puppetTog.set(s.puppet); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'pins',
        get: getState,
        set: applyState,
        thumbFor: function (s, opts) { return pinsSvg(s, (opts && opts.height) || 34); },
        defaults: [
          { name: 'Corners', state: { count: 4, puppet: true } },
          { name: 'Edges', state: { count: 8, puppet: true } },
          { name: 'Handles only', state: { count: 4, puppet: false } }
        ]
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select a layer to pin';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
