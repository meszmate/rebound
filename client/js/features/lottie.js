/*
 * Rebound, Lottie export tool.
 * Reads the selected layers' transform animation from the host, serializes it to
 * Lottie JSON (client/js/export/lottie.js — pure, unit-tested), and asks the host
 * to write the file. Closes the Figma -> AE -> code handoff for web/app motion.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  R.tools.register({
    id: 'lottie',
    title: 'Lottie export',
    group: 'Convert',
    order: 5,
    keywords: ['lottie', 'bodymovin', 'json', 'export', 'web', 'app', 'handoff', 'mogrt', 'code'],
    mount: mountLottie
  });

  function mountLottie(ctx) {
    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Export the selected layers’ transform animation — position, scale, rotation, opacity, anchor — with their eases to a Lottie .json for the web (lottie-web) or app (Lottie iOS/Android).' }),
      el('div.rb-section-label', { text: 'What exports' }),
      el('div.rb-hint', { text: 'Solids and shapes carry a colored fill; text and other layers export transform-only. Masks, effects, and full shape geometry aren’t exported yet — the eases and motion are exact.' })
    ]));

    var status = el('span.rb-scope', { text: '' });
    var exportBtn = el('button.rb-btn.is-primary', {
      title: 'Read the selection, build Lottie JSON, and save it',
      onclick: doExport
    }, ['Export Lottie…']);
    ctx.footer.appendChild(status);
    ctx.footer.appendChild(exportBtn);

    function describe(sel) {
      if (!sel || !sel.hasComp) return 'Open a composition';
      var n = sel.selectedLayerCount || 0;
      if (!n) return 'Select one or more layers';
      return n + ' layer' + (n === 1 ? '' : 's') + ' selected';
    }
    var off = ctx.onSelection(function (sel) { status.textContent = describe(sel); });
    status.textContent = describe(ctx.getSelection());

    function doExport() {
      ctx.invoke('lottie.read', {})
        .then(function (doc) {
          var lottie = R.exporters && R.exporters.lottie;
          if (!lottie) { ctx.toast('Lottie exporter unavailable', { kind: 'error' }); return; }
          var json = JSON.stringify(lottie.exportLottie(doc));
          var safeName = String(doc.name || 'rebound').replace(/[^A-Za-z0-9_-]+/g, '_');
          return ctx.invoke('lottie.save', { json: json, name: safeName }).then(function (res) {
            if (!res || res.cancelled) return;
            var partial = (doc.partial && doc.partial.length)
              ? ' · ' + doc.partial.length + ' transform-only' : '';
            ctx.toast('Exported ' + doc.layers.length + ' layer' + (doc.layers.length === 1 ? '' : 's') +
              partial + ' → ' + res.path, { kind: 'success' });
          });
        })
        .catch(function (err) { ctx.toast((err && err.message) || 'Lottie export failed', { kind: 'error' }); });
    }

    return { destroy: function () { off(); } };
  }
})(window.Rebound = window.Rebound || {});
