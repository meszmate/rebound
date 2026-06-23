#!/usr/bin/env node
/*
 * Build a *signed* ZXP and install it into the local CEP extensions folder as a
 * real (signed) directory, replacing any dev junction.
 *
 *   node tools/deploy-signed.mjs
 *
 * Why this exists: recent After Effects / CEP 12 builds verify an extension's
 * signature even when PlayerDebugMode is on, so the unsigned `install:dev`
 * junction is rejected ("Signature verification failed" in CEP12-AEFT.log) and
 * the panel never opens. A self-signed install passes that check. Re-run this
 * after editing host/client code to redeploy (the install is a copy, not live).
 *
 * Signer: set REBOUND_ZXPSIGN to Adobe's ZXPSignCmd, or have it on PATH; on this
 * machine it is also auto-found under %LOCALAPPDATA%\motion_studio. The cert
 * (cert.p12, self-signed, 10 years) is created automatically if missing.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const BUNDLE_ID = 'com.meszmate.rebound';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const cert = path.join(repoRoot, 'cert.p12');
const password = process.env.REBOUND_CERT_PASSWORD || 'rebound-dev';
const zxp = path.join(repoRoot, 'dist', `rebound_${pkg.version}.zxp`);

function findSigner() {
  if (process.env.REBOUND_ZXPSIGN && fs.existsSync(process.env.REBOUND_ZXPSIGN)) {
    return process.env.REBOUND_ZXPSIGN;
  }
  // Convenience: ZXPSignCmd ships inside some installed CEP panels.
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const vendorRoot = path.join(process.env.LOCALAPPDATA, 'motion_studio');
    if (fs.existsSync(vendorRoot)) {
      for (const app of fs.readdirSync(vendorRoot)) {
        const cand = path.join(vendorRoot, app, 'resources', 'vendor', 'ZXPSignCmd_64.exe');
        if (fs.existsSync(cand)) return cand;
      }
    }
  }
  return process.platform === 'win32' ? 'ZXPSignCmd.exe' : 'ZXPSignCmd';
}

function extensionsDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
  }
  throw new Error('CEP extensions are only supported on Windows and macOS.');
}

const signer = findSigner();

// 1. Ensure a signing certificate exists.
if (!fs.existsSync(cert)) {
  console.log('Creating self-signed certificate (10 years)...');
  execFileSync(
    signer,
    ['-selfSignedCert', 'US', 'NA', 'Rebound', 'Rebound', password, cert, '-validityDays', '3650'],
    { stdio: 'inherit' }
  );
}

// 2. Stage + sign into a ZXP (reuse the packager; no TSA for offline installs).
console.log('Packaging signed ZXP...');
execFileSync('node', [path.join(repoRoot, 'tools', 'pack.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, REBOUND_ZXPSIGN: signer, REBOUND_TSA: 'none' },
});

// 3. Replace whatever is installed (junction or directory) with the signed files.
const target = path.join(extensionsDir(), BUNDLE_ID);
removeInstall(target);
fs.mkdirSync(target, { recursive: true });
extractZip(zxp, target);

// 4. Confirm the installed directory verifies.
execFileSync(signer, ['-verify', target, '-skipOnlineRevocationChecks'], { stdio: 'inherit' });

console.log('\nInstalled signed Rebound to', target);
console.log('Restart After Effects, then Window > Extensions > Rebound.');

/**
 * Remove an existing install. A dev junction must be unlinked, NOT recursed
 * into, or we would delete the repo it points at.
 */
function removeInstall(dir) {
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return; // nothing there
  }
  if (st.isSymbolicLink()) {
    // Directory symlink / junction: drop the link only.
    if (process.platform === 'win32') {
      execFileSync('cmd', ['/c', 'rmdir', dir], { stdio: 'ignore' });
    } else {
      fs.unlinkSync(dir);
    }
    console.log('Removed existing junction (link only).');
  } else {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('Removed existing install directory.');
  }
}

function extractZip(zip, dest) {
  if (process.platform === 'win32') {
    const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
      `[System.IO.Compression.ZipFile]::ExtractToDirectory('${zip}', '${dest}')`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', zip, '-d', dest], { stdio: 'inherit' });
  }
}
