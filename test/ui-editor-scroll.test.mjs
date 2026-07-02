import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Regression guard for the editing-view UX fixes (there is no DOM test env, so
// these lock the CSS/JS patterns that made the fixes, preventing a silent
// reintroduction of the "too big / can't resize / buggy scrolling" behaviour).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// Extract the body of the first CSS rule whose selector line starts with `sel`.
function ruleBody(css, sel) {
  const i = css.indexOf(sel + ' {');
  if (i < 0) return null;
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('editing view — scroll is not swallowed by the graph', () => {
  const css = read('client/css/curve-editor.css');
  it('the whole .rb-curve graph does NOT set touch-action:none (would eat scroll)', () => {
    const body = ruleBody(css, '.rb-curve');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/touch-action\s*:\s*none/);
  });
  it('touch-action:none is scoped to the draggable handles instead', () => {
    expect(css).toMatch(/\.rb-handle\s*\{[^}]*touch-action\s*:\s*none/);
    expect(css).toMatch(/\.rb-handle-hit\s*\{[^}]*touch-action\s*:\s*none/);
  });
  it('handles have an enlarged invisible hit target (easy to grab)', () => {
    expect(css).toMatch(/\.rb-handle-hit\s*\{[^}]*fill\s*:\s*transparent/);
    expect(read('client/js/ui/curve-editor.js')).toMatch(/rb-handle-hit/);
  });
});

describe('editing view — tool body scrolls predictably (no multi-column)', () => {
  const layout = read('client/css/layout.css');
  it('the wide-panel rule no longer flows the tool body into CSS columns', () => {
    // column-width on the scrolling tool body caused scroll to jump between
    // columns and sliced the graph across them.
    expect(layout).not.toMatch(/\.rb-tool-host\s*>\s*\.rb-col\s*\{[^}]*column-width/);
  });
  it('it uses a centered, capped single column instead', () => {
    expect(layout).toMatch(/\.rb-tool-host\s*>\s*\.rb-col\s*\{[^}]*max-width/);
  });
});

describe('tool panel — the scroll chain is height-bounded', () => {
  // .rb-main is a vertical flex column inside the column #rb-app; without
  // min-height:0 it overflows (clipped by #rb-app's overflow:hidden) and the tool
  // body can never scroll — "it won't go down / the bottom is cut off".
  it('.rb-main sets min-height:0 so inner overflow-y:auto can scroll', () => {
    const body = ruleBody(read('client/css/nav.css'), '.rb-main');
    expect(body).not.toBeNull();
    expect(body).toMatch(/min-height\s*:\s*0/);
  });
});

describe('theme — no color-mix() (unsupported by AE CEF Chromium)', () => {
  // AE's CEF drops any declaration using color-mix(), so tints/backgrounds go
  // invisible. All tints must use rgba(var(--x-rgb), a) instead.
  const files = [
    'client/css/base.css', 'client/css/home.css', 'client/css/components.css',
    'client/css/import.css', 'client/css/layout.css', 'client/css/nav.css',
    'client/css/curve-editor.css'
  ];
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const f of files) {
    it(`${f.split('/').pop()} has no functional color-mix()`, () => {
      expect(stripComments(read(f))).not.toMatch(/color-mix\(/);
    });
  }
  it('theme.js publishes the rgba() triplet tokens', () => {
    const t = read('client/js/core/theme.js');
    expect(t).toMatch(/--rb-accent-rgb/);
    expect(t).toMatch(/accentRgb/);
  });
});

describe('editing view — the graph is resizable', () => {
  it('R.ui.resizeHandle exists', () => {
    const controls = read('client/js/ui/controls.js');
    expect(controls).toMatch(/R\.ui\.resizeHandle\s*=\s*resizeHandle/);
    // persists a remembered height and clamps to a [min,max] range
    expect(controls).toMatch(/R\.disk\.write/);
    expect(controls).toMatch(/function clampH/);
  });
  it('every curve-editor tool wires a resize handle', () => {
    for (const tool of ['ease', 'spring', 'recoil', 'bounce']) {
      expect(read(`client/js/features/${tool}.js`)).toMatch(/ui\.resizeHandle\(/);
    }
  });
});
