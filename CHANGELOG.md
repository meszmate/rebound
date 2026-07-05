# Changelog

All notable changes to Rebound are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Anything in Rebound can now be pinned to the Home board, from anywhere.**
  A new load-time preset registry (`R.toolPresets`) turns every tool's built-in
  presets AND every preset the user saves into pinnable Home actions, without
  the tool ever having been opened (previously a tool's presets only appeared
  after the tool mounted once, so e.g. no Spring preset was ever offered).
  Spring, Bounce and Recoil presets apply in one click, byte-identical to the
  tool's own Apply (with the Keyframes/Expression per-tile choice); every other
  tool's preset pins as "open the tool with this preset loaded". All ~150
  preset actions also become bindable to keyboard shortcuts for free, since
  they live in the same action catalog. Pinning now also works in place: every
  preset tile in every tool's gallery grew a hover "+" (Add to Home), and the
  tool header grew a pin that drops the tool's launcher on the active board.
  Spring, Recoil and Bounce can additionally be pinned as live widgets (their
  preview + curve + sliders are the whole tool).
- **The Add browser is a real catalog now.** It was a 640px dialog squeezed
  into a ~370px panel with a bare 22px search pill (the input inside was 32px
  tall, overflowing its own box) and a four-way kind filter. Now it is a
  full-height sheet sized to the panel, with a proper search field (icon,
  34px, focused on open) that cuts across everything, scrollable category
  chips with live counts (Widgets / Actions / Presets / Easing / Expressions /
  Scripts / Tools), presets grouped under a small tool heading with the preset
  name on the card, and cards that draw the preset's REAL sampled curve
  (spring overshoot, bounce decay) instead of a generic stand-in. The same
  real-curve chip is what the pinned tile shows on the board.
- **The "link" tool demo animates again.** Its follower elements shipped
  out-of-range SMIL keyTimes (`0.08;0.58;1.08`), which the browser rejects
  outright (console errors, static demo); the lag is now a `begin` offset with
  valid keyTimes.

