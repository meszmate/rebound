/*
 * Rebound, Pin Rig tool.
 * Native Puppet pins can't be script-created, so the workflow is: the artist
 * places pins with the Puppet Tool, then this binds each pin to a controller
 * null (you animate the nulls, the mesh follows) and builds slider rigs. The
 * preview loops a mesh corner following a moving controller so the idea reads at
 * a glance, and reacts to the controller style and size.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var svg = R.dom.svg;
  var ui = R.ui;

  var LABELS = [{ value: 9, label: 'Cyan' }, { value: 4, label: 'Yellow' }, { value: 1, label: 'Red' }, { value: 14, label: 'Green' }];

  function pinsSvg(st, h) {
    var hr = Math.max(2.5, Math.min(6, (st.size || 28) / 9));
    function handleShape() {
      return st.style === 'null'
        ? svg('rect', { x: -hr, y: -hr, width: 2 * hr, height: 2 * hr, fill: 'none', stroke: 'var(--rb-accent)', 'stroke-width': 1.4 })
        : svg('circle', { r: hr, fill: 'var(--rb-accent)', 'fill-opacity': '0.92' });
    }
    var anim = function (attr, vals) { return svg('animate', { attributeName: attr, values: vals, dur: '3s', repeatCount: 'indefinite' }); };
    var shape = svg('path', { d: 'M46 32 L110 32 L110 64 L46 64 Z', fill: 'var(--rb-accent)', 'fill-opacity': '0.14', stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-opacity': '0.5' },
      [anim('d', 'M46 32 L110 32 L110 64 L46 64 Z;M46 32 L122 18 L110 64 L46 64 Z;M46 32 L110 32 L110 64 L46 64 Z')]);
    var link = svg('line', { x1: 110, y1: 32, x2: 124, y2: 22, stroke: 'var(--rb-accent)', 'stroke-width': 1, 'stroke-dasharray': '2 2', 'stroke-opacity': '0.6' },
      [anim('x1', '110;122;110'), anim('y1', '32;18;32'), anim('x2', '124;136;124'), anim('y2', '22;10;22')]);
    var movingPin = svg('circle', { cx: 110, cy: 32, r: 2.4, fill: 'var(--rb-accent)' }, [anim('cx', '110;122;110'), anim('cy', '32;18;32')]);
    var handleG = svg('g', null, [handleShape(), svg('animateTransform', { attributeName: 'transform', type: 'translate', values: '124,22; 136,10; 124,22', dur: '3s', repeatCount: 'indefinite' })]);
    handleG.setAttribute('transform', 'translate(124,22)');
    return svg('svg', { viewBox: '0 0 160 90', width: '100%', height: h }, [
      svg('rect', { x: 1, y: 1, width: 158, height: 88, fill: 'var(--rb-bg)', stroke: 'var(--rb-border)', 'stroke-width': 1, rx: 3 }),
      shape, link,
      svg('circle', { cx: 46, cy: 32, r: 2.4, fill: 'var(--rb-accent)' }),
      svg('circle', { cx: 110, cy: 64, r: 2.4, fill: 'var(--rb-accent)' }),
      svg('circle', { cx: 46, cy: 64, r: 2.4, fill: 'var(--rb-accent)' }),
      movingPin, handleG
    ]);
  }

  // Built-in presets, module-level so each is a pinnable Home action at load
  // (R.toolPresets), without the tool ever having been opened.
  var PINS_DEFAULTS = [
    { name: 'Cyan dots', state: { style: 'dot', size: 28, label: 9 } },
    { name: 'Big dots', state: { style: 'dot', size: 60, label: 4 } },
    { name: 'Nulls', state: { style: 'null', size: 40, label: 1 } }
  ];
  R.toolPresets.declare('pins', { defaults: PINS_DEFAULTS });

  R.tools.register({
    id: 'pins',
    title: 'Puppet Rig',
    group: 'Transform',
    order: 6,
    keywords: ['puppet', 'pin', 'rig', 'bind', 'null', 'controller', 'slider', 'link', 'joystick', 'rigging', 'character'],
    mount: mount
  });

  function mount(ctx) {
    var st = { style: 'dot', size: 28, label: 9, ctrlName: 'Control' };

    var previewHost = el('div', { style: { border: '1px solid var(--rb-border)', borderRadius: 'var(--rb-radius-2)', background: 'var(--rb-bg-sunken)', padding: '6px' } });
    function renderPreview() { R.dom.clear(previewHost); previewHost.appendChild(pinsSvg(st, 90)); }
    renderPreview();

    var styleSeg = ui.segmented([{ value: 'dot', label: 'Shape dot' }, { value: 'null', label: 'Null' }], { value: st.style, onChange: function (v) { st.style = v; renderPreview(); } });
    var sizeS = ui.slider({ label: 'Size', min: 8, max: 120, step: 1, value: st.size, format: function (v) { return Math.round(v) + 'px'; }, onInput: function (v) { st.size = v; renderPreview(); } });
    var labelSeg = ui.segmented(LABELS, { value: st.label, onChange: function (v) { st.label = +v; } });

    var nameInput = el('input', { type: 'text', value: st.ctrlName, placeholder: 'Slider name', 'aria-label': 'Slider name', spellcheck: 'false', oninput: function () { st.ctrlName = nameInput.value || 'Control'; } });
    var nameField = el('div.rb-field.rb-field-text', null, [nameInput]);
    var addSliderBtn = el('button.rb-btn', { type: 'button', onclick: doAddSlider }, ['Add slider']);
    var linkBtn = el('button.rb-btn', { type: 'button', onclick: doLink }, ['Link selected']);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Place pins with the Puppet Tool first, then Bind. You animate the nulls and the mesh follows.' }),
      previewHost,
      el('div.rb-section-label', { text: 'Controllers' }),
      ui.row('Style', styleSeg.el),
      sizeS.el,
      ui.row('Color', labelSeg.el),
      el('div.rb-section-label', { text: 'Slider rig' }),
      el('div.rb-faint', { text: 'Add a slider to the selected layer, then select 1D properties and link them so one slider drives many.' }),
      nameField,
      el('div.rb-row.rb-wrap', null, [addSliderBtn, linkBtn])
    ]));

    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(el('button.rb-btn.is-ghost', { onclick: doUnbind }, ['Unbind']));
    ctx.footer.appendChild(el('button.rb-btn.is-primary', { onclick: doBind }, ['Bind pins to nulls']));

    var off = ctx.onSelection(function (sel) { scopeText.textContent = describe(sel); });
    scopeText.textContent = describe(ctx.getSelection());

    function doBind() {
      ctx.invoke('pins.bind', { style: st.style, size: st.size, label: st.label })
        .then(function (res) {
          var skip = (res.skipped && res.skipped.length) ? ' (' + res.skipped.length + ' skipped)' : '';
          ctx.toast('Bound ' + res.bound + ' pin' + (res.bound === 1 ? '' : 's') + ' to ' + res.nulls + ' controller' + (res.nulls === 1 ? '' : 's') + skip, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not bind pins', { kind: 'error' }); });
    }
    function doUnbind() {
      ctx.invoke('pins.unbind', {})
        .then(function (res) { ctx.toast('Unbound ' + res.cleared + ' pin' + (res.cleared === 1 ? '' : 's'), { kind: 'info' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message, { kind: 'error' }); });
    }
    function doAddSlider() {
      ctx.invoke('pins.slider', { name: st.ctrlName, value: 0 })
        .then(function (res) { ctx.toast('Added “' + res.name + '” slider to ' + res.added + ' layer' + (res.added === 1 ? '' : 's'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not add slider', { kind: 'error' }); });
    }
    function doLink() {
      ctx.invoke('pins.link', { name: st.ctrlName })
        .then(function (res) {
          ctx.toast('Linked ' + res.linked + ' propert' + (res.linked === 1 ? 'y' : 'ies') + ' to “' + st.ctrlName + '”', { kind: 'success' });
          if (res.skipped && res.skipped.length) ctx.toast('Skipped: ' + res.skipped.join(', '), { kind: 'info' });
          ctx.refreshSelection();
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not link', { kind: 'error' }); });
    }

    function getState() { return { style: st.style, size: st.size, label: st.label }; }
    function applyState(s) {
      if (!s) return;
      if (s.style) { st.style = s.style; styleSeg.set(s.style); }
      if (s.size != null) { st.size = s.size; sizeS.set(s.size); }
      if (s.label != null) { st.label = s.label; labelSeg.set(s.label); }
      renderPreview();
    }

    return {
      presets: {
        toolId: 'pins', get: getState, set: applyState,
        thumbFor: function (s, opts) { return pinsSvg(s, (opts && opts.height) || 34); },
        defaults: PINS_DEFAULTS
      },
      destroy: off
    };
  }

  function describe(sel) {
    if (!sel || !sel.hasComp) return 'Open a composition';
    if (!sel.selectedLayerCount) return 'Select a pinned layer';
    return sel.selectedLayerCount + ' layer' + (sel.selectedLayerCount === 1 ? '' : 's') + ' selected';
  }
})(window.Rebound = window.Rebound || {});
