# Rebound, Feature Catalog

This is the working specification and roadmap for Rebound, a free
motion-design panel for After Effects. Every feature here is an **original
implementation** built on public, non-proprietary techniques, CSS cubic-bezier
timing, the Penner easing equations, spring physics (a damped harmonic
oscillator), and Adobe's documented ExtendScript / CEP APIs.

Priorities: **P0** ships first (the core easing + spring + anchor loop), **P1**
fills out the workflow toolkit, **P2** is polish and breadth. Complexity is a
rough build-size estimate (S / M / L).

> **Prior art.** A handful of excellent commercial panels pioneered this kind of
> workflow tooling for After Effects. Rebound is an independent, clean-room tool
>, we studied *what* such workflows accomplish and built our own design and
> code from first principles. No third-party source, scripts, assets, preset
> names, or interface chrome are reused. The only vendored third-party code is
> Adobe's `CSInterface.js` and a public-domain JSON polyfill for ExtendScript.

---

## Implementation status

**Shipped (45 tools across 11 groups):** Ease, Library, Velocity, Copy Ease,
Smooth, Bake · Spring · Recoil, Drift, Bounce, Motion (orbit/spin/look-at),
Follow, Lean, Kinetic · Anchor, Reset, Nullify, Separate, Link · Align,
Distribute, Arrange, Flip, Grids, Composition, Precompose · Stagger, Sequence,
Trim, Reverse, Fade, Keyframes · Multiply, Radial, Echo, Vignette · Shapes, Trim
Paths, Break, Text Break · Color, Palette, Stroke, Gradient · Tags · Demo. Plus
the platform: the curve editor, command palette, host theme sync, settings
panel, undo-grouped batching, structured errors, and JSON persistence.

**Roadmap (larger sub-systems, specified below but not yet built):** advanced
curve-editor modes (multi-space Speed/Value graph, multi-segment run editing,
before/after onion-skin, magnetic snapping, preset matching, spatial-path
easing, per-axis separate-dimension curves); a particle field and brush-recorder;
a Verlet soft-body (jiggle); plexus connectors and a motion tracer; a cursor &
UI-interaction kit; and richer gradient color-stop authoring (constrained by
ExtendScript). Each is a substantial feature on its own.

The sections below describe the full intended design; anything not in the
"Shipped" list above is roadmap.

---

## 1. Easing, the curve editor

