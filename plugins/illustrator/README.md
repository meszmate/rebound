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

> **Want a file instead of a one-click send?** Hold **Shift** while running the
> script to always save a `.rbir` file, even when After Effects is open, handy
> for handing a design off or importing it later.

To make it appear under File > Scripts permanently, copy both files into
Illustrator's `Presets/<locale>/Scripts` folder and restart Illustrator.

## What transfers

Paths and compound paths (exact bezier, even-odd holes), groups (with clip
masks), and text (editable, per character-attribute run, with the real font).
Solid, gradient (colours exact, linear/radial with geometry), CMYK/Gray/Spot/Lab
(converted to RGB), strokes (width, cap, join, dashes), opacity, and blend modes.
Placed/linked images, symbols, gradient meshes, patterns, live effects (drop
shadow/glow/blur), and opacity-masked art are **baked to pixel-exact PNGs** so
they still come across (they just aren't editable vectors). Everything baked or
approximated is listed at the end of the export.

## Known limitations

- **Rotated text stays editable but imports unrotated.** Illustrator's scripting
  DOM exposes no transform matrix or rotation angle for a text frame, so rotation
  can't be detected or carried. Rasterize a rotated text frame in Illustrator
  first if you need it pixel-exact.
- **Opacity masks are baked** (the mask art isn't a separable page item in the
  DOM), so the masked result is a flat image rather than an editable luma matte.
- **Live-effect detection is heuristic** (visible-bounds overflow): a heavily
  mitred stroke could bake when it didn't need to. Both cases are noted.
