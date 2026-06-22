# Rebound, contributor & agent guide

Rebound is a free **After Effects panel** for easing, springs, and
motion-design workflow tools. It is a buildless Adobe **CEP** extension: an
HTML/CSS/JS panel that talks to an **ExtendScript** host.

This file is the source of truth for how the project is built. `CLAUDE.md` is a
symlink to it.

---

## Principles

1. **Original, clean-room code.** Everything is implemented from first
   principles against *public* specifications, CSS cubic-bezier timing, the
   Penner easing equations, spring physics (a damped harmonic oscillator), and
   Adobe's documented ExtendScript / CEP APIs. We do **not** copy any other
   product's source, scripts, assets, preset names, or interface. The only
   vendored third-party file is Adobe's `client/js/lib/CSInterface.js`.
2. **Describe features by what they do.** In code, comments, and docs, name a
   feature by its behavior (e.g. "physical spring easing", "anchor-point
   repositioning"), not by any other tool. Keep competitor brand names out of
   the codebase.
3. **Buildless.** No bundler. Plain files loaded in dependency order. The same
   pure-logic modules run in the panel *and* under Node tests.
4. **Non-destructive by default, bakeable on demand.** Prefer native temporal
   ease and live expressions; always offer a clean bake. Always tell the user
   which mode was used.
5. **A Home widget is ONE simple control, not the whole tool.** When a tool is
   embedded as a Home widget it shows a single primary control, the interactive
   heart of the tool, filling the box edge to edge, exactly like the Ease widget
   (just its curve) and the Anchor widget (just its 9-point stage). A widget is
   never the tool's full control panel shrunk into a box. Secondary options are
   not crammed in next to it; they live in the full tool, one click away via the
   widget's open control, so they are easy to reach without taking space or
   bothering the main control. See "Home & widget UX" below.

---

## Repository layout

```
CSXS/manifest.xml        CEP manifest, declares the panel + settings extensions
.debug                   CEP remote-debug ports (panel 8718, settings 8719)

client/                  the panel (HTML/CSS/JS), runs in CEP's Chromium
  index.html             main panel; lists every script in load order
  settings.html          settings/preferences extension
  css/                   design system (base, components, layout, curve-editor)
  js/
    lib/CSInterface.js   vendored Adobe bridge library
    core/                bridge, theme, store, registry, dom, events, units, log
    easing/              pure math: bezier, penner, spring, sampler (UMD, tested)
    presets/             built-in preset library
    ui/                  controls + the curve editor widget
    features/            one file per tool (registers itself)
    main.js              shell bootstrap (loaded last)

host/                    ExtendScript host (ES3), runs in After Effects
  index.jsx              entry; evaluates lib + command modules in order
  lib/                   json (polyfill), core (RPC dispatch), util (helpers)
  commands/              one file per command group; registers handlers

docs/                    FEATURES, INSTALL, DEVELOPMENT, ARCHITECTURE
test/                    Vitest unit tests for the math + units core
tools/                   Node dev tooling (icons, cert, pack, install, debug)
```

---

## Architecture in one screen

- **Bridge (`client/js/core/bridge.js`)**, the only module that touches
  CSInterface. `Rebound.bridge.invoke(method, args)` returns a Promise of a host
  command's result. evalScript is async on Windows, sync on macOS, and always
  returns a string, so every call goes through a JSON envelope.
- **Host RPC (`host/lib/core.jsx`)**, `$.__rebound.dispatch(method, argsJson)`
  returns `{"ok":true,"data":…}` or `{"ok":false,"error":…}`. Commands
  registered with an undo label run inside one `beginUndoGroup`/`endUndoGroup`.
- **Tool registry (`client/js/core/registry.js`)**, each feature calls
  `Rebound.tools.register({ id, title, group, mount })`. The shell builds
  navigation from the registry and mounts a tool on demand.
- **Easing engine (`client/js/easing/*`)**, pure, host-agnostic, UMD-wrapped
  so it runs in the panel and imports into Vitest. New physics belongs here so
  it stays unit-testable; the host only receives resolved values/eases to write.
- **Reactive store + theme**, a tiny framework-free store drives all views;
  theme reads the host skin and sets CSS custom properties.

### Module pattern (panel)

Every panel script is an IIFE attaching to the global namespace:

```js
;(function (R) {
  'use strict';
  // ...
  R.something = ...;
})(window.Rebound = window.Rebound || {});
```

Pure-logic modules (easing, units) additionally use a UMD header so Vitest can
import them. They register their dependencies from `Rebound.*` first and only
fall back to `require()`.

### Host command pattern

```jsx
(function () {
  var R = $.__rebound;
  R.register('group.action', function (args) {
    // ... do work, return a plain JSON-serialisable value ...
    return { ok: true };
  }, 'Rebound: Action');   // <- undo-group label (omit for read-only commands)
})();
```

Always address properties by **matchName** (locale-safe), never display name -
see `host/lib/util.jsx`.

---

## Home & widget UX (product principles)

The configurable Home board lets the user pin any tool as a live **widget**. These
rules are non-negotiable; honour them whenever you touch the Home, a widget, or a
tool's `mount()`:

- **Simple, focused, identical mental model.** Every widget is its tool's one
  primary control, full-bleed, behaving the same way (you directly manipulate the
  curve, the anchor stage, the gradient bar, the preview). Do **not** render the
  full tool's panel of secondary controls inside a widget. If a tool has several
  controls, the widget shows only the essential one; the rest are reachable in the
  full tool.
- **How it's wired (two routes).** `mount(ctx)` receives `ctx.widget === true` when
  embedded on the Home. Pick the route that fits the tool:
  1. **Crop the full tool.** If the tool already has one obvious primary element
     (the Ease/Velocity/Smooth curve, the Anchor stage, the gradient bar), list it
     in `WIDGET_FOCUS` (toolId -> primary selector) and optionally `WIDGET_HIDE`
     (toolId -> selectors to drop) in `client/js/ui/home-screen.js`: `applyFocus`
     keeps that element full-bleed and hides the rest.
  2. **Build a purpose-made compact widget.** If the tool is a preview + several
     sliders (Spring, Bounce, Recoil, Drift) or a button panel (Align), do **not**
     crop the full tab (it looks like a cramped copy). Branch on `ctx.widget` in the
     mount and build a small, deliberate layout: a `.rb-wgt` flex column holding a
     `.rb-wgt-hero` (the live preview stage or schematic SVG, which fills) and a
     `.rb-wgt-ctl` with only the one or two controls that shape the result; for a
     button panel use `.rb-wgt-alignbar`. Pass `controls:false` to `PreviewStage` so
     its own switchers don't clutter the hero. These tools are deliberately **absent**
     from `WIDGET_FOCUS`. CSS for the recipe lives under "Compact tool widgets" in
     `client/css/home.css`; mark a hero SVG `rb-keep-aspect` if it must not stretch.
- **Secondary options: accessible, never in the way.** Anything that is not the
  primary control lives in the full tool, opened by the widget's open control (the
  arrow). It must not occupy widget space or float over the tool during use.
