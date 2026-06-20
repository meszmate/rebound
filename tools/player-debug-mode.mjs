#!/usr/bin/env node
/*
 * Toggle Adobe CEP PlayerDebugMode so unsigned/dev extensions load.
 *
 *   node tools/player-debug-mode.mjs --on
 *   node tools/player-debug-mode.mjs --off
 *
 * Windows: sets HKCU\Software\Adobe\CSXS.<n>\PlayerDebugMode = "1".
 * macOS:   defaults write com.adobe.CSXS.<n> PlayerDebugMode 1 (+ flush cfprefsd).
 *
 * It writes every CSXS version a current After Effects build might use, so the
 * dev panel loads regardless of which AE you launch.
 */
import { execFileSync } from 'node:child_process';

const CSXS_VERSIONS = [9, 10, 11, 12];
const enable = !process.argv.includes('--off');
const platform = process.platform;

function win(version) {
  const key = `HKCU\\Software\\Adobe\\CSXS.${version}`;
  if (enable) {
    execFileSync('reg', ['add', key, '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f'], {
      stdio: 'ignore',
    });
  } else {
    try {
      execFileSync('reg', ['delete', key, '/v', 'PlayerDebugMode', '/f'], { stdio: 'ignore' });
    } catch {
      /* value may not exist */
    }
  }
}

function mac(version) {
  const domain = `com.adobe.CSXS.${version}`;
  if (enable) {
    execFileSync('defaults', ['write', domain, 'PlayerDebugMode', '1']);
  } else {
    try {
      execFileSync('defaults', ['delete', domain, 'PlayerDebugMode']);
    } catch {
      /* key may not exist */
    }
  }
}

try {
  for (const v of CSXS_VERSIONS) {
    if (platform === 'win32') win(v);
    else if (platform === 'darwin') mac(v);
    else {
      console.error('PlayerDebugMode is only configurable on Windows and macOS.');
      process.exit(1);
    }
  }
  if (platform === 'darwin') {
    try {
      execFileSync('killall', ['cfprefsd']);
    } catch {
      /* fine if not running */
    }
  }
  console.log(
    `PlayerDebugMode ${enable ? 'ENABLED' : 'disabled'} for CSXS ${CSXS_VERSIONS.join(', ')}.` +
      (enable ? '\nRestart After Effects for the change to take effect.' : '')
  );
} catch (err) {
  console.error('Failed to update PlayerDebugMode:', err.message);
  process.exit(1);
}
