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
- **Ease "Read" showed the wrong curve on a multi-property selection.** Read used
  the *first* selected property, but a property whose value is constant across the
  segment (a null's held Scale, a non-moving axis) carries no recoverable timing —
  it can only read back as a linear diagonal. So reading an eased null that also
  had a flat Scale/axis selected showed a straight line, not the curve you applied.
  Read now skips non-moving properties and reports the first one that actually
  moves (falling back to a flat one only if nothing in the selection moves). It
  also scans *within* a property — past a held opening segment to a later moving
  one — and, for non-spatial multi-dimension properties (e.g. a non-uniform Scale
  eased only on its Y axis), reads the dimension that actually changes rather than
  always dimension 0. The apply↔read round-trip is exact: applying a curve then
  reading it back reconstructs the same x1/y1/x2/y2 (the `avg` speed factor cancels).
- **Align/Distribute moved parented layers to the wrong place.** A layer's
  Position is in its *parent's* coordinate space (comp space only when it has no
  parent), but the align math measured each layer's box from raw Position as if it
  were comp space — so aligning anything imported into a group/frame (everything
  the Figma importer makes) put them somewhere unrelated (e.g. aligning *left*
  could shove the upper layer *right*). Align is now parent-aware: each layer's
  content rect is mapped into true composition space through the full parent chain
  (rotation/scale included, X/Y-separated Position handled), aligned there, and the
  resulting move is converted back into the layer's own Position space. Unparented
  layers are unchanged.
- **Easing curve handles couldn't be dragged in After Effects.** AE's CEF runtime
  drops **pointer events on SVG sub-elements** (the same quirk that gives a
  `<button>` a `click` but no `pointerdown`), so the bezier handles — SVG
  `<circle>`s wired to `pointerdown` — never started a drag. The handles now bind
  **both mouse and pointer** events (mouse fires reliably in CEF), with guards so
  the paired down/up events drive a single drag, and the drag no longer relies on
  `setPointerCapture` (which throws on SVG in CEF). Browser preview fires
  pointerdown fine, which is why it slipped through.
- **Imported text lost its font and weight (Inter Bold came in as Helvetica).**
  The host font resolver had a single strategy (AE 24's exact
  family+style lookup) and silently set no font on a miss, so any AE without the
  Fonts API, or any style-name mismatch, left AE's default face. It is now a
  multi-strategy resolver — explicit PostScript name, exact family+style, style
  synonyms and a numeric-weight→style map, a constructed `Family-Style` PostScript
  probe, and a scan of every installed face (matching native names too) — that
  never accepts a substitute, verifies the set, prefers `fontObject` (24.0+) to
  dodge silent substitution, falls back to faux bold/italic when only the upright
  face exists, and only then flags a genuinely missing font. The exporter now ships
  `postScriptName` + `fontWeight` per run and keeps the font even when segment
  reading throws. (`app.fonts.allFonts` is also now read shape-agnostically, fixing
  an empty font-replacement dropdown.)
- **All imported text was secretly point text.** `TextDocument.boxText` is
  read-only, so the old `boxText = true` write was swallowed and every text layer
  fell back to point text (no wrapping to the source width). Box text is now
  created up front via `addBoxText([w,h], …)`, with vertical alignment
  (`boxVerticalAlignment`, 24.6+) honoured; point text only when the source
  auto-resizes width-and-height.
- **A wide frame imported as a tiny 100×100 null in the corner.** After Effects
  nulls cannot be resized, so a frame/group handle never covered its content. Like
  Overlord/AEUX, the flat build now uses a **guide shape layer sized to the node**
  (transparent fill, faint non-rendering outline, anchor centred) so the container
  box actually spans the art; children stay put. A group used *as a mask* still
  bails safely instead of matting through the empty guide.
