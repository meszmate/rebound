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

[Unreleased]: https://github.com/meszmate/rebound/commits/main
