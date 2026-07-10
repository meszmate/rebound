import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the physics-rig audit fixes against the REAL host code (loaded via
// new Function with a mock AE tree, same pattern as host-anchor.test.mjs):
//   - rig.jsx per-tool expression tags: set writes "// Rebound:tag", a tagged
//     clear removes only its own tool's rig (plus bare legacy markers), so one
//     tool's Remove no longer kills another tool's rig on the same property.
//   - ensureSlider updates the value on reused controls (unless keyed/expressed).
//   - removeControls deletes a tool's named effects so Remove leaves no orphans.
//   - kinetic/follow: throw a friendly error when nothing was rigged, skip
//     separated-dimension Position, and emit 3D-safe expressions.

const dir = path.dirname(fileURLToPath(import.meta.url));

const MATCH = {
  transform: 'ADBE Transform Group',
  position: 'ADBE Position',
  scale: 'ADBE Scale',
  rotation: 'ADBE Rotate Z',
  opacity: 'ADBE Opacity'
};

class CameraLayer {}
class LightLayer {}

// A property whose expression assignment flips expressionEnabled, like AE's.
function prop() {
  const p = {
    canSetExpression: true,
    expressionEnabled: false,
    numKeys: 0,
    dimensionsSeparated: false,
    _expr: '',
    value: 0,
    setValue(v) { this.value = v; }
  };
  Object.defineProperty(p, 'expression', {
    get() { return this._expr; },
    set(v) { this._expr = v; this.expressionEnabled = v !== ''; }
  });
  return p;
}

function makeLayer(name) {
  const effects = [];
  const parade = {
    get numProperties() { return effects.length; },
    property(i) { return effects[i - 1]; },
    addProperty(matchName) {
      const value = prop();
      const fx = {
        name: '',
        matchName,
        property() { return value; },
        remove() { effects.splice(effects.indexOf(fx), 1); }
      };
      effects.push(fx);
      return fx;
    }
  };
  const channels = {
    [MATCH.position]: prop(),
    [MATCH.scale]: prop(),
    [MATCH.rotation]: prop(),
    [MATCH.opacity]: prop()
  };
  const tr = { property(n) { return channels[n] || null; } };
  return {
    name,
    property(n) {
      if (n === 'ADBE Effect Parade') return parade;
      if (n === MATCH.transform) return tr;
      return null;
    },
    _fx: effects,
    _ch: channels
  };
}

function effectNames(layer) {
  return layer._fx.map((fx) => fx.name);
}

let rig;
let commands;
let comp;

beforeAll(() => {
  commands = {};
  comp = { time: 0, frameRate: 24, selectedLayers: [], selectedProperties: [], width: 1280, height: 720 };
  const $ = {
    __rebound: {
      util: { MATCH, activeComp() { return comp; } },
      beginUndo() {},
      endUndo() {},
      register(name, fn) { commands[name] = fn; }
    }
  };
  new Function('$', readFileSync(path.join(dir, '../host/lib/rig.jsx'), 'utf8'))($);
  rig = $.__rebound.rig;
  const load = (file) => new Function('$', 'CameraLayer', 'LightLayer',
    readFileSync(path.join(dir, '../host/commands/' + file), 'utf8'))($, CameraLayer, LightLayer);
  load('kinetic.jsx');
  load('follow.jsx');
});

describe('rig.setExpression / clearExpression tags', () => {
  it('a tagged set writes "// Rebound:tag" as the first line', () => {
    const p = prop();
    expect(rig.setExpression(p, 'value;', 'lean')).toBe(true);
    expect(p.expression.split('\n')[0]).toBe('// Rebound:lean');
  });

  it('an untagged set keeps the bare legacy marker', () => {
    const p = prop();
    expect(rig.setExpression(p, 'value;')).toBe(true);
    expect(p.expression.split('\n')[0]).toBe('// Rebound');
  });

  it('never overwrites a user expression', () => {
    const p = prop();
    p.expression = 'wiggle(1, 5)';
    expect(rig.setExpression(p, 'value;', 'lean')).toBe(false);
    expect(p.expression).toBe('wiggle(1, 5)');
  });

  it('one Rebound tool may replace another (re-applying is user intent)', () => {
    const p = prop();
    rig.setExpression(p, 'value;', 'lean');
    expect(rig.setExpression(p, 'value * 2;', 'squash')).toBe(true);
    expect(p.expression.split('\n')[0]).toBe('// Rebound:squash');
  });

  it('a clear with the WRONG tag refuses and keeps the expression', () => {
    const p = prop();
    rig.setExpression(p, 'value;', 'lean');
    expect(rig.clearExpression(p, 'kinetic')).toBe(false);
    expect(p.expression).toContain('// Rebound:lean');
  });

  it('a clear with the RIGHT tag removes the expression', () => {
    const p = prop();
    rig.setExpression(p, 'value;', 'lean');
    expect(rig.clearExpression(p, 'lean')).toBe(true);
    expect(p.expression).toBe('');
  });

  it('a tagged clear also removes bare legacy Rebound expressions', () => {
    const p = prop();
    p.expression = '// Rebound\nvalue;';
    expect(rig.clearExpression(p, 'lean')).toBe(true);
    expect(p.expression).toBe('');
  });

  it('an untagged clear removes any Rebound expression (legacy behaviour)', () => {
    const p = prop();
    rig.setExpression(p, 'value;', 'squash');
    expect(rig.clearExpression(p)).toBe(true);
    expect(p.expression).toBe('');
  });

  it('never clears a user expression, tagged or not', () => {
    const p = prop();
    p.expression = 'wiggle(1, 5)';
    expect(rig.clearExpression(p, 'lean')).toBe(false);
    expect(rig.clearExpression(p)).toBe(false);
    expect(p.expression).toBe('wiggle(1, 5)');
  });
});

describe('rig.ensureSlider reuse', () => {
  it('creates the control and sets its value', () => {
    const L = makeLayer('A');
    rig.ensureSlider(L, 'Lean Amount', 8);
    expect(effectNames(L)).toEqual(['Lean Amount']);
    expect(L._fx[0].property(1).value).toBe(8);
  });

  it('updates the value on a reused control', () => {
    const L = makeLayer('A');
    rig.ensureSlider(L, 'Lean Amount', 8);
    rig.ensureSlider(L, 'Lean Amount', 20);
    expect(L._fx.length).toBe(1);
    expect(L._fx[0].property(1).value).toBe(20);
  });

  it('leaves a keyframed control alone', () => {
    const L = makeLayer('A');
    rig.ensureSlider(L, 'Lean Amount', 8);
    L._fx[0].property(1).numKeys = 2;
    rig.ensureSlider(L, 'Lean Amount', 20);
    expect(L._fx[0].property(1).value).toBe(8);
  });

  it('leaves an expression-driven control alone', () => {
    const L = makeLayer('A');
    rig.ensureSlider(L, 'Lean Amount', 8);
    L._fx[0].property(1).expression = 'time * 2';
    rig.ensureSlider(L, 'Lean Amount', 20);
    expect(L._fx[0].property(1).value).toBe(8);
  });
});

describe('rig.removeControls', () => {
  it('removes only the named controls and reports the count', () => {
    const L = makeLayer('A');
    rig.ensureSlider(L, 'Lean Amount', 8);
    rig.ensureSlider(L, 'Lean Smooth', 4);
    rig.ensureSlider(L, 'Kinetic Max', 50);
    const removed = rig.removeControls(L, ['Lean Amount', 'Lean Smooth', 'Not There']);
    expect(removed).toBe(2);
    expect(effectNames(L)).toEqual(['Kinetic Max']);
  });
});

describe('kinetic host (real kinetic.jsx)', () => {
  it('applies a tagged, 3D-safe scale expression', () => {
    const src = makeLayer('Lead');
    const child = makeLayer('Child');
    comp.selectedLayers = [src, child];
    const res = commands['kinetic.apply']({ target: 'scale', sensitivity: 50, max: 50 });
    expect(res.applied).toBe(1);
    const expr = child._ch[MATCH.scale].expression;
    expect(expr).toContain('// Rebound:kinetic');
    expect(expr).toContain('value.length > 2'); // keeps Z on 3D Scale
  });

  it('throws a friendly error when nothing could be rigged', () => {
    comp.selectedLayers = [makeLayer('Lead'), new CameraLayer()];
    expect(() => commands['kinetic.apply']({ target: 'scale' })).toThrow(/No targets rigged/);
  });

  it('remove clears only its own rig and its own controls', () => {
    const L = makeLayer('A');
    rig.ensureSlider(L, 'Kinetic Sensitivity', 50);
    rig.ensureSlider(L, 'Kinetic Max', 50);
    rig.ensureSlider(L, 'Lean Amount', 8);
    rig.setExpression(L._ch[MATCH.scale], 'value;', 'kinetic');
    rig.setExpression(L._ch[MATCH.rotation], 'value;', 'lean'); // a Lean rig on the same layer
    comp.selectedLayers = [L];
    const res = commands['kinetic.remove']({});
    expect(res.cleared).toBe(1);
    expect(L._ch[MATCH.scale].expression).toBe('');
    expect(L._ch[MATCH.rotation].expression).toContain('// Rebound:lean'); // survived
    expect(effectNames(L)).toEqual(['Lean Amount']); // only Kinetic controls removed
  });
});

describe('follow host (real follow.jsx)', () => {
  it('emits a dimension-guarded expression on the follower', () => {
    const lead = makeLayer('Lead');
    const tail = makeLayer('Tail');
    comp.selectedLayers = [lead, tail];
    const res = commands['follow.apply']({ delayFrames: 4, cascade: false });
    expect(res.applied).toBe(1);
    const expr = tail._ch[MATCH.position].expression;
    expect(expr).toContain('// Rebound:follow');
    expect(expr).toContain('value.length > 2'); // 3D follower keeps its Z, 2D truncates
  });

  it('skips separated-dimension Position with a clear reason', () => {
    const lead = makeLayer('Lead');
    const tail = makeLayer('Tail');
    tail._ch[MATCH.position].dimensionsSeparated = true;
    comp.selectedLayers = [lead, tail];
    expect(() => commands['follow.apply']({ delayFrames: 4 }))
      .toThrow(/separate dimensions is on/);
  });
});
