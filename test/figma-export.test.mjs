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

function gradientRect(gradientTransform, type) {
  return {
    id: '1:7', name: 'Grad', type: 'RECTANGLE', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
    width: 100, height: 50, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
    cornerRadius: 0, cornerSmoothing: 0,
    fills: [{
      type: type || 'GRADIENT_LINEAR', visible: true, opacity: 1,
      gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }],
      gradientTransform
    }],
    strokes: []
  };
}

function perSideRect() {
  const n = rectNode();
  n.id = '1:11';
  n.strokeTopWeight = 0; n.strokeRightWeight = 0; n.strokeBottomWeight = 2; n.strokeLeftWeight = 0;
  n.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]);
  return n;
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

function nestedFrameParent() {
  // A top-level frame containing an inner frame at (40, 30) that itself clips and
  // rounds its corners. The inner frame's child sits at absolute (60, 50), i.e.
  // (20, 20) inside the inner frame.
  const child = rectNode();
  child.id = '1:20';
  child.absoluteTransform = [[1, 0, 60], [0, 1, 50]];
  child.absoluteBoundingBox = { x: 60, y: 50, width: 100, height: 50 };
  const inner = {
    id: 'F2', name: 'Inner', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH',
    width: 100, height: 80, rotation: 0,
    absoluteTransform: [[1, 0, 40], [0, 1, 30]],
    absoluteBoundingBox: { x: 40, y: 30, width: 100, height: 80 },
    clipsContent: true,
    cornerRadius: 8, cornerSmoothing: 0,
    fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1, visible: true }],
    strokes: [], effects: [],
    children: [child]
  };
  return {
    id: 'F1', name: 'Outer', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH',
    width: 300, height: 200, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 200 },
    clipsContent: true,
    fills: [], strokes: [], effects: [],
    children: [inner]
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

  it('measures the text ink offset (renderBounds) so the host can land ink-to-ink', async () => {
    // Figma's line-height gap sits above the first line's cap: box top != ink
    // top. The exporter ships the renderer-measured offset; without it the host
    // lands AE ink on the box top and every label imports a few pixels high.
    const t = textNode();
    t.absoluteRenderBounds = { x: 41.2, y: 63.4, width: 117, height: 17 };
    const ir = await buildIR([t]);
    const node = ir.document.frames[0].children[0];
    expect(node.text.inkOffset.x).toBeCloseTo(1.2, 5);
    expect(node.text.inkOffset.y).toBeCloseTo(3.4, 5);
  });

  it('omits the ink offset when renderBounds are polluted or unusable', async () => {
    // Strokes/effects bleed into absoluteRenderBounds, and a rotated node's
    // AABB is not its box, so all three cases must fall back (no inkOffset).
    const withFx = textNode();
    withFx.absoluteRenderBounds = { x: 41, y: 63, width: 117, height: 17 };
    withFx.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.3 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, visible: true }];
    const withStroke = textNode();
    withStroke.absoluteRenderBounds = { x: 41, y: 63, width: 117, height: 17 };
    withStroke.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true }];
    const rotated = textNode();
    rotated.absoluteRenderBounds = { x: 41, y: 63, width: 117, height: 17 };
    rotated.rotation = 15;
    const none = textNode(); // no renderBounds at all (hidden / older API)
    for (const n of [withFx, withStroke, rotated, none]) {
      const ir = await buildIR([n]);
      expect(ir.document.frames[0].children[0].text.inkOffset).toBeUndefined();
    }
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

  it('rasterizes CROP / rotated / aspect-mismatched images, keeps aspect-matched FILL live', async () => {
    // The mock image is 4x4 (square). A 100x100 box matches -> live footage.
    const match = await buildIR([imageRect(undefined, { scaleMode: 'FILL', width: 100, height: 100 })]);
    expect(match.document.frames[0].children[0].imageHash).toBe('img1');
    // A 200x100 box does not match the square image -> COVER crop is baked.
    const stretched = await buildIR([imageRect(undefined, { scaleMode: 'FILL', width: 200, height: 100 })]);
    expect(stretched.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    // CROP never reproduces natively -> always rasterised.
    const crop = await buildIR([imageRect(undefined, { scaleMode: 'CROP' })]);
    expect(crop.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    // A rotated image paint -> rasterised so the rotation survives.
    const rot = await buildIR([imageRect(undefined, { scaleMode: 'FILL', rotation: 90 })]);
    expect(rot.document.frames[0].children[0].imageHash).toMatch(/^figraster-/);
    // FIT stays live (the importer reproduces contain exactly).
    const fit = await buildIR([imageRect(undefined, { scaleMode: 'FIT', width: 200, height: 100 })]);
    expect(fit.document.frames[0].children[0].imageHash).toBe('img1');
  });

  it('keeps a TILE pattern image live and carries the tile scale for native Motion Tile', async () => {
    // A TILE (pattern) paint must NOT rasterise: it stays a live IMAGE node so the
    // host repeats it with the native "ADBE Tile" effect. The scalingFactor and
    // imageTransform diagonal are carried as tile scale hints.
    const n = imageRect(undefined, { scaleMode: 'TILE' });
    n.fills[0].scalingFactor = 0.5;
    n.fills[0].imageTransform = [[2, 0, 0], [0, 3, 0]];
    const node = (await buildIR([n])).document.frames[0].children[0];
    expect(node.type).toBe('IMAGE');
    expect(node.imageHash).toBe('img1');
    expect(node.scaleMode).toBe('TILE');
    expect(node.tileScale).toBeCloseTo(0.5, 3);
    expect(node.tileWidthScale).toBeCloseTo(2, 3);
    expect(node.tileHeightScale).toBeCloseTo(3, 3);
    expect(validateMod.validate(await buildIR([n])).valid).toBe(true);
  });

  it('a TILE pattern with no scale hints defaults the tile scale to 1', async () => {
    const node = (await buildIR([imageRect(undefined, { scaleMode: 'TILE' })])).document.frames[0].children[0];
    expect(node.type).toBe('IMAGE');
    expect(node.scaleMode).toBe('TILE');
    expect(node.tileScale).toBe(1);
    expect(node.tileWidthScale).toBeUndefined();
  });

  it('derives gradient handle geometry from gradientTransform (not the REST-only field)', async () => {
    // Identity transform -> horizontal ramp across the box.
    const horiz = await buildIR([gradientRect([[1, 0, 0], [0, 1, 0]])]);
    const hh = horiz.document.frames[0].children[0].fills[0].gradientHandles;
    expect(hh[0][0]).toBeCloseTo(0, 3); expect(hh[0][1]).toBeCloseTo(25, 3);
    expect(hh[1][0]).toBeCloseTo(100, 3); expect(hh[1][1]).toBeCloseTo(25, 3);
    // A 90-degree transform -> vertical ramp (top to bottom at mid-x).
    const vert = await buildIR([gradientRect([[0, 1, 0], [1, 0, 0]])]);
    const vh = vert.document.frames[0].children[0].fills[0].gradientHandles;
    expect(vh[0][0]).toBeCloseTo(50, 3); expect(vh[0][1]).toBeCloseTo(0, 3);
    expect(vh[1][0]).toBeCloseTo(50, 3); expect(vh[1][1]).toBeCloseTo(50, 3);
    // Radial: the first handle is the centre (0.5,0.5) of the box.
    const rad = await buildIR([gradientRect([[1, 0, 0], [0, 1, 0]], 'GRADIENT_RADIAL')]);
    const rh = rad.document.frames[0].children[0].fills[0].gradientHandles;
    expect(rh[0][0]).toBeCloseTo(50, 3); expect(rh[0][1]).toBeCloseTo(25, 3);
  });

  it('keeps a 3-stop linear gradient editable (native rebuild, not rasterised)', async () => {
    // The host now rebuilds 2..8 stop linear/radial gradients as TRUE native
    // gradients (via the .ffx preset trick), so the exporter must NOT rasterise
    // them. A 3-stop gradient must arrive as a real shape with all its stops.
    const n = gradientRect([[1, 0, 0], [0, 1, 0]]);
    n.fills[0].gradientStops = [
      { position: 0, color: { r: 0.26, g: 0.84, b: 1, a: 1 } },
      { position: 0.48, color: { r: 0.06, g: 0.53, b: 0.81, a: 1 } },
      { position: 1, color: { r: 0.41, g: 0.66, b: 1, a: 1 } }
    ];
    const node = (await buildIR([n])).document.frames[0].children[0];
    expect(node.type).not.toBe('IMAGE');
    expect(node.fills[0].type).toBe('GRADIENT_LINEAR');
    expect(node.fills[0].stops.length).toBe(3);
    expect(node.fills[0].stops[1].position).toBeCloseTo(0.48, 3);
    expect(node.fills[0].stops[2].color.r).toBeCloseTo(0.41, 3);
  });

  it('keeps an angular (conic) gradient editable as GRADIENT_ANGULAR (host rebuilds it via Polar Coordinates)', async () => {
    // The host rebuilds angular gradients natively (horizontal G-Fill gradient +
    // an "ADBE Polar Coordinates" Rect-to-Polar effect), so the exporter must NOT
    // rasterise them. A 3-stop angular must arrive as a real shape with all stops
    // and its gradientHandles.
    const n = gradientRect([[1, 0, 0], [0, 1, 0]], 'GRADIENT_ANGULAR');
    n.fills[0].gradientStops = [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 0.5, color: { r: 0, g: 1, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
    ];
    n.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]);
    const ir = await buildIR([n]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).not.toBe('IMAGE');
    expect(node.type).toBe('RECTANGLE');
    expect(node.fills[0].type).toBe('GRADIENT_ANGULAR');
    expect(node.fills[0].stops.length).toBe(3);
    expect(node.fills[0].stops[1].color.g).toBeCloseTo(1, 3);
    expect(node.fills[0].gradientHandles.length).toBe(2);
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('keeps a diamond gradient editable as GRADIENT_DIAMOND (native vector gradient, not rasterised)', async () => {
    const n = gradientRect([[1, 0, 0], [0, 1, 0]], 'GRADIENT_DIAMOND');
    n.fills[0].gradientStops = [
      { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
      { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }
    ];
    n.exportAsync = async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]);
    const ir = await buildIR([n]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).not.toBe('IMAGE');
    expect(node.fills[0].type).toBe('GRADIENT_DIAMOND');
    expect(node.fills[0].stops.length).toBe(2);
    // Diamond uses the radial-style centre handle (0.5,0.5 -> box centre).
    expect(node.fills[0].gradientHandles[0][0]).toBeCloseTo(50, 3);
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('rasterizes a node with differing per-side stroke weights', async () => {
    const ir = await buildIR([perSideRect()]);
    const node = ir.document.frames[0].children[0];
    expect(node.type).toBe('IMAGE');
    expect(node.imageHash).toMatch(/^figraster-/);
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

  it('emits a nested frame as a real FRAME (precomp) with its chrome and re-based children', async () => {
    const ir = await buildIR([nestedFrameParent()]);
    const outer = ir.document.frames[0];
    const inner = outer.children[0];
    // The nested frame keeps its FRAME identity (not collapsed to a GROUP) so the
    // host can rebuild it as a clipping precomp.
    expect(inner.type).toBe('FRAME');
    expect(inner.clipsContent).toBe(true);
    expect(inner.buildMode).toBe('PRECOMP');
    expect(inner.cornerRadii.topLeft).toBe(8);
    expect(inner.background.length).toBe(1);
    // The nested frame is positioned within the outer frame (top-level relative).
    expect(inner.transform.x).toBe(40);
    expect(inner.transform.y).toBe(30);
    // Its child is re-based to the nested frame's own origin: absolute (60,50)
    // minus the nested frame origin (40,30) -> (20,20) local to the precomp.
    expect(inner.children[0].transform.x).toBe(20);
    expect(inner.children[0].transform.y).toBe(20);
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

// Ground-truth scenarios lifted from the user's real Branding board
// (file ExF7F6OQea07IneHpInnXU, node 55:2 — 1855 frames / 766 text / 124 vectors,
// nested up to 14 deep). Confirmed against the live Figma API: deep "Container"
// wrapper chains, a gradient card with TOP-ONLY corner rounding + an INSIDE border,
// and a 16-vector curve-graph "Icon". These encode that exact combination so a
// regression in collapse / per-corner radii / stroke-align / icon-merge is caught
// in CI, not on the user's next import.
describe('figma exporter -> IR (real Branding-board patterns)', () => {
  // A pure-layout wrapper frame (Figma auto-layout "Container"): draws nothing,
  // only positions its single child. sits at `abs` on the canvas.
  function container(id, abs, child) {
    return {
      id, name: 'Container', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH', isMask: false,
      width: 332, height: 168, rotation: 0,
      absoluteTransform: [[1, 0, abs[0]], [0, 1, abs[1]]],
      absoluteBoundingBox: { x: abs[0], y: abs[1], width: 332, height: 168 },
      fills: [], strokes: [], effects: [], clipsContent: false,
      children: [child]
    };
  }

  // The gradient card 57:59: linear ramp #1e63ff@8% -> #16e0c0@92%, top corners
  // rounded 5px (bottom square), a 1px INSIDE border #3b3c40, one child inside.
  function gradientCard(abs) {
    const inner = {
      id: '57:60', name: 'Swatch', type: 'RECTANGLE', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
      width: 20, height: 10, rotation: 0,
      absoluteTransform: [[1, 0, abs[0] + 4], [0, 1, abs[1] + 4]],
      absoluteBoundingBox: { x: abs[0] + 4, y: abs[1] + 4, width: 20, height: 10 },
      cornerRadius: 0, cornerSmoothing: 0,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true }], strokes: []
    };
    return {
      id: '57:59', name: 'Gradient Card', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH', isMask: false,
      width: 332, height: 168, rotation: 0,
      absoluteTransform: [[1, 0, abs[0]], [0, 1, abs[1]]],
      absoluteBoundingBox: { x: abs[0], y: abs[1], width: 332, height: 168 },
      clipsContent: false,
      // Per-corner: top rounded, bottom square (Figma topLeftRadius/... fields).
      topLeftRadius: 5, topRightRadius: 5, bottomRightRadius: 0, bottomLeftRadius: 0, cornerSmoothing: 0,
      fills: [{
        type: 'GRADIENT_LINEAR', visible: true, opacity: 1,
        gradientStops: [
          { position: 0.08, color: { r: 0.118, g: 0.388, b: 1, a: 1 } },
          { position: 0.92, color: { r: 0.086, g: 0.878, b: 0.753, a: 1 } }
        ],
        gradientTransform: [[1, 0, 0], [0, 1, 0]]
      }],
      strokes: [{ type: 'SOLID', color: { r: 0.231, g: 0.235, b: 0.251 }, opacity: 1, visible: true }],
      strokeWeight: 1, strokeAlign: 'INSIDE', strokeCap: 'NONE', strokeJoin: 'MITER',
      effects: [],
      children: [inner]
    };
  }

  // A top-level screen frame (like "Gradient" 57:2) at canvas origin (100,200).
  function screen(children) {
    return {
      id: '57:2', name: 'Gradient', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH', isMask: false,
      width: 400, height: 880, rotation: 0,
      absoluteTransform: [[1, 0, 100], [0, 1, 200]],
      absoluteBoundingBox: { x: 100, y: 200, width: 400, height: 880 },
      fills: [], strokes: [], effects: [], clipsContent: true,
      children
    };
  }

  it('collapses a deep Container wrapper chain and hoists the gradient card, position-safe', async () => {
    // screen(100,200) > Container(112,212) > Container(134,234) > gradientCard(156,256)
    const card = gradientCard([156, 256]);
    const chain = container('C1', [112, 212], container('C2', [134, 234], card));
    const ir = await buildIR([screen([chain])]);

    // Both pure-layout Containers collapse; the card hoists to the screen's own kids.
    expect(ir.document.stats.collapsed).toBe(2);
    const kids = ir.document.frames[0].children;
    expect(kids.length).toBe(1);
    const built = kids[0];
    expect(built.name).toBe('Gradient Card');
    // Position survives the collapse: absolute (156,256) minus screen origin (100,200).
    expect(built.transform.x).toBe(56);
    expect(built.transform.y).toBe(56);
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('keeps the gradient card 1:1 — linear stops at 8%/92%, top-only rounding, INSIDE 1px border', async () => {
    const ir = await buildIR([screen([gradientCard([156, 256])])]);
    const card = ir.document.frames[0].children[0];
    expect(card.type).toBe('FRAME');
    // Gradient rides the frame background as a real (non-rasterised) native ramp.
    const g = card.background[0];
    expect(g.type).toBe('GRADIENT_LINEAR');
    expect(g.stops[0].position).toBeCloseTo(0.08, 3);
    expect(g.stops[1].position).toBeCloseTo(0.92, 3);
    // Horizontal ramp (bg-gradient-to-r): mid-height, spanning the full width.
    expect(g.gradientHandles[0][1]).toBeCloseTo(84, 3);
    expect(g.gradientHandles[1][0]).toBeCloseTo(332, 3);
    // Per-corner radii preserved exactly (top 5, bottom 0) — NOT flattened to uniform.
    expect(card.cornerRadii.topLeft).toBe(5);
    expect(card.cornerRadii.topRight).toBe(5);
    expect(card.cornerRadii.bottomRight).toBe(0);
    expect(card.cornerRadii.bottomLeft).toBe(0);
    // Inside border with its real weight & alignment (host insets it via Offset Paths).
    expect(card.stroke.weight).toBe(1);
    expect(card.stroke.align).toBe('INSIDE');
    expect(validateMod.validate(ir).valid).toBe(true);
  });

  it('merges a 16-vector curve-graph Icon into ONE editable shape layer (not 16)', async () => {
    // The Home/Ease "Icon" frames hold ~16 stroked vectors (the graph). They must
    // become a single merged shape whose sub-groups are the 16 vectors — one layer.
    const vecs = [];
    for (let i = 0; i < 16; i++) {
      vecs.push({
        id: '49:' + (45 + i), name: 'Vector', type: 'VECTOR', visible: true, opacity: 1, blendMode: 'NORMAL', isMask: false,
        width: 4, height: 240, rotation: 0,
        absoluteTransform: [[1, 0, 200 + i], [0, 1, 260]],
        absoluteBoundingBox: { x: 200 + i, y: 260, width: 4, height: 240 },
        vectorPaths: [{ data: 'M0 0 L0 240', windingRule: 'NONZERO' }],
        fills: [], strokes: [{ type: 'SOLID', color: { r: 0.35, g: 0.6, b: 1 }, opacity: 1, visible: true }],
        strokeWeight: 1, strokeAlign: 'CENTER', strokeCap: 'ROUND', strokeJoin: 'ROUND'
      });
    }
    const icon = {
      id: '49:44', name: 'Icon', type: 'FRAME', visible: true, opacity: 1, blendMode: 'PASS_THROUGH', isMask: false,
      width: 330, height: 240, rotation: 0,
      absoluteTransform: [[1, 0, 200], [0, 1, 260]],
      absoluteBoundingBox: { x: 200, y: 260, width: 330, height: 240 },
      fills: [], strokes: [], effects: [], clipsContent: false,
      children: vecs
    };
    const ir = await buildIR([screen([icon])]);
    expect(ir.document.stats.merged).toBe(1);
    const built = ir.document.frames[0].children[0];
    expect(built.type).toBe('GROUP');
    expect(built.merged).toBe(true);
    expect(built.children.length).toBe(16);
    // countIRLayers treats the merged icon as ONE layer (its vectors ride it).
    // screen(1) + merged icon(1) = 2; the 16 vectors do NOT inflate the count.
    expect(ir.document.stats.layers).toBe(2);
    expect(validateMod.validate(ir).valid).toBe(true);
  });
});
