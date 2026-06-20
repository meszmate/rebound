/*
 * Rebound — tool registry (the plug-in contract).
 *
 * Each feature module calls Rebound.tools.register({ id, title, group, ... })
 * at load time. The shell reads the registry to build navigation and mounts a
 * tool's UI on demand. Adding a feature is: create its file + list it in
 * index.html — no shell edits.
 *
 * Tool spec:
 *   id        unique string id (kebab-case)
 *   title     display name
 *   group     navigation group label
 *   order     sort order within group (default 0)
 *   icon      optional SVG string
 *   keywords  array of strings for the command palette / search
 *   mount(container, ctx)   build UI into container; may return an API object
 *   commands  optional [{ id, title, run(ctx) }] surfaced in the palette
 */
;(function (R) {
  'use strict';

  var tools = {};
  var order = [];

  function register(spec) {
    if (!spec || !spec.id) {
      throw new Error('Rebound.tools.register: a tool needs an id.');
    }
    if (tools[spec.id]) {
      if (R.log) R.log.warn('Tool re-registered: ' + spec.id);
    } else {
      order.push(spec.id);
    }
    tools[spec.id] = spec;
    return spec;
  }

  function get(id) {
    return tools[id];
  }

  function list() {
    return order.map(function (id) { return tools[id]; });
  }

  function byOrder(a, b) {
    return (a.order || 0) - (b.order || 0) || (a.title < b.title ? -1 : 1);
  }

  // Grouped for the navigation rail, preserving first-seen group order.
  function groups() {
    var byGroup = {};
    var groupOrder = [];
    list().forEach(function (t) {
      var g = t.group || 'Tools';
      if (!byGroup[g]) {
        byGroup[g] = [];
        groupOrder.push(g);
      }
      byGroup[g].push(t);
    });
    return groupOrder.map(function (g) {
      return { name: g, tools: byGroup[g].slice().sort(byOrder) };
    });
  }

  // Every command across every tool, for the command palette.
  function allCommands() {
    var out = [];
    list().forEach(function (t) {
      out.push({ id: 'open:' + t.id, title: t.title, kind: 'tool', tool: t, keywords: t.keywords || [] });
      (t.commands || []).forEach(function (c) {
        out.push({ id: t.id + ':' + c.id, title: t.title + ' — ' + c.title, kind: 'command', tool: t, command: c });
      });
    });
    return out;
  }

  R.tools = {
    register: register,
    get: get,
    list: list,
    groups: groups,
    allCommands: allCommands
  };
})(window.Rebound = window.Rebound || {});
