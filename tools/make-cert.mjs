#!/usr/bin/env node
/*
 * Create a self-signed certificate for signing the ZXP, using Adobe's
 * ZXPSignCmd. ZXPSignCmd is not bundled (Adobe's redistribution terms) — point
 * the REBOUND_ZXPSIGN env var at it, or place it on PATH.
 *
 *   ZXPSignCmd download: https://github.com/Adobe-CEP/CEP-Resources
 *   node tools/make-cert.mjs
 *
 * Produces cert.p12 in the repo root (gitignored). The dev password is
 * "rebound-dev" — fine for local signing; use a real cert for distribution.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(repoRoot, 'cert.p12');
const password = process.env.REBOUND_CERT_PASSWORD || 'rebound-dev';

function findSigner() {
  if (process.env.REBOUND_ZXPSIGN && fs.existsSync(process.env.REBOUND_ZXPSIGN)) {
    return process.env.REBOUND_ZXPSIGN;
  }
  return process.platform === 'win32' ? 'ZXPSignCmd.exe' : 'ZXPSignCmd';
}

const signer = findSigner();
try {
  execFileSync(
    signer,
    ['-selfSignedCert', 'US', 'NA', 'Rebound', 'Rebound', password, out],
    { stdio: 'inherit' }
  );
  console.log('\nCreated', out, '(password: ' + password + ')');
} catch (err) {
  console.error('Could not run ZXPSignCmd:', err.message);
  console.error('Set REBOUND_ZXPSIGN to its path, or add it to PATH.');
  console.error('Download: https://github.com/Adobe-CEP/CEP-Resources');
  process.exit(1);
}
