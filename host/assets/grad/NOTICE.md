# Gradient preset templates — third-party notice

The files `grad2.ffx.tmpl` … `grad8.ffx.tmpl` in this folder are After Effects
animation-preset (`.ffx`) containers, one per gradient stop count (2–8), used by
`host/lib/grad.jsx` to write **true editable native shape-layer gradients**. After
Effects exposes `ADBE Vector Grad Colors` as `NO_VALUE` to scripting (and `NO_DATA`
to the native C++ SDK), so the stop colours cannot be set with `setValue`; the only
script-reachable path is to substitute the colours into a gradient preset's embedded
`GCkyUtf8` XML block and `layer.applyPreset()` it onto the target G-Fill / G-Stroke.
This is the same technique used by Overlord and by Google's AEUX.

## Attribution

These template containers are derived from **AEUX** by Google
(https://github.com/google/aeux), specifically the `template_grad2`…`template_grad8`
preset blobs in its host script.

    Copyright 2018 Google LLC
    Licensed under the Apache License, Version 2.0
    http://www.apache.org/licenses/LICENSE-2.0

A copy of the Apache 2.0 license accompanies this notice (`LICENSE-APACHE-2.0.txt`).

## Modifications (Apache 2.0 §4(b))

- Extracted from AEUX's escaped-binary JavaScript string literals into standalone
  `.ffx.tmpl` files (byte-for-byte; only the container, no surrounding code).
- The per-stop numeric `<float>` slots are carried as plain-text token lines
  (`points[i].rampPoint`, `points[i].midPoint`, `points[i].opacity`,
  `points[i].color[j]`) which `host/lib/grad.jsx` replaces at import time with the
  real gradient's positions / colours / alpha. The surrounding RIFX binary chrome
  is left unchanged.

Regenerate with `node tools/build-grad-templates.mjs` (see that file for the exact
source URL and extraction logic).
