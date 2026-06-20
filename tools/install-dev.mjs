#!/usr/bin/env node
/*
 * Install (or remove) Rebound into the per-user CEP extensions folder so After
 * Effects loads it. A directory symlink/junction is used by default so edits to
 * the repo are live; pass --copy to copy files instead.
 *
 *   node tools/install-dev.mjs            # link the repo into the CEP folder
 *   node tools/install-dev.mjs --copy     # copy instead of link
 *   node tools/install-dev.mjs --remove   # uninstall
 *
 * Windows: %APPDATA%\Adobe\CEP\extensions\com.meszmate.rebound
 * macOS:   ~/Library/Application Support/Adobe/CEP/extensions/com.meszmate.rebound
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const BUNDLE_ID = 'com.meszmate.rebound';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extensionsDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
  }
  throw new Error('CEP extensions are only supported on Windows and macOS.');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (/^(node_modules|\.git|dist|coverage)$/.test(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const target = path.join(extensionsDir(), BUNDLE_ID);
const remove = process.argv.includes('--remove');
const useCopy = process.argv.includes('--copy');

try {
  if (fs.existsSync(target) || isLink(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('Removed existing install at', target);
  }
  if (remove) {
    console.log('Rebound uninstalled.');
    process.exit(0);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (useCopy) {
    copyDir(repoRoot, target);
    console.log('Copied Rebound to', target);
  } else {
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(repoRoot, target, type);
    console.log('Linked', repoRoot, '->', target);
  }
  console.log(
    '\nNext:\n  1. Enable dev mode:  npm run debug:on\n  2. (Re)start After Effects\n' +
      '  3. Window > Extensions > Rebound'
  );
} catch (err) {
  console.error('Install failed:', err.message);
  if (err.code === 'EPERM') {
    console.error('Try running the terminal as Administrator, or use --copy.');
  }
  process.exit(1);
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
