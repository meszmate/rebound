import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Panel polish pass: the mechanical description de-duplication (a card titled
// "Spring" must not start its description with "Spring."), and the new shared
// R.ui surface (emptyState / flashSuccess) that main.js and home-screen.js
// call unconditionally.

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

function loadModule(rel, R) {
  const src = readFileSync(path.join(root, rel), 'utf8');
  const fn = new Function('window', src);
  fn({ Rebound: R });
  return R;
}

function stubRuntime() {
  const noop = () => {};
  return {
    dom: { el: () => ({ classList: { add: noop, toggle: noop }, appendChild: noop, addEventListener: noop, style: {} }), on: noop, clear: noop },
    ui: {},
    brand: { MARK: '<svg></svg>' },
    units: { round: (v) => v },
    easing: { sampler: { toFunction: () => () => 0 } },
    disk: { read: () => null, write: noop },
    log: { info: noop, warn: noop, error: noop }
  };
}

describe('toolMeta.stripLead', () => {
  const R = loadModule('client/js/ui/tool-meta.js', stubRuntime());
  const strip = R.toolMeta.stripLead;

  it('strips a leading tool name with a period', () => {
    expect(strip('Spring', "Spring. The engine's real physical overshoot."))
      .toBe("The engine's real physical overshoot.");
  });

  it('strips colon / dash separators and re-capitalises', () => {
    expect(strip('Recoil', 'Recoil: velocity-driven wobble.')).toBe('Velocity-driven wobble.');
    expect(strip('Align', 'Align — snaps layers to an edge.')).toBe('Snaps layers to an edge.');
  });

  it('is case-insensitive on the name', () => {
    expect(strip('arrange', 'Arrange packs layers into an even grid.'))
      .toBe('Arrange packs layers into an even grid.'); // no separator: untouched
    expect(strip('ARRANGE', 'arrange. Packs layers.')).toBe('Packs layers.');
  });

  it('leaves text alone when the name is only a prefix of a word', () => {
    expect(strip('Ease', 'Ease selected keyframes in and out.'))
      .toBe('Ease selected keyframes in and out.');
  });

  it('handles empty / missing input', () => {
    expect(strip('', 'Whatever.')).toBe('Whatever.');
    expect(strip('Spring', '')).toBe('');
    expect(strip('Spring', 'Spring. ')).toBe('Spring. '); // nothing left: keep original
  });

  it('escapes regex metacharacters in the name', () => {
    expect(strip('Null + Parent', 'Null + Parent. Creates a null.')).toBe('Creates a null.');
  });
});

describe('shared R.ui polish surface', () => {
  const R = loadModule('client/js/ui/controls.js', stubRuntime());

  it('exports emptyState and flashSuccess', () => {
    expect(typeof R.ui.emptyState).toBe('function');
    expect(typeof R.ui.flashSuccess).toBe('function');
  });

  it('flashSuccess tolerates a missing button', () => {
    expect(() => R.ui.flashSuccess(null)).not.toThrow();
  });
});

describe('copy rules', () => {
  it('settings help copy carries no em dash prose', () => {
    const src = readFileSync(path.join(root, 'client/js/features/settings-panel.js'), 'utf8');
    // The bare '—' chord placeholder is a value marker, not prose; prose em
    // dashes always ride whitespace.
    expect(/—\s/.test(src)).toBe(false);
  });

  it('the fixed import.js strings carry no em dash', () => {
    const src = readFileSync(path.join(root, 'client/js/features/import.js'), 'utf8');
    const autoPrecomp = src.match(/On \(default\): a big design lands[^']*/);
    const update = src.match(/On: re-importing the same design[^']*/);
    expect(autoPrecomp && autoPrecomp[0]).not.toMatch(/—/);
    expect(update && update[0]).not.toMatch(/—/);
  });
});
