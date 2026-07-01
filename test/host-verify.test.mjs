import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the in-AE "are the red borders gone?" verifier (host/commands/import/
// verify.jsx). The build environment can't run After Effects, so this command is
// what turns "eyeball the render" into an objective check the user runs in-app.
// We load the real .jsx in Node against a mock comp/layer/vector tree and assert:
//   - a clean import (coloured paints, no Stroke layer styles) -> clean:true
//   - an enabled Stroke layer style (the actual red-border bug source) -> clean:false
//   - a red-dominant paint -> reported for review, but not a failure
//   - nested precomps are scanned, and deeply-nested (Offset Paths) strokes are found

let verify;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, '../host/commands/import/verify.jsx'), 'utf8');
  const $ = { __rebound: { util: {}, register() {} } };
  new Function('$', src)($);
  verify = $.__rebound.verify;
});

// --- mock AE object builders -------------------------------------------------
function operator(matchName, colorName, color) {
  return {
    matchName,
    numProperties: 0,
    property(name) { return name === colorName ? { value: color } : null; }
  };
}
const fill = (color) => operator('ADBE Vector Graphic - Fill', 'ADBE Vector Fill Color', color);
const stroke = (color) => operator('ADBE Vector Graphic - Stroke', 'ADBE Vector Stroke Color', color);

// A shape group addressed by 1-based index (mirrors AE PropertyGroup.property(i)).
function group(children, extra = {}) {
  return {
    numProperties: children.length,
    property(arg) {
      if (typeof arg === 'number') return children[arg - 1] || null;
      if (arg in extra) return extra[arg];
      return null;
    }
  };
}
// An 'ADBE Vector Group' wrapper whose real contents sit under 'ADBE Vectors
// Group' — the exact nesting an inside/outside (Offset Paths) stroke lives in.
function vectorGroup(contentsChildren) {
  const contents = group(contentsChildren);
  return { matchName: 'ADBE Vector Group', numProperties: 1, property(arg) { return arg === 'ADBE Vectors Group' ? contents : null; } };
}
function layer(name, { vectors = null, strokeStyle = null, source = null } = {}) {
  return {
    name,
    source,
    property(n) {
      if (n === 'ADBE Root Vectors Group') return vectors;
      if (n === 'ADBE Layer Styles') {
        if (strokeStyle === null) return { property() { return null; } };
        return { property(k) { return k === 'frameFX' ? { enabled: strokeStyle } : null; } };
      }
      return null;
    }
  };
}
let _id = 0;
function comp(name, layers) { return { id: ++_id, name, numLayers: layers.length, layer(i) { return layers[i - 1] || null; } }; }

const GREY = [0.231, 0.235, 0.251];
const RED = [0.93, 0.13, 0.13];

describe('host verify.redScan — objective red-border check', () => {
  it('isRedDefault flags AE-red, not real design colours', () => {
    expect(verify.isRedDefault(RED)).toBe(true);
    expect(verify.isRedDefault([1, 0, 0])).toBe(true);
    expect(verify.isRedDefault(GREY)).toBe(false);       // the card grey from the real board
    expect(verify.isRedDefault([0.5, 0.45, 0.45])).toBe(false); // muted / not red-dominant
    expect(verify.isRedDefault(null)).toBe(false);
  });

  it('a clean import (coloured paints, no Stroke layer styles) is clean', () => {
    const c = comp('Board', [
      layer('Card', { vectors: group([fill(GREY), stroke(GREY)]) }),
      layer('Button', { vectors: group([fill([0.1, 0.4, 0.9])]) })
    ]);
    const v = verify.verdict(verify.scanComp(c));
    expect(v.clean).toBe(true);
    expect(v.strokeLayerStyles).toHaveLength(0);
    expect(v.redPaints).toHaveLength(0);
    expect(v.shapeLayers).toBe(2);
  });

  it('an ENABLED Stroke layer style (the real bug source) fails the check', () => {
    const c = comp('Board', [layer('Card', { vectors: group([fill(GREY)]), strokeStyle: true })]);
    const v = verify.verdict(verify.scanComp(c));
    expect(v.clean).toBe(false);
    expect(v.strokeLayerStyles).toHaveLength(1);
    expect(v.strokeLayerStyles[0].layer).toBe('Card');
  });

  it('a DISABLED Stroke layer style does not fail the check', () => {
    const c = comp('Board', [layer('Card', { vectors: group([fill(GREY)]), strokeStyle: false })]);
    expect(verify.verdict(verify.scanComp(c)).clean).toBe(true);
  });

  it('a red-dominant paint is reported for review but is not a failure', () => {
    const c = comp('Board', [layer('Oops', { vectors: group([fill(RED)]) })]);
    const v = verify.verdict(verify.scanComp(c));
    expect(v.clean).toBe(true);              // pass/fail hangs only on layer styles
    expect(v.redPaints).toHaveLength(1);
    expect(v.redPaints[0]).toMatchObject({ layer: 'Oops', kind: 'fill' });
  });

  it('recurses into a nested precomp and finds its paints', () => {
    const inner = comp('Frame', [layer('InnerCard', { vectors: group([fill(RED)]) })]);
    const outer = comp('Board', [layer('Frame precomp', { source: inner })]);
    const v = verify.verdict(verify.scanComp(outer));
    expect(v.compsScanned).toBe(2);
    expect(v.redPaints).toHaveLength(1);
    expect(v.redPaints[0].layer).toBe('InnerCard');
  });

  it('finds a stroke nested inside an Offset Paths (Vector Group) wrapper', () => {
    // An INSIDE stroke lives in its own 'ADBE Vector Group' > 'ADBE Vectors Group'.
    // A correctly-coloured one must be seen (so recursion works) and pass.
    const c = comp('Board', [layer('Card', { vectors: group([vectorGroup([stroke(GREY)])]) })]);
    const v = verify.verdict(verify.scanComp(c));
    expect(v.clean).toBe(true);
    expect(v.redPaints).toHaveLength(0);
    // and if that nested stroke were the old red default, it would be caught:
    const bad = comp('Board2', [layer('Card', { vectors: group([vectorGroup([stroke(RED)])]) })]);
    expect(verify.verdict(verify.scanComp(bad)).redPaints).toHaveLength(1);
  });
});
