# Rebound IR (the cross-app contract)

Rebound moves a design from another app into After Effects by passing one thing
between them: a **Rebound IR document**. It is a single, versioned JSON shape
that every exporter (Figma, Illustrator, and future sources) emits and the After
Effects importer consumes. No exporter knows anything about After Effects, and
the importer knows nothing about Figma or Illustrator. All app-specific knowledge
lives at the edges.

```
Figma plugin ─┐
Illustrator ──┼─→  Rebound IR (JSON)  ──→  Rebound (After Effects)  ─→  native AE layers
others …    ──┘        the contract            the importer
```

The schema is the single source of truth: [`shared/ir/schema.json`](../shared/ir/schema.json).
The version constant lives in [`shared/ir/ir-version.json`](../shared/ir/ir-version.json).

## Normalisation rules (every exporter converts INTO these)

- **Colour**: `{ r, g, b, a }` with each channel `0..1`. (After Effects colour
  properties take `0..1`; Figma is already `0..1`; Illustrator RGB/CMYK/Gray/Lab/
  Spot are converted to sRGB by the exporter.)
- **Length**: pixels. Illustrator points are 1:1 with pixels at 72 dpi.
- **Angle**: degrees, clockwise.
- **Origin / axis**: top-left, **Y down** (the After Effects convention).
  Illustrator is bottom-left, Y up, so its exporter flips Y on every coordinate,
  bezier handle, and matrix. This is the single most common cause of a "1:1"
  failure, so it is covered by fixture tests.
- **Path tangents**: stored **relative to their vertex** (`handle - anchor`),
  exactly what an AE `Shape()` wants. `[0,0]` means a corner.
- **Images**: carried as base64 in `document.assets`, keyed by content hash so
  the same bitmap is stored once and referenced by hash.

## Document shape

```
{
  irVersion: "1.0.0",
  source:   { app, appVersion?, exporterVersion?, fileName?, selectionCount? },
  document: {
    name?, colorSpace, unit, yAxis,
    assets: { <hash>: { hash, mime, width, height, bytesBase64 } },
    frames: [ Frame ]
  }
}
```

A **Frame** is an artboard / top-level frame: `id, name, width, height,
background[], clipsContent, buildMode (PRECOMP | GROUP), children[]`.

A **Node** is any element. Shared fields: `id, type, name, visible, locked,
opacity, blendMode, isMask, transform, constraints, fills[], stroke, effects[],
cornerRadii, children[]`. Type-specific fields:

| type | extra fields |
| --- | --- |
| `RECTANGLE` / `ELLIPSE` / `POLYGON` / `STAR` | `primitive` (parametric, keeps it editable in AE) |
| `LINE` / `VECTOR` | `paths[]` (bezier subpaths; multiple = compound / holes) |
| `BOOLEAN` | `boolean.op` + operand `children[]` |
| `TEXT` | `text` (characters + per-run styling) |
| `IMAGE` | `imageHash` into `document.assets` |
| any | `svgFallback` (an exported SVG string for an exact, non-parametric rebuild) |

**Paint** covers `SOLID`, `GRADIENT_LINEAR/RADIAL/ANGULAR/DIAMOND`, and `IMAGE`.
**Text runs** carry font family/style/PostScript name, size, fills, tracking
(AE units, 1000 = 1em), line height, baseline shift, case, decoration, faux
bold/italic, and horizontal/vertical scale.

## Transfer

The importer is the receiving side inside the Rebound After Effects panel:

1. **Primary** — the panel runs a loopback HTTP server (CEP has Node). An
   exporter `POST`s the IR to `http://127.0.0.1:<port>/rebound/ir`; the chosen
   port is published to `USER_DATA/Rebound/bridge.json` and discoverable via
   `GET /rebound/ping`.
2. **Fallback** — any exporter can also write the IR to a `.rbir` file (just the
   JSON). The panel's "Import from file" runs the identical build path, so the
   fallback always works offline, behind firewalls, or when AE was not open at
   export time.

## Versioning

