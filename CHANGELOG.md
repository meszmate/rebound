# Changelog

All notable changes to Rebound are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **No-image fidelity round: every fill type now rebuilds as native vector/effect
  content** (multi-agent implement + adversarial review). Nothing in this list is
  a flat raster any more — the only remaining pixels are an image that was already
  an image:
  - **Photoshop adjustment layers** become real AE **adjustment layers + native
    effects** (Brightness/Contrast, Hue/Saturation, Levels, Exposure, Vibrance,
    Photo Filter, Colour Balance, Black & White), so they colour-grade the layers
    below instead of being dropped. Kinds with no AE equivalent still create the
    adjustment layer (stack preserved) and are flagged.
  - **Gradient text** is rebuilt the proper AE way — a native, fully editable
    gradient **shape matted by the text** — so the stops are real (not the old
    first-stop solid or an unscriptable layer-style ramp); the text stays editable
    as the matte.
  - **Angular (conic) gradients** rebuild as a native linear gradient warped by a
    **Polar Coordinates** effect (real editable conic, no raster); isolated to the
    fill so a co-resident stroke is never bent.
  - **Diamond gradients** rebuild as a native radial gradient (vector/editable; AE
    has no diamond primitive, flagged) — never rasterised.
  - **Pattern / tiled image fills** repeat the real tile via the native **Motion
    Tile** effect instead of baking the whole shape to a PNG.
- **Import fidelity pass across all three sources (shared host ceiling).** A
  multi-agent audit + implementation closed the highest-impact 1:1 gaps:
  - **Gradient midpoints** are honoured (the host no longer hardcodes every stop
    midpoint to 0.5), so non-even ramps from Figma/Illustrator/Photoshop land —
    one shared change in `grad.jsx`/`paint.jsx` that lifts every gradient source.
  - **Nested frames rebuild as real precomps** with their own clipping
    (`clipsContent`), background, rounded corners and chrome, instead of
    collapsing to a flat null; the Figma exporter now emits nested `FRAME` nodes
    (children re-based to the frame's own origin) rather than flattening to groups.
  - **Ellipse arc / pie / ring** shapes reconstruct from the parametric outline
    (correct +X/clockwise orientation) and prefer the exporter's exact baked path
    when present.
  - **Photoshop** pixel masks now emit an ALPHA track matte (wiring the host's
    existing matte engine instead of rasterising), gradient fill layers emit
    structural native gradients, and non-solid strokes force a pixel-exact raster
    instead of dropping silently.
  - **Text** applies paragraph spacing/indents, horizontal/vertical scale and
    underline where After Effects supports them (24.3+), flags strikethrough and
    lower/title case as approximations (no AE scripting equivalent), and renders a
    gradient text fill as a Gradient Overlay layer style.
  - Known limits kept honest: Illustrator opacity masks aren't enumerable via
    scripting (baked composite only); layer-style and text gradient *stop colours*
    aren't scriptable (geometry/angle land, colours fall to the default ramp);
    angular/diamond gradients and pattern fills still rasterise. Every host write
    is `try/catch`-guarded so older AE builds never break.
- **True native multi-stop gradients on import.** After Effects blocks scripts
  (and even the native C++ SDK) from setting shape-gradient stop colours
  (`ADBE Vector Grad Colors` is `NO_VALUE`/`NO_DATA`). Rebound now writes real
  editable 2–8 stop linear/radial gradients via the animation-preset (`.ffx`)
  trick — the same technique Overlord and Google's AEUX use — by substituting
  the real stops into a preset's XML and `applyPreset`ing it onto the G-Fill /
  G-Stroke. Templates live in `host/assets/grad/` (derived from AEUX, Apache-2.0;
  see its `NOTICE.md`) and regenerate with `npm run build:grad`. Requires the
  "Allow Scripts to Write Files and Access Network" preference; falls back to the
  Gradient Ramp / 4-Colour approximation when off, so a gradient always shows.
- Project foundation: buildless CEP extension scaffold, manifest (panel +
  settings extensions), dev tooling, CI, and documentation.

### Fixed
- **Anchor handles do nothing on click.** The nine anchor handles are `<button>`
  elements, and in After Effects' CEF runtime a button fires `click` but not
  `pointerdown`, so after the handles were switched to `pointerdown` they stopped
  responding (no move, no toast). They activate on `click` again (keyboard too);
  `pointerdown` is kept only to preview the pin and block the box's free-drag.
- **Color tool skipped shape layers.** A shape with only a gradient fill, a
  stroke, an animated fill, or no paint yet (common on imported artwork) had no
  solid `Fill` operator to recolour and was reported "cannot be coloured." It is
  no longer skipped: a truly unfilled shape gets a clean native Fill operator,
  and any other shape is tinted with a reversible "Rebound Fill" effect that
  renders on top of an existing gradient — so the chosen colour always lands.
- **Toast popups piled up.** Toasts now collapse an immediate repeat (a refreshed
  timer instead of a duplicate), cap the stack at three, and clear faster
  (success ~2s) so quick actions no longer bury the panel in popups. The Anchor
  tool's verbose diagnostic toasts were trimmed to a single brief confirmation.

### Changed
- Home tiles and widgets are less rounded by default (corner radius 12 → 7px),
  for a tighter, less bubbly look; the Appearance ▸ Corners scale was lowered to
  match (Sharp 3 / Rounded 7 / Round 12 / Extra 20).
- The Figma exporter no longer rasterises 3+ stop linear/radial gradients — they
  are rebuilt as true editable native gradients now, fulfilling the "native
  gradients, not flattened images" promise. Only angular/diamond (no native AE
  shape-gradient type) and pattern fills are still rasterised for exactness.
