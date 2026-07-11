import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the physics improvement wave against the REAL host code (loaded via
// new Function with a mock AE tree, same pattern as host-anchor.test.mjs):
//   - rig.read (rigstate.jsx): reports which selected layers carry a tool's
//     "// Rebound:<tag>" rig and echoes that tool's control values, so the
//     panel can load a selected rig back into its sliders.
//   - motion.jsx: the new target ('comp' | 'layer') and distribute args
//     produce the right expression fragments and per-layer phase sliders.
//   - drift.jsx: axis / loop / seed produce the right expression fragments
//     and controls.

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
class Property {}
const PropertyValueType = { NO_VALUE: 0, ThreeD_SPATIAL: 1 };
const PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };

// A property whose expression assignment flips expressionEnabled, like AE's.
function prop() {
  const p = new Property();
  p.propertyType = PropertyType.PROPERTY;
  p.canSetExpression = true;
  p.canVaryOverTime = true;
  p.propertyValueType = PropertyValueType.ThreeD_SPATIAL;
  p.expressionEnabled = false;
  p.numKeys = 0;
  p.dimensionsSeparated = false;
  p._expr = '';
  p.value = 0;
  p.setValue = function (v) { this.value = v; };
  Object.defineProperty(p, 'expression', {
    get() { return this._expr; },
    set(v) { this._expr = v; this.expressionEnabled = v !== ''; }
  });
  return p;
}

