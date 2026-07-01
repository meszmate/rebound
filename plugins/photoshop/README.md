# Rebound Relay (Photoshop)

Send a Photoshop document into After Effects. Type layers come across as
**editable After Effects text** with the real font, **layer effects** (drop and
inner shadow, glows, colour overlay, stroke) come across as real, editable After
Effects **layer styles**, and every other layer is placed as a pixel-perfect
image exactly where it was. The free companion to the Rebound After Effects
panel; see [`../../docs/IR.md`](../../docs/IR.md) for the shared contract.

## Run it

A single ExtendScript file, no build step.

1. In After Effects, open the **Rebound** panel (it starts the receiver
   automatically).
2. Open the document in Photoshop.
3. **File > Scripts > Browse…** and choose `plugins/photoshop/export-ir.jsx`
   (keep `json2.js` beside it).
4. It is sent straight into your active composition (**one click**). If After
   Effects is not running, you are prompted to save a self-contained `.rbir`
   file (images embedded) to import from the panel with **Import from file…**.

> **Want a file instead of a one-click send?** Hold **Shift** while running the
> script to always save a `.rbir` file, even when After Effects is open, handy
> for handing a design off or importing it later.

To install it under File > Scripts permanently, copy both files into
Photoshop's `Presets/Scripts` folder and restart Photoshop.

## What transfers

Groups (with blend + opacity), editable type layers (font, size, colour,
tracking, alignment, per-run styling), vector shape layers (as editable paths),
and layer effects (drop/inner shadow, glow, colour/gradient overlay, stroke,
bevel, satin) as real layer styles. Raster, smart-object, fill, and adjustment
layers are placed as pixel-exact images by their bounds.

## Known limitations

- **Rotated text is baked to a pixel-exact image** (Photoshop text rotation
  isn't carried as editable AE text). Unrotated text stays fully editable.
- **Paragraph-text box sizing uses the ink bounds**, not the text frame, so a
  paragraph box much wider than its text could re-wrap slightly. Point text and
  box-filling paragraph text are unaffected.
- Rich (mixed) type styling on very old Photoshop builds falls back to the
  dominant style; everything approximated is listed in the export report.
