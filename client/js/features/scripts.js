/*
 * Rebound, Script & Expression manager.
 *
 * Save named scripts (ExtendScript) and expressions, then run or apply them with
 * one click. Saved items also show up in the Home browser, so any of them can be
 * pinned to a board as a one-click tile. Scripts run via the host scripts.run
 * command (one undo group); expressions go onto the selected properties via
 * expressions.apply.
 */
;(function (R) {
  'use strict';

  var el = R.dom.el;
  var ui = R.ui;
  var KEY = 'user-scripts';

  function load() { return R.disk.read(KEY, []) || []; }
  function save(list) { R.disk.write(KEY, list); }

  R.tools.register({
    id: 'scripts',
    title: 'Scripts',
    group: 'Organize',
    order: 60,
    keywords: ['script', 'scripts', 'expression', 'expressions', 'run', 'code', 'jsx', 'extendscript', 'snippet'],
    mount: mount
  });

  function runItem(ctx, s) {
    if (s.type === 'expression') {
      ctx.invoke('expressions.apply', { code: s.code })
        .then(function (r) { ctx.toast('Applied to ' + r.applied + ' propert' + (r.applied === 1 ? 'y' : 'ies'), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (e) { ctx.toast((e && e.message) || 'Could not apply', { kind: 'error' }); });
    } else {
      ctx.invoke('scripts.run', { code: s.code, label: s.name })
        .then(function (r) { ctx.toast('Ran ' + s.name + (r && r.result ? ': ' + r.result : ''), { kind: 'success' }); ctx.refreshSelection(); })
        .catch(function (e) { ctx.toast((e && e.message) || 'Script error', { kind: 'error' }); });
    }
  }

  function mount(ctx) {
    var listEl = el('div.rb-scripts-list');

    function render() {
      R.dom.clear(listEl);
      var list = load();
      if (!list.length) { listEl.appendChild(el('div.rb-empty', { text: 'No scripts or expressions yet. Add one to run it with a click.' })); return; }
      list.forEach(function (s, i) {
        var badge = el('span.rb-home-badge' + (s.type === 'expression' ? '.is-open' : ''), { text: s.type === 'expression' ? 'expr' : 'script' });
        listEl.appendChild(el('div.rb-scripts-row', null, [
          el('span.rb-grow.rb-scripts-name', { text: s.name, title: s.code }),
          badge,
          el('button.rb-btn.is-primary', { type: 'button', onclick: function () { runItem(ctx, s); } }, [s.type === 'expression' ? 'Apply' : 'Run']),
          el('button.rb-btn.is-ghost.is-icon', { type: 'button', title: 'Edit', onclick: function () { edit(i); } }, ['✎']),
          el('button.rb-btn.is-ghost.is-icon', { type: 'button', title: 'Delete', onclick: function () { var l = load(); l.splice(i, 1); save(l); render(); } }, ['×'])
        ]));
      });
    }

    function edit(i) {
      if (!ui.modal) return;
      var list = load();
      var s = (i == null) ? { id: 's' + Date.now(), name: '', type: 'script', code: '' } : list[i];
      var draft = { type: s.type };
      var nameI = el('input.rb-savedlg-input', { type: 'text', spellcheck: 'false', value: s.name, placeholder: 'Name' });
      var typeCtl = ui.segmented([{ value: 'script', label: 'Script' }, { value: 'expression', label: 'Expression' }], { value: s.type, onChange: function (v) { draft.type = v; } });
      // Syntax-highlighted editor when available; fall back to a plain textarea
      // so the tool never breaks if the component failed to load.
      var codeEd, codeNode;
      if (R.codeEditor) {
        codeEd = R.codeEditor.create({ value: s.code || '', placeholder: 'app.project.activeItem... or wiggle(2, 30)', minHeight: 150 });
        codeNode = codeEd.el;
      } else {
        var codeI = el('textarea.rb-cfg-text.rb-scripts-code', { spellcheck: 'false', rows: '9', placeholder: 'app.project.activeItem... or wiggle(2, 30)' });
        codeI.value = s.code || '';
        codeEd = { getValue: function () { return codeI.value; } };
        codeNode = codeI;
      }
      var saveB = el('button.rb-btn.is-primary', { type: 'button', onclick: function () {
        var name = (nameI.value || '').trim();
        if (!name) { ctx.toast('Give it a name first', { kind: 'error' }); return; }
        var l = load();
        var rec = { id: s.id, name: name, type: draft.type, code: codeEd.getValue() };
        if (i == null) l.push(rec); else l[i] = rec;
        save(l); render(); h.close('confirm');
      } }, ['Save']);
      var body = el('div.rb-col', null, [
        ui.row('Name', nameI),
        ui.row('Type', typeCtl.el),
        el('div.rb-section-label', { text: 'Code' }),
        codeNode,
        el('div.rb-faint', { text: 'Script runs as ExtendScript in one undo step. Expression is written onto the selected properties.' })
      ]);
      var h = ui.modal({ title: i == null ? 'New script / expression' : 'Edit', width: 460, body: body, footer: [saveB], initialFocus: nameI });
    }

    ctx.body.appendChild(el('div.rb-col', null, [
      el('div.rb-section-label', { text: 'Scripts & expressions' }),
      el('div.rb-faint', { text: 'Saved items also appear in the Home browser, so you can pin any of them as a one-click tile.' }),
      listEl
    ]));
    ctx.footer.appendChild(el('button.rb-btn', { type: 'button', onclick: function () { edit(null); } }, ['Add script / expression']));
    render();
    return {};
  }

  // Saved snippets as Home actions, so they can be pinned as one-click tiles.
  function homeActions() {
    return load().map(function (s) {
      return {
        id: 'script-' + s.id, label: s.name, toolId: 'scripts', group: 'Scripts', kind: 'apply', display: 'text',
        desc: s.type === 'expression' ? ('Apply expression: ' + s.name) : ('Run script: ' + s.name),
        invoke: s.type === 'expression' ? { method: 'expressions.apply', args: { code: s.code } } : { method: 'scripts.run', args: { code: s.code, label: s.name } }
      };
    });
  }

  R.userScripts = { load: load, homeActions: homeActions };
})(window.Rebound = window.Rebound || {});
