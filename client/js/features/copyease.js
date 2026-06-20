/*
 * Rebound, Copy Ease.
 * Copy the temporal ease (speed + influence) off one keyframe and paste it
 * onto others. The Mode picker chooses which part of the stored ease to write:
 * just the influence, just the speed, or both, the untouched part is kept from
 * each target key's current ease.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;

  R.tools.register({
    id: 'copyease',
    title: 'Copy Ease',
    group: 'Easing',
    order: 4,
    keywords: ['copy', 'paste', 'ease', 'influence', 'speed', 'temporal', 'keyframe'],
    mount: mount
  });

  function mount(ctx) {
    var stored = null;
    var mode = 'both';
    var mirror = false;
    var scale = 1;

    // --- Copy / Mode / Paste controls ---
    var copyBtn = el('button.rb-btn', {
      title: 'Copy the ease from the first selected keyframe',
      onclick: doCopy
    }, ['Copy']);

    var modeCtl = ui.segmented([
      { value: 'influence', label: 'Influence', title: 'Paste only the influence' },
      { value: 'speed', label: 'Speed', title: 'Paste only the speed' },
      { value: 'both', label: 'Both', title: 'Paste both influence and speed' }
    ], { value: mode, onChange: function (v) { mode = v; } });

    var mirrorToggle = ui.toggle({ label: 'Mirror in and out', value: mirror,
      title: 'Paste the copied out-ease onto the target in-side and vice versa, for a symmetric flip.',
      onChange: function (v) { mirror = v; } });
    var scaleField = ui.numberField({ label: 'Scale', value: scale, min: 0.1, max: 4, step: 0.05,
      decimals: 2, suffix: 'x', width: '110px', onChange: function (v) { scale = v; } });

    var pasteBtn = el('button.rb-btn.is-disabled', {
      title: 'Paste the copied ease onto the selected keyframes',
      onclick: doPaste
    }, ['Paste']);

    function setPasteEnabled(on) {
      pasteBtn.classList.toggle('is-disabled', !on);
    }

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Copy the ease from one keyframe and paste it onto others.' }),
      el('div.rb-row', null, [copyBtn]),
      el('div.rb-section-label', { text: 'Paste' }),
      modeCtl.el,
      mirrorToggle.el,
      ui.row('Scale', scaleField.el),
      el('div.rb-row', null, [pasteBtn])
    ]));

    // --- Footer ---
    var scopeText = el('span.rb-scope', { text: '' });
    ctx.footer.appendChild(scopeText);

    function describeSelection(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      if (!sel.totalSelectedKeys) return 'Select keyframes';
      return sel.totalSelectedKeys + ' keyframe' + (sel.totalSelectedKeys === 1 ? '' : 's') + ' selected';
    }

    var off = ctx.onSelection(function (sel) {
      scopeText.textContent = describeSelection(sel);
    });
    scopeText.textContent = describeSelection(ctx.getSelection());

    function doCopy() {
      ctx.invoke('copyease.copy', {})
        .then(function (res) {
          stored = res;
          setPasteEnabled(true);
          ctx.toast('Ease copied', { kind: 'success' });
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not copy ease', { kind: 'error' });
        });
    }

    function doPaste() {
      if (!stored) { ctx.toast('Copy an ease first', { kind: 'error' }); return; }
      ctx.invoke('copyease.paste', { ease: stored, mode: mode, mirror: mirror, scale: scale })
        .then(function (res) {
          ctx.toast('Pasted onto ' + res.keys + ' keyframe' + (res.keys === 1 ? '' : 's'), { kind: 'success' });
          ctx.refreshSelection();
        })
        .catch(function (err) {
          ctx.toast(err.message || 'Could not paste ease', { kind: 'error' });
        });
    }

    return { destroy: off };
  }
})(window.Rebound = window.Rebound || {});