The heart of Rebound: one curve surface that authors easing, then writes it to
keyframes.

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Curve editor canvas** | P0 | L | Unit-square cubic-bezier graph (time × progress). Fixed corner anchors at (0,0)/(1,1), two draggable interior control points. The curve *is* the ease, steepness equals speed. Canonical state is the 4-tuple `(x1,y1,x2,y2)`, CSS-compatible. Renders crisp at HiDPI; shows a synced speed-graph and a looping "motion swatch" dot so you feel the ease before applying. |
| **Control-point handles** | P0 | M | The two interior points are draggable with tangent lines. On grab, a floating chip shows live **Influence %** and **Speed** in the property's real units (px/sec, deg/sec) from the selected keyframe spacing. Modifier = 10× fine-drag. |
| **Numeric bezier input** | P0 | S | Four fields two-way bound to the canvas; arrow-key nudge (±0.01, shift ±0.1). Non-monotonic-in-time warning with one-click clamp; `x` constrained to [0,1]. |
| **Conversion core** | P0 | M | Tested math bridge converting the normalized 4-tuple ↔ AE per-side `KeyframeEase(speed, influence)`, scaling handle slope by the segment's **signed** average speed, clamping influence to [0.1,100]. A fidelity indicator warns when a curve (strong overshoot) can't be pure temporal ease. |
| **Apply to selection (batch)** | P0 | M | Author once, select many keyframe pairs across properties/layers, apply the same normalized ease to all in one undo group. Hover-Apply ghosts the result and reports scope ("14 segments across 3 properties"). |
| **Ease scope toggle** | P0 | S | Segmented Out / In&Out / In, reading the untouched side first so it isn't clobbered. Plus an **Auto-split** mode: ease-out the first key, in&out the middles, ease-in the last, a whole run as one arc. |
| **Read ease from AE (reverse sync)** | P0 | M | Inverts AE's speed/influence on the selected keys back into a 4-tuple and loads it into the editor; overlays the read "before" curve against your edited "after". |
| **Auto-apply (live)** | P1 | M | Optional: push curve edits to selected keys live while dragging, debounced and coalesced; commits to AE only on release to keep undo clean. A held modifier suppresses it for free experimentation. |
| **Cross-ecosystem copy/paste** | P1 | M | Copy the curve as CSS `cubic-bezier()`, an expression snippet, or a Lottie/GSAP/Framer easing; smart-paste sniffs the incoming format. Lottie-safe badge warns when overshoot won't survive export. |
| **Snapping** | P1 | M | Grid fractions, axis constrain, symmetric mirror (sticky lock), angle detents (0/15/30/45°), and magnetic snap to a curated set of well-known easing points. |
| **In-segment overshoot / undershoot** | P1 | L | Anticipation and elastic settle beyond the 0–1 box, parameterized physically (overshoot %, bounces, damping) and realized via minimal baked helper keys or a compact expression, labeled so it stays editable. |
| **Apply as keys vs. expression** | P1 | L | Keys mode writes temporal interpolation; expression mode drives the property with a readable parameterized easing expression (named control layer) and composes with, never overwrites, existing expressions. One-click bake-to-keys and lift-keys-to-curve. |
| **Speed (velocity) panel** | P1 | M | Dedicated uncapped Speed In/Out editor (negative allowed for overshoot), auto-suggested Max range from the property's delta/duration, and an overshoot-% control that solves back to the needed velocity. |
| **Influence panel** | P1 | S | Numeric In/Out/Both influence (0.1–100) with a digit-entry overlay; shows raw influence and its effective ease% side by side. |
| **Multi-space graph (Progress / Speed / Value)** | P1 | L | One adaptive surface; the same drag is interpreted in whichever space is active without losing keyframe data. Overlays a live trace of the *actual* sampled velocity (including expression influence). |
| **Copy/paste ease (modes)** | P1 | M | Copy a key's velocity payload and paste as Influence-only, Speed-only, Both, or Cubic (re-solved per segment). Ease-eyedropper grabs ease off any pair on hover; a swatch history of recent curves. |
| **Separate-dimensions aware easing** | P1 | L | Detects dimensionality and writes per dimension; offers to Separate Position while preserving existing ease. X/Y/Z curves shown at once as colored curves on one canvas; link/unlink axes. |
| **Multi-segment curve editing** | P2 | L | Shape a whole keyframe run on one wide multi-segment canvas with shared-handle continuity; falls back to single-segment for a 2-key selection. |
| **Before/after A-B preview** | P2 | M | Explicit A-B toggle and onion-skin ghost frames along the motion path, so edits are judged against the real comp. |
| **Preset matching / ease detection** | P2 | S | Computes a distance metric to identify which library preset the selected keys resemble; shows a confidence-ranked top-3 with similarity %, plus normalize-to-nearest. |
| **Optional spatial path easing** | P2 | M | Clearly-labeled toggle to also derive spatial bezier tangents from the same curve so motion-path arrivals decelerate visually; default stays temporal-only. |
| **Smooth (blend keys & paths)** | P2 | M | Soften animation by blending values and rounding sharp motion-path corners (great for tracked data); selective range, before/after preview, separate temporal vs spatial, outlier-rejecting denoise. |

## 2. Springs & physics

One spring engine, surfaced in many tools, all reading the same graph editor.

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Physical spring engine** | P0 | L | Damped harmonic oscillator (mass / stiffness / damping, or perceptual response+bounce / response+dampingFraction) with correct underdamped / critical / overdamped solutions and a settle-time estimate, the signature bouncy/overshoot easing. Exposed three synced ways (Bounciness+Settle, physical params, live curve), per-axis springs, clean keys *or* expression with one-click bake. |
| **Recoil, velocity-driven overshoot** | P0 | L | Add elastic overshoot to already-keyframed properties via a damped-sine expression driven by the velocity arriving at each key (Overshoot / Bounce / Friction / Enable). Detects incoming ease so an ease-in doesn't kill the bounce; one master rig drives many properties with per-property scale and optional stagger; live value+speed graph; half-life decay readout. |
| **Bounce, gravitational rebound** | P1 | L | Value rebounds off its target like a ball, each bounce smaller (asymmetric decay). A single restitution (0–1) + floor-awareness; optional squash-and-stretch link drives scale on impact frames; envelope shown live in the editor. |
| **Drift, organic randomizer** | P1 | M | One-click smart wiggle (Smooth/Hold, Frequency, Amount, Seed) with a live noise-curve graph, per-axis amount, a turbulence↔sine continuum, and temporal-coherence to tie multiple layers to one shared noise field with phase offsets. |
| **Follow, follow-through chains** | P1 | L | Link a parent property to children that follow with staggered, springy lag (per-link stiffness/damping, not plain delay). Drag-to-link with a visual hierarchy graph; a stagger curve shapes the ramp; shares the one spring core; one-click bake. |
| **Orbit / Spin / Look-At** | P2 | M | Auto-motion rigs: satellite orbit (interactive ring gizmo, elliptical option, multi-body phase spreads, eased angular velocity), continuous spin, and auto look-at a target; bake-to-keys. |
| **React, velocity-triggered driver** | P2 | M | Drive a property from another's instantaneous velocity (secondary action / lean / lag) through a mapping curve with smoothing; optional spring on the output. |
| **Jiggle, soft-body from puppet pins** | P2 | L | Cascade puppet-pin motion through delay+drag for jelly/ripple, with an optional true Verlet mass-spring solve (stiffness/damping/gravity, pinning, simple edge collision), baked to keys; one slider blends stylized↔plausible. |

