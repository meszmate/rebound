import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Validate the in-AE 1:1 self-check by loading the REAL host/commands/import/audit.jsx
// in Node. This is the reconciliation that runs on the user's machine after an
// import and flags any silent loss of layers — the piece that turns "the logic is
// right" into "and the actual build accounted for every element".

let audit;

beforeAll(() => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(dir, '../host/commands/import/audit.jsx'), 'utf8');
  const $ = { __rebound: { importer: {} } };
  new Function('$', src)($);
  audit = $.__rebound.importer.audit;
});

describe('host import audit.countExpected', () => {
  it('counts every visible node recursively', () => {
    const frames = [{ children: [{}, { children: [{}, {}] }] }];
    // frame(1) + leaf(1) + mid(1) + mid's two leaves(2) = 5
    expect(audit.countExpected(frames)).toBe(5);
  });

  it('counts a merged icon as ONE (its vectors ride the single shape)', () => {
    const merged = { merged: true, children: [{}, {}, {}] };
    expect(audit.countExpected([merged])).toBe(1);
    expect(audit.countExpected([{ children: [merged, {}] }])).toBe(3); // frame + merged(1) + leaf
  });

  it('excludes invisible nodes (the host skips them too)', () => {
    expect(audit.countExpected([{ visible: false, children: [{}, {}] }])).toBe(0);
    expect(audit.countExpected([{ children: [{ visible: false }, {}] }])).toBe(2); // frame + one visible leaf
  });

  it('tolerates holes / empty input', () => {
    expect(audit.countExpected([{}, null, { children: [] }])).toBe(2);
    expect(audit.countExpected(null)).toBe(0);
  });
});

describe('host import audit.reconcile', () => {
  it('passes when built + skipped accounts for every expected node', () => {
    const r = audit.reconcile(10, { framesBuilt: 3, layersBuilt: 6, skipped: [{}] });
    expect(r.accounted).toBe(10);
    expect(r.missing).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('flags a NET deficit — layers that silently vanished', () => {
    // Expected 10, built 6 (+2 frames) = 8, 0 skipped -> 2 missing.
    const r = audit.reconcile(10, { framesBuilt: 2, layersBuilt: 6, skipped: [] });
    expect(r.missing).toBe(2);
    expect(r.ok).toBe(false);
  });

  it('never reports a false deficit when chrome/containers push the tally over', () => {
    // Container + background + chrome layers legitimately exceed the node count.
    const r = audit.reconcile(5, { framesBuilt: 4, layersBuilt: 7, skipped: [] });
    expect(r.missing).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('run() reconciles a full IR document against its report', () => {
    const ir = { document: { frames: [{ children: [{}, { merged: true, children: [{}, {}] }] }] } };
    // expected = frame(1) + leaf(1) + merged(1) = 3
    const clean = audit.run(ir, { framesBuilt: 1, layersBuilt: 2, skipped: [] });
    expect(clean.expected).toBe(3);
    expect(clean.ok).toBe(true);
    const lossy = audit.run(ir, { framesBuilt: 1, layersBuilt: 0, skipped: [] });
    expect(lossy.missing).toBe(2);
    expect(lossy.ok).toBe(false);
  });
});
