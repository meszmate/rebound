import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Contract test for one-click Home actions: every feature module loads, every
// tool-declared `quick` spec (and every curated apply action) invokes a method
// that is REALLY registered on the host. A typo'd method string would
// otherwise fail only at click time inside After Effects, silently.

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

function hostMethods() {
  const out = new Set();
  const scan = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { scan(p); continue; }
      if (!/\.(jsx|jsxinc)$/.test(f.name)) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/R\.register\(\s*'([^']+)'/g)) out.add(m[1]);
    }
  };
  scan(path.join(root, 'host'));
  return out;
}

// A permissive stub Rebound runtime: enough surface for every feature module's
// LOAD phase (mount() is never called). tools.register captures the real specs.
function makeRuntime() {
  const tools = [];
  const noop = () => {};
  const R = {
    dom: { el: () => ({}), svg: () => ({}), on: noop, clear: noop },
    ui: {},
    log: { info: noop, warn: noop, error: noop },
    disk: { available: false, read: () => null, write: () => true, dir: () => null },
    units: { round: (v) => v },
    bus: { on: noop, emit: noop },
    bridge: { available: false, invoke: () => Promise.resolve({}), cs: null },
    theme: {},
    keybinds: { chordFromEvent: noop, isReserved: () => false, actionIdForChord: () => null },
    easing: {
      sampler: { toFunction: () => () => 0, bakeFactors: () => [], sparseSamples: () => [], samplePoints: () => [], range: () => ({ min: 0, max: 1 }) },
      spring: { spring: () => ({}) },
      bezier: { cubicBezier: () => () => 0, sanitizeHandles: (h) => h, clamp: (v) => v },
      penner: {},
      overshoot: {},
      applyCurve: noop, removeButton: () => ({}), removeFromSelection: noop
    },
    presets: { defaults: [] },
    presetProviders: [],
    toolPresets: { declare: noop, get: () => null, actions: () => [], actionIdFor: () => '', userPresets: () => [], curveApplyBuild: () => ({ method: 'ease.bakeSparse', args: {} }), slugify: (s) => s },
    behaviors: { list: () => [] },
    tools: {
      register(spec) { tools.push(spec); },
      list() { return tools.slice(); },
      get(id) { return tools.find((t) => t.id === id) || null; }
    },
    createStore: () => ({ get: () => ({}), update: noop, select: () => noop })
  };
  return { R, tools };
}

let tools, actions, methods;

beforeAll(() => {
  methods = hostMethods();
  const { R, tools: captured } = makeRuntime();
  const featDir = path.join(root, 'client/js/features');
  const failures = [];
  for (const f of readdirSync(featDir).filter((n) => n.endsWith('.js')).sort()) {
    const src = readFileSync(path.join(featDir, f), 'utf8');
    // Each file is `;(function (R) { ... })(window.Rebound = window.Rebound || {})`.
    const g = { Rebound: R };
    try {
      new Function('window', 'document', 'localStorage', src)(g, { addEventListener() {}, createElement: () => ({}) }, undefined);
    } catch (e) {
      failures.push(f + ': ' + e.message);
    }
  }
  expect(failures).toEqual([]); // every feature module must LOAD in isolation
  tools = captured;

  // Load the real catalog over the captured tools and collect its actions.
  // Feature modules installed their real disk-backed providers; swap them for
  // empty ones (this test is about the static catalog, not saved user data).
  R.userScripts = { homeActions: () => [] };
  R.userExpressions = { homeActions: () => [] };
  R.presets = { homeActions: () => [], defaults: [] };
  R.presetProviders = [];
  R.recoilApply = () => ({ method: 'ease.bakeSparse', args: {} });
  const haSrc = readFileSync(path.join(root, 'client/js/ui/home-actions.js'), 'utf8');
  new Function('window', haSrc)({ Rebound: R });
  actions = R.homeActions.all();
});

describe('one-click Home actions (tool quick specs + curated applies)', () => {
  it('a healthy number of tools registered and textbreak declares a quick action', () => {
    expect(tools.length).toBeGreaterThan(40);
    const tb = tools.find((t) => t.id === 'textbreak');
    expect(tb.quick.method).toBe('textbreak.apply');
    const act = actions.find((a) => a.id === 'quick-textbreak');
    expect(act.kind).toBe('apply');
    expect(act.invoke.args.mode).toBe('words');
  });

  it('every statically-invoking apply action targets a REAL host command', () => {
    const bad = [];
    for (const a of actions) {
      if (a.kind !== 'apply' || !a.invoke || !a.invoke.method) continue;
      if (!methods.has(a.invoke.method)) bad.push(a.id + ' -> ' + a.invoke.method);
    }
    expect(bad).toEqual([]);
  });

  it('quick actions carry a plain description and defaults object', () => {
    for (const t of tools) {
      if (!t.quick) continue;
      expect(t.quick.method, t.id).toBeTruthy();
      expect(typeof (t.quick.args || {}), t.id).toBe('object');
      expect((t.quick.desc || '').length, t.id).toBeGreaterThan(10);
    }
  });
});
