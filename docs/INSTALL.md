# Installing Rebound

Rebound runs in After Effects **2019 (16.0) or newer** on **Windows** and
**macOS**. There are two ways to install it: from a packaged `.zxp` (for users)
or from source (for development).

---

## 1. Install from a `.zxp` (users)

1. Download `rebound_x.y.z.zxp` from the project's Releases page.
2. Install it with any ZXP installer:
   - [ZXPInstaller](https://zxpinstaller.com/) (free, Windows + macOS), or
   - the [Anastasiy Extension Manager](https://install.anastasiy.com/).
3. Quit and reopen After Effects.
4. Open it from **Window ▸ Extensions ▸ Rebound**.

If the panel doesn't appear, see [Troubleshooting](#troubleshooting).

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

**Windows** — sets a registry string value for each CSXS version:

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11  PlayerDebugMode = "1"
HKEY_CURRENT_USER\Software\Adobe\CSXS.12  PlayerDebugMode = "1"
```

**macOS** — writes a preference for each CSXS version and flushes the cache:

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

Packaging needs Adobe's **ZXPSignCmd** (not redistributable here — download it
from [Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources)).
Put it on your PATH or set `REBOUND_ZXPSIGN` to its full path.

```bash
npm run cert     # one-time: create a self-signed cert.p12
npm run pack     # produces dist/rebound_x.y.z.zxp (timestamped signature)
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Panel missing from the Extensions menu | Confirm PlayerDebugMode is on for your AE's CSXS version, then fully restart AE. |
| Panel is blank / white | Open the remote debugger (below) and check the console for errors. |
| "Rebound" loads but does nothing | The ExtendScript host failed to load — use the **⟳** (reload host) button in the header, or check the debugger console. |
| Link step fails with `EPERM` (Windows) | Run the terminal as Administrator, or `npm run install:dev -- --copy`. |
| Changes don't show up | If you used `--copy`, re-run install; if you linked, just reload the panel (right-click ▸ Reload, or the ⟳ button). |

### Remote debugging

With PlayerDebugMode enabled and the panel open in AE, open a Chromium-based
browser at:

- `http://localhost:8718` — main Rebound panel
- `http://localhost:8719` — settings panel

These ports come from the `.debug` file. You get full DevTools (console,
elements, network) against the live panel.