### Added
- **Every tool with a sensible default is now a ONE-CLICK Home tile.** Tools
  declare their primary action (`quick` in the tool registration: the exact
  host call their Apply button makes, with the tool's own defaults), and the
  catalog turns each into a pinnable 1-click action — 27 new ones, including
  Text Break (break the selected text into word layers, retargetable to
  characters/lines per tile), Stagger, Sequence, Smooth, Squash, Fade, Echo,
  Flip, Motion, Retime, Scatter, Trim Paths, Vignette, Stroke, Velocity,
  Precompose, Auto-Crop and more. They show under Quick actions in the Add
  browser, are keyboard-bindable, and carry per-tile option selects where the
  tool has one obvious main choice. A new contract test loads every feature
  module and asserts each one-click method really exists on the host, so a
  typo can never fail silently at click time. Tools whose primary action has
  no meaningful static default (Clone's capture-then-stamp, Rename's empty
  pattern, Multiply's all-zero offsets) stay open/preset-only on purpose.
- **Board reordering and resizing are fully reactive, animated interactions.**
  Reordering no longer uses HTML5 drag-and-drop (the source of every CEF drag
  bug and impossible to animate): press a card in edit mode and move five
  pixels and it LIFTS (elevation, accent ring), follows the cursor one-to-one,
  siblings glide out of the way live as you cross them, the board auto-scrolls
  at its edges, and release settles the card into its slot with a small
  spring. A press without movement stays a plain click. Resizing now follows
  the cursor pixel-for-pixel: the card itself tracks the pointer while a
  dashed ghost previews the snapped slot it will settle into, neighbours glide
  around the snap as before, and release animates the card from its live size
  into the slot. Lost-mouseup (release outside the panel) ends both cleanly.

### Fixed
- **Import layout audit: eleven placement bugs fixed across the pipeline.** A
  systematic three-slice audit (text, transform/shape/image, containers) of the
  exporter and host, hunting the same class as the ink-to-ink bug ("source-app
  metric silently assumed equal to the AE metric"). All fixes are locked by
  tests over the real code:
  - *Rotated containers stay flat.* The precomp paths re-base children by
    translation only, so a rotated frame/group precomp landed its content and
    clip box rotated about the wrong pivot; rotated containers now take the
    flat route (which carries full matrices and is rotation-correct), with a
    report note when clipping had to be skipped. Masks keep their matte
    precomp.
  - *Boolean/merged-shape children place correctly under rotation.* Child
    offsets are frame-space deltas but were consumed as layer-local (rotated
    twice on a rotated boolean), and an operand rotated relative to its
    boolean lost the rotation entirely (rendered axis-aligned). Offsets now
    map through the inverse of the node's matrix and relatively-rotated
    children get their own vector group carrying the rotation.
  - *Precomp-per-frame imports keep the canvas layout.* The opt-in
    precompFrames path never positioned the precomp layers, so multi-frame
    imports stacked every frame at the comp centre. They now land top-left
    anchored at their canvas offsets, centred as a group like the flat build.
  - *Ring/pie shapes draw true edges.* Reversing the inner donut edge did not
    swap bezier tangents (S-shaped lobes), and wedge radial edges kept arc
    tangents (bowed "straight" lines). Full-circle donuts keep their seam.
  - *Flipped/rotated images fit their box.* FILL/FIT centering and the crop
    mask were computed in comp axes assuming rotation zero, so a flipped photo
    (decomposed as rotation 180 + negative scale) landed a full box away.
    Fitting now happens in node-local space mapped through the node's matrix;
    the crop mask is computed directly in layer space (rotation-invariant).
  - *Tiled fills reach their box edges.* Motion Tile output grows symmetrically
    about the layer centre, so large boxes tiled short of the far edge and
    spilled past the near one; output now covers the box and a mask crops it.
  - *Rasterised nodes place exactly.* The 2x PNG bakes the node's own shadow
    (the render is bigger than the box), but the host cover-cropped the shadow
    off and re-applied the effect on top. The exporter now ships the true
    render box, skips re-emitting baked effects, and the host places it 1:1.
  - *Box text lands ink-to-ink too* (top-aligned): Figma half-leads the first
    line, AE hangs it at the font ascent, so fixed-size text blocks imported
    high. Guarded so builds where AE reports the box instead of the ink keep
    today's placement.
  - *Auto line height is resolved to exact pixels* for auto-sized multi-line
    text (Figma's AUTO is font-metric based, AE's autoLeading is a flat 120%,
    ~1% drift per line), and HEIGHT-auto-resize boxes get one leading of slack
    so AE's metrics can never silently hide the last line.
  - *Lists no longer grow by paragraph spacing per item* (Figma spaces
    paragraphs, not U+2028-joined list items; the exporter marks the soft
    breaks and the host skips the spacing, reported). Point text now honours
    maxLines (extra lines used to render below the design).
  - *Ink anchoring respects justification*: when AE's ink width differs from
    Figma's (substituted font, faux bold), centre/right-aligned labels stay
    anchored on their justification edge instead of hanging off the left ink
    edge; and the ink gate now checks the ABSOLUTE transform, so a rotated or
    mirrored ancestor can no longer poison the offset. Photoshop paragraph
    text exports its authored text box instead of the rendered-ink bounds
    (which re-wrapped lines and could hide the last one).
- **A mixed selection imports under ONE parent.** Selecting a frame plus loose
  elements split on export: the loose ones were wrapped in the synthetic
  "Selection" container, the frame stood alone beside it, so one of the
  selected elements was not linked to the selection parent. A mixed selection
  now wraps everything in the one Selection frame; all-frame selections keep
  one top frame each (multi-screen boards stay separate).
- **Imported text no longer sits a few pixels high next to its neighbours.**
  Figma positions a text node by its box, but the glyphs do not start at the
  box top: the line-height gap sits above the first line's cap (about 10% of
  the font size at auto line height). The importer landed After Effects' text
  ink on the box top, so every point-text label imported visibly high — e.g. a
  wordmark no longer vertically centred beside its logo. The exporter now
  ships the renderer-measured ink offset (absoluteRenderBounds relative to the
  box) and the host lands ink on ink, exact for every justification at once.
  Guarded: strokes, effects and rotation pollute the rendered bounds, so those
  nodes keep the previous box-top placement. Locked by exporter tests.
- **The Anchor tool works on 3D layers.** Position compensation mapped the
  anchor delta through scale and Z rotation only, so on a 3D layer with any X/Y
  rotation or orientation the compensation landed in the wrong plane and the
  layer visibly jumped instead of holding still ("center works, bottom center
  doesn't" — center is a no-op when the anchor already sits there). The delta
  now runs the full AE transform chain (scale, rotation Z, Y, X, then
  orientation) for 3D layers; 2D behaviour is unchanged. An expression-driven
  anchor is now also skipped with a visible reason instead of silently losing
  the setValue to the expression while Position still shifted. Locked by a new
  mock-AE test over the real host code (test/host-anchor.test.mjs).
- **"Precomp large frames & groups" off now really means no automatic precomps.**
  A small clipping frame whose content pokes past its edge (the crop-by-frame
  pattern: Figma hides the overflow, so the frame looks tiny and tidy) was
  still forced into a precomp by the clipping rule, ignoring the toggle — "it
  doesn't take up 40 layers but it comps it anyway". Now the clip rule defers
  to the user: with both precomp toggles off the frame builds flat, its
  overflow stays visible, and the fidelity report says exactly why ("clips
  overflowing content, but precomps are turned off"). Defaults are unchanged
  (clipping frames still clip 1:1 via a precomp), masks still get their matte
  precomp, and a new exporter-to-host contract test locks all of it in CI
  (test/host-precomp-decision.test.mjs, using the decision seam
  R.importer.decide that build.jsx now exports).
- **Resizing a Home tile no longer "jumps everywhere".** Three compounding bugs:
  (1) the FLIP helper measured destination rects while previous glides were still
  mid-transition, so fast drags compounded garbage deltas and sent tiles flying;
  (2) FLIP also animated the very tile being resized, sliding it under the
  pointer on every snap; (3) the pointer-to-cell math used a cell height and
  anchor captured once at pointerdown, which went stale the moment a snap changed
  the row count, because every 1fr row re-stretches on the fit-to-height board,
  producing the snap/unsnap oscillation. Now: metrics and the anchor are re-read
  on every move, a 58% hysteresis stops boundary flicker, the resized item is
  excluded from FLIP, and in-flight transforms are cleared before destinations
  are measured (which also steadies drag-to-reorder). Resizing also gained a live
  size chip ("2 × 1", same voice as the curve editor's drag chips), a lifted
  elevation on the grabbed tile, and pointercancel/lostpointercapture cleanup so
  a cancelled drag can't strand listeners or the resizing state.
- **Bezier handles can cross in X: strong ease-in-outs are drawable again.** The
  editor (and the host's mirror sanitizer) forced x1 <= x2 on the wrong
  assumption that the two keyframes' influences must sum to 100%, so the
  in-handle could never be dragged left of the out-handle and curves like
  cubic-bezier(0.87, 0, 0.13, 1) were impossible to author. In truth each
  keyframe's influence is its own independent 0.1..100% (out = 100*x1, in =
  100*(1-x2)), crossed handles are exactly representable as native temporal
  ease, and x(t) stays monotonic for any x1,x2 in [0,1]. The crossing clamp is
  removed from bezier.sanitizeHandles, the curve editor's applyHandle, the
  numeric bezier fields, and the host's sanitizeCurve; X still clamps to
  [0.001, 0.999]. Tests now lock crossing as supported instead of forbidden.
- **Curve handles (and every other drag) no longer stick to the cursor after a
  release outside the panel.** In CEP, releasing the mouse outside the panel
  never delivers mouseup/pointerup, so any document-level move listener stayed
  bound and the dragged thing chased the cursor on the next buttonless move,
  which made the ease widget's bezier handles feel "buggy, can't drag them
  anywhere". Every drag surface (curve editor handles, home-board resize,
  colour picker, gradient endpoints/stops/chips, the anchor puck, field
  scrubbing and the editor resize strip) now treats the first move with no
  button held as the release and ends the drag cleanly. Also, the edit-mode
  widget shield now explains itself: clicking a shielded widget shows "Turn off
  Edit to use this widget" instead of silently swallowing the click.
- **Resizing works inside After Effects (the grip no longer starts a card drag).**
  Two CEF realities killed the resize in the real panel even though it worked in
  a desktop browser: in edit mode the card is an HTML5 draggable, so pressing
  the corner grip and moving started a native card DRAG (a reorder that shoves
  the item down a row) instead of a resize; and AE's CEF can drop pointer
  events while still delivering mouse events (the same quirk the curve editor
  handles). The grip now cancels any dragstart born on it, disables the card's
  draggable for the duration of a resize, binds both mousedown and pointerdown
  (a flag dedupes the pair), and streams moves from the document instead of
  relying on pointer capture. Verified with a mouse-events-only synthetic drag,
  which is what CEF delivers at worst.
- **Growing an item now grows it in place; the board scrolls in edit mode.**
  Two design limits made a resize read as "it just moves down instead of doing
  anything": dense auto-placement RELOCATES an item whose grown span no longer
  fits at its position, and the fit-to-height board (no scrolling, rows stretch)
  could not create room, so growth squeezed every row instead. In edit mode the
  rows now hold their size cap and the board scrolls (`.rb-home.is-editing
  .rb-home-grid`); during a resize drag the item is pinned to its origin cell
  with an explicit grid start, so siblings reflow around it while it grows in
  place, the width clamps to the columns remaining from that origin, and the
  drag auto-scrolls at the board's edges. On release the item order is
  re-derived from the visual board, so the re-render keeps the item where it was
  left. Widget height caps were also raised (big widgets 6 to 8 rows, small 4 to
  5) now that the board can scroll.
- **Widget edit controls no longer pile on top of each other on narrow widgets.**
  The floating top-right cluster (colour, Auto, collapse, open, maximize, remove)
  is ~180px wide in edit mode, so on a one- or two-column widget it overflowed
  the card and landed on the title chip and on itself. The cluster now wraps
  right-aligned inside the card, the title chip's width adapts to the visible
  cluster, and two width-measured tiers (`is-tight` < 210px, `is-xtight` <
  150px, kept in sync by `syncTight()` on fit, render and live resize) shed the
  colour pair, then maximize and the title, leaving collapse / open / remove,
  which fit even a one-column widget. Very narrow tiles move the customize cog
  to the free bottom-left corner so it can't touch the remove button.
- **Panel scrolling was broken (content cut off, "won't go down").** `.rb-main`, a
  vertical flex column, was missing `min-height: 0`, so tall tool content overflowed
  the `overflow:hidden` app shell and the inner scroll area never engaged. One line
  fixed it; the whole panel scrolls properly now.
- **Invisible buttons / missing tints in After Effects (`color-mix` purge).** AE's
  CEF Chromium doesn't support CSS `color-mix()`, so ~40 backgrounds, focus rings,
  badges and hover tints silently rendered as *nothing* — including the widget's
  own control buttons ("no background, not visible at all"). Added raw `--rb-*-rgb`
  triplet tokens (published by `theme.js` per skin) and converted every `color-mix()`
  to CEF-safe `rgba()` / layered backgrounds. Also gave the widget's ghost buttons a
  real surface so they read as buttons. Guarded by tests that fail if any functional
  `color-mix()` returns.
- **The easing graph editor is resizable now — and calmer by default.** The curve
  editor was a fixed, oversized 300px block with no way to resize it; trying to
  drag it did nothing. It now opens at a more compact height and has a slim drag
  handle beneath it — drag to resize, ↑/↓ to nudge, double-click to reset — with
  the height remembered per tool. Applied consistently to Ease, Spring, Recoil and
  Bounce (shared `R.ui.resizeHandle`). Fixes "the editing view is too big and
  resizing just doesn't work."
- **Buggy scrolling in the tool panel is fixed.** Two causes: (1) `touch-action:
  none` was on the whole curve graph, so scroll gestures starting over it were
  swallowed — now scoped to just the draggable handles, so the rest of the graph
  scrolls the panel normally; (2) on wide docks the tool body flowed into CSS
  multi-columns, which made scrolling jump between columns and sliced the graph
  across them — replaced with a single, centered, comfortably-wide column that
  scrolls predictably. Also enlarged the curve handles' grab area (invisible hit
  target) so they're no longer finicky to drag.
- **The "red borders" are gone (real root cause).** Figma's default stroke align is
  INSIDE, and inside/outside SOLID strokes were reproduced as an After Effects
  *Stroke layer style*. When that layer style's scripted colour set silently failed
  on a given AE build, AE left its **default red** border — on every bordered card,
  button and swatch, unaffected by deselecting. Borders are now drawn as real,
  correctly-coloured **shape strokes** (inset/outset via Offset Paths for
  inside/outside), for both flat shapes/frames and precomped frames (a border shape
  is added inside the precomp). Even if the offset can't be built, the fallback is a
  centred stroke with the *correct colour* — never a red default. Also deselects all
  layers after import (removes AE's selection outlines) as belt-and-suspenders.
  The dead `strokeToLayerStyle` path (the exact code that produced the red border)
  is now deleted so it can't be re-wired back in. The regression lock covers both
  of AE's default-red sources — an uncoloured shape **stroke** *and* an uncoloured
  shape **fill** — proving the importer can't leave any paint at AE's default red.
- **New: a one-click "Check for red borders" verifier, run inside After Effects.**
  The import report now has a button that scans the imported comps (recursing into
  precomps) for AE's two default-red sources — an enabled Stroke *layer style* (the
  old bug source; a correct import has zero) and any red-dominant shape paint — and
  reports an objective verdict in the panel. It turns "eyeball the render" into a
  machine check, and doubles as a permanent regression guard you can re-run anytime
  (`verify.redScan` host command; logic locked by `test/host-verify.test.mjs`).
- **Installed fonts (e.g. Inter) no longer report as "not installed".** The font
  read-back check flagged a family missing whenever AE's `TextDocument.font` string
  differed from the PostScript name we requested — even when we had set a verified,
  family-matched `FontObject` that AE cannot substitute (modern Inter reads back a
  canonical/variable name). Resolved fonts set via `FontObject` are now trusted, and
  an optical-size family fallback matches "Inter 18pt" to a design's "Inter".
- **Centre/right-aligned point text now lands centred/right in its box.** Point-text
  placement forced the ink's left edge to the box left for every justification; a
  centre- or right-aligned label sat left-hugging. It now lands the ink's
  justification-relevant edge (centre/right/left) on the box, so alignment matches
  the source. Auto-width labels are unaffected (box == ink).

### Added
- **Organizing very large imports (1000+ objects).** Two improvements so a huge
  frame no longer lands as one unmanageable timeline:
  - **Auto-precomp now covers large GROUPS, not just frames, with a customizable
    threshold.** A single huge frame is often flat frames plus deep groups;
    precomping only frames left those groups flooding one comp. Any subtree (frame
    or group) with ≥ the threshold descendants now folds into its own editable
    precomp. The threshold is a field in Import (default lowered 120 → **40**; set
    it to 20 or less for finer per-card precomps, higher for whole-screens only).
  - **Generated precomps are filed in a project-panel folder** ("‹design› —
    Import") instead of scattering as loose comps in the project root.
  - **Optional "Colour-code layers by group"** (opt-in): gives each top-level frame
    (or, for a single frame, each of its groups) a distinct timeline label colour,
    so a big flat import reads as blocks. Purely cosmetic.
- **Import 1:1 self-check.** After a build, the importer reconciles every source
  element against what it actually built and reports the result in the panel: a
  clean import shows "all N elements accounted for"; a net deficit is flagged
  loudly ("M elements unaccounted for") so a silent loss of layers can never pass
  for a faithful import. The reconciliation runs in After Effects (the only place
  it can), is read-only and fully guarded (it can never affect an import), and its
  counting/reconcile logic is unit-tested. Complements the CI validation of the
  exporter IR, the host shape geometry, and the host positioning glue — all three
  now run the real code (loaded in Node) against known and real-file values.
- **Import scale: big designs no longer flood the After Effects timeline.** A
  deeply-nested design (e.g. a 9-screen board ≈ 2,700 objects) used to land as
  thousands of flat layers. Four levers, all opt-out:
  - **Auto-precomp large frames** (default on) — any nested frame that flattens
    into ≥120 layers (a whole screen) becomes its own editable precomp, via the
    same path clipping frames already use. A multi-screen board lands as a handful
    of precomps in the main comp; a single frame stays flat. Toggle in Import.
  - **Collapse pure-layout wrapper frames** — Figma auto-layout "Container" frames
    with no fill/stroke/effect/clip are hoisted away (visual no-op, position-exact).
  - **Merge icon vector groups** — a wrapper whose children are all leaf vectors
    becomes ONE editable shape layer (each vector an editable sub-group) instead
    of one layer per vector.
  - **Drop empty spacer frames**, and a **Figma-plugin object-count guardrail**
    that warns before sending a huge selection.
  (Collapse / merge / spacer-drop are unit-tested IR shaping; auto-precomp reuses
  the proven nested-precomp build. Benefits all three sources for the importer-side
  parts.) The Figma plugin now **reports how much the flood was tamed** on send
  (e.g. "130 layers · collapsed 1400 layout wrappers, merged 30 icons").
- **Cross-source import fidelity (Figma / Illustrator / Photoshop).** The importer
  is source-agnostic, so these land for every source that feeds it:
  - **Point text lands pixel-exact.** The importer measures the laid-out ink bounds
    and offsets so the text's top-left coincides with the source box — exact for
    every justification, superseding the ascent/width estimate.
  - **Guide-shape container overlay hidden** — imported frame/group containers no
    longer draw a red boundary in the comp (video switch off; still a parent handle).
  - **Illustrator live effects** (drop shadow / glow / blur) bake to pixel-exact
    art instead of exporting the plain vector without the effect.
  - **Photoshop rotated text** bakes to pixel-exact art (PS text rotation isn't
    carried as editable AE text); unrotated text stays editable.
- **Behaviors (new tool) — a drag-and-apply motion library.** Browse ready-made
  **entrances, exits, and emphasis** moves (Fade / Scale / Pop / Slide / Rise /
  Sink / Pulse / Pop / Spin) and drop them on the selected layers. Unlike
  expression-preset libraries, each behavior lays down **clean, hand-tunable
  keyframes with real eases** (authored from Rebound's own easing model) starting
  at the playhead — with shared Duration / Distance / Direction / Overshoot
  controls. Pure, unit-tested spec builder (`client/js/behaviors/library.js`, 10
  tests); the host turns specs into keyframes + temporal eases.
- **Figma re-import updates in place instead of stacking duplicates.** Every
  imported layer is now stamped with its Figma node id (in the layer comment).
  With the new **"Update in place on re-import"** toggle on, re-importing the
  same design **removes the prior version of each matched layer** before building
  the fresh one — so iterating on a design after you've started animating no
  longer buries the comp in duplicate layer sets. Layers you added by hand
  (untagged) are never touched; the report shows how many were replaced.
- **Re-import KEEPS your animation.** Update-in-place now captures each replaced
  layer's Transform keyframes/expressions before deletion and re-applies them to
  the freshly-built layer with the same node id — so you can iterate on the
  design (colours, text, art) after animating without losing your work.
  **Position/Anchor keyframes follow the redesign's new placement** (the first
  keyframe lands on the new position); **Scale/Rotation/Opacity are preserved
  absolute** (a fade or settle is intrinsic). Fail-safe: any property that can't
  be transferred falls back to a plain rebuild. The report shows how many layers
  kept their animation.
- **Audio & rhythm (new tool) — beat/transient markers, a category no all-in-one
  rival owns.** Drop comp or layer markers from a **BPM beat grid** (with
  **tap-tempo** and subdivision) or **detected from the audio itself**: select a
  WAV layer and Rebound decodes it (the panel's Node runtime) and energy-flux
  onset-detects the transients, mapping them into composition time. Markers feed
  straight into the already-polished Stagger/Sequence. Backed by a pure,
  unit-tested module (`client/js/audio/onset.js` — WAV decode + onset detection +
  beat grid + snap, 9 tests). MP3/AAC fall back to the BPM grid (no bundled
  decoder yet); snapping existing keyframes to the grid is a planned follow-up.
- **Lottie export (new tool) — close the Figma → AE → code loop.** Select layers
  and export their transform animation (position, scale, rotation, opacity,
  anchor) *with eases* to a Lottie `.json` for web (lottie-web) or app (Lottie
  iOS/Android). Lottie's per-keyframe `o`/`i` tangents are the same normalized
  cubic-bezier Rebound already uses, so eases round-trip exactly — no
  approximation. Solids/shapes carry a colored fill; text/other export
  transform-only (flagged). Backed by a pure, unit-tested serializer
  (`client/js/export/lottie.js`, 11 tests). No competitor in the audit set
  offers Lottie/MOGRT export.
- **Easing delivery layer — the last mile to full Flow parity (three parts).**
  - **Modifier-key side at apply:** hold **Alt** while applying (the Apply button
    *or* a one-click preset tile) to ease the **Out** side only, **Shift** for
    **In** only, **Alt+Shift** for both — without touching the In/Out/Both control.
  - **Export eases as standalone scripts:** a new host command writes one
    self-contained `.jsx` per saved ease (built-in + your own) to a folder you
    pick. Each bakes the curve and applies it with **no Rebound dependency**, so
    it drops straight onto a **KBar** "Run Script File" button, a Tool Launcher,
    or AE's Scripts menu. Monotonic curves are fitted to a single bezier;
    overshoot/spring curves (not expressible as one cubic) are skipped.
  - **User-assignable keyboard shortcuts:** bind any Home action to a key in
    Settings → *Keyboard shortcuts* (click **Set**, press your combo). Chords are
    unique, reserved combos (Cmd+K, Cmd+Enter, Esc, Enter, "/") are protected, and
    bindings persist. These are panel-focused shortcuts (a CEP panel can't
    register global AE hotkeys — KBar is the route for those, hence the exporter).
- **Ease presets now apply on click (Flow-style one-click easing).** Clicking a
  preset tile in the Ease tool's gallery now **eases the selected keyframes
  immediately** and loads the curve into the editor for tweaking/re-Apply — no
  separate Apply step. If nothing's selected yet it just loads (no error). Other
  tools are unaffected: the gallery gained an opt-in `onPick` hook and only the
  Ease tool uses it. (The Home board's one-click Easy Ease / Ease In / Ease Out
  tiles already applied natively; this brings the in-tool gallery in line.)
- **Ease tool: edit the Speed graph directly, 1:1 with After Effects.** A new
  **Value graph / Speed graph** toggle flips the curve editor between the
  progress/value curve (CSS `cubic-bezier`, an S-shape for an ease-in-out) and
  the **velocity-over-time graph** AE's Graph Editor shows by default (a hump for
  the same ease). In Speed mode a handle's **height is the keyframe's speed** and
  its **X is the influence**, so dragging a handle *up* makes that end genuinely
  faster — no more S-curve↔hump mental translation, and what you draw matches
  what AE displays. Both modes edit the same `{x1,y1,x2,y2}`, so Apply/Read are
  unchanged. Backed by a new tested `easing/speedgraph` module (the speed profile
  is the exact derivative of the value curve — verified to integrate to 1).
- **Ease tool now shows the real AE values before you Apply.** A live "Applies as
  (real values)" readout lists every selected keyframe segment and the actual
  **influence % and speed** the current curve will set on it — in real units per
  property (Position `px/s`, Scale `%/s`, Rotation `°/s`, Opacity `%/s`). Because
  one normalized curve maps to *different* speeds per property (speed = slope ×
  the segment's own dv/dt), selecting a null's **Position and Scale** together now
  shows both rows with their distinct numbers, so there's no surprise after Apply.
  It also makes the (speed, influence) model visible: the handle's **X is the
  influence** — drag a handle only *up* (changing speed/Y) while its X stays small
  and the readout shows a low influence %, explaining why the motion barely eases.
  Updates live as you shape the curve, switch In/Out/In&Out, Read, or paste.

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
- **Ease Apply now reproduces the handles you drew (the core "it becomes
  completely different than my bezier handles" bug).** After Effects' native
  temporal ease reproduces *any* single monotonic-in-time cubic bezier exactly —
  including value overshoot (Back-out) and anticipation — so the fix was to keep
  every drawable curve inside the domain AE can store: **X in [0.001, 0.999]** and
  **x1 ≤ x2** (monotonic time, so the two ease handles never overlap and influence
  stays in 0.1%–100%). Two concrete divergences are gone: a **sub‑0.1%‑influence
  handle** used to round‑trip to a different, steeper/overshooting curve (speed was
  derived from the raw X while influence was clamped — now both use the same
  clamped X); and **crossed handles (x1 > x2)**, which AE silently re‑solved into a
  different shape, are prevented at the drag. `bezier.sanitizeHandles` is the
  shared clamp across the editor, numeric fields, paste and Apply, mirrored in the
  host. Y stays free, so overshoot/anticipation still apply natively (editable, no
  baking). The live preview and the applied motion now match by construction.
- **A Remove button everywhere it belongs.** The Ease tool (and Smooth, Velocity,
  Copy Ease) now have a **Remove** that clears any Rebound expression and
  linearizes the selected keyframes, via a shared `R.easing.removeFromSelection`
  so the behavior is identical across tools; Bounce gets a Remove wired to its own
  expression‑clear. (Not added where a linearize would mislead: Echo, Fade, Trim
  Paths, Stagger, Sequence, Throw.)
- **"Applied it and nothing changed" after switching Apply‑as modes.** Baking an
  overshoot now clears any pre‑existing Rebound remap **expression** first — an
  enabled expression overrides keyframe values in AE, so a leftover one from a
  prior "Apply as: Expression" was silently ignoring the freshly‑baked keys.
- **The live curve on selection now matches the Read button.** The passive
  read used dimension 0 of the first selected pair while Read used the
  most‑moving dimension of the first *moving* pair; on a flat‑dim‑0 or held
  opening segment they disagreed. Both now share one segment‑pick.
- **Easing no longer smooths a deliberate HOLD (stepped) key**, only the eased
  side of a key is converted to bezier, and Apply now **reports skipped
  segments** (held / zero‑length) instead of a silent partial no‑op.
- **Read is honest about expression‑driven properties** (it says the keyframe
  ease it shows isn't what's actually playing), the Spring mode labels no longer
  wrap to two lines, and the Ease tool gains a **Reset** (to Easy Ease) plus an
  "eases along the motion path" note for spatial Position/Anchor.
- **Spatial eases follow the real motion‑path length.** Position/Anchor ease a
  single scalar along the path; Apply/Read used the straight‑line chord, so a
  **curved** path eased flatter than drawn and a **there‑and‑back** move (equal
  endpoints, real travel) was a silent no‑op. Both now use the true **arc length**
  when the path is curved or returns near its start (straight paths unchanged);
  Apply, Read, and the live readout share one `util.spatialDelta` so they agree.
- **Spring / overshoot bake now matches the live preview (was visibly "buggy").**
  Applying a Spring (or any overshooting curve) to two keyframes baked only the
  curve's **turning points** and let AE guess the tangents (continuous auto-bezier),
  which the project's own overshoot fidelity tests show is *dramatically* less
  faithful than pinning the **true slope** at each key — so the baked motion
  didn't look like the exact curve the preview animates. Worse, the normalized
  spring is clamped flat at its endpoint while the underlying curve is still
  moving, which planted a **near-duplicate reversal keyframe** a hair before the
  second key — a tiny jerk right as it "reached the final state." The overshoot
  bake was rebuilt to be faithful: anchors now sit at every **extremum *and*
  target-crossing**, each keyframe's temporal handle is pinned to the curve's
  **real slope** (the Hermite that hugs the math, the same technique the recoil
  bake uses), and the endpoint duplicate is merged away. Target crossings that
  land exactly on the value (elastic/back curves on a clean period) are now
  detected too. Reconstruction error dropped to ~1–3% of travel across springs
  and elastic (`client/js/easing/sampler.js` `fitSamples`,
  `host/commands/spring.jsx`; 6 new fidelity tests). The bounce still fits
  *between* the two selected keyframes (settling on the second at its time, as the
  preview does); say the word if you'd rather it extend the settle past the second
  key.
- **"zero denominator converting ratio" AE error — guarded at every source.** Two
  reachable triggers, both fixed: (1) applying a temporal ease to a **zero-length
  spatial segment** (two Position/Anchor keyframes with identical values — e.g. a
  Behavior with distance 0, or easing a non-moving null's Position) — Behaviors,
  the Ease tool, and the exported ease scripts now leave such a segment linear
  instead of throwing; (2) `addComp` during Figma import reading a **0
  pixel-aspect / duration / frame-rate** off an odd active comp — both import
  `addComp` paths now floor those to sane positives. (The related "outside of list
  length" error had no unguarded call site in the host — all list indexing is
  bounds-checked — so it was a downstream symptom of the undo-stack corruption
  above; the reference-counted undo fix removes it.)
- **"Undo group mismatch, will attempt to fix" (recurring AE warning) — root-caused
  and eliminated.** The RPC dispatch already wraps every labelled command in one
  `beginUndoGroup`/`endUndoGroup` (with `finally`), but seven commands
  (Anchor, Recoil, Pin Rig, Backdrop, ease-remap, plus the new Audio and Behaviors)
  *also* opened their own group — and After Effects does **not** support nested
  undo groups, so each call produced the mismatch warning, which then persisted
  across subsequent actions. Undo grouping is now **reference-counted** in the host
  core: only the outermost begin/end touches AE, inner ones are no-ops, and the
  dispatch force-closes any group a command leaves open (`resetUndo` in `finally`)
  so the stack can never stay unbalanced. All self-managing commands route through
  the counter.
- **Cross-tool consistency & correctness pass (adversarial multi-agent review of
  16 tools; 15 verified fixes applied).** Every fix was confirmed real against the
  code and safe to apply:
  - **Motion** no longer reports a false success when every layer is skipped — it
    now throws "No supported layers: …" like its peers (Squash).
  - **Motion / Pins / Kinetic / Fade** now surface the host's *skipped* layers
    (count or reasons) in their result toasts instead of silently dropping them.
  - **Backdrop** presets now sync the effect sliders (Echo time/count/decay, Radial
    blur amount, Chromatic aberration) — loading a preset updated the values but
    left the sliders showing stale positions.
  - **Trim Paths** presets now round-trip the "Replace existing" toggle (it was
    dropped from saved state).
  - **Echo** preview honored `echoTime` via a truthy check, so a valid `0` fell
    back to the default spacing — now a proper null check.
  - **Rename**'s button is disabled with no selection (was clickable → no-op).
  - **Kinetic** remove, **Break**'s skip wording, and **Vignette**'s toast were
    tidied for accurate, consistent feedback; **Tags** cleanup wrapped like peers.
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
