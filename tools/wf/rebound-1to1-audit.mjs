export const meta = {
  name: 'rebound-1to1-audit',
  description: 'Audit every Rebound exporter + AE host for 1:1 fidelity gaps and research native-plugin feasibility',
  phases: [
    { title: 'Audit+Research', detail: 'read each exporter + host; research native plugin + competitor techniques' },
    { title: 'Verify', detail: 'adversarially re-check load-bearing research claims' },
    { title: 'Synthesize', detail: 'native-plugin verdict + ranked per-tool 1:1 roadmap' },
  ],
}

const CONTEXT = [
  'Rebound is a FREE tool that imports designs from Figma / Illustrator / Photoshop into Adobe After Effects as native, editable AE layers. Architecture:',
  '- Exporters emit a shared "Rebound IR" JSON document:',
  '  - Figma plugin (JS, Figma Plugin API): plugins/figma/src/ir-build.js (+ main.js, ui.js, build.mjs concatenates into dist/main.js)',
  '  - Illustrator (ExtendScript): plugins/illustrator/export-ir.jsx',
  '  - Photoshop (ExtendScript): plugins/photoshop/export-ir.jsx',
  '- Shared IR contract: shared/ir/schema.json, shared/ir/ir-version.json, shared/lib/{bezier,effects,grad,normalize,validate}.js, docs/IR.md',
  '- AE host importer (CEP panel, ExtendScript) consumes IR and builds AE layers:',
  '  host/commands/import/{build,shape,paint,geometry,mask,text,fonts,effect,layerstyle,image,transform}.jsx and host/lib/{core,grad,ir,json,rig,util}.jsx',
  '- IR normalization: colors {r,g,b,a} 0..1; lengths px; angles deg clockwise; origin top-left Y-down (Illustrator flips Y); path tangents relative to vertex; images base64 in document.assets keyed by content hash.',
  '',
  'KNOWN HARD LIMIT (verified in prior work, but re-verify): After Effects ExtendScript CANNOT set shape-layer gradient stop colours because property "ADBE Vector Grad Colors" is PropertyValueType.NO_VALUE; same restriction for layer-style Gradient Overlay. So a scripted multi-stop gradient imports as AE-default black to white. Current repo workarounds: 2-stop becomes editable "ADBE Ramp" (Gradient Ramp) effect; 3+ stop Figma gradients are rasterized to a pixel-exact IMAGE on export. See host/commands/import/paint.jsx gradientEffect() and host/lib/grad.jsx.',
  '',
  'MARKETING PROMISE (docs/RELAY.md): "Native gradients, not flattened images." The current rasterize approach CONTRADICTS this. A TRUE 1:1 editable native gradient is the goal.',
  '',
  'HEADLINE QUESTION the user asked: would a NATIVE After Effects plugin (AEGP / C++ SDK, like Overlord/AEUX) let us write true editable gradients and other things scripts cannot, and is it worth building? They also want every exporter+host made "way better 1:1".',
].join('\n');

const AUDIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'summary', 'gaps'],
  properties: {
    area: { type: 'string' },
    summary: { type: 'string', description: 'what this surface captures well today, in 2-3 sentences' },
    gaps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'whatIsLost', 'whereFileLine', 'severity', 'currentBehavior', 'idealBehavior', 'fixApproach', 'effort', 'requiresNative'],
        properties: {
          title: { type: 'string' },
          whatIsLost: { type: 'string' },
          whereFileLine: { type: 'string', description: 'file:line references' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          currentBehavior: { type: 'string' },
          idealBehavior: { type: 'string' },
          fixApproach: { type: 'string', description: 'concrete approach to close the gap' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          requiresNative: { type: 'boolean', description: 'true if only a native C++ plugin can fully fix it' },
        },
      },
    },
  },
};