- **Nothing floats over the tool while using it.** No chrome, dot, or menu on top
  of the interactive control during normal use. Arrange controls (resize, remove,
  recolour, drag) appear only in edit mode (the pencil); the use-time footer
  (Apply/Read) sits at the bottom only for tools that have an action, and tools
  with no action show no footer.
- **Grid-correct sizing.** Widgets size their height by whole grid rows (they
  store `{c, r}` and span `grid-row`), never a free pixel height, so a resized
  widget always reserves its track and can never overlap the items below.
- **Customisable, additive, themed.** The user can pin the same action many times
  (instance ids + `refs`), customise each independently, recolour per tile/widget
  (with an explicit Auto = use the theme), and rearrange on a fixed snap grid.
  Entrance animations are distinct per item. Keybinds and a read-from-selection
  "Read" button are first-class where they apply.

## Adding a tool

1. Create `client/js/features/<id>.js`; call `Rebound.tools.register({ id,
   title, group, order, keywords, mount })`.
2. In `mount(ctx)` build UI into `ctx.body` and actions into `ctx.footer`.
   `ctx` provides `invoke`, `store`, `bus`, `toast`, `units`, `getSelection`,
   `onSelection`, `refreshSelection`. Return `{ destroy }` if you allocate
   timers/observers.
3. If it touches After Effects, add a host command in `host/commands/<group>.jsx`
   and load it from `host/index.jsx`.
4. Add one `<script>` line to `client/index.html` (Features block).
5. Put any pure math in `client/js/easing/` (or a new pure module) and test it.

---

## Build, test, run

```bash
npm install
npm test            # Vitest, the math + units core
npm run lint        # ESLint (browser / ExtendScript / Node scopes)
npm run check       # lint + test

# Local install into After Effects (per-user CEP folder)
npm run debug:on        # enable PlayerDebugMode (CSXS 9–12)
npm run install:dev     # symlink/junction the repo into the CEP extensions dir
# restart AE -> Window > Extensions > Rebound

# Package a signed ZXP (needs Adobe ZXPSignCmd on PATH or $REBOUND_ZXPSIGN)
npm run cert
npm run pack
```

Remote-debug a running panel: enable PlayerDebugMode, open the panel in AE, then
visit `http://localhost:8718` (main) or `:8719` (settings) in Chromium. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Preview the panel UI in a plain
browser (no host) with the static server in `tools/serve.mjs`.

---

## Conventions

- ES5-compatible JS in `client/` (CEF is modern, but stay conservative and
  buildless). ES3 only in `host/` (no `let`/`const`/arrow/`JSON` assumptions -
  `host/lib/json.jsx` provides JSON).
- Indent 2 spaces (`.editorconfig`). Run `npm run lint` before committing.
- Keep all host calls behind `Rebound.bridge`, it's the seam for a future UXP
  port.
- Every mutating host action is one undo group and reports what it changed.
- Tests live in `test/*.test.mjs` and import via `test/helpers/easing.mjs`.

---

## Environment notes (Windows dev)

Node, npm, and gh are installed under `C:\Program Files\nodejs` and
`C:\Program Files\GitHub CLI`. If they're not on your shell PATH, prepend those
in PowerShell. The repo's `CLAUDE.md` is a git symlink to this file.
