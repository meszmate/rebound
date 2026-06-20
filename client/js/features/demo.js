/*
 * Rebound — Demo tool.
 * Builds a small practice composition with a single animated layer so a new
 * user has something to ease, spring, or otherwise experiment on.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;

  R.tools.register({
    id: 'demo',
    title: 'Demo',
    group: 'Help',
    order: 0,
    keywords: ['demo', 'practice', 'example', 'sample', 'try', 'tutorial', 'getting started', 'playground'],
    mount: mount
  });

  function mount(ctx) {
    var buildButton = el('button.rb-btn.is-primary', {
      title: 'Create a practice composition to try the tools',
      onclick: build
    }, ['Build demo comp']);

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-faint', { text: 'Creates a fresh practice composition with one moving layer so you have something to ease, spring, or otherwise experiment on. Select the layer (or its Position keyframes) and reach for the other tools.' }),
      buildButton
    ]));

    var scopeText = el('span.rb-scope', { text: 'Creates a new composition' });
    ctx.footer.appendChild(scopeText);

    function build() {
      ctx.invoke('demo.apply', {})
        .then(function (res) { ctx.toast('Built practice composition', { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (err) { ctx.toast(err.message || 'Could not build demo comp', { kind: 'error' }); });
    }

    return { destroy: function () {} };
  }
})(window.Rebound = window.Rebound || {});