const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['topic', 'verdict', 'findings'],
  properties: {
    topic: { type: 'string' },
    verdict: { type: 'string', description: 'bottom-line conclusion for this research topic' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['claim', 'detail', 'confidence', 'actionable', 'implication', 'sources'],
        properties: {
          claim: { type: 'string' },
          detail: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          actionable: { type: 'boolean', description: 'true if this enables a concrete change to Rebound' },
          implication: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['claim', 'holdsUp', 'correctedClaim', 'evidence', 'sources'],
  properties: {
    claim: { type: 'string' },
    holdsUp: { type: 'boolean' },
    correctedClaim: { type: 'string', description: 'the accurate version if the original was wrong or imprecise' },
    evidence: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
  },
};

const NATIVE_VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['feasible', 'summary', 'options', 'recommendedPath', 'bottomLine'],
  properties: {
    feasible: { type: 'boolean' },
    summary: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'description', 'unlocks', 'cost', 'maintenance', 'distribution', 'recommendation'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          unlocks: { type: 'array', items: { type: 'string' } },
          cost: { type: 'string' },
          maintenance: { type: 'string' },
          distribution: { type: 'string' },
          recommendation: { type: 'string', enum: ['strong-yes', 'yes', 'maybe', 'no'] },
        },
      },
    },
    recommendedPath: { type: 'string' },
    bottomLine: { type: 'string' },
  },
};

