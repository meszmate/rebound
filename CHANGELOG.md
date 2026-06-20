# Changelog

All notable changes to Rebound are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Project foundation: buildless CEP extension scaffold, manifest (panel +
  settings extensions), dev tooling, CI, and documentation.
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

[Unreleased]: https://github.com/meszmate/rebound/commits/main
