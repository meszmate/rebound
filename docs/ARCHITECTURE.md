# Rebound architecture

Rebound is a buildless Adobe CEP extension: a Chromium-hosted panel plus an
ExtendScript host, with a clean RPC seam between them.

```
 ┌─────────────────────────────────────────────┐
 │ After Effects                                │
 │                                              │
 │   ┌──────────────┐   evalScript   ┌────────┐ │
 │   │  Panel (CEF) │ ─────────────▶ │  Host  │ │
 │   │  client/     │ ◀───────────── │ host/  │ │
 │   │  HTML/CSS/JS │   JSON string  │ ES3    │ │
 │   └──────────────┘                └────────┘ │
 └─────────────────────────────────────────────┘
```

## The bridge (panel ⇄ host)

`client/js/core/bridge.js` is the only module that touches CSInterface.

- `Rebound.bridge.invoke(method, args)` returns a `Promise` of a host command's
  result, or rejects with an `Error` carrying a structured `hostError`.
- evalScript is **async on Windows, synchronous on macOS**, and **always returns
  a string**, so every call is Promise-wrapped and uses a JSON envelope.
- The host is bootstrapped once: the bridge passes the extension path, evaluates
  `host/index.jsx`, and the host reports its version back.

### RPC envelope

The panel calls:

```js
$.__rebound.dispatch("ease.apply", "{\"curve\":{…},\"scope\":\"inout\"}")
```

The host returns one of:

```json
{ "ok": true,  "data": { "segments": 14, "properties": 3 } }
{ "ok": false, "error": { "message": "Select at least two keyframes." } }
```

`host/lib/core.jsx` owns `dispatch`: it parses the args, runs the registered
command (inside one undo group if it declared an undo label), and serialises the
envelope. Errors become structured JSON instead of the opaque
`"EvalScript error."` string.

## The host

ES3 ExtendScript, loaded in order by `host/index.jsx`:

1. `lib/json.jsx` — a small original JSON parser/stringifier (the legacy engine
   has no native JSON).
2. `lib/core.jsx` — the RPC dispatcher + command registry.
3. `lib/util.jsx` — matchName constants and shared helpers (active comp,
   property resolution, dimensionality).
4. `commands/*.jsx` — feature commands; each calls `$.__rebound.register(...)`.

Design rules: **iterate inside ExtendScript** (pass everything once, loop in
JSX, return one payload — never `evalScript` per item); **one undo group** per
action; **matchName** addressing for locale safety; keep the host **thin** —
heavy math is done in the tested JS core and only resolved values are written.

## The panel

### Core (`client/js/core/`)

| Module | Role |
| --- | --- |
| `bridge.js` | the CSInterface seam (above) |
| `registry.js` | the tool registry — features self-register; the shell reads it |
| `store.js` | a tiny reactive store + versioned JSON persistence (Node FS) |
| `theme.js` | reads the host skin → CSS custom properties (light/dark/accent) |
| `events.js` | a synchronous event bus |
| `dom.js` | declarative element helpers (HTML + SVG) |
| `units.js` | the shared unit/time parser (UMD, tested) |
| `log.js` | logging + a ring buffer behind "copy log" |

### Easing engine (`client/js/easing/`)

Pure, host-agnostic, UMD-wrapped so it runs in the panel and imports into
Vitest.

- `bezier.js` — cubic-bezier solver (Newton-Raphson) and the curve ⇄ AE
  temporal-ease (`speed`, `influence`) conversion, both directions.
- `penner.js` — the closed-form Penner set + a monotonic/non-monotonic flag.
- `spring.js` — the damped harmonic oscillator with physical and perceptual
  (response + bounce / response + dampingFraction) parameterizations and a
  settle-time estimate, with correct underdamped / critical / overdamped
  branches.
- `sampler.js` — decides the application strategy (native temporal ease vs.
  bake), samples points for the editor, bakes interpolation factors, and fits a
  monotonic curve to a single bezier.

### UI (`client/js/ui/`)

`controls.js` provides framework-free factories (toast, segmented control,
numeric field, slider, toggle). `curve-editor.js` is the SVG curve editor:
draggable bezier handles, an overshoot-aware viewport, a live influence/speed
readout, and an optional looping "feel it" motion swatch.

### Shell (`client/js/main.js`)

Boots the theme, builds the header / selection strip / tab rail, mounts tools
from the registry on demand, polls the AE selection into the store, and runs the
`Ctrl/Cmd-K` command palette.

### Tools (`client/js/features/`)

One file per tool. Each registers a spec with a `mount(ctx)` that builds UI into
`ctx.body` and actions into `ctx.footer`. `ctx` exposes `invoke`, `store`,
`bus`, `toast`, `units`, and selection helpers. See `features/ease.js` as the
reference implementation.

## Applying an ease — worked example

1. The user shapes a curve in the editor → `{ type:'bezier', x1,y1,x2,y2 }`.
2. **Ease** calls `invoke('ease.apply', { curve, scope, applyToAll })`.
3. The host iterates the selected keyframes, and per segment per dimension
   computes `influence`/`speed` from the curve and the segment's signed average
   speed (`dv/dt`) — mirroring the unit-tested formula in `bezier.js` — then
   `setTemporalEaseAtKey`, all in one undo group.
4. It returns `{ segments, properties }`; the panel shows a confirmation toast.

Overshooting curves (springs, bounce) can't be a single temporal ease, so the
sampler routes them to a **bake** (dense sampled keyframes) or an expression —
and the UI says which mode was used.

## Why buildless

Each CEP panel is its own Chromium process; staying framework-free and
dependency-free keeps it lean and the source directly debuggable in the panel.
The UMD pattern lets the *exact* shipped math modules be unit-tested under Node.
Keeping every host call behind one bridge module is also the abstraction seam
for a possible future UXP port.