const ROADMAP_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['quickWins', 'bigBets', 'items'],
  properties: {
    quickWins: { type: 'array', items: { type: 'string' }, description: 'high-impact low-effort, no native needed' },
    bigBets: { type: 'array', items: { type: 'string' } },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['tool', 'title', 'impact', 'effort', 'requiresNative', 'approach', 'files'],
        properties: {
          tool: { type: 'string', enum: ['figma', 'illustrator', 'photoshop', 'host', 'ir', 'native', 'cross'] },
          title: { type: 'string' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          requiresNative: { type: 'boolean' },
          approach: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

// ---- Phase 1: audit (codebase) + research (web), concurrently ----
phase('Audit+Research')

const auditTargets = [
  {
    label: 'audit:figma',
    area: 'Figma exporter',
    files: 'plugins/figma/src/ir-build.js (primary), plugins/figma/src/main.js, plugins/figma/manifest.json. Cross-reference shared/ir/schema.json for what the IR can carry.',
    focus: 'What Figma node properties become IR vs get dropped/approximated: gradients (all 4 types), strokes (dash, cap, join, multiple strokes, stroke align inside/outside/center), effects (blur, shadow, inner shadow, background blur), blend modes, opacity, images and image scale modes (fill/fit/tile/crop), text (variable fonts, OpenType features, mixed runs, text-on-path, list/indent), auto-layout, masks/clip, boolean ops, vector networks, component instances/variants, constraints, corner smoothing/squircles, rotation/skew/flip in transform, fill-vs-stroke-vs-layer opacity, nested frames, exportSettings, plus the rasterize-on-export decisions (hasUnreproducibleFill).',
  },
  {
    label: 'audit:illustrator',
    area: 'Illustrator exporter',
    files: 'plugins/illustrator/export-ir.jsx (primary), plugins/illustrator/README.md. Cross-reference shared/ir/schema.json.',
    focus: 'Y-flip correctness; CMYK/Spot/Lab/Gray to sRGB; gradients (linear/radial, gradient mesh, freeform), pattern fills, multiple appearances/effects (drop shadow, Gaussian blur as live effect), strokes (dashed, arrowheads, width profiles, brushes), text (area vs point, threaded text, text on path, OpenType, tracking units), symbols, graphs, clipping masks, opacity masks, blend modes, compound paths/even-odd, raster/linked images, live effects vs expanded, artboards.',
  },
  {
    label: 'audit:photoshop',
    area: 'Photoshop exporter',
    files: 'plugins/photoshop/export-ir.jsx (primary), plugins/photoshop/README.md. Cross-reference shared/ir/schema.json.',
    focus: 'Layer types: pixel layers, shape/vector layers, type layers, smart objects, adjustment layers, fill layers, groups. Layer styles (drop shadow, inner shadow, stroke, gradient overlay, color overlay, pattern overlay, bevel, glow, satin). Layer masks and vector masks, clipping masks, blend modes, fill vs opacity, blend-if. Text fidelity. Smart object handling. Resolution/DPI scaling to px.',
  },
  {
    label: 'audit:host-vector',
    area: 'AE host importer (vector/paint/gradient path)',
    files: 'host/commands/import/{build,shape,paint,geometry,mask}.jsx and host/lib/grad.jsx and shared/lib/grad.js. Read them fully.',
    focus: 'How fills/strokes/gradients/masks/geometry are rebuilt. The gradient NO_VALUE limitation and the Ramp / 4ColorGradient / rasterize workarounds — assess fidelity loss precisely. Stroke dashes/caps/joins, multiple fills/strokes ordering, even-odd vs nonzero fill rule, boolean merge correctness, per-corner radii, rounded-rect bezier, mask modes/feather/expansion, frame background reconstruction. Where is geometry lossy?',
  },
  {
    label: 'audit:host-text-fx',
    area: 'AE host importer (text/fonts/effects/layerstyle/image/transform)',
    files: 'host/commands/import/{text,fonts,effect,layerstyle,image,transform}.jsx. Read them fully.',
    focus: 'Text: per-character/per-run styling fidelity, font matching/missing-font resolver, tracking/leading/baseline/case/faux styles, paragraph vs point text, box text, justification, text-on-path. Effects: which IR effects map to which AE effects and how lossy (blur, shadow). Layer styles: which become AE layer styles vs effects, gradient-overlay limitation. Image: placement, scaling, color management. Transform: rotation/skew/anchor/parenting, opacity, blend mode mapping.',
  },
  {
    label: 'audit:ir-contract',
    area: 'Shared IR contract and validation',
    files: 'shared/ir/schema.json, shared/ir/ir-version.json, docs/IR.md, shared/lib/{validate,normalize,effects,grad,bezier}.js. Read them.',
    focus: 'What can the IR even REPRESENT? Identify expressiveness ceilings that silently cap 1:1 BEFORE the importer runs: missing fields for blend modes, effect parameters, gradient stop midpoints/easing, stroke dash arrays, text features, image scale modes, masks, constraints, 3D, animation. Is there a fidelity-report mechanism and is it honest? What schema additions would unlock the biggest 1:1 wins?',
  },
];

const researchTasks = [
  {
    label: 'research:native-feasibility',
    topic: 'Native AE plugin (AEGP/C++ SDK) feasibility for true 1:1',
    prompt: [
      'Use web search (multiple queries; follow into Adobe AE SDK docs, the AEGP suites reference, and developer community threads). Determine AUTHORITATIVELY:',
      '(1) Does the After Effects AEGP / C++ SDK let a plugin programmatically CREATE or MODIFY shape-layer gradient fills with arbitrary multi-stop colours and positions — the exact thing ExtendScript blocks because "ADBE Vector Grad Colors" is PropertyValueType.NO_VALUE? Look at the Dynamic Stream / Effect / Stream suites and how the shape "ADBE Vector Grad Colors" arbitrary-data stream can be written natively. Cite specific suites/functions if possible.',
      '(2) What ELSE can native plugins do that scripts cannot relevant to design import: layer styles, true gradients on strokes, reading/writing arbitrary-data (custom) properties, importing footage, faster bulk builds?',
      '(3) HYBRID viability: can a small native helper coexist with the existing CEP/ExtendScript panel and be invoked by it? Options: registering an AEGP command callable from a script via app.executeCommand(menuID); file-based IPC where the script writes a job file and an idle-hook plugin applies gradients; a native importer (AEIO) for a custom file type. Which is realistic?',
      '(4) COST: language/toolchain (Xcode + Visual Studio), per-OS builds (macOS universal arm64+x86_64, Windows x64), code signing + Apple notarization, AE version compatibility, packaging (.plugin/.aex, AE Plugin Manager), and ongoing maintenance burden. Roughly how big a project is a minimal gradient-writing helper vs a full native importer?',
      'Give a clear verdict on whether a native plugin (full or thin-helper hybrid) is worth it for Rebound. Cite real sources.',
    ].join('\n'),
  },
  {
    label: 'research:competitors',
    topic: 'How competitors achieve 1:1 design-to-AE',
    prompt: [
      'Use web search to investigate how each of these moves designs into After Effects, where each is native vs scripted, how each handles gradients/text/effects 1:1, and what each punts on:',
      '- Overlord (Battle Axe) — Illustrator<->AE. Native plugin? How does it transfer gradients editable?',
      '- AEUX (formerly Sketch2AE / "Send to After Effects") — Sketch/Figma to AE, with an AE-side panel. Gradients, text, effects? Any native part?',
      '- ai2ae and other Illustrator-to-AE scripts.',
      '- Figma-to-AE / Figma-to-Lottie paths (LottieFiles, Aninix, Phase) and how Lottie/Bodymovin represents gradients as native data, and which AE plugin renders Lottie.',
      '- FlatPack / Explode Shape Layers and related shape utilities.',
      'For each: native-or-script, gradient strategy, text strategy, biggest fidelity wins, biggest punts. Cite sources. Conclude with techniques Rebound could adopt.',
    ].join('\n'),
  },
  {
    label: 'research:script-workarounds',
    topic: 'Pure-scripting workarounds to push the no-native path further',
    prompt: [
      'Use web search + reasoning. Goal: close 1:1 gaps WITHOUT a native plugin, in ExtendScript/CEP. For each item rate whether it ACTUALLY works in current AE (2023-2025) with confidence + sources:',
      '(1) Setting shape gradient stops despite NO_VALUE: known tricks — copy a gradient via clipboard and paste; apply a saved Animation Preset (.ffx) carrying the gradient then re-point; build the gradient in a template .aep and import/duplicate it; derive the exact "ADBE Vector Grad Colors" arbitrary-data binary/base64 format and setValue it; paste a gradient from a Photoshop/Illustrator layer.',
      '(2) Gradient Ramp (ADBE Ramp, 2 colour) and 4-Color Gradient (ADBE 4ColorGradient) limits; whether stacking/blending effects or an expression-driven gradient can approximate N-stop gradients better.',
      '(3) Whether AE\'s own "Convert to Editable Gradient" or Illustrator paste-into-AE preserves gradients, and whether that path is scriptable.',
      '(4) Other gap-closers scripts CAN do well that Rebound may be underusing: real masks, track mattes for clipping, fonts, blend modes, motion-blur, guide layers, expressions for live effects.',
      'Be honest about myth vs real. Cite sources and flag confidence per item.',
    ].join('\n'),
  },
];

const phase1 = await parallel([
  ...auditTargets.map(t => () => agent(
    CONTEXT + '\n\nYou are auditing ONE surface of Rebound for places where 1:1 fidelity from the source design to After Effects is LOST or APPROXIMATED.\n\nSURFACE: ' + t.area + '\nREAD THESE FILES IN FULL: ' + t.files + '\nFOCUS especially on: ' + t.focus + '\n\nFor every gap, give: title, what is lost, file:line, severity (blocker=visibly wrong/missing, major=approximated, minor=edge case), current behavior, ideal 1:1 behavior, concrete fix approach, effort (S under 1 day / M / L), and whether it FUNDAMENTALLY requires a native C++ plugin (true) or can be fixed in script/exporter (false). Be exhaustive and specific — read the actual code, do not guess. Return raw structured data.',
    { label: t.label, phase: 'Audit+Research', schema: AUDIT_SCHEMA, agentType: 'Explore' }
  )),
  ...researchTasks.map(t => () => agent(
    CONTEXT + '\n\nResearch topic: ' + t.topic + '\n\n' + t.prompt + '\n\nReturn raw structured findings. Every actionable claim must cite at least one source URL.',
    { label: t.label, phase: 'Audit+Research', schema: RESEARCH_SCHEMA }
  )),
]);

const audits = phase1.slice(0, auditTargets.length).filter(Boolean);
const research = phase1.slice(auditTargets.length).filter(Boolean);

// ---- Phase 2: adversarially verify the load-bearing research claims ----
phase('Verify')

const candidateClaims = [];
for (const r of research) {
  for (const f of (r.findings || [])) {
    if (f.actionable || f.confidence === 'high') candidateClaims.push({ topic: r.topic, claim: f.claim, detail: f.detail });
  }
}
const toVerify = candidateClaims.slice(0, 10);
log('Verifying ' + toVerify.length + ' load-bearing research claims');

const verifyResults = await parallel(toVerify.map((c, i) => () => agent(
  CONTEXT + '\n\nYou are a SKEPTIC. Independently fact-check this technical claim about After Effects / its SDK / a competitor tool. Use fresh web searches; do NOT trust the claim framing. Default to holdsUp=false if you cannot find solid corroboration.\n\nCLAIM (topic: ' + c.topic + '): ' + c.claim + '\nClaimed detail: ' + c.detail + '\n\nDecide if it holds up, give the corrected/precise version, your evidence, and source URLs.',
  { label: 'verify:' + (i + 1), phase: 'Verify', schema: VERIFY_SCHEMA }
)));
const verified = verifyResults.filter(Boolean);

// ---- Phase 3: synthesize ----
phase('Synthesize')

const auditJSON = JSON.stringify(audits);
const researchJSON = JSON.stringify(research);
const verifiedJSON = JSON.stringify(verified);

const [nativeVerdict, roadmap] = await parallel([
  () => agent(
    CONTEXT + '\n\nUsing the research and verification below, produce the definitive verdict on whether Rebound should build a NATIVE After Effects plugin to reach true 1:1 (especially editable gradients), and which path: (a) full native importer, (b) thin native gradient/layer-style helper invoked by the existing script (hybrid), (c) stay script-only and live with rasterize/approximate. Weigh what each option unlocks against build/sign/distribute/maintenance cost and the project free, no-login positioning.\n\nRESEARCH:\n' + researchJSON + '\n\nVERIFICATION (trust these corrections over raw research):\n' + verifiedJSON + '\n\nReturn the structured verdict. Be decisive and honest about cost.',
    { label: 'synth:native-verdict', phase: 'Synthesize', schema: NATIVE_VERDICT_SCHEMA, effort: 'high' }
  ),
  () => agent(
    CONTEXT + '\n\nUsing the full audit + research + verification below, produce a RANKED roadmap of concrete improvements that make every Rebound surface way better 1:1. Separate quick wins (high-impact, low-effort, no native needed) from big bets. For each item: which tool, title, impact, effort, whether it requires native, the concrete approach, and the files to touch. Dedupe overlapping gaps across surfaces. Prioritize what a user actually sees (gradients, text, shadows, blend modes, masks).\n\nAUDIT:\n' + auditJSON + '\n\nRESEARCH:\n' + researchJSON + '\n\nVERIFICATION:\n' + verifiedJSON + '\n\nReturn the structured roadmap.',
    { label: 'synth:roadmap', phase: 'Synthesize', schema: ROADMAP_SCHEMA, effort: 'high' }
  ),
]);

return {
  audits,
  research,
  verified,
  nativeVerdict,
  roadmap,
  counts: {
    auditGaps: audits.reduce((n, a) => n + (a.gaps ? a.gaps.length : 0), 0),
    researchFindings: research.reduce((n, r) => n + (r.findings ? r.findings.length : 0), 0),
    verifiedClaims: verified.length,
  },
};
