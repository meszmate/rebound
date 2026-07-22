#!/usr/bin/env node
/*
 * Package Rebound into a signed ZXP for distribution.
 *
 *   node tools/pack.mjs
 *
 * Stages only the files the extension needs (no node_modules / tests / tooling),
 * then signs with Adobe's ZXPSignCmd and a timestamp authority so the signature
 * outlives the self-signed certificate. Requires cert.p12 (run `npm run cert`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const dist = path.join(repoRoot, 'dist');
const staging = path.join(dist, 'staging');
// A platform suffix (set by the release workflow) keeps the macOS and Windows
// builds side by side, since a ZXP signed on one OS renders blank on the other
// (a documented Adobe signing issue). Local builds stay plain `rebound_x.y.z`.
const suffix = process.env.REBOUND_ZXP_SUFFIX ? `_${process.env.REBOUND_ZXP_SUFFIX}` : '';
const zxp = path.join(dist, `rebound_${pkg.version}${suffix}.zxp`);
const cert = path.join(repoRoot, 'cert.p12');
const password = process.env.REBOUND_CERT_PASSWORD || 'rebound-dev';
// Timestamp authority keeps the signature valid past the certificate's own
// expiry. Default to DigiCert's TSA for releases; set REBOUND_TSA=none (or "")
// to sign without a timestamp, e.g. for offline local installs.
const tsaEnv = process.env.REBOUND_TSA;
const tsa = tsaEnv === undefined ? 'http://timestamp.digicert.com' : tsaEnv;
const useTsa = tsa && tsa !== 'none';

const INCLUDE = ['CSXS', 'client', 'host', 'shared', '.debug', 'LICENSE', 'README.md'];

// macOS cruft (.DS_Store, __MACOSX, AppleDouble ._ files) can break CEP
// signature verification, so it never goes into the package.
const SKIP = new Set(['.DS_Store', '__MACOSX', 'Thumbs.db']);
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('._')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function findSigner() {
  if (process.env.REBOUND_ZXPSIGN && fs.existsSync(process.env.REBOUND_ZXPSIGN)) {
    return process.env.REBOUND_ZXPSIGN;
  }
  return process.platform === 'win32' ? 'ZXPSignCmd.exe' : 'ZXPSignCmd';
}

if (!fs.existsSync(cert)) {
  console.error('Missing cert.p12. Run `npm run cert` first.');
  process.exit(1);
}

// Fresh staging.
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
for (const item of INCLUDE) {
  const src = path.join(repoRoot, item);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(staging, item);
  if (fs.statSync(src).isDirectory()) copyDir(src, dest);
  else fs.copyFileSync(src, dest);
}

fs.rmSync(zxp, { force: true });
const signArgs = ['-sign', staging, zxp, cert, password];
if (useTsa) signArgs.push('-tsa', tsa);
try {
  execFileSync(findSigner(), signArgs, { stdio: 'inherit' });
  fs.rmSync(staging, { recursive: true, force: true });
  console.log('\nPackaged', path.relative(repoRoot, zxp));
} catch (err) {
  console.error('Packaging failed:', err.message);
  console.error('Ensure ZXPSignCmd is available (REBOUND_ZXPSIGN or PATH).');
  process.exit(1);
}