## 3. Library & presets

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Preset library** | P0 | M | Ships the full Penner set (Linear, Quad/Cubic/Quart/Quint/Sine/Expo/Circ/Back, each In/Out/InOut) as resolution-independent cubic tuples, plus user presets. Tiles render a mini curve and live-preview on hover by scrubbing the real selected layer; searchable by feel. |
| **Save preset (smart naming)** | P0 | S | Store the current curve (+ optional spring/overshoot params) with an auto-suggested name and tags from the detected shape; save-as-variation groups a family. |
| **Multiple libraries** | P1 | M | Personal / Team / Project scopes; switch active, rename/reorder/delete; the shipped set is locked (duplicate-to-edit). A Project library travels inside the `.aep`. |
| **Import / export libraries** | P1 | S | Versioned JSON in/out; direct CSS / Lottie interchange; a shareable token encodes one curve in its 4 numbers for paste-and-apply. |
| **Favorites + recents** | P2 | S | Star/pin favorites and an auto-floating "recent & most-used" band from tracked apply counts. |

## 4. Transform & anchor

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **9-point anchor grid** | P0 | L | Move the anchor to any of 9 bbox points **without moving the layer**, compensating Position (and re-solving every Position keyframe/expression) so the animation looks identical. Live comp-viewer overlay with a hover ghost; a draggable puck scrubs to any fractional position with a % readout; a built-in sub-pixel self-check rolls back rather than letting motion drift. |
| **Center anchor / center in comp** | P0 | S | Explicit anchor-only vs center-in-comp affordances; center X / Y / both; center the selection's combined bbox; center-to picker (comp / layer / guide / selection); optional alpha-weighted visual centroid. |
| **Anchor: include masks** | P1 | M | Compute the grid from mask-path bounds; click on a path to drop the anchor on a vertex / along the curve with magnetism; anchor-to-centroid. |
| **Anchor: rotation-aware** | P1 | M | Factors existing rotation so "top-left" means the visually top-left corner, compensating through the rotation matrix; auto-detects and hints. |
| **Anchor: shared pivot across selection** | P1 | M | Give many layers a common pivot (mean / median / area-weighted centroid, or a chosen reference layer); preview lines connect to the pivot; optionally drop a labeled control null. |
| **Flip / mirror** | P1 | S | Mirror across an interactively-placed axis line at any angle; pivot choice (in place / about selection / about a guide); non-destructive via a parented control. |

## 5. Layout

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Align** | P0 | M | 9-dot magnet pad: one click aligns to comp, double-tap aligns within selection; shift-drag a dot adds a live numeric offset. Group vs To-First modes, 3D depth targets, anchor-aware toggle, translucent landing preview. |
| **Distribute** | P0 | M | Even spacing with an explicit by-gaps vs by-centers choice (px / % / units); a draggable on-canvas spacing handle; lock-ends vs grow-from-first. |
| **Arrange into a grid** | P1 | M | Responsive grid engine with flexbox-style justification and row alignment, fixed-count / fit-to-comp / custom-size, gap, and cell vs layer bounds; optional live expression-driven grid; masonry packing for mixed aspect ratios. |
| **Grids & guides overlay** | P2 | M | Rule-of-thirds, golden ratio, parametric columns (count/gutter/margin), baseline grids; first-class snap targets with on-canvas distance readouts; native guides vs render-safe guide layer. |
| **Composition / units utility** | P2 | S | Edit active comp aspect / resolution / duration / fps in place with content-aware reflow on resize; a global units toggle every tool reads from. |

