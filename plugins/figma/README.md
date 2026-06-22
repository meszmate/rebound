# Rebound Relay (Figma)

Send a Figma design straight into After Effects as native, editable layers. The
free companion to the Rebound After Effects panel. Text stays editable text with
every parameter, shapes stay parametric, gradients stay native gradients.

This is one half of a pair:

- **Rebound Relay** (this plugin) reads your selection and produces a Rebound IR
  document (see [`../../docs/IR.md`](../../docs/IR.md)).
- **Rebound** (the After Effects panel) receives it and rebuilds it 1:1.

## How it works

The Rebound panel runs a tiny loopback server inside After Effects. Relay finds
it on `127.0.0.1`, sends the IR, and After Effects rebuilds the design. If After
Effects is not running, Relay saves a `.rbir` file you can import from the panel.
Nothing leaves your computer.

## Build

The plugin is buildless apart from one concatenation step (Figma needs a single
bundled script and an inlined UI). From the repo root:

```
npm run build:figma
```

This writes `plugins/figma/dist/main.js` and `plugins/figma/dist/ui.html`, which
`manifest.json` points at.

## Test it locally

1. In After Effects, open the **Rebound** panel (it starts the receiver
   automatically; the Import tool shows "Receiver on").
2. In Figma desktop: **Plugins -> Development -> Import plugin from manifest…**
   and choose `plugins/figma/manifest.json`.
3. Run **Rebound Relay** from **Plugins -> Development**.
4. Select a frame or some layers and click **Send to After Effects**. The layers
   appear in your active composition, and a fidelity report shows what
   transferred.

If After Effects is not open, click **Save .rbir instead** (or it saves
automatically) and use **Import from file…** in the Rebound panel.

## What transfers

Frames (as precomps), groups, rectangles, ellipses, polygons, stars, lines,
vectors, booleans, text (editable, per run on AE 24.3+), solid and gradient
fills and strokes, drop shadows and blurs, transforms, opacity, and blend modes.
See the fidelity matrix in [`../../docs/IR.md`](../../docs/IR.md).
