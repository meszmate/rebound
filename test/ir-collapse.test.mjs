import { describe, it, expect } from 'vitest';
import '../plugins/figma/src/ir-build.js';

const { isCollapsibleLayout } = globalThis.ReboundFigma;

// A pure-layout FRAME wrapper (no visual/structural role), with one child.
function frame(props) {
  return Object.assign({ type: 'FRAME', visible: true, children: [{ type: 'RECTANGLE' }] }, props);
}

describe('ir-build.isCollapsibleLayout', () => {
  it('collapses a pure-layout FRAME wrapper', () => {
    expect(isCollapsibleLayout(frame({}))).toBe(true);
  });

  it('collapses a pure GROUP', () => {
    expect(isCollapsibleLayout({ type: 'GROUP', visible: true, children: [{ type: 'TEXT' }] })).toBe(true);
  });

  it('keeps a frame with a visible fill / stroke', () => {
    expect(isCollapsibleLayout(frame({ fills: [{ type: 'SOLID', visible: true }] }))).toBe(false);
    expect(isCollapsibleLayout(frame({ strokes: [{ type: 'SOLID' }] }))).toBe(false);
  });

  it('keeps a clipping or rounded frame (needs a real container)', () => {
    expect(isCollapsibleLayout(frame({ clipsContent: true }))).toBe(false);
    expect(isCollapsibleLayout(frame({ cornerRadius: 8 }))).toBe(false);
    expect(isCollapsibleLayout(frame({ topLeftRadius: 4 }))).toBe(false);
  });

  it('keeps a frame with reduced opacity, non-normal blend, or an effect', () => {
    expect(isCollapsibleLayout(frame({ opacity: 0.5 }))).toBe(false);
    expect(isCollapsibleLayout(frame({ blendMode: 'MULTIPLY' }))).toBe(false);
    expect(isCollapsibleLayout(frame({ effects: [{ type: 'DROP_SHADOW', visible: true }] }))).toBe(false);
  });

  it('keeps a rotated wrapper (children inherit the rotation)', () => {
    expect(isCollapsibleLayout(frame({ rotation: 15 }))).toBe(false);
  });

  it('never collapses INSTANCE/COMPONENT (kept for reuse/de-dup)', () => {
    expect(isCollapsibleLayout({ type: 'INSTANCE', visible: true, children: [{}] })).toBe(false);
    expect(isCollapsibleLayout({ type: 'COMPONENT', visible: true, children: [{}] })).toBe(false);
  });

  it('never collapses a wrapper containing a mask child (mask scope)', () => {
    expect(isCollapsibleLayout(frame({ children: [{ isMask: true }, { type: 'RECTANGLE' }] }))).toBe(false);
  });

  it('is a mask wrapper -> keep', () => {
    expect(isCollapsibleLayout(frame({ isMask: true }))).toBe(false);
  });

  it('does not collapse an empty or hidden wrapper', () => {
    expect(isCollapsibleLayout(frame({ children: [] }))).toBe(false);
    expect(isCollapsibleLayout(frame({ visible: false }))).toBe(false);
  });

  it('passes a semi-transparent fill (visible) as a real fill', () => {
    // opacity>0 fill still counts as a visual; a fully invisible paint does not.
    expect(isCollapsibleLayout(frame({ fills: [{ type: 'SOLID', visible: false }] }))).toBe(true);
    expect(isCollapsibleLayout(frame({ fills: [{ type: 'SOLID', opacity: 0 }] }))).toBe(true);
  });
});

describe('ir-build.isIconGroup', () => {
  const { isIconGroup } = globalThis.ReboundFigma;
  const vec = (p) => Object.assign({ type: 'VECTOR', visible: true }, p);
  // A pure wrapper whose children are all leaf vectors.
  const icon = (kids, props) => Object.assign({ type: 'FRAME', visible: true, children: kids || [vec(), vec()] }, props);

  it('merges a wrapper of 2+ leaf vectors', () => {
    expect(isIconGroup(icon())).toBe(true);
    expect(isIconGroup({ type: 'GROUP', visible: true, children: [vec(), vec(), vec()] })).toBe(true);
  });

  it('needs at least two leaf children', () => {
    expect(isIconGroup(icon([vec()]))).toBe(false);
    expect(isIconGroup(icon([]))).toBe(false);
  });

  it('rejects a wrapper with a non-vector child (text/image/nested group)', () => {
    expect(isIconGroup(icon([vec(), { type: 'TEXT', visible: true }]))).toBe(false);
    expect(isIconGroup(icon([vec(), { type: 'VECTOR', visible: true, children: [vec()] }]))).toBe(false);
  });

  it('rejects a real card (wrapper has a fill / stroke / corner / clip)', () => {
    expect(isIconGroup(icon(null, { fills: [{ type: 'SOLID', visible: true }] }))).toBe(false);
    expect(isIconGroup(icon(null, { clipsContent: true }))).toBe(false);
    expect(isIconGroup(icon(null, { cornerRadius: 6 }))).toBe(false);
  });

  it('rejects a gradient-filled or rotated child (needs its own layer)', () => {
    expect(isIconGroup(icon([vec({ fills: [{ type: 'GRADIENT_LINEAR', visible: true }] }), vec()]))).toBe(false);
    expect(isIconGroup(icon([vec({ rotation: 30 }), vec()]))).toBe(false);
  });

  it('rejects a rotated or mask wrapper', () => {
    expect(isIconGroup(icon(null, { rotation: 10 }))).toBe(false);
    expect(isIconGroup(icon(null, { isMask: true }))).toBe(false);
  });
});

describe('ir-build.frameDrawsNothing', () => {
  const { frameDrawsNothing } = globalThis.ReboundFigma;

  it('drops an empty invisible frame (a zero-size spacer)', () => {
    expect(frameDrawsNothing({ type: 'FRAME', children: [], background: [] })).toBe(true);
  });

  it('keeps a frame that has children', () => {
    expect(frameDrawsNothing({ children: [{}] })).toBe(false);
  });

  it('keeps a frame with a real background / stroke / effect', () => {
    expect(frameDrawsNothing({ children: [], background: [{ type: 'SOLID' }] })).toBe(false);
    expect(frameDrawsNothing({ children: [], stroke: { paints: [{}] } })).toBe(false);
    expect(frameDrawsNothing({ children: [], effects: [{ type: 'DROP_SHADOW' }] })).toBe(false);
  });
});
