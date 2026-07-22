# Installing Rebound

Rebound runs in After Effects **2019 (16.0) or newer** on **Windows** and
**macOS**. There are two ways to install it: from a packaged `.zxp` (for users)
or from source (for development).

---

## 1. Install from a `.zxp` (users)

1. From the [Releases page](https://github.com/meszmate/rebound/releases),
   download the `.zxp` **for your operating system**:
   - macOS: `rebound_x.y.z_macos.zxp`
   - Windows: `rebound_x.y.z_windows.zxp`

   This matters. A ZXP is signed on the OS it is built on, and a ZXP signed on
   the *other* OS installs fine but renders **blank** (a documented Adobe
   signing issue). Grab the one that matches your machine.
2. Install it with any ZXP installer:
   - [ZXPInstaller](https://zxpinstaller.com/) (free, Windows + macOS), or
   - the [Anastasiy Extension Manager](https://install.anastasiy.com/).

   If the installer offers a choice, install **for the current user**, not for
   all users. The all-users location needs admin rights and a partial write
   there leaves the panel unable to find its files.
3. Quit and reopen After Effects (quit the whole app, not just the panel).
4. Open it from **Window ▸ Extensions ▸ Rebound**.

If the panel is blank or does not appear, see [Troubleshooting](#troubleshooting).

### If your installer does nothing

A `.zxp` is a signed zip, and extracting it into the extensions folder is a
valid install on its own, no installer required. This always works when
ZXPInstaller or Anastasiy silently fail (common on brand-new macOS builds).

**macOS**

```bash
D=~/Library/Application\ Support/Adobe/CEP/extensions/com.meszmate.rebound
rm -rf "$D" && mkdir -p "$D"
unzip -o ~/Downloads/rebound_x.y.z_macos.zxp -d "$D"
```

**Windows** (PowerShell):

```powershell
$D = "$env:APPDATA\Adobe\CEP\extensions\com.meszmate.rebound"
Remove-Item -Recurse -Force $D -ErrorAction SilentlyContinue
Expand-Archive "$HOME\Downloads\rebound_x.y.z_windows.zxp" -DestinationPath $D
```

Then quit and reopen After Effects. (The signature travels inside the zip, so
the manually placed folder still verifies.)

---

## 2. Install from source (developers)

Requires **Node.js 20+**.

```bash
git clone https://github.com/meszmate/rebound
cd rebound
npm install
```

### a. Enable CEP developer mode

After Effects refuses to load unsigned extensions unless *PlayerDebugMode* is
enabled. Rebound ships a helper that sets it for every relevant CEP version:

```bash
npm run debug:on     # enable
npm run debug:off    # disable later
```

<details>
<summary>What this changes (manual equivalent)</summary>

**Windows**, sets a registry string value for each CSXS version:

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11  PlayerDebugMode = "1"
HKEY_CURRENT_USER\Software\Adobe\CSXS.12  PlayerDebugMode = "1"
```

**macOS**, writes a preference for each CSXS version and flushes the cache:

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
killall cfprefsd
```

Use the CSXS version that matches your AE build (AE 2022–2024 → CSXS.11,
AE 2025 → CSXS.12). The helper sets 9–12 to be safe.
</details>

### b. Link the extension into the CEP folder

```bash
npm run install:dev          # symlink/junction the repo (live edits)
npm run install:dev -- --copy # or copy files instead
npm run uninstall:dev        # remove
```

This places (or links) the bundle at:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\Adobe\CEP\extensions\com.meszmate.rebound` |
| macOS | `~/Library/Application Support/Adobe/CEP/extensions/com.meszmate.rebound` |

> On Windows the link is a directory **junction**, which doesn't need
> Administrator rights. If linking fails, run the terminal as Administrator or
> use `--copy`.

### c. Launch

Restart After Effects and open **Window ▸ Extensions ▸ Rebound**.

---

## 3. Building a `.zxp` yourself

Packaging needs Adobe's **ZXPSignCmd** (not redistributable here, download it
from [Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources)).
Put it on your PATH or set `REBOUND_ZXPSIGN` to its full path.

```bash
npm run cert     # one-time: create a self-signed cert.p12
npm run pack     # produces dist/rebound_x.y.z.zxp (timestamped signature)
```

---

## Troubleshooting

**Installed from a release and the panel is blank or missing?** Work down this
list; one of these is almost always it:

| Symptom | Fix |
| --- | --- |
| Panel is blank / black (installed the ZXP) | You likely have the wrong OS's file. A ZXP signed on the other platform loads blank. Download the `_macos` build on macOS or the `_windows` build on Windows, reinstall, and fully restart AE. |
| Blank on macOS even with the right file | Gatekeeper quarantined it. Clear the flag: `xattr -cr ~/Library/Application\ Support/Adobe/CEP/extensions/com.meszmate.rebound`, then restart AE. |
| Installer runs but no folder appears | ZXPInstaller silently failed (common on very new macOS). Try the [Anastasiy Extension Manager](https://install.anastasiy.com/), or use the manual install above; both are reliable. |
| `ERR_FILE_NOT_FOUND` for `client/index.html` | A half-written install (usually an all-users install without admin rights). Delete the folder at that path and reinstall for the current user. |
| Panel missing from the Extensions menu | Reinstall for the current user, fully quit and reopen AE. If you built from source instead, confirm PlayerDebugMode is on for your AE's CSXS version. |
| "Rebound" loads but does nothing | The ExtendScript host failed to load; use the **⟳** (reload host) button in the header, or check the debugger console. |

Extension locations (delete a stale/broken install here before reinstalling):

- macOS user: `~/Library/Application Support/Adobe/CEP/extensions/com.meszmate.rebound`
- macOS all users: `/Library/Application Support/Adobe/CEP/extensions/com.meszmate.rebound`
- Windows user: `%APPDATA%\Adobe\CEP\extensions\com.meszmate.rebound`

**Building from source (developer symptoms):**

| Symptom | Fix |
| --- | --- |
| Link step fails with `EPERM` (Windows) | Run the terminal as Administrator, or `npm run install:dev -- --copy`. |
| Changes don't show up | If you used `--copy`, re-run install; if you linked, just reload the panel (right-click ▸ Reload, or the ⟳ button). |
| Unsigned dev install rejected | Recent CEP verifies signatures even in debug mode. Use `npm run deploy` to install a signed copy instead of the dev symlink. |

### Remote debugging

With PlayerDebugMode enabled and the panel open in AE, open a Chromium-based
browser at:

- `http://localhost:8718`, main Rebound panel
- `http://localhost:8719`, settings panel

These ports come from the `.debug` file. You get full DevTools (console,
elements, network) against the live panel.