## 6. Timing

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Stagger layers & keyframes** | P1 | M | Stagger in time with a visual **stagger-curve editor** (ease the stagger itself), scrubbable mini-timeline, stagger-by-spatial-position (ripple across the canvas), and deterministic seeds. |
| **Shift / sequence timing** | P1 | M | Shift/sequence/randomize in-points, out-points, source-start, markers, and keyframes independently; before/after/within the playhead; relative/absolute; a smart unit parser (1s/1f/1m/1h/1ms) used panel-wide; an on-timeline fan/spread gizmo. |
| **Keyframe assist & cleanup** | P2 | M | Keyframe-type quick-set (linear/hold/auto-bezier), prev/next nav, a **focus** mode that sets the work area to the selected segment for loop preview, and key-clean that thins redundant keys within a velocity tolerance. |
| **Trim to keys / work area / markers** | P2 | S | Snap In/Out to first/last keys (independent toggles), to the work area, to markers, or to selected keys, with ±N-frame padding; combines with the stagger engine. |

## 7. Generators & rigs

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Radial array** | P1 | L | A ring of evenly-distributed copies driven by one controller (center / count / radius / arc / stagger / per-copy size & color). Two backends from one button: a lightweight Repeater rig and a bake-to-real-layers mode; center can follow comp/layer/point; any per-copy attribute as a distribution curve; orient-to-center options. |
| **Multiply, progressive duplicate** | P1 | M | Bulk-duplicate into a delay/transform stack (Linear / Grid / Radial / Along-Path), every per-copy transform with a progressive field + randomize range + easing curve; a master spread slider fans the stack in time and space; live ghost preview; Repeater or baked. |
| **Trail, optical echo / smear** | P2 | M | A sampled-transform trail of real duplicate layers, each independently colorable along a gradient, plus a smear/morph mode; sliders for length, decay, hue-shift. |
| **Tracer, motion-path trail** | P2 | L | A stroked path that draws/follows a moving layer, with length-based fade and velocity-driven width; freeze+edit bakes the swept motion to an editable bezier path. |
| **Particles, interactive field** | P2 | L | Brush directly in the comp to record a re-simulatable particle field (size/spacing/impact/gravity/margins); change parameters after recording and the bake updates; export to keys or expression. |
| **Vignette** | P2 | S | Non-destructive adjustment-layer vignette with live shape, animatable position that can track a target, tint, and blend-mode presets. |

## 8. Shapes & paths

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Trim Paths write-on** | P2 | S | Add Trim Paths with preset directions (start→end, end→start, center-out, both ends) and inline duration/ease for a finished draw-on; stagger across multiple paths. |
| **Connect, layer network / plexus** | P2 | L | Live, 3D-aware connector lines between layers (sequential / closed / all), distance-based auto-connect, per-line opacity falloff, one-click reconnect, bake-to-keys. |
| **Break vector layer** | P2 | M | Split a multi-shape vector into one layer per group, preserving the hierarchy as a parented null rig; granularity, auto-naming, optional pre-stagger. |
| **Text-Break** | P2 | M | Split text into per-letter / word / line layers (editable text or outlined shapes), auto-rigged with one Stagger slider via expression delay and a keep-editable re-split link. |
| **Shape primitive gallery** | P2 | M | Live-editable parametric primitives (rect, rounded-rect, ellipse, polygon, star, triangle, line) with a centered anchor and an inspector for radius / point-count / inner-outer radius; smart-insert snapping. |

## 9. Color

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Color tools** | P2 | M | Fill/stroke with live preview, a global screen eyedropper (samples outside AE) with recent-colors history, copy/paste & swap, HSB picker, and palette harmonies applied across a selection by role. |
| **Palette & gradient library** | P2 | M | Solids *and* multi-stop gradients as first-class assets (linear/radial/angular, alpha stops); apply as fill/stroke, copy gradient between layers, import/export ASE + GPL + CSS; live angle/scale handles on the comp. |

## 10. Organization

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Tags** | P2 | M | A tag/sub-tag system over layers and project items that rides inside the project (survives duplication/precomp), colors timeline labels live, supports smart/saved-search and cross-comp tags, and is keyboard-first (type a tag to isolate it). |
| **Cursor & UI kit** | P2 | L | Cursor + UI-interaction automation for app/UI demos in one panel: record a cursor route, auto-detect tagged buttons it passes, insert hover/click states with correct easing; OS-accurate cursor skins; a timeline of draggable action blocks; typewriter with WPM + human jitter. |

