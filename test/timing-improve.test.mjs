import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Locks the timing-tool improvement wave against mock AE trees, running the
// REAL host command files:
//   - stagger.jsx  : the new distribution math (interval vs total span, the
//                    cubic ease curves) lands layers where the panel preview says.
//   - shapes.jsx   : the line primitive is a real two-point open path with a
//                    stroke, not a thin filled rectangle.
//   - break.jsx    : result fields + the selection handover (pieces selected,
//                    sources deselected) so a follow-up Stagger acts on them.
//   - textbreak.jsx: same handover, plus the box-text Lines support with every
//                    bail path locked via scripted sourceRectAtTime heights.

const dir = path.dirname(fileURLToPath(import.meta.url));
const hostSrc = (name) => readFileSync(path.join(dir, '../host/commands', name), 'utf8');

function loadHost(name, extraGlobals = {}) {
  const commands = {};
  const comp = {
    time: 0,
    frameRate: 24,
    width: 1920,
    height: 1080,
    _layers: [],
    get selectedLayers() { return this._layers.filter((l) => l.selected); }
  };
  const $ = {
    __rebound: {
      util: {
        MATCH: { transform: 'ADBE Transform Group', position: 'ADBE Position' },
        activeComp() { return comp; }
      },
      beginUndo() {},
      endUndo() {},
      register(cmd, fn) { commands[cmd] = fn; }
    }
  };
  const names = Object.keys(extraGlobals);
  new Function('$', ...names, hostSrc(name))($, ...names.map((n) => extraGlobals[n]));
  return { commands, comp };
}

// ---------------------------------------------------------------------------
// Stagger: distribution math
// ---------------------------------------------------------------------------

// A layer whose inPoint rides along with startTime, the way whole-layer time
// shifts behave in AE.
function timeLayer(name, index, inPoint) {
  return {
    name,
    index,
    label: 0,
    selected: true,
    _start: 0,
    _in: inPoint,
    get inPoint() { return this._in; },
    get startTime() { return this._start; },
    set startTime(v) { const d = v - this._start; this._start = v; this._in += d; }
  };
}

function staggerEnv(layers, time = 0) {
  const { commands, comp } = loadHost('stagger.jsx');
  comp.time = time;
  comp._layers = layers;
  return { apply: commands['stagger.apply'], comp };
}

function inPoints(layers) { return layers.map((l) => l.inPoint); }

