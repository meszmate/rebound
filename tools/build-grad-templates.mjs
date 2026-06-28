/*
 * Regenerate the native-gradient .ffx preset templates.
 *
 * After Effects will not let a script set shape gradient stop colours
 * ('ADBE Vector Grad Colors' is NO_VALUE). The script-reachable workaround is to
 * substitute the stops into a gradient animation preset's embedded XML and
 * layer.applyPreset() it. We ship one preset container per stop count (2..8).
 *
 * Rather than hand-author RIFX bytes, we derive the proven containers from AEUX
 * (Google, Apache-2.0), which embeds template_grad2..template_grad8 as escaped
 * binary string literals. This script downloads that source, extracts each
 * literal byte-for-byte, and writes host/assets/grad/grad{N}.ffx.tmpl.
 *
 * The per-stop <float> slots stay as plain-text token lines
 * (points[i].rampPoint / .midPoint / .opacity / .color[j]); host/lib/grad.jsx
 * replaces them with real values at import time. See host/assets/grad/NOTICE.md.
 *
 * Usage:  node tools/build-grad-templates.mjs
 */
/* global fetch */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AEUX_HOST_URL =
  'https://raw.githubusercontent.com/google/aeux/main/Ae/AEUX/src/host/AEFT/host.jsx';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'host', 'assets', 'grad');

async function main() {
  process.stdout.write(`Fetching AEUX host script…\n  ${AEUX_HOST_URL}\n`);
  const res = await fetch(AEUX_HOST_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching AEUX host.jsx`);
  const src = await res.text();

  fs.mkdirSync(outDir, { recursive: true });

  // Each template is a single-line JS string literal: template_gradN: "....."
  const re = /template_grad(\d+)\s*:\s*("(?:[^"\\]|\\.)*")/g;
  let m;
  let count = 0;
  while ((m = re.exec(src)) !== null) {
    const n = m[1];
    // The captured group is a JS double-quoted string literal; eval resolves its
    // \xNN / \uXXXX / \n escapes to the raw characters.
    const decoded = eval(m[2]);
    // latin1 == ExtendScript encoding='BINARY' (low byte of each char code).
    const buf = Buffer.from(decoded, 'latin1');
    const out = path.join(outDir, `grad${n}.ffx.tmpl`);
    fs.writeFileSync(out, buf);
    const tokenLines = decoded.split('\n').filter((l) => /^\s*points\[/.test(l)).length;
    process.stdout.write(`  grad${n}.ffx.tmpl  ${buf.length} bytes, ${tokenLines} float slots\n`);
    count++;
  }
  if (count < 7) throw new Error(`Expected templates 2..8, extracted only ${count}`);
  process.stdout.write(`Done: ${count} templates -> ${path.relative(repoRoot, outDir)}\n`);
}

main().catch((e) => {
  process.stderr.write(`build-grad-templates failed: ${e.message}\n`);
  process.exit(1);
});
