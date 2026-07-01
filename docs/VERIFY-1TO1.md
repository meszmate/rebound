# Verifying 1:1 fidelity in After Effects

Rebound's conversion logic is validated automatically (`npm test` — the exporter
IR, the host shape geometry, and the host positioning glue all run their **real
code** against known and real-file values). The one thing automated tests cannot
do is look at the rendered result in After Effects: that needs AE running and a
human eye. This is the short procedure to close that last inch, and to turn any
mismatch into a fast, precise fix.

## The 60-second check

1. **Import a real file** (Figma/Illustrator/Photoshop → the Rebound panel).
2. **Read the panel's 1:1 self-check.** After the build it reports either
   *"all N elements accounted for"* or a loud *"M elements unaccounted for"*. A
   deficit means layers were silently lost — copy that line and the file, and
   send it: it points straight at the gap.
3. **Read the fidelity report** below it — "Approximated" and "Not transferred"
   list exactly what was rebuilt inexactly or baked, by name. Nothing there means
   everything came across as native, editable layers.
4. **Spot-check placement**: nothing should be off-canvas, collapsed to a corner,
   or overlapping wrongly. Toggle a few layers; confirm they sit where the design
   has them.

If steps 2–4 are clean, the import is faithful. If anything looks off, the next
section makes the report actionable.

## The canonical acceptance test (the real Branding board)

The converter is validated in CI against a specific real file — the "Panel —
Screens" board (Figma `ExF7F6OQea07IneHpInnXU`, node `55:2`): 2,745 nodes
(1855 frames / 766 text / 124 vectors) nested 14 deep. Import it and confirm the
elements whose logic the tests pin down:

| Element | Expected in After Effects |
| --- | --- |
| The whole board | Lands as ~9 editable precomps (one per screen), **not** 1000+ flat layers |
| A single screen (import just one frame) | Stays flat/editable in one comp |
| The **Gradient** screen's gradient card | Linear ramp blue → teal, **top corners rounded, bottom square** (per-corner, not uniform), 1px inside border |
| The curve-graph **Icon** (Home/Ease) | **One** editable shape layer, not 16 separate vectors |
| Buttons | Rounded-rect background + centered label, text **not** shifted |
| Layout "Container" wrappers | Gone (hoisted away), positions unchanged |

These are the exact cases the CI suite proves the *logic* produces; this table is
how you confirm the *render* matches on your machine.

## Reporting a mismatch (fastest path to a fix)

For anything that looks wrong, send:

- the **file** (or the specific node id),
- the **1:1 self-check line** and the **fidelity report** from the panel,
- one sentence on what's wrong (*"the gradient card's bottom corners are rounded
  but should be square"*, *"this label is 8px too low"*).

That maps directly onto a unit test + a targeted fix. Placement/geometry issues
usually trace to `host/commands/import/{transform,shape,geometry}.jsx`; missing
elements to the self-check reconciliation; look/rebuild issues to `paint.jsx` /
`effect.jsx` / the exporter. Each has real-code tests you can extend to lock the
fix in.