describe('stagger.apply distribution math (real host code)', () => {
  it('interval mode: fixed steps from the playhead', () => {
    const L = [timeLayer('a', 1, 0), timeLayer('b', 2, 0), timeLayer('c', 3, 0)];
    const { apply } = staggerEnv(L, 1);
    const res = apply({ intervalFrames: 4, order: 'index', anchor: 'playhead' });
    expect(res.staggered).toBe(3);
    inPoints(L).forEach((v, i) => expect(v).toBeCloseTo(1 + i * 4 / 24, 9));
  });

  it('span mode, linear: the whole cascade fits spanFrames exactly', () => {
    const L = [timeLayer('a', 1, 0), timeLayer('b', 2, 0), timeLayer('c', 3, 0), timeLayer('d', 4, 0)];
    const { apply } = staggerEnv(L, 0);
    apply({ mode: 'span', spanFrames: 24, distribute: 'linear', order: 'index', anchor: 'playhead' });
    const exp = [0, 1 / 3, 2 / 3, 1];
    inPoints(L).forEach((v, i) => expect(v).toBeCloseTo(exp[i], 9));
  });

  it('span mode, ease out: delays follow 1-(1-u)^3, first and last pinned', () => {
    const L = [timeLayer('a', 1, 0), timeLayer('b', 2, 0), timeLayer('c', 3, 0), timeLayer('d', 4, 0)];
    const { apply } = staggerEnv(L, 0);
    apply({ mode: 'span', spanFrames: 24, distribute: 'out', order: 'index', anchor: 'playhead' });
    const f = (u) => 1 - Math.pow(1 - u, 3);
    inPoints(L).forEach((v, i) => expect(v).toBeCloseTo(f(i / 3), 9));
  });

  it('span mode, ease in: the middle layer bunches toward the start (u^3)', () => {
    const L = [timeLayer('a', 1, 0), timeLayer('b', 2, 0), timeLayer('c', 3, 0)];
    const { apply } = staggerEnv(L, 0);
    apply({ mode: 'span', spanFrames: 24, distribute: 'in', order: 'index', anchor: 'playhead' });
    expect(L[1].inPoint).toBeCloseTo(0.125, 9); // (0.5)^3 * 1s
    expect(L[2].inPoint).toBeCloseTo(1, 9);
  });

  it('span mode, ease both: the midpoint stays the midpoint', () => {
    const L = [timeLayer('a', 1, 0), timeLayer('b', 2, 0), timeLayer('c', 3, 0)];
    const { apply } = staggerEnv(L, 0);
    apply({ mode: 'span', spanFrames: 24, distribute: 'both', order: 'index', anchor: 'playhead' });
    expect(L[1].inPoint).toBeCloseTo(0.5, 9);
  });

  it('anchor first: the cascade starts at the earliest selected in-point', () => {
    const L = [timeLayer('a', 1, 2), timeLayer('b', 2, 0.5), timeLayer('c', 3, 1)];
    const { apply } = staggerEnv(L, 9); // playhead far away, must be ignored
    apply({ intervalFrames: 6, order: 'index', anchor: 'first' });
    inPoints(L).forEach((v, i) => expect(v).toBeCloseTo(0.5 + i * 0.25, 9));
  });

  it('a single layer lands on the base with no NaN (u guard)', () => {
    const L = [timeLayer('a', 1, 3)];
    const { apply } = staggerEnv(L, 2);
    const res = apply({ mode: 'span', spanFrames: 24, distribute: 'out', order: 'index', anchor: 'playhead' });
    expect(res.staggered).toBe(1);
    expect(L[0].inPoint).toBeCloseTo(2, 9);
  });

  it('a negative span clamps to zero: every layer lands on the base', () => {
    const L = [timeLayer('a', 1, 0), timeLayer('b', 2, 1)];
    const { apply } = staggerEnv(L, 0.5);
    apply({ mode: 'span', spanFrames: -12, order: 'index', anchor: 'playhead' });
    inPoints(L).forEach((v) => expect(v).toBeCloseTo(0.5, 9));
  });
});

// ---------------------------------------------------------------------------
// Shapes: the line primitive structure
// ---------------------------------------------------------------------------

// A generic AE-ish property node: addProperty() grows children by matchName,
// property() lazily vends sub-nodes, setValue() records the value.
function propNode(matchName) {
  return {
    matchName: matchName || '',
    children: [],
    props: {},
    _value: undefined,
    setValue(v) { this._value = v; },
    addProperty(mn) { const c = propNode(mn); this.children.push(c); return c; },
    property(name) { if (!this.props[name]) this.props[name] = propNode(name); return this.props[name]; }
  };
}

class ShapeMock {
  constructor() {
    this.vertices = [];
    this.inTangents = [];
    this.outTangents = [];
    this.closed = true;
  }
}

function shapesEnv() {
  const { commands, comp } = loadHost('shapes.jsx', { Shape: ShapeMock });
  const created = [];
  comp.layers = { addShape() { const L = propNode(''); created.push(L); return L; } };
  return { add: commands['shapes.add'], created };
}

function contentsOf(layer) {
  const root = layer.props['ADBE Root Vectors Group'];
  expect(root.children.length).toBe(1);
  expect(root.children[0].matchName).toBe('ADBE Vector Group');
  return root.children[0].props['ADBE Vectors Group'];
}

