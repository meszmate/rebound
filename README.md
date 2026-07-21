<div align="center">

<img src="docs/logo.svg" alt="Rebound" width="116" height="106" />

# Rebound

**A free easing & motion-design panel for After Effects.**

Shape easing curves, design physical springs with real overshoot, fix anchor
points, align and array layers, rig follow-through, and bring whole designs in
from Figma, Illustrator, and Photoshop as native, editable layers, from one
cohesive panel. Clean-room, original, and built on public techniques.

</div>

https://github.com/user-attachments/assets/7fd2a7ec-b01f-4b68-8588-10a4bcffb7be

---

## Why Rebound

Motion designers stitch together a pile of small operations all day: easing
keyframes, nudging anchor points, aligning layers, building bouncy overshoot.
Rebound brings those into a single, keyboard-friendly panel with one consistent
curve editor at its heart, so you learn one surface, not fifty dialogs.

- **One curve editor** for easing, springs, and overshoot. Drag handles, type
  `cubic-bezier()`, or pick a preset, and *feel* it before you apply.
- **Physical springs.** A real damped-harmonic-oscillator engine (mass /
  stiffness / damping, or friendly Bounciness + Settle Time) with correct
  overshoot, baked to clean keyframes or a live expression.
- **Anchor, align, distribute, array, follow-through** and more, batch-aware
  and each a single undo step.
- **Non-destructive by default.** Prefer native temporal ease and live
  expressions; one click bakes anything to keyframes for render farms or Lottie.
- **Yours.** No telemetry, no account, original code under the MIT license.

See the full roadmap in [docs/FEATURES.md](docs/FEATURES.md).

## Send designs straight into After Effects

Rebound also brings designs in. Select a frame in Figma, artwork in Illustrator,
or open a document in Photoshop, send it, and it lands in your active composition
as **native, editable After Effects layers**: text stays editable text with every
parameter, shapes stay parametric, gradients stay native gradients, shadows and
glows and bevels become real **layer styles**, masks become track mattes, and you
get a fidelity report of exactly what transferred. Free, no account, and nothing
leaves your machine.

This is the free alternative to the paid incumbents, and it goes further: even
Illustrator and Photoshop **text** comes across as real, editable After Effects
text, and Photoshop **layer effects** come across as editable layer styles.

### How it works

```
Figma ───────┐
Illustrator ─┼──>  Rebound IR (.rbir)  ──>  Rebound (After Effects)  ──>  native layers
others ──────┘
```

Every exporter emits one portable document, the **Rebound IR** (documented in
[docs/IR.md](docs/IR.md)); the After Effects panel rebuilds it. The Rebound panel
runs a tiny loopback receiver, so a one-click send works while After Effects is
open; when it is not, the exporter saves a `.rbir` file you import from the
panel. Both paths run the identical builder.

### The companions ("Relay")

- **[Figma](plugins/figma/)** is a Figma plugin. Build it with `npm run
  build:figma`, then in Figma: **Plugins ▸ Development ▸ Import plugin from
  manifest…** and choose `plugins/figma/manifest.json`.
- **[Illustrator](plugins/illustrator/)** is an ExtendScript file. Run it with
  **File ▸ Scripts ▸ Other Script…** and choose
  `plugins/illustrator/export-ir.jsx`.
- **[Photoshop](plugins/photoshop/)** is an ExtendScript file. Run it with
  **File ▸ Scripts ▸ Browse…** and choose `plugins/photoshop/export-ir.jsx`.

### Try it end to end

1. In After Effects, open the **Rebound** panel and an empty composition. Open
   **Convert & import ▸ Import**; it shows "Receiver on".
2. In Figma, run **Rebound Relay**, select a frame, and click **Send to After
   Effects**. (Or export from Illustrator, or import a saved `.rbir` from the
   panel with **Import from file…**.)
3. The layers appear in your composition, and the import report lists anything
   that was approximated or needs a font, with a one-click font replacement.

The per-app steps and the full fidelity matrix are in each companion's README and
in [docs/IR.md](docs/IR.md).

## Status

Active early development, but already broad: **59 tools** ship today (including
**Import**, the Figma/Illustrator/Photoshop bridge), reached through a
searchable, keyboard-first **Home launcher** (grouped into goal-shaped sections
with favorites + recents), and a **live Preview Stage** that loops the
easing/spring motion on a sample shape or text, so you see what a curve does
before you apply it. Built on a fully unit-tested easing/spring engine, a shared
IR contract, and a clean panel↔host bridge.