function makeLayer(name) {
  const effects = [];
  const parade = {
    propertyType: PropertyType.INDEXED_GROUP,
    get numProperties() { return effects.length; },
    property(i) { return effects[i - 1]; },
    addProperty(matchName) {
      const value = prop();
      const fx = {
        name: '',
        matchName,
        propertyType: PropertyType.NAMED_GROUP,
        get numProperties() { return 1; },
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
  const order = [MATCH.position, MATCH.scale, MATCH.rotation, MATCH.opacity];
  const tr = {
    propertyType: PropertyType.INDEXED_GROUP,
    get numProperties() { return order.length; },
    property(n) {
      if (typeof n === 'number') return channels[order[n - 1]] || null;
      return channels[n] || null;
    }
  };
  const layer = {
    name,
    // rig.read walks property(1..numProperties): transform, then the parade.
    get numProperties() { return 2; },
    property(n) {
      if (n === 1 || n === MATCH.transform) return tr;
      if (n === 2 || n === 'ADBE Effect Parade') return parade;
      return null;
    },
    _fx: effects,
    _ch: channels
  };
  for (const key of order) channels[key]._layer = layer;
  return layer;
}

function effectValue(layer, name) {
  const fx = layer._fx.find((f) => f.name === name);
  return fx ? fx.property(1).value : undefined;
}
function hasEffect(layer, name) {
  return layer._fx.some((f) => f.name === name);
}

let commands;
let comp;

beforeAll(() => {
  commands = {};
  comp = { time: 0, frameRate: 24, selectedLayers: [], selectedProperties: [], width: 1280, height: 720 };
  const $ = {
    __rebound: {
      util: {
        MATCH,
        activeComp() { return comp; },
        layerOfProperty(p) { return p._layer; }
      },
      beginUndo() {},
      endUndo() {},
      register(name, fn) { commands[name] = fn; }
    }
  };
  new Function('$', readFileSync(path.join(dir, '../host/lib/rig.jsx'), 'utf8'))($);
  const load = (file) => new Function(
    '$', 'CameraLayer', 'LightLayer', 'Property', 'PropertyValueType', 'PropertyType',
    readFileSync(path.join(dir, '../host/commands/' + file), 'utf8')
  )($, CameraLayer, LightLayer, Property, PropertyValueType, PropertyType);
  load('motion.jsx');
  load('drift.jsx');
  load('rigstate.jsx');
});

describe('rig.read (rigstate.jsx): tagged rig detection + control echo', () => {
  it('reports a rigged layer and echoes its slider values', () => {
    const L = makeLayer('Box');
    comp.selectedLayers = [L];
    comp.selectedProperties = [L._ch[MATCH.position]];
    commands['drift.apply']({ type: 'smooth', amount: 33, frequency: 4.5, seed: 7 });

    const res = commands['rig.read']({ tag: 'drift', sliders: ['Drift Amount', 'Drift Frequency', 'Drift Seed'] });
    expect(res.rigged).toBe(1);
    expect(res.total).toBe(1);
    expect(res.values).toEqual({ 'Drift Amount': 33, 'Drift Frequency': 4.5, 'Drift Seed': 7 });
    expect(res.layers[0]).toMatchObject({ name: 'Box', rigged: true });
  });

  it('an unrigged layer reports rigged 0 with no values', () => {
    comp.selectedLayers = [makeLayer('Plain')];
    const res = commands['rig.read']({ tag: 'drift', sliders: ['Drift Amount'] });
    expect(res.rigged).toBe(0);
    expect(res.values).toBeNull();
  });

  it('another tool\'s tag does not match (drift rig is invisible to "lean")', () => {
    const L = makeLayer('Box');
    comp.selectedLayers = [L];
    comp.selectedProperties = [L._ch[MATCH.position]];
    commands['drift.apply']({ type: 'smooth', amount: 10, frequency: 1 });
    const res = commands['rig.read']({ tag: 'lean', sliders: ['Lean Amount'] });
    expect(res.rigged).toBe(0);
  });

  it('mixed selection: values come from the first rigged layer, counts are per-layer', () => {
    const rigged = makeLayer('Rigged');
    const plain = makeLayer('Plain');
    comp.selectedLayers = [rigged];
    comp.selectedProperties = [rigged._ch[MATCH.position]];
    commands['drift.apply']({ type: 'smooth', amount: 50, frequency: 2, seed: 3 });

    comp.selectedLayers = [plain, rigged];
    const res = commands['rig.read']({ tag: 'drift', sliders: ['Drift Amount', 'Drift Seed'] });
    expect(res.rigged).toBe(1);
    expect(res.total).toBe(2);
    expect(res.values).toEqual({ 'Drift Amount': 50, 'Drift Seed': 3 });
    expect(res.layers.map((l) => l.rigged)).toEqual([false, true]);
  });
});

describe('motion.jsx: target + distribute args', () => {
  it('orbit with target=layer reads the LAST layer\'s live position, no center sliders', () => {
    const a = makeLayer('A');
    const b = makeLayer('B');
    const center = makeLayer('Center "Ring"');
    comp.selectedLayers = [a, b, center];

    const res = commands['motion.apply']({ mode: 'orbit', target: 'layer', orbitRadius: 120, orbitSpeed: 45 });
    expect(res.applied).toBe(2);

    const expr = a._ch[MATCH.position].expression;
    expect(expr).toContain('thisComp.layer("Center \\"Ring\\"").transform.position');
    expect(expr).not.toContain('Orbit Center X');
    expect(hasEffect(a, 'Orbit Center X')).toBe(false);
    expect(hasEffect(a, 'Orbit Center Y')).toBe(false);
    // the target layer itself is the reference, never rigged
    expect(center._ch[MATCH.position].expression).toBe('');
    expect(center._fx.length).toBe(0);
  });

  it('orbit with target=comp captures the comp center into sliders', () => {
    const a = makeLayer('A');
    comp.selectedLayers = [a];
    commands['motion.apply']({ mode: 'orbit', orbitRadius: 100, orbitSpeed: 60 });
    const expr = a._ch[MATCH.position].expression;
    expect(expr).toContain('cx = effect("Orbit Center X")("Slider");');
    expect(expr).not.toContain('thisComp.layer(');
    expect(effectValue(a, 'Orbit Center X')).toBe(comp.width / 2);
    expect(effectValue(a, 'Orbit Center Y')).toBe(comp.height / 2);
  });

  it('orbit distribute hands out i*360/n phases over the riggable pool', () => {
    const a = makeLayer('A');
    const b = makeLayer('B');
    const cam = new CameraLayer();
    cam.name = 'Cam';
    comp.selectedLayers = [a, b, cam];

    const res = commands['motion.apply']({ mode: 'orbit', distribute: true, orbitRadius: 150, orbitSpeed: 60 });
    expect(res.applied).toBe(2);
    // the camera is skipped BEFORE phases are dealt: 2 in the ring, not 3
    expect(effectValue(a, 'Orbit Phase')).toBe(0);
    expect(effectValue(b, 'Orbit Phase')).toBe(180);
    expect(a._ch[MATCH.position].expression).toContain('ph = effect("Orbit Phase")("Slider");');
    expect(a._ch[MATCH.position].expression).toContain('degreesToRadians(time * s + ph)');
  });

  it('orbit without distribute writes no phase slider and a phase-free angle', () => {
    const a = makeLayer('A');
    comp.selectedLayers = [a];
    commands['motion.apply']({ mode: 'orbit', orbitRadius: 150, orbitSpeed: 60 });
    expect(hasEffect(a, 'Orbit Phase')).toBe(false);
    expect(a._ch[MATCH.position].expression).toContain('a = degreesToRadians(time * s);');
  });

  it('lookat with target=layer aims at the layer live (atan2, no target sliders)', () => {
    const a = makeLayer('A');
    const aim = makeLayer('Aim');
    comp.selectedLayers = [a, aim];
    commands['motion.apply']({ mode: 'lookat', target: 'layer' });
    const expr = a._ch[MATCH.rotation].expression;
    expect(expr).toContain('thisComp.layer("Aim").transform.position');
    expect(expr).toContain('Math.atan2');
    expect(hasEffect(a, 'Look Target X')).toBe(false);
    expect(aim._ch[MATCH.rotation].expression).toBe('');
  });

  it('lookat with target=comp captures the target into sliders', () => {
    const a = makeLayer('A');
    comp.selectedLayers = [a];
    commands['motion.apply']({ mode: 'lookat' });
    expect(a._ch[MATCH.rotation].expression).toContain('tx = effect("Look Target X")("Slider");');
    expect(effectValue(a, 'Look Target X')).toBe(comp.width / 2);
  });

  it('a layer target needs a reference layer: single selection throws friendly', () => {
    comp.selectedLayers = [makeLayer('A')];
    expect(() => commands['motion.apply']({ mode: 'orbit', target: 'layer' }))
      .toThrow(/target layer last/);
  });
});

describe('drift.jsx: axis / loop / seed expression fragments', () => {
  function applyDrift(args) {
    const L = makeLayer('Box');
    comp.selectedLayers = [L];
    comp.selectedProperties = [L._ch[MATCH.position]];
    commands['drift.apply'](args);
    return L;
  }

  it('the seed slider feeds seedRandom and stores the panel value', () => {
    const L = applyDrift({ type: 'smooth', amount: 20, frequency: 2, seed: 41 });
    const expr = L._ch[MATCH.position].expression;
    expect(expr).toContain('sd = effect("Drift Seed")("Slider");');
    expect(expr).toContain('seedRandom(index + sd, true);');
    expect(effectValue(L, 'Drift Seed')).toBe(41);
  });

  it('axis x keeps Y (and Z) untouched with dimension guards', () => {
    const L = applyDrift({ type: 'smooth', axis: 'x' });
    const expr = L._ch[MATCH.position].expression;
    expect(expr).toContain('[w[0], value[1], value[2]]');
    expect(expr).toContain('[w[0], value[1]]');
  });

  it('axis y keeps X (and Z) untouched', () => {
    const L = applyDrift({ type: 'smooth', axis: 'y' });
    const expr = L._ch[MATCH.position].expression;
    expect(expr).toContain('[value[0], w[1], value[2]]');
    expect(expr).toContain('[value[0], w[1]]');
  });

  it('axis all (or garbage) wiggles every component, no guards', () => {
    const L = applyDrift({ type: 'smooth', axis: 'diagonal' });
    const expr = L._ch[MATCH.position].expression;
    expect(expr).toContain('w = wiggle(frq, amt);');
    expect(expr).not.toContain('value instanceof Array');
  });

  it('loop crossfades wiggle(t) into wiggle(t - per) and adds the period slider', () => {
    const L = applyDrift({ type: 'smooth', loop: true, loopSec: 2.5 });
    const expr = L._ch[MATCH.position].expression;
    expect(expr).toContain('per = Math.max(0.1, effect("Drift Loop")("Slider"));');
    expect(expr).toContain('w1 = wiggle(frq, amt, 1, 0.5, t);');
    expect(expr).toContain('w2 = wiggle(frq, amt, 1, 0.5, t - per);');
    expect(expr).toContain('w = linear(t, 0, per, w1, w2);');
    expect(effectValue(L, 'Drift Loop')).toBe(2.5);
  });

  it('no loop: a plain wiggle, and no Drift Loop control on the layer', () => {
    const L = applyDrift({ type: 'smooth' });
    expect(L._ch[MATCH.position].expression).toContain('w = wiggle(frq, amt);');
    expect(hasEffect(L, 'Drift Loop')).toBe(false);
  });

  it('hold quantizes via posterizeTime before the wiggle', () => {
    const L = applyDrift({ type: 'hold' });
    expect(L._ch[MATCH.position].expression).toContain('posterizeTime(frq);');
  });
});