`irVersion` is semver. The importer accepts a **matching major** and warns on
minor/patch skew; a major mismatch is a hard, friendly error rather than a broken
build. Bump the major only for a breaking schema change.

## Validation

[`shared/lib/validate.js`](../shared/lib/validate.js) is a small, targeted
validator (not a general JSON Schema engine) so it runs in the Figma sandbox, the
ExtendScript host, the panel, and Node alike. It returns `{ valid, errors,
warnings, counts }` and, crucially, separates hard **errors** (cannot build) from
**warnings** (will build with reduced fidelity) so the import report can be
honest about what transferred.

## Fidelity matrix

Ratings: **exact** (identical), **high** (visually identical, editable),
**approximate** (close, flagged in the report), **lossy** (visual only / not
fully editable), **unsupported** (skipped, noted).

| Feature | Figma source | Illustrator source | After Effects build | Fidelity |
| --- | --- | --- | --- | --- |
| Frame / artboard | FrameNode | Document artboard / top layer | CompItem sized to the frame, placed as a precomp | exact |
| Group | GroupNode | GroupItem | precompose or a null-parented set | high |
| Rectangle (+ radius) | RectangleNode + radii | PathItem / live rect | `ADBE Vector Shape - Rect` + roundness; per-corner / squircle -> bezier path | high |
| Ellipse (+ arc) | EllipseNode + arcData | PathItem / ellipse | `ADBE Vector Shape - Ellipse`; arcs/pie -> bezier path | high |
| Polygon / star | PolygonNode / StarNode | PathItem | `ADBE Vector Shape - Star` (type 1/2) | high |
| Line | LineNode | open PathItem | open 2-vertex path + stroke | exact |
| Vector path | vectorPaths / vectorNetwork | PathItem.pathPoints | `Shape()` vertices + relative tangents | high |
| Compound / holes | EVENODD fillGeometry | CompoundPathItem | sub-paths in one group, even-odd Fill Rule | high |
| Boolean | BooleanOperationNode | pathfinder result | Merge Paths (`ADBE Vector Filter - Merge`) | high |
| Solid fill | SolidPaint | RGB/CMYK/Gray/Lab/Spot | `ADBE Vector Graphic - Fill` (0..1) | exact |
| Linear / radial gradient | GradientPaint | GradientColor | `G-Fill` + `ADBE Vector Grad Colors` stops (already solved in this repo) | high |
| Angular / diamond gradient | GRADIENT_ANGULAR/DIAMOND | freeform / mesh | no native AE type -> approximate or rasterise | approximate |
| Image fill | ImagePaint bytes | Raster / Placed item | PNG footage import, scaled to the node box | high |
| Stroke (weight/cap/join/dash) | strokes + props | strokeWidth + props | `ADBE Vector Graphic - Stroke`; INSIDE/OUTSIDE align -> centre (flagged) | high |
| Text (editable, per run) | getStyledTextSegments | per-run character/paragraph attrs | `TextDocument` + `characterRange` (AE 24.3+); older AE splits runs into layers | high |
| Opacity | node.opacity | item.opacity | `ADBE Opacity` | exact |
| Blend mode | blendMode | blendingMode | `layer.blendingMode` | high |
| Rotation / position / size | transform | matrix (Y up) | layer transform + anchor; IL must flip Y | exact |
| Drop / inner shadow | DropShadow/InnerShadow | Drop Shadow effect | `ADBE Drop Shadow`; inner shadow approximated | high |
| Layer / background blur | LAYER/BACKGROUND_BLUR | Gaussian Blur | `ADBE Gaussian Blur 2`; background blur approximated | high |
| Masks / clipping | isMask | clipping path | AE mask or track matte | high |
| Constraints | constraints | n/a | stored as a layer comment, not reconstructed | unsupported |
| Auto-layout | layoutMode | n/a | baked absolute positions only | lossy |
| Tapered / variable stroke | n/a | width profile | baked outline or flagged | lossy |
| Pattern / mesh / freeform | PatternPaint | pattern / mesh | rasterised to an image or flagged | approximate |
