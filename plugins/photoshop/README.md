# Rebound Relay (Photoshop)

Send a Photoshop document into After Effects. Type layers come across as
**editable After Effects text** with the real font, **layer effects** (drop and
inner shadow, glows, colour overlay, stroke) come across as real, editable After
Effects **layer styles**, and every other layer is placed as a pixel-perfect
image exactly where it was. The free companion to the Rebound After Effects
panel; see [`../../docs/IR.md`](../../docs/IR.md) for the shared contract.

## Run it

A single ExtendScript file, no build step.

1. Open the document in Photoshop.
2. **File > Scripts > Browse…** and choose `plugins/photoshop/export-ir.jsx`
   (keep `json2.js` beside it).
3. Choose where to save the `.rbir` file (images are embedded, so it is one
   self-contained file).
4. In After Effects, open the **Rebound** panel and use **Import from file…**
   (Convert & import) to rebuild it in the active composition.

To install it under File > Scripts permanently, copy both files into
Photoshop's `Presets/Scripts` folder and restart Photoshop.

## What transfers

Groups (with blend + opacity), editable type layers (font, size, colour,
tracking, alignment), and layer effects as real layer styles. Raster, shape,
smart-object, fill, and adjustment layers are flattened to images and placed by
their bounds. Rich (mixed) type styling falls back to the dominant style, and
bevel/satin/gradient-overlay are noted in the export report for now.
