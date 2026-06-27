import { describe, it, expect, beforeAll } from 'vitest';
import normalize from '../shared/lib/normalize.js';
import bezier from '../shared/lib/bezier.js';
import validateMod from '../shared/lib/validate.js';

// Exercise the Figma IR builder (which runs in the Figma sandbox) against a
// mocked figma environment, then validate its output with the shared validator.
// This covers the exporter -> IR -> contract path that the AE importer relies on.

const MIXED = Symbol('figma.mixed');

function mockFigma() {
  return {
    mixed: MIXED,
    root: { name: 'Test File' },
    getImageByHash() {
      return {
        getBytesAsync: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]),
        getSizeAsync: async () => ({ width: 4, height: 4 })
      };
    },
    base64Encode: () => 'iVBORw0KGgo='
  };
}

function rectNode() {
  return {
    id: '1:1', name: 'Box', type: 'RECTANGLE', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
    width: 100, height: 50, rotation: 0,
    absoluteTransform: [[1, 0, 20], [0, 1, 30]],
    absoluteBoundingBox: { x: 20, y: 30, width: 100, height: 50 },
    cornerRadius: 8, cornerSmoothing: 0,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1, visible: true }],
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
    strokeWeight: 2, strokeAlign: 'CENTER', strokeCap: 'NONE', strokeJoin: 'MITER',
    effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.3 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, visible: true }]
  };
}

function textNode() {
  return {
    id: '1:2', name: 'Label', type: 'TEXT', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
    width: 120, height: 24, rotation: 0,
    absoluteTransform: [[1, 0, 40], [0, 1, 60]],
    absoluteBoundingBox: { x: 40, y: 60, width: 120, height: 24 },
    characters: 'Hi', fontSize: 16,
    textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP', textAutoResize: 'NONE', paragraphSpacing: 0,
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
    strokes: [], effects: [],
    getStyledTextSegments() {
      return [{
        start: 0, end: 2, characters: 'Hi',
        fontName: { family: 'Inter', style: 'Bold' }, fontSize: 16,
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
        letterSpacing: { unit: 'PERCENT', value: 0 }, lineHeight: { unit: 'AUTO' },
        textCase: 'ORIGINAL', textDecoration: 'NONE'
      }];
    }
  };
}

function shadowRect(blendMode) {
  const n = rectNode();
  n.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.3 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, visible: true, blendMode }];
  return n;
}

function pieEllipse() {
  return {
    id: '1:3', name: 'Pie', type: 'ELLIPSE', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
    width: 80, height: 80, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 80 },
    arcData: { startingAngle: 0, endingAngle: Math.PI, innerRadius: 0.5 },
    fillGeometry: [{ data: 'M0 0 L80 0 L80 40 L0 40 Z', windingRule: 'NONZERO' }],
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 }, opacity: 1, visible: true }],
    strokes: []
  };
}

function maskRect(id, isMask, maskType) {
  return {
    id, name: 'r' + id, type: 'RECTANGLE', visible: true, opacity: 1, blendMode: 'NORMAL',
    isMask: !!isMask, maskType,
    width: 50, height: 50, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 },
    cornerRadius: 0, cornerSmoothing: 0,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true }],
    strokes: []
  };
}

function frameWithChrome() {
  return {
    id: 'F1', name: 'Card', type: 'FRAME', visible: true, opacity: 0.9, blendMode: 'PASS_THROUGH',
    width: 200, height: 120, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 120 },
    clipsContent: true,
    cornerRadius: 12, cornerSmoothing: 0,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true }],
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }],
    strokeWeight: 2, strokeAlign: 'INSIDE', strokeCap: 'NONE', strokeJoin: 'MITER',
    effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 8 }, radius: 16, spread: 0, visible: true }],
    children: [rectNode()]
  };
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]);

function noiseRect() {
  const n = rectNode();
  n.id = '1:9';
  n.effects = [{ type: 'NOISE', visible: true }];
  n.exportAsync = async () => PNG_BYTES;
  return n;
}

function imageRect(filters, opts) {
  opts = opts || {};
  const w = opts.width || 100, h = opts.height || 100;
  const paint = { type: 'IMAGE', imageHash: 'img1', scaleMode: opts.scaleMode || 'FILL', visible: true, filters };
  if (opts.rotation) paint.rotation = opts.rotation;
  return {
    id: '1:10', name: 'Photo', type: 'RECTANGLE', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
    width: w, height: h, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: w, height: h },
    cornerRadius: 0, cornerSmoothing: 0,
    fills: [paint],
    strokes: [],
    exportAsync: async () => PNG_BYTES
  };
}

let buildIR;

beforeAll(async () => {
  globalThis.ReboundNormalize = normalize;
  globalThis.ReboundBezier = bezier;
  globalThis.figma = mockFigma();
  await import('../plugins/figma/src/ir-build.js');
  buildIR = globalThis.ReboundFigma.buildIR;
});

