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
        renderRealValues();
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

    // --- Real-values readout: what Apply will actually set on the selection ----
    // One normalized curve maps to DIFFERENT AE influence/speed per property,
    // because speed = slope * (the segment's own dv/dt). Showing it removes the
    // "I dragged the handle but nothing happened" mystery: a small influence (the
    // handle's X) barely eases no matter how high you pull it (the Y / speed).
    var lastSel = ctx.getSelection();
    var realValuesEl = el('div.rb-ease-real');

    function projForCurve(avg) {
      var den = 1 - curve.x2;
      return {
        outInfl: clampInfluence(curve.x1 * 100),
        outSpeed: curve.x1 === 0 ? 0 : (curve.y1 / curve.x1) * avg,
        inInfl: clampInfluence(den * 100),
        inSpeed: den === 0 ? 0 : ((1 - curve.y2) / den) * avg
      };
    }
    function fmtSpeed(v, unit) {
      return R.units.round(v, 1) + (unit || '') + '/s';
    }
    function renderRealValues() {
      R.dom.clear(realValuesEl);
      var segs = [];
      if (lastSel && lastSel.properties) {
        for (var i = 0; i < lastSel.properties.length; i++) {
          if (lastSel.properties[i].segment) segs.push(lastSel.properties[i]);
        }
      }
      if (!segs.length) {
        realValuesEl.appendChild(el('div.rb-ease-real-empty', {
          text: 'Select 2+ keyframes to see the values Apply will set.'
        }));
        return;
      }
      for (var j = 0; j < segs.length; j++) {
        var p = segs[j];
        var pr = projForCurve(p.segment.avg);
        var unit = p.segment.unit;
        var parts = [];
        if (scope !== 'in') parts.push('out ' + fmtSpeed(pr.outSpeed, unit) + ' @ ' + Math.round(pr.outInfl) + '%');
        if (scope !== 'out') parts.push('in ' + fmtSpeed(pr.inSpeed, unit) + ' @ ' + Math.round(pr.inInfl) + '%');
        realValuesEl.appendChild(el('div.rb-ease-real-row', null, [
          el('span.rb-ease-real-name', { text: (p.layerName ? p.layerName + ' · ' : '') + p.name }),
          el('span.rb-ease-real-vals', { text: parts.join('   ·   ') })
        ]));
      }
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
          renderRealValues();
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
    ], { value: scope, onChange: function (v) { scope = v; renderRealValues(); } });

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
          renderRealValues();
          ctx.toast('Pasted curve', { kind: 'success' });
        });
      }
    }, ['Paste']);

    var exportBtn = el('button.rb-btn.is-ghost', {
      title: 'Write every saved ease as a standalone .jsx — wire each to a KBar button, a Tool Launcher, or AE’s Scripts menu',
      onclick: doExportScripts
    }, ['Export → scripts']);

    // --- Graph space: Value (progress) vs Speed (velocity, like AE) ---
    var graphCtl = ui.segmented([
      { value: 'value', label: 'Value graph', title: 'Progress/value curve — the same shape as CSS cubic-bezier()' },
      { value: 'speed', label: 'Speed graph', title: 'Velocity over time — matches After Effects’ Graph Editor (no mental translation)' }
    ], { value: editor.getSpace(), onChange: function (v) { editor.setSpace(v); } });

    // --- Assemble body ---
    ctx.body.appendChild(el('div.rb-col', null, [
      previewHost,
      graphCtl.el,
      editorHost,
      el('div.rb-section-label', { text: 'Bezier points' }),
      fieldRow,
      el('div.rb-row.rb-wrap', null, [copyBtn, pasteBtn, exportBtn]),
      el('div.rb-section-label', { text: 'Apply to' }),
      scopeCtl.el,
      el('div.rb-hint', { text: 'Tip: hold Alt while applying for Out only, Shift for In only — works on preset tiles too.' }),
      allToggle.el,
      el('div.rb-section-label', { text: 'Applies as (real values)' }),
      realValuesEl
    ]));

    // --- Footer actions ---
    var scopeText = el('span.rb-scope', { text: 'No keyframes selected' });
    var readBtn = el('button.rb-btn', {
      title: 'Read the selected keyframes’ ease into the editor',
      onclick: doRead
    }, ['Read']);
    var applyBtn = el('button.rb-btn.is-primary', {
      onclick: doApply,
      title: 'Apply the curve to the selected keyframes. Hold Alt = Out only, Shift = In only, Alt+Shift = In & Out.'
    }, ['Apply']);
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
      lastSel = sel;
      scopeText.textContent = describeSelection(sel);
      renderRealValues();
    });
    scopeText.textContent = describeSelection(lastSel);

    // Flow-style modifier override: hold a modifier while applying (Apply button
    // or a preset tile) to force the eased side for that one apply, without
    // touching the In/Out/Both control. Alt = Out only, Shift = In only, both =
    // In & Out; no modifier = whatever the scope control says.
    function scopeForEvent(e) {
      if (!e) return scope;
      var alt = !!e.altKey, shift = !!e.shiftKey;
      if (alt && shift) return 'inout';
      if (alt) return 'out';
      if (shift) return 'in';
      return scope;
    }

    function doApply(e) {
      var useScope = scopeForEvent(e);
      ctx.invoke('ease.apply', { curve: curve, scope: useScope, applyToAll: applyToAll })
        .then(function (res) {
          var sideNote = useScope !== scope ? ' (' + useScope + ')' : '';
          ctx.toast('Eased ' + res.segments + ' segment' + (res.segments === 1 ? '' : 's') +
            ' across ' + res.properties + ' propert' + (res.properties === 1 ? 'y' : 'ies') + sideNote, { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not apply ease', { kind: 'error' });
        });
    }

    // Export every saved ease (built-in + your own) as a standalone .jsx the host
    // writes to a folder you pick. Monotonic penner curves are fitted to a single
    // cubic-bezier; overshoot/spring curves can't be one bezier, so they're skipped.
    function asBezierCurve(c) {
      if (!c) return null;
      if (c.type === 'bezier') return c;
      var sampler = R.easing.sampler;
      if (sampler.strategy(c) === 'temporal-ease') {
        var h = sampler.fitBezierHandles(c);
        return { type: 'bezier', x1: h.x1, y1: h.y1, x2: h.x2, y2: h.y2 };
      }
      return null;
    }
    function gatherEasePresets() {
      var out = [];
      ((R.presets && R.presets.defaults) || []).forEach(function (p) {
        var c = asBezierCurve(p && p.curve);
        if (c) out.push({ name: p.name, curve: c });
      });
      var user = [];
      try { var d = R.disk.read('presets:ease', null); if (d && d.items) user = d.items; } catch (e) { /* none */ }
      user.forEach(function (u) {
        var c = asBezierCurve(u.state && u.state.curve);
        if (c) out.push({ name: u.name, curve: c });
      });
      return out;
    }
    function doExportScripts() {
      var presets = gatherEasePresets();
      if (!presets.length) { ctx.toast('No exportable eases found', { kind: 'error' }); return; }
      ctx.invoke('ease.exportScripts', { presets: presets })
        .then(function (res) {
          if (!res || res.cancelled) return;
          ctx.toast('Exported ' + res.written + ' ease script' + (res.written === 1 ? '' : 's') +
            ' to ' + res.folder, { kind: 'success' });
        })
        .catch(function (err) { ctx.toast(err.message || 'Could not export ease scripts', { kind: 'error' }); });
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
          renderRealValues();
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
      renderRealValues();
    }

    // Flow-style one-click: clicking a preset tile loads it into the editor AND
    // eases the live selection immediately. If nothing is selected yet, it just
    // loads (no error) so you can select keyframes and click again.
    function canApplyNow() {
      return applyToAll || (!!lastSel && lastSel.hasComp && (lastSel.totalSelectedKeys || 0) >= 2);
    }
    function pickPreset(state, e) {
      applyState(state);
      if (canApplyNow()) doApply(e);
      else ctx.toast('Loaded — select 2+ keyframes to apply', { kind: 'info' });
    }

    updateReadout();
    renderRealValues();

    // Selecting a keyframe pair shows its live ease (from the cached summary, no
    // host round-trip — the host already computes currentEase when >=2 keys).
    function firstEased(sel) {
      if (!sel || !sel.hasComp || !sel.properties) return null;
      for (var i = 0; i < sel.properties.length; i++) { var p = sel.properties[i]; if (p && p.currentEase) return p; }
      return null;
    }

    return {
      presets: {
        toolId: 'ease',
        get: getState,
        set: applyState,
        onPick: pickPreset,
        previewFor: function (s) { return s.curve; },
        defaults: easeDefaults()
      },
      selectionRead: {
        matches: function (sel) { var p = firstEased(sel); return !!(p && p.currentEase && p.currentEase.curve); },
        apply: function (_res, sel) {
          var p = firstEased(sel);
          if (!p || !p.currentEase || !p.currentEase.curve) return;
          var c = p.currentEase.curve;
          editor.setGhost(curve);
          curve = { type: 'bezier', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 };
          editor.setCurve(curve);
          syncFields();
          updateReadout();
        }
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
  // Mirror host/commands/ease.jsx clampInfluence so the readout matches Apply.
  function clampInfluence(v) { return v < 0.1 ? 0.1 : v > 100 ? 100 : v; }

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
