/*
 * Rebound, Ease tool.
 * The reference feature: shape a normalized cubic-bezier on the curve editor,
 * then apply it to the selected keyframes (or read the selection's ease back).
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'ease',
    title: 'Ease',
    group: 'Easing',
    order: 0,
    keywords: ['ease', 'curve', 'bezier', 'easing', 'timing', 'velocity'],
    mount: mountEase
  });

  function mountEase(ctx) {
    var curve = { type: 'bezier', x1: 0.33, y1: 0, x2: 0.67, y2: 1 };
    var scope = 'inout';
    var applyToAll = false;

    // --- Curve editor ---
    var editorHost = el('div');
    // In a Home widget the curve is the whole tool: fill edge to edge with no
    // frame inset or headroom bands. In the full tool tab keep the framed look.
    var fill = !!ctx.widget;
    var editor = ui.CurveEditor(editorHost, {
      value: curve,
      swatch: false,
      allowOvershoot: true,
      height: 300,
      pad: fill ? 1 : 16,
      marginFactor: fill ? 0.04 : 0.1,
      marginMin: fill ? 0.04 : 0.14,
      onChange: function (c) {
        curve = c;
        syncFields();
        updateReadout();
      }
    });

    // --- Live preview stage (driven by the same sampler that Apply uses) ---
    var previewHost = el('div');
    var preview = ui.PreviewStage(previewHost, {
      getCurve: function () { return curve; },
      property: 'position',
      sample: 'shape'
    });
    function updateReadout() {
      preview.setReadout('cubic-bezier(' + ['x1', 'y1', 'x2', 'y2'].map(function (k) {
        return R.units.round(curve[k], 2);
      }).join(', ') + ')');
    }

    // --- Numeric bezier fields ---
    var fields = {};
    function field(key, label) {
      var f = ui.numberField({
        label: label,
        value: curve[key],
        step: 0.01,
        decimals: 2,
        width: '100%',
        onChange: function (v) {
          curve[key] = key.charAt(0) === 'x' ? clamp01(v) : v;
          editor.setCurve(curve);
          updateReadout();
        }
      });
      fields[key] = f;
      return f.el;
    }
    var fieldRow = el('div.rb-row.rb-wrap', null, [
      wrapField(field('x1', 'x1')),
      wrapField(field('y1', 'y1')),
      wrapField(field('x2', 'x2')),
      wrapField(field('y2', 'y2'))
    ]);

    function wrapField(node) {
      return el('div', { style: { flex: '1 1 64px', minWidth: '64px' } }, [node]);
    }
    function syncFields() {
      ['x1', 'y1', 'x2', 'y2'].forEach(function (k) {
        if (fields[k]) fields[k].set(curve[k]);
      });
    }

    // --- Scope + options ---
    // In & Out is already adaptive across a selection: the first key eases out,
    // interior keys ease on both sides, and the last key eases in (each segment
    // sets the outgoing ease on its start key and the incoming ease on its end
    // key). Out and In restrict to a single side.
    var scopeCtl = ui.segmented([
      { value: 'out', label: 'Out', title: 'Ease the outgoing side only' },
      { value: 'inout', label: 'In & Out', title: 'Ease both sides (adapts at the ends of the selection)' },
      { value: 'in', label: 'In', title: 'Ease the incoming side only' }
    ], { value: scope, onChange: function (v) { scope = v; } });

    var allToggle = ui.toggle({
      label: 'Apply to every keyframe (not just selected)',
      value: applyToAll,
      onChange: function (v) { applyToAll = v; }
    });

    // --- Copy / paste cubic-bezier ---
    var copyBtn = el('button.rb-btn.is-ghost', {
      title: 'Copy as CSS cubic-bezier()',
      onclick: function () {
        var css = 'cubic-bezier(' + [curve.x1, curve.y1, curve.x2, curve.y2]
          .map(function (n) { return R.units.round(n, 3); }).join(', ') + ')';
        copyToClipboard(css);
        ctx.toast('Copied ' + css, { kind: 'success' });
      }
    }, ['Copy CSS']);

    var pasteBtn = el('button.rb-btn.is-ghost', {
      title: 'Paste a cubic-bezier() string',
      onclick: function () {
        readClipboard().then(function (text) {
          var parsed = parseCubicBezier(text);
          if (!parsed) { ctx.toast('No cubic-bezier found on the clipboard', { kind: 'error' }); return; }
          curve = { type: 'bezier', x1: parsed[0], y1: parsed[1], x2: parsed[2], y2: parsed[3] };
          editor.setCurve(curve);
          syncFields();
          updateReadout();
          ctx.toast('Pasted curve', { kind: 'success' });
        });
      }
    }, ['Paste']);

    // --- Assemble body ---
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      editorHost,
      el('div.rb-section-label', { text: 'Bezier points' }),
      fieldRow,
      el('div.rb-row', null, [copyBtn, pasteBtn]),
      el('div.rb-section-label', { text: 'Apply to' }),
      scopeCtl.el,
      allToggle.el
    ]));

    // --- Footer actions ---
    var scopeText = el('span.rb-scope', { text: 'No keyframes selected' });
    var readBtn = el('button.rb-btn', {
      title: 'Read the selected keyframes’ ease into the editor',
      onclick: doRead
    }, ['Read']);
    var applyBtn = el('button.rb-btn.is-primary', { onclick: doApply }, ['Apply']);
    ctx.footer.appendChild(scopeText);
    ctx.footer.appendChild(readBtn);
    ctx.footer.appendChild(applyBtn);

    function describeSelection(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      if (sel.totalSelectedKeys < 2 && !applyToAll) return 'Select 2+ keyframes to apply';
      var props = sel.properties.length;
      return sel.totalSelectedKeys + ' key' + (sel.totalSelectedKeys === 1 ? '' : 's') +
        ' · ' + props + ' propert' + (props === 1 ? 'y' : 'ies');
    }

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = describeSelection(sel);
    });
    scopeText.textContent = describeSelection(ctx.getSelection());

    function doApply() {
      ctx.invoke('ease.apply', { curve: curve, scope: scope, applyToAll: applyToAll })
        .then(function (res) {
          ctx.toast('Eased ' + res.segments + ' segment' + (res.segments === 1 ? '' : 's') +
            ' across ' + res.properties + ' propert' + (res.properties === 1 ? 'y' : 'ies'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not apply ease', { kind: 'error' });
        });
    }

    function doRead() {
      ctx.invoke('ease.read', {})
        .then(function (res) {
          if (!res.found) { ctx.toast('Select a keyframe pair to read', { kind: 'error' }); return; }
          editor.setGhost(curve);
          curve = res.curve;
          editor.setCurve(curve);
          syncFields();
          updateReadout();
          ctx.toast('Read ease from ' + res.propertyName, { kind: 'info' });
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not read ease', { kind: 'error' });
        });
    }

    function getState() { return { curve: JSON.parse(JSON.stringify(curve)) }; }
    function applyState(s) {
      if (!s || !s.curve) return;
      curve = JSON.parse(JSON.stringify(s.curve));
      editor.setCurve(curve);
      syncFields();
      updateReadout();
    }

    updateReadout();

    return {
      presets: {
        toolId: 'ease',
        get: getState,
        set: applyState,
        previewFor: function (s) { return s.curve; },
        defaults: easeDefaults()
      },
      destroy: function () {
        off();
        preview.destroy();
        editor.destroy();
      }
    };
  }

  // A curated spread of the built-in easing library for the preset gallery.
  function easeDefaults() {
    var pick = ['linear', 'sine-inout', 'cubic-in', 'cubic-out', 'cubic-inout', 'quart-out', 'expo-inout', 'circ-out', 'back-out', 'back-inout'];
    var byId = {};
    (R.presets.defaults || []).forEach(function (p) { byId[p.id] = p; });
    return pick.map(function (id) {
      var p = byId[id];
      return p ? { name: p.name, state: { curve: p.curve } } : null;
    }).filter(Boolean);
  }

  // --- helpers --------------------------------------------------------------

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function parseCubicBezier(text) {
    if (!text) return null;
    var m = String(text).match(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
    if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
    // bare "a, b, c, d"
    var nums = String(text).split(/[,\s]+/).map(parseFloat).filter(function (n) { return !isNaN(n); });
    return nums.length === 4 ? nums : null;
  }

  function copyToClipboard(text) {
    try {
      if (navigator && navigator.clipboard) { navigator.clipboard.writeText(text); return; }
    } catch (e) { /* fall through */ }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function readClipboard() {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.readText) {
        return navigator.clipboard.readText();
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve('');
  }
})(window.Rebound = window.Rebound || {});
