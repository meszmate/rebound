<div align="center">

# ◗ Rebound

**A free, open-source easing & motion-design panel for After Effects.**

Shape easing curves, design physical springs with real overshoot, fix anchor
points, align and array layers, and rig follow-through — from one cohesive
panel. Clean-room, original, and built on public, non-proprietary techniques.

</div>

---

## Why Rebound

Motion designers stitch together a pile of small operations all day: easing
keyframes, nudging anchor points, aligning layers, building bouncy overshoot.
Rebound brings those into a single, keyboard-friendly panel with one consistent
curve editor at its heart — so you learn one surface, not fifty dialogs.

- **One curve editor** for easing, springs, and overshoot. Drag handles, type
  `cubic-bezier()`, or pick a preset — and *feel* it before you apply.
- **Physical springs.** A real damped-harmonic-oscillator engine (mass /
  stiffness / damping, or friendly Bounciness + Settle Time) with correct
  overshoot, baked to clean keyframes or a live expression.
- **Anchor, align, distribute, array, follow-through** and more — batch-aware
  and each a single undo step.
- **Non-destructive by default.** Prefer native temporal ease and live
  expressions; one click bakes anything to keyframes for render farms or Lottie.
- **Yours.** No telemetry, no account, original code under the MIT license.

See the full roadmap in [docs/FEATURES.md](docs/FEATURES.md).

## Status

Early development. The easing engine, host bridge, theme, curve editor, and the
**Ease** tool are working; the broader toolkit is being built out against the
catalog in [docs/FEATURES.md](docs/FEATURES.md). Expect rough edges.

## Install

### From a release (recommended for users)

1. Download the latest `rebound_x.y.z.zxp` from the Releases page.
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
npm test            # unit tests for the easing + units math
npm run lint        # ESLint
npm run check       # lint + test
```

You can preview the panel UI in a normal browser (without After Effects) — see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Architecture is documented in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and how to add a tool is in
[AGENTS.md](AGENTS.md).

## Compatibility

After Effects 2019 (16.0) and newer, on Windows and macOS. Rebound is a CEP
extension (CEP 9+).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
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

[MIT](LICENSE).