describe('shapes.add line primitive (real host code)', () => {
  it('line: a two-point OPEN path plus a stroke, no fill', () => {
    const { add, created } = shapesEnv();
    const res = add({ kind: 'line' });
    expect(res).toEqual({ created: 1, kind: 'line' });
    const layer = created[0];
    expect(layer.name).toBe('Line');
    const contents = contentsOf(layer);
    expect(contents.children.map((c) => c.matchName)).toEqual([
      'ADBE Vector Shape - Group',
      'ADBE Vector Graphic - Stroke'
    ]);
    const shape = contents.children[0].props['ADBE Vector Shape']._value;
    expect(shape).toBeInstanceOf(ShapeMock);
    expect(shape.closed).toBe(false);
    expect(shape.vertices).toEqual([[-100, 0], [100, 0]]);
    expect(shape.inTangents).toEqual([[0, 0], [0, 0]]);
    expect(shape.outTangents).toEqual([[0, 0], [0, 0]]);
    expect(contents.children[1].props['ADBE Vector Stroke Width']._value).toBe(6);
    // Centered on the comp.
    expect(layer.props['ADBE Transform Group'].props['ADBE Position']._value).toEqual([960, 540]);
  });

  it('rectangle keeps the filled-rect structure (the line is the only stroke case)', () => {
    const { add, created } = shapesEnv();
    add({ kind: 'rectangle' });
    const contents = contentsOf(created[0]);
    expect(contents.children.map((c) => c.matchName)).toEqual([
      'ADBE Vector Shape - Rect',
      'ADBE Vector Graphic - Fill'
    ]);
    expect(contents.children[0].props['ADBE Vector Rect Size']._value).toEqual([200, 200]);
  });

  it('star gets explicit radii (outer 100, inner 50)', () => {
    const { add, created } = shapesEnv();
    add({ kind: 'star' });
    const star = contentsOf(created[0]).children[0];
    expect(star.matchName).toBe('ADBE Vector Shape - Star');
    expect(star.props['ADBE Vector Star Outer Radius']._value).toBe(100);
    expect(star.props['ADBE Vector Star Inner Radius']._value).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Break: result fields + the selection handover
// ---------------------------------------------------------------------------

function breakShapeLayer(comp, name, groupNames) {
  const L = {
    name,
    selected: true,
    removed: false,
    groups: groupNames.map((g) => ({ matchName: 'ADBE Vector Group', name: g })),
    property(n) {
      if (n !== 'ADBE Root Vectors Group') return null;
      return {
        get numProperties() { return L.groups.length; },
        property(i) {
          const g = L.groups[i - 1];
          return {
            matchName: g.matchName,
            name: g.name,
            remove() { L.groups.splice(L.groups.indexOf(g), 1); }
          };
        }
      };
    },
    duplicate() {
      const dup = breakShapeLayer(comp, L.name, []);
      dup.groups = L.groups.map((g) => ({ ...g }));
      dup.selected = false;
      comp._layers.push(dup);
      return dup;
    },
    remove() { L.removed = true; comp._layers = comp._layers.filter((x) => x !== L); }
  };
  return L;
}

describe('break.apply selection handover (real host code)', () => {
  it('splits a 3-group layer, reports selected, and hands the selection to the pieces', () => {
    const { commands, comp } = loadHost('break.jsx');
    const src = breakShapeLayer(comp, 'Art', ['Sun', 'Moon', 'Star']);
    comp._layers = [src];
    const res = commands['break.apply']({ deleteOriginal: false });
    expect(res.created).toBe(3);
    expect(res.selected).toBe(3);
    expect(res.skipped).toEqual([]);
    const pieces = comp._layers.filter((l) => l !== src);
    expect(pieces.map((p) => p.name)).toEqual(['Sun', 'Moon', 'Star']);
    // Each piece kept exactly its own group.
    pieces.forEach((p, i) => {
      expect(p.groups.length).toBe(1);
      expect(p.groups[0].name).toBe(['Sun', 'Moon', 'Star'][i]);
    });
    // The handover: source deselected, every piece selected.
    expect(src.selected).toBe(false);
    pieces.forEach((p) => expect(p.selected).toBe(true));
    expect(comp.selectedLayers.length).toBe(3);
    comp.selectedLayers.forEach((l, i) => expect(l).toBe(pieces[i]));
  });

  it('a single-group layer is skipped honestly and nothing is reselected', () => {
    const { commands, comp } = loadHost('break.jsx');
    const src = breakShapeLayer(comp, 'Lonely', ['Only']);
    comp._layers = [src];
    const res = commands['break.apply']({});
    expect(res.created).toBe(0);
    expect(res.selected).toBe(0);
    expect(res.skipped).toEqual(['Lonely (single group)']);
    expect(src.selected).toBe(true); // untouched: no pieces means no handover
  });

  it('deleteOriginal removes the source; non-shape layers are skipped by name', () => {
    const { commands, comp } = loadHost('break.jsx');
    const src = breakShapeLayer(comp, 'Art', ['A', 'B']);
    const solid = { name: 'BG', selected: true, property() { return null; } };
    comp._layers = [src, solid];
    const res = commands['break.apply']({ deleteOriginal: true });
    expect(res.created).toBe(2);
    expect(res.skipped).toEqual(['BG (not a shape layer)']);
    expect(src.removed).toBe(true);
    expect(comp._layers).not.toContain(src);
    // The still-selected solid is deselected by the handover too.
    expect(solid.selected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Text Break: box-text Lines support + handover, bail paths locked with
// scripted sourceRectAtTime heights
// ---------------------------------------------------------------------------

const PJ = {
  LEFT_JUSTIFY: 'left',
  CENTER_JUSTIFY: 'center',
  RIGHT_JUSTIFY: 'right',
  FULL_JUSTIFY_LASTLINE_LEFT: 'full'
};
const BVA = { TOP: 'top', CENTER: 'center', BOTTOM: 'bottom' };

const H1 = 10;   // one-line ink height
const LEAD = 12; // per-extra-line height step

// Greedy word wrap into a box `limit` characters wide; overlong words hard-wrap
// mid-word. \r / \n force paragraph breaks (used by the leading probe).
function wrapLines(text, limit) {
  const out = [];
  for (const para of text.split(/\r\n|\r|\n/)) {
    const words = para.split(' ').filter((w) => w.length);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const w of words) {
      if (w.length > limit) {
        if (line) { out.push(line); line = ''; }
        let rest = w;
        while (rest.length > limit) { out.push(rest.slice(0, limit)); rest = rest.slice(limit); }
        line = rest;
      } else if (!line) {
        line = w;
      } else if (line.length + 1 + w.length <= limit) {
        line += ' ' + w;
      } else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

class TextLayerMock {
  constructor(comp, opts) {
    this._comp = comp;
    this.name = opts.name || 'Text';
    this.selected = opts.selected !== false;
    this._text = opts.text || '';
    this._boxText = opts.boxText !== false;
    this._just = opts.justification || PJ.LEFT_JUSTIFY;
    this._bva = opts.boxVerticalAlignment; // undefined = pre-24.6 host
    this._limit = opts.limit == null ? 999 : opts.limit;
    this._anchor = opts.anchor ? opts.anchor.slice() : [0, 0];
  }
  property(n) {
    const self = this;
    if (n === 'ADBE Text Properties') {
      return {
        property() {
          return {
            get value() {
              const doc = {
                text: self._text,
                boxText: self._boxText,
                justification: self._just,
                fontSize: 40
              };
              if (self._bva !== undefined) doc.boxVerticalAlignment = self._bva;
              return doc;
            },
            setValue(td) { self._text = td.text; }
          };
        }
      };
    }
    if (n === 'ADBE Transform Group') {
      return {
        property() {
          return {
            get value() { return self._anchor.slice(); },
            setValue(v) { self._anchor = v.slice(); }
          };
        }
      };
    }
    return null;
  }
  sourceRectAtTime() {
    const lines = wrapLines(this._text, this._limit);
    const count = Math.max(1, lines.length);
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, l.length);
    return { left: 0, top: 0, width: widest * 10, height: H1 + (count - 1) * LEAD };
  }
  duplicate() {
    const d = new TextLayerMock(this._comp, {
      name: this.name,
      selected: false,
      text: this._text,
      boxText: this._boxText,
      justification: this._just,
      boxVerticalAlignment: this._bva,
      limit: this._limit,
      anchor: this._anchor
    });
    this._comp._layers.push(d);
    return d;
  }
  remove() { this._comp._layers = this._comp._layers.filter((l) => l !== this); }
}

function textbreakEnv(layerOpts) {
  const { commands, comp } = loadHost('textbreak.jsx', {
    TextLayer: TextLayerMock,
    ParagraphJustification: PJ,
    BoxVerticalAlignment: BVA
  });
  const src = new TextLayerMock(comp, layerOpts);
  comp._layers = [src];
  return { apply: commands['textbreak.apply'], comp, src };
}

describe('textbreak.apply box text (real host code, scripted rect heights)', () => {
  it('Lines mode splits a two-line box by its visual wrap, stacks by leading, hands over the selection', () => {
    const { apply, comp, src } = textbreakEnv({ name: 'Box', text: 'alpha beta gamma delta', limit: 11, anchor: [5, 7] });
    const res = apply({ mode: 'lines' });
    expect(res.created).toBe(2);
    expect(res.selected).toBe(2);
    expect(res.skipped).toEqual([]);
    const pieces = comp._layers.filter((l) => l !== src);
    expect(pieces.length).toBe(2); // the temp measuring duplicate is gone
    expect(pieces.map((p) => p._text)).toEqual(['alpha beta', 'gamma delta']);
    expect(pieces.map((p) => p.name)).toEqual(['alpha beta', 'gamma delta']);
    // Only the line stacking moves: anchor.y shifts one leading per line.
    expect(pieces[0]._anchor).toEqual([5, 7]);
    expect(pieces[1]._anchor).toEqual([5, 7 - LEAD]);
    // The handover: source deselected, both pieces selected.
    expect(src.selected).toBe(false);
    pieces.forEach((p) => expect(p.selected).toBe(true));
  });

  it('Words mode on box text keeps the honest skip', () => {
    const { apply, comp, src } = textbreakEnv({ name: 'Box', text: 'alpha beta gamma delta', limit: 11 });
    const res = apply({ mode: 'words' });
    expect(res.created).toBe(0);
    expect(res.selected).toBe(0);
    expect(res.skipped).toEqual(['Box (box text: use Lines mode)']);
    expect(comp._layers.length).toBe(1);
    expect(comp._layers[0]).toBe(src); // nothing created, no temp left
  });

  it('a mid-word wrap bails cleanly (no pieces, temp duplicate removed)', () => {
    const { apply, comp, src } = textbreakEnv({ name: 'Box', text: 'extraordinarily big', limit: 8 });
    const res = apply({ mode: 'lines' });
    expect(res.created).toBe(0);
    expect(res.skipped).toEqual(['Box (box text wraps mid-word)']);
    expect(comp._layers.length).toBe(1);
    expect(comp._layers[0]).toBe(src);
    expect(src.selected).toBe(true);
  });

  it('full-justified box text bails before measuring anything', () => {
    const { apply, comp, src } = textbreakEnv({
      name: 'Box', text: 'alpha beta gamma delta', limit: 11,
      justification: PJ.FULL_JUSTIFY_LASTLINE_LEFT
    });
    const res = apply({ mode: 'lines' });
    expect(res.created).toBe(0);
    expect(res.skipped).toEqual(['Box (box text: justified paragraphs re-flow)']);
    expect(comp._layers.length).toBe(1);
    expect(comp._layers[0]).toBe(src);
  });

  it('a non-top-aligned box bails (the anchor shift assumes top stacking)', () => {
    const { apply, comp, src } = textbreakEnv({
      name: 'Box', text: 'alpha beta gamma delta', limit: 11,
      boxVerticalAlignment: BVA.CENTER
    });
    const res = apply({ mode: 'lines' });
    expect(res.created).toBe(0);
    expect(res.skipped).toEqual(['Box (box text: only top-aligned boxes)']);
    expect(comp._layers.length).toBe(1);
    expect(comp._layers[0]).toBe(src);
  });

  it('a box that renders as one visual line is a single-line skip', () => {
    const { apply, comp, src } = textbreakEnv({ name: 'Box', text: 'short words', limit: 40 });
    const res = apply({ mode: 'lines' });
    expect(res.created).toBe(0);
    expect(res.skipped).toEqual(['Box (single line)']);
    expect(comp._layers.length).toBe(1);
    expect(comp._layers[0]).toBe(src);
  });

  it('point text words mode: pieces created, anchors offset by prefix width, selection handed over', () => {
    const { apply, comp, src } = textbreakEnv({ name: 'Title', text: 'GO FAST', boxText: false });
    const res = apply({ mode: 'words' });
    expect(res.created).toBe(2);
    expect(res.selected).toBe(2);
    expect(res.skipped).toEqual([]);
    const pieces = comp._layers.filter((l) => l !== src);
    expect(pieces.map((p) => p._text)).toEqual(['GO', 'FAST']);
    // 'GO' sits at the line start; 'FAST' is offset by the width of 'GO '
    // (3 chars * 10px in the scripted rect model): anchor.x = 0 + (0 - 30).
    expect(pieces[0]._anchor).toEqual([0, 0]);
    expect(pieces[1]._anchor).toEqual([-30, 0]);
    expect(src.selected).toBe(false);
    pieces.forEach((p) => expect(p.selected).toBe(true));
  });
});
