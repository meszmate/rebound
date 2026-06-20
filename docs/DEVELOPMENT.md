# Developing Rebound

## Prerequisites

- Node.js 20+ and npm
- After Effects 2019+ (for host testing)
- Adobe ZXPSignCmd (only for packaging) — see [INSTALL.md](INSTALL.md)

## Setup

```bash
npm install
npm run check        # lint + unit tests; do this before every commit
```

## The two halves

Rebound has a **panel** (browser-side, `client/`) and a **host**
(ExtendScript, `host/`). They communicate through `Rebound.bridge`.

### Iterating on the panel

You can develop most of the UI in a normal browser, with no After Effects:

```bash
node tools/serve.mjs            # serves client/ at http://localhost:8099
```

Outside the host, `Rebound.bridge.available` is `false`, host calls reject
gracefully, and selection polling is disabled — so the shell, curve editor,
controls, and presets all render and are fully interactive. Use this for fast
visual iteration.

Inside After Effects, use the remote debugger (`http://localhost:8718`, see
INSTALL.md) for the real thing, including host round-trips.

### Iterating on the host

The host is reloaded by the panel on demand — click the **⟳** button in the
header (visible only inside AE) after editing any `host/*.jsx` file. No AE
restart needed. The bridge bootstraps `host/index.jsx`, which re-evaluates every
module idempotently.

If you prefer, run a `.jsx` directly from the ExtendScript Toolkit / VS Code
ExtendScript Debugger for line-level debugging.

## Tests

The pure math (easing curves, springs, sampler, units) is unit-tested with
Vitest:

```bash
npm test             # run once
npm run test:watch   # watch mode
npm run test:cov     # coverage (client/js/easing)
```

Tests import the runtime modules directly (they're UMD), so the *exact* code
that ships in the panel is what's tested. New pure logic should live in
`client/js/easing/` (or a sibling pure module) and get tests in `test/`.

The ExtendScript host can't run under Node, so host logic is kept thin — it
receives already-resolved values from the tested JS core and writes them to AE.
The host JSON helper's algorithm is validated separately (see
`tools/_json-check.mjs`).

## Linting

```bash
npm run lint
npm run lint:fix
```

ESLint is scoped by path: browser globals for `client/js/**`, ES3 + AE globals
for `host/**`, and Node/ESM for `tools/**` and `test/**`.

## Project conventions

- Buildless. Add panel scripts as `<script>` tags in `client/index.html` in
  dependency order.
- `client/` is ES5-compatible; `host/` is ES3.
- One undo group per mutating action; report what changed via a toast.
- Address AE properties by matchName only.
- Keep all host access behind `Rebound.bridge`.

See [AGENTS.md](../AGENTS.md) for the module patterns and how to add a tool, and
[ARCHITECTURE.md](ARCHITECTURE.md) for the deeper design.

## Useful scripts

| Command | Does |
| --- | --- |
| `npm run debug:on` / `debug:off` | Toggle CEP PlayerDebugMode |
| `npm run install:dev` / `uninstall:dev` | Link/remove the dev build |
| `npm run cert` | Create a self-signed signing certificate |
| `npm run pack` | Build a signed `.zxp` |
| `node tools/gen-icons.mjs` | Regenerate panel icons |
| `node tools/serve.mjs` | Static-serve `client/` for browser preview |