## 11. Core UX, integration & architecture

| Feature | Pri | Cx | What it does |
| --- | --- | --- | --- |
| **Host theme sync** | P0 | S | Read AE's panel skin at startup and on theme-change; drive CSS custom properties (luma<128 dark/light heuristic, only the reliable AppSkinInfo fields). Light/dark/auto + accent color. |
| **Single-undo-group batching** | P0 | S | Every mutating action wraps all host writes in one `beginUndoGroup/endUndoGroup` and iterates inside ExtendScript, one Ctrl-Z per action, plus a perf win. A toast confirms what changed. |
| **Structured host errors + toasts** | P0 | S | Every host command returns structured error JSON instead of the opaque "EvalScript error." string; failures surface as non-blocking toasts with a copyable detail log. |
| **Empty / invalid-selection guidance** | P0 | S | Graceful handling of no comp / footage active item / no selection / single-key selections / unkeyframed properties, with context-aware empty states and disabled Apply + tooltip rather than throwing. |
| **Command palette** | P1 | M | Ctrl/Cmd-K fuzzy-run any tool, apply any preset, or jump to any property/keyframe by name; accepts natural queries; surfaces shortcuts inline. |
| **Remappable shortcuts + cheat-sheet** | P1 | M | In-panel keymap, fully remappable, with a hold-`?` overlay, chord support (1–9 fire favorites), `registerKeyEventsInterest` wired, and an optional companion script for global AE shortcuts. |
| **Responsive / dockable layout** | P1 | M | Reflows between horizontal/vertical docks (orientation from aspect ratio), a draggable splitter, collapse-to-library and compact-HUD modes, per-dock layout remembered; honors the 136px floor and CSXS geometry. |
| **Settings panel (2nd extension)** | P1 | M | The preferences extension: auto-apply, modifier behavior, apply-mode defaults, units overlay, theme override, library locations, persisted to JSON and synced to the main panel via CEP events. |
| **Live selection polling** | P1 | M | Selecting a key/layer reads its values into a single reactive store so every view (graph, sliders, fields) stays consistent; throttled polling or event push; a selection-summary header. |
| **Universal bake-to-keyframes** | P1 | M | A consistent Bake button on every expression rig samples at frame rate over the active range, writing clean keys (optionally fitted temporal ease) and reporting key count, for render farms / Lottie / handoff. |
| **Versioned data schema + migration** | P1 | S | All persisted JSON carries a schema version with forward migration and a one-time backup so user data never breaks across versions. |
| **Keyboard navigation & accessibility** | P1 | S | Custom widgets keyboard-operable with visible focus; `prefers-reduced-motion` honored on previews; fully navigable without a mouse. |
| **Launcher / headless API** | P2 | S | Every curve/tool exposed as a generated one-line script launcher and a scriptable `applyEase(presetId)` / `runTool(id)` API; exportable to external launchers. |
| **First-run onboarding** | P2 | M | An optional one-screen tour (shape → select → Apply) and a one-click "build me a demo comp" to practice on. |

---

## Architecture commitments (from the technical research)

- **Buildless vanilla CEP**, plain HTML/CSS/JS loaded by `<script>` in dependency
  order; UMD-ish `Rebound.*` namespace so the same files run in the panel and
  under Vitest. No bundler.
- **One bridge** wraps `cs.evalScript` in a Promise, detects the `EvalScript
  error.` sentinel, and JSON-parses results, the single seam to CSInterface
  (and a future UXP port).
- **Host RPC convention**, small ExtendScript command functions take one
  JSON-string arg and return one JSON-string envelope, wrapped in
  try/catch + `beginUndoGroup`/`endUndoGroup`; iterate inside JSX, never loop
  `evalScript` per item.
- **Host-agnostic math core**, `client/js/easing/{bezier,penner,spring,sampler}.js`
  are pure and unit-tested; physics extends this core (testable), and JSX only
  receives resolved keyframe values/eases to write.
- **Locale safety**, all host property access via `matchName`, never display
  names, centralized in one constants module.
- **Persistence**, versioned JSON under `USER_DATA/Rebound/` via Node FS (the
  manifest enables `--enable-nodejs`); a read-only bundled library plus user /
  team / project libraries.