describe('figma exporter -> IR', () => {
  it('produces a valid IR document the validator accepts', async () => {
    const ir = await buildIR([rectNode(), textNode()]);
    const res = validateMod.validate(ir);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });

  it('wraps loose selection in one synthetic frame', async () => {
    const ir = await buildIR([rectNode(), textNode()]);
    expect(ir.source.app).toBe('figma');
    expect(ir.document.frames.length).toBe(1);
    expect(ir.document.frames[0].children.length).toBe(2);
  });

  it('keeps the rectangle parametric with corner radius and a stroke', async () => {
    const ir = await buildIR([rectNode()]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).toBe('RECTANGLE');
    expect(node.primitive.rect.size).toEqual([100, 50]);
    expect(node.cornerRadii.topLeft).toBe(8);
    expect(node.stroke.weight).toBe(2);
    expect(node.effects[0].type).toBe('DROP_SHADOW');
  });

  it('copies text content and per-run font', async () => {
    const ir = await buildIR([textNode()]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).toBe('TEXT');
    expect(node.text.characters).toBe('Hi');
    expect(node.text.runs[0].fontFamily).toBe('Inter');
    expect(node.text.runs[0].fontStyle).toBe('Bold');
    expect(node.text.runs[0].fontSize).toBe(16);
  });

  it('carries a shadow blend mode through to the IR (and omits the default)', async () => {
    const withBlend = await buildIR([shadowRect('MULTIPLY')]);
    expect(withBlend.document.frames[0].children[0].effects[0].blendMode).toBe('MULTIPLY');
    const plain = await buildIR([shadowRect('NORMAL')]);
    expect(plain.document.frames[0].children[0].effects[0].blendMode).toBeUndefined();
  });

  it('rebuilds an ellipse arc/ring as paths plus arc metadata', async () => {
    const ir = await buildIR([pieEllipse()]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).toBe('ELLIPSE');
    expect(node.primitive.ellipse.arc.innerRadius).toBe(0.5);
    expect(node.primitive.ellipse.arc.endAngle).toBeCloseTo(180, 3);
    expect(node.paths.length).toBeGreaterThan(0);
    const res = validateMod.validate(ir);
    expect(res.valid).toBe(true);
  });

  it('wires a mask to its following siblings (multi-target + luma)', async () => {
    const ir = await buildIR([maskRect('m1', true, 'LUMINANCE'), maskRect('a'), maskRect('b')]);
    const mask = ir.document.frames[0].children[0];
    expect(mask.maskType).toBe('LUMA');
    expect(mask.maskTargetId).toBe('a');
    expect(mask.maskTargetIds).toEqual(['a', 'b']);
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('a single-target mask uses maskTargetId only and defaults to alpha', async () => {
    const ir = await buildIR([maskRect('m1', true), maskRect('a')]);
    const mask = ir.document.frames[0].children[0];
    expect(mask.maskType).toBe('ALPHA');
    expect(mask.maskTargetId).toBe('a');
    expect(mask.maskTargetIds).toBeUndefined();
  });

  it('a second mask starts a new group (does not capture the first mask’s targets)', async () => {
    const ir = await buildIR([maskRect('m1', true), maskRect('a'), maskRect('m2', true), maskRect('b')]);
    const kids = ir.document.frames[0].children;
    expect(kids[0].maskTargetId).toBe('a');
    expect(kids[0].maskTargetIds).toBeUndefined();
    expect(kids[2].maskTargetId).toBe('b');
  });

  it('rasterizes a node carrying an unreproducible (noise) effect', async () => {
    const ir = await buildIR([noiseRect()]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).toBe('IMAGE');
    expect(node.imageHash).toMatch(/^figraster-/);
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('rasterizes an image with photo filters but keeps a plain image as raw footage', async () => {
    const adjusted = await buildIR([imageRect({ exposure: 0.5 })]);
    expect(adjusted.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    const plain = await buildIR([imageRect()]);
    const node = plain.document.frames[0].children[0];
    expect(node.type).toBe('IMAGE');
    expect(node.imageHash).toBe('img1');
  });

  it('rasterizes CROP / TILE / rotated / aspect-mismatched images, keeps aspect-matched FILL live', async () => {
    // The mock image is 4x4 (square). A 100x100 box matches -> live footage.
    const match = await buildIR([imageRect(undefined, { scaleMode: 'FILL', width: 100, height: 100 })]);
    expect(match.document.frames[0].children[0].imageHash).toBe('img1');
    // A 200x100 box does not match the square image -> COVER crop is baked.
    const stretched = await buildIR([imageRect(undefined, { scaleMode: 'FILL', width: 200, height: 100 })]);
    expect(stretched.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    // CROP and TILE never reproduce natively -> always rasterised.
    const crop = await buildIR([imageRect(undefined, { scaleMode: 'CROP' })]);
    expect(crop.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    const tile = await buildIR([imageRect(undefined, { scaleMode: 'TILE' })]);
    expect(tile.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    // A rotated image paint -> rasterised so the rotation survives.
    const rot = await buildIR([imageRect(undefined, { scaleMode: 'FILL', rotation: 90 })]);
    expect(rot.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    // FIT stays live (the importer reproduces contain exactly).
    const fit = await buildIR([imageRect(undefined, { scaleMode: 'FIT', width: 200, height: 100 })]);
    expect(fit.document.frames[0].children[0].imageHash).toBe('img1');
  });

  it('carries frame chrome (shadow / border / corners / opacity) onto the precomp frame', async () => {
    const ir = await buildIR([frameWithChrome()]);
    const frame = ir.document.frames[0];
    expect(frame.opacity).toBe(0.9);
    expect(frame.blendMode).toBeUndefined(); // PASS_THROUGH is the default, omitted
    expect(frame.effects[0].type).toBe('DROP_SHADOW');
    expect(frame.stroke.weight).toBe(2);
    expect(frame.cornerRadii.topLeft).toBe(12);
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('places nodes in frame-relative coordinates', async () => {
    const ir = await buildIR([rectNode()]);
    const node = ir.document.frames[0].children[0];
    // Synthetic frame origin is the rect's own bbox, so it lands at 0,0.
    expect(node.transform.x).toBe(0);
    expect(node.transform.y).toBe(0);
    expect(node.transform.width).toBe(100);
  });
});
