# Contributing to Rebound

Thanks for your interest! Rebound is buildless and the math core is fully
unit-tested, so it's an easy codebase to jump into.

## Ground rules

- **Original, clean-room code only.** Implement from public specs (CSS
  cubic-bezier, the Penner equations, spring physics) and Adobe's documented
  APIs. Do not copy any other product's source, scripts, assets, preset names,
  or interface. The only vendored third-party file is Adobe's `CSInterface.js`.
- **Name features by behavior**, not by other tools, in code, comments, and
  docs.
- Be kind in issues and reviews.

## Getting started

```bash
npm install
npm run check      # lint + tests must pass
```

Read [AGENTS.md](AGENTS.md) (module patterns, how to add a tool) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Workflow

1. Fork and branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Make your change. Add or update tests for any pure logic
   (`client/js/easing/`, `client/js/core/units.js`).
3. `npm run check` must pass. Preview UI changes in the browser
   (`node tools/_serve.mjs`) and, where possible, inside After Effects.
4. Keep PRs focused. Describe what changed and how you verified it.

## Adding a tool

See the "Adding a tool" section in [AGENTS.md](AGENTS.md). In short: create
`client/js/features/<id>.js`, register it, add a host command if it touches AE,
and list the script in `client/index.html`.

## Commit messages

Short imperative subject (e.g. `Add distribute-by-gaps option`). Reference an
issue when relevant.

## Reporting bugs

Open an issue with: AE version + OS, what you did, what you expected, what
happened, and the panel log (the header menu can copy it). For host errors, the
remote debugger console (see [docs/INSTALL.md](docs/INSTALL.md)) is gold.

## License

By contributing you agree your contributions are licensed under the project's
[MIT license](LICENSE).