| Group | Tools |
| --- | --- |
| **Easing** | Ease · Library · Velocity · Copy Ease · Smooth · Bake |
| **Springs & physics** | Spring · Recoil · Drift · Bounce · Motion (orbit/spin/look-at) · Follow · Lean · Kinetic · Squash & Stretch · Throw · Path Follow |
| **Timing** | Stagger · Sequence · Trim · Reverse · Fade · Keyframes · Retime · Clone |
| **Transform & rig** | Anchor · Reset · Nullify · Separate · Link · Puppet Rig · Autocrop |
| **Layout & align** | Align · Distribute · Arrange · Flip · Grids · Composition · Precompose |
| **Generators** | Multiply · Radial · Echo · Vignette · Scatter · Expressions · Backdrop |
| **Shapes & paths** | Shapes · Trim Paths · Break · Text Break |
| **Color** | Color · Palette · Stroke · Gradient |
| **Convert & import** | Import (Figma / Illustrator / Photoshop / `.rbir` to native layers) |
| **Organize & help** | Tags · Rename · Scripts · Share · Demo |

The panel UI is verified in a browser; the ExtendScript host is reviewed against
Adobe's API and best exercised live in After Effects (see install/testing
below). The full catalog and the remaining roadmap (multi-space/multi-segment
curve editing, a particle field, soft-body, plexus connectors, a cursor kit) are
in [docs/FEATURES.md](docs/FEATURES.md). Expect rough edges.

## Install

### From a release (recommended for users)

1. Download the latest `rebound_x.y.z.zxp` from the
   [Releases page](https://github.com/meszmate/rebound/releases).
2. Install it with a ZXP installer (e.g. the free
   [ZXPInstaller](https://zxpinstaller.com/)) or Adobe's Extension Manager
   equivalent.
3. Restart After Effects → **Window ▸ Extensions ▸ Rebound**.

### From source (for development)

```bash
git clone https://github.com/meszmate/rebound
cd rebound
npm install
npm run debug:on        # enable CEP dev mode (PlayerDebugMode)
npm run install:dev     # link the repo into your CEP extensions folder
# restart After Effects -> Window > Extensions > Rebound
```

Full, platform-specific steps (Windows + macOS, paths, troubleshooting) are in
[docs/INSTALL.md](docs/INSTALL.md).

## Development

```bash
npm test            # unit tests (easing/units math + the IR contract and Figma exporter)
npm run lint        # ESLint
npm run check       # lint + test
npm run build:figma # bundle the Figma "Relay" companion into plugins/figma/dist
```

You can preview the panel UI in a normal browser (without After Effects), see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Architecture is documented in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and how to add a tool is in
[AGENTS.md](AGENTS.md).

### Releasing

Releases are automated. Push a `vX.Y.Z` tag whose version matches
`package.json`, and the [release workflow](.github/workflows/release.yml)
lints, tests, packs a signed ZXP, and publishes it to the
[Releases page](https://github.com/meszmate/rebound/releases):

```bash
npm version patch        # bumps package.json + creates the tag
git push --follow-tags
```

The workflow signs with a self-signed certificate and a public timestamp
authority, so the signature stays valid past the certificate's expiry. To build
a ZXP locally instead, run `npm run cert` then `npm run pack` (both need Adobe's
[ZXPSignCmd](https://github.com/Adobe-CEP/CEP-Resources) on `PATH` or in
`REBOUND_ZXPSIGN`); the result lands in `dist/`.

## Compatibility

After Effects 2019 (16.0) and newer, on Windows and macOS. Rebound is a CEP
extension (CEP 9+).

## Contributing

Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md).
The codebase is buildless and the math core is fully unit-tested, so it's easy
to dive into.

## Prior art & acknowledgements

Several excellent commercial panels pioneered this style of workflow tooling for
After Effects. Rebound is an independent, clean-room project: we studied *what*
such workflows accomplish and implemented our own design and code from first
principles using public techniques (CSS cubic-bezier, the Penner equations,
spring physics) and Adobe's documented scripting APIs. No third-party source,
assets, or interface are reused; the only vendored file is Adobe's
`CSInterface.js`.

## License

[MIT](LICENSE). Rebound is free and open source; use it for anything, personal
or commercial, with no restrictions.
