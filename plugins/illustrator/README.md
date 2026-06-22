# Rebound Relay (Illustrator)

Send Illustrator artwork into After Effects as native, editable layers. Unlike
the paid incumbents, Illustrator **text comes across as real, editable After
Effects text** with every character attribute (Illustrator hands us the exact
PostScript font name).

This is the Illustrator exporter half of the pair; the Rebound After Effects
panel rebuilds the result. See [`../../docs/IR.md`](../../docs/IR.md) for the
shared contract and the fidelity matrix.

## Run it

The exporter is a single ExtendScript file, no build step.

1. In After Effects, open the **Rebound** panel (it starts the receiver
   automatically).
2. Select the artwork in Illustrator (or run with nothing selected to export all
   top-level art).
3. **File > Scripts > Other Script…** and choose
   `plugins/illustrator/export-ir.jsx` (it `#include`s `json2.js` from the same
   folder, so keep them together).
4. It is sent straight into your active composition (**one click**). If After
   Effects is not running, you are prompted to save a `.rbir` file to import from
   the panel with **Import from file…**.

To make it appear under File > Scripts permanently, copy both files into
Illustrator's `Presets/<locale>/Scripts` folder and restart Illustrator.

## What transfers

Paths and compound paths (exact bezier, even-odd holes), groups, and text
(editable, per character-attribute run, with the real font). Solid, gradient
(colours exact), CMYK/Gray/Spot (converted to RGB), strokes (width, cap, join,
dashes), opacity, and blend modes. Placed/linked images, symbols, gradient
meshes, and patterns are not transferred in this version and are listed at the
end of the export so you know exactly what to redo by hand.
