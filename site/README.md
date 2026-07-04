# Rebound: marketing site

The public site for Rebound, the easing / springs / motion-design panel for
After Effects. A single static landing page built with **Astro 7** and
**Tailwind CSS v4**, no client framework: interactions are small vanilla
scripts bundled per component.

## Design language

- **Mono brand.** The full "bounce" monogram (see the Branding Figma file) in
  ink on a whitish, hairline-divided layout. No gradient chip, no boxed cards
  where a divider will do.
- **Blue = live.** The brand accent is reserved for interactive/live elements
  (curve handles, the trace dot, eyebrow labels); everything static stays ink.
- **Real product, faithfully.** The hero panel and the Figma-plugin mockups
  mirror the actual `--rb-*` panel tokens (`#1e1f23` / `#2f3034` / `#17181b` /
  accent `#5496fa`) and the real Relay UI states.

## Notable pieces

- `src/components/Playground.astro`: a live cubic-bezier editor (drag,
  keyboard-nudge, presets, copy CSS) plus a damped-harmonic-oscillator spring
  mode. Same math family as the panel.
- `src/components/PanelMock.astro`: CSS recreation of the panel's Home board.
- `src/components/Boards.astro`: scripted edit-mode demo (a cursor drags a
  tile, resizes the ease widget, switches tile size; the board reflows live).
- `src/components/ImportSection.astro`: Figma / Illustrator / Photoshop
  switcher with per-app source cards and fidelity reports.
- `src/layouts/Base.astro`: meta/OG + the scroll-reveal observer.
- `public/og.png`: exported from the Branding Figma file's social banner.

All motion honors `prefers-reduced-motion`.

## Commands

| Command           | Action                                    |
| :---------------- | :---------------------------------------- |
| `npm install`     | Install dependencies                      |
| `npm run dev`     | Dev server at `localhost:4321`            |
| `npm run build`   | Production build to `./dist/`             |
| `npm run preview` | Preview the production build              |