- Easing engine (`bezier`, `penner`, `spring`, `sampler`) with full unit-test
  coverage, including a physical damped-harmonic-oscillator spring.
- Panel↔host bridge with a JSON-envelope RPC, an ExtendScript host (JSON
  polyfill, dispatch core, shared utilities, system + ease commands).
- Reactive store, host theme sync, event bus, DOM helpers, shared unit parser.
- Tool registry (plug-in architecture), reusable UI controls, and the SVG
  curve editor widget.
- **Ease** tool: shape a cubic-bezier, apply it to the selection as native
  temporal ease, read existing ease back, copy/paste `cubic-bezier()`, and a
  built-in Penner preset library.
- Cross-platform dev tooling: PlayerDebugMode toggle, dev install (link/copy),
  icon generator, self-signed cert + ZXP packaging.
- **Spring**, **Library**, **Anchor**, **Align/Distribute**, **Recoil**, **Drift**
  tools.
- **Multiply** (progressive duplicate stack), **Flip** (mirror), **Stagger**
  (time cascade), **Bounce** (gravitational rebound), **Trim** (fit in/out to
  keyframes), **Arrange** (grid), and **Keyframes** (interpolation setters).
  14 tools across 7 groups in total.
- **Motion** (Orbit/Spin/Look-At rig), **Composition** (edit comp settings),
  **Fade** (opacity in/out), **Trim Paths** (shape write-on), **Shapes**
  (primitive gallery), **Grids** (guide overlays). 20 tools across 8 groups.
- **Radial** (ring array), **Color** (fill/solid/effect recolor), **Vignette**
  (edge-darkening adjustment layer), **Reset** (transform reset), **Follow**
  (follow-through trail), **Echo** (optical trail). 26 tools across 9 groups.
- **Sequence** (end-to-end timing), **Smooth** (roving/auto-bezier keys),
  **Nullify** (control null + parent), **Lean** (velocity tilt), **Tags**
  (project-resident layer tags), **Precompose**. 32 tools across 10 groups.
- **Velocity** (numeric speed/influence), **Copy Ease** (copy/paste ease),
  **Bake** (expressions → clean keyframes), **Kinetic** (velocity-driven),
  **Separate** (dimensions), **Break** (split shape layer). 38 tools, 10 groups.
- **Palette** (color schemes), **Reverse** (mirror keyframes), **Demo** (build a
  practice comp), **Link** (parent), **Stroke**, **Text Break**, **Gradient**.
  45 tools across 11 groups.

[Unreleased]: https://github.com/meszmate/rebound/commits/main
