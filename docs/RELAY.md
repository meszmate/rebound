# Relay: positioning, listings, and publishing

Notes for shipping the cross-app "send to After Effects" feature. The flagship is
**Rebound** (the After Effects panel); the companions that send into it are
**Rebound Relay** (Figma today, Illustrator today, more later).

Always say **free**. Never "open source" (the repository is private). Lead with
proof, not claims.

## Positioning

> The free bridge from Figma and Illustrator into After Effects. Your design
> lands as real, editable After Effects layers.

The wedge is one sentence the audience already feels: the paid incumbent needs a
licence and a login, and the old free option is unmaintained. Rebound is the
maintained, free, no-login, no-watermark successor that also goes further:
Illustrator **text** becomes real After Effects text, gradients stay native
gradients, and an honest **fidelity report** shows exactly what transferred.

Differentiators to lead with, each a real pain we fix:

1. Editable text with every parameter copied (including Illustrator text).
2. Native gradients, not flattened images.
3. A fidelity report, so import is transparent instead of silently lossy.
4. An up-front missing-font resolver (After Effects has no global font replace).
5. One-click send or a `.rbir` file, works offline, designs never leave the box.

Use install counts, written reviews, and demo GIFs as social proof. Do not use
star-count style proof (it implies the source is public).

## The demo

The whole pitch is one before/after clip: select a Figma frame, one click, the
exact layers rebuilt in After Effects as editable shapes and live text, then
keyframe one of them. Export it as a short MP4 (landing page, social) and a
looping GIF (Figma cover, README, listing). The carousel shows: text stays
editable, gradients survive, shapes stay parametric, the fidelity report, the
font resolver.

## Figma Community listing

Published from the Figma desktop app (Plugins ▸ Development ▸ Publish). First
review can take up to ~2 weeks, so submit early. Needs a 128x128 icon, a
1920x1080 cover (use the GIF), a name, tagline, description, tags, and a support
contact. The `networkAccess` localhost reasoning in `manifest.json` is part of
review, so keep it accurate.

- **Name:** Rebound Relay
- **Tagline:** Send your design to After Effects as native, editable layers. Free.
- **Tags:** after effects, motion, export, animation, handoff, lottie
- **Description (opening):** Send a Figma frame straight into After Effects as
  real, editable layers. Text stays editable text with every parameter, shapes
  stay parametric, gradients stay native gradients, and you get a report of
  exactly what transferred. Free, no account, nothing leaves your computer. Pairs
  with the free Rebound panel for After Effects.

## After Effects distribution

The panel ships as a signed ZXP (`npm run pack`, needs `cert.p12` from `npm run
cert`). Distribute it free on aescripts.com (the best motion-design channel, it
accepts free tools and handles install trust) and self-host the ZXP. For
development, `npm run debug:on` + `npm run install:dev` loads it unsigned.

## Launch order

Ship the After Effects ZXP plus the `.rbir` file import first (it works
standalone), then submit Figma to the Community, then coordinate a public launch
(a landing page and a Product Hunt post with the video) for when the Figma plugin
clears review, so the one-click path is live on day one.