- **Text styling that silently did nothing.** `allCaps`/`smallCaps` are read-only
  (now set via `fontCapsOption`); `applyUnderline` does not exist in AE scripting
  (now flagged as an approximation, like strikethrough); the phantom
  `leftMargin`/`rightMargin` indent writes were removed (only `startIndent`/
  `endIndent` are real); and Figma `paragraphSpacing` now lands as space-*after*
  (it was being written as space-before).
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
- **Last text & fidelity gaps closed (Figma → AE), so import is 1:1.**
  **Strikethrough** now draws like underline (a generated rule through the
  x-height). **Underline/strikethrough on part of a line** is measured to the
  exact run extent (single line) instead of spanning the whole line. **Lowercase
  / title-case** text (which After Effects has no case option for) is reproduced
  by baking the case into the displayed characters (length-preserving, so styling
  stays aligned). **Lists/bullets** rebuild as real markers (`•` / `1.`) with a
  hanging indent — handling the U+2028 line-separators Figma uses between items.
  **Truncated** text keeps its box and is flagged (AE has no ellipsis). Plus the
  **mirrored-image cover** alignment and the **rotated backdrop-blur mask** edge
  cases are now correct.
- **Reproduced the things After Effects "can't do" (Figma → AE).** None of these
  were dead ends — each now has a faithful, editable reconstruction:
  **underline** is drawn as a generated stroked line under each baseline (from
  `textDocument.baselineLocs`, following wraps), matched to the text and parented
  to it; **backdrop/background blur** becomes an adjustment layer with a Gaussian
  blur, masked to the node's footprint and placed below it so it blurs what's
  behind (glassmorphism), instead of being dropped; **image fills** scale as true
  **cover** (uniform + centre-crop) rather than stretching on an aspect mismatch;
  the **clip-overflow** test now uses each child's true rotated bounding box; and
  **inside/outside gradient strokes** flip their offset by the path winding so the
  side is correct on freeform/boolean paths.
- **1:1 clipping, masks, image backgrounds and inside/outside strokes (Figma →
  AE).** A frame now clips exactly when Figma's clip-content is on **and** its
  content overflows — built as a precomp boundary (the only faithful clip in AE),
  and never for a frame that does not clip, so non-clipping frames stay flat. A
  **frame or group used as a mask** becomes a real pixel layer (precomp) so its
  silhouette mattes correctly (a group's frame-local children are re-based into
  group space first); multi-target masks (one Figma mask over several siblings)
  wire each target reliably (top-down, adjacency-verified). **Image frame
  backgrounds** rebuild as a footage layer at the bottom of the frame (clipped to
  the frame's rounded corners when it clips). **Inside/outside gradient strokes**
  are offset into place with an isolated Offset-Paths group so only the stroke
  shifts, not the fill.
- **Import fidelity sweep (Figma → AE).** Beyond the font/box-text/container fixes
  above: a new **"Import into the active composition"** toggle (default on,
  Overlord-style — off always makes a new comp); polygons, stars and boolean
  operations rebuild as **editable Polystar / Merge-Paths** shapes instead of dead
  baked outlines; rounded-corner and circular **image fills clip to their exact
  silhouette**; image **flips/mirrors** survive; **gradient stroke opacity**, a
  guard so a conic-gradient *stroke* no longer warps the whole layer, shadow
  **spread converted px→percent**, drop-shadow **knockout** (`showShadowBehindNode`),
  and a flag when multiple shadows collapse to AE's single-shadow limit; sheared
  nodes rasterise pixel-exact (with a skew note as a backstop); elongated radial/
  diamond gradients size to their longer axis; `dashOffset` round-trips; and
  `BOOLEAN`/`ADJUSTMENT` validate cleanly. Genuinely-unscriptable cases (underline,
  true backdrop blur, lists/bullets, per-paragraph mixed alignment) are flagged as
  approximations rather than faked.
- **Figma → AE import now flattens into one composition by default, matching
  Overlord/AEUX.** Each frame becomes an editable group (a null parenting its
  children, plus a background shape layer that rebuilds the frame's
  fill/corners/border/shadow) instead of a precomp per frame, so importing a
  real design no longer explodes the project into dozens of nested comps. A new
  **Precomp frames** toggle (Import ▸ How it builds) restores the trimmed,
  clipped precomp-per-frame build when you want it. Top-level frames now carry an
  `offset` in the IR so multi-frame and loose selections keep their layout in the
  single comp.
- **The Rebound "bounce" mark is now the logo everywhere in the UI** — the AE
  panel rail/home/settings marks, the panel menu icons, and the Figma plugin
  header, replacing the old `◗` glyph, disc icons, and relay-arrow. The Figma
  plugin UI was de-boxed (bare brand mark instead of a blue chip, borderless
  status/selection rows) for a lighter, less generic look.
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
