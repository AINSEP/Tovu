# Tovu Desktop — grounded feature gap audit

- Date: 2026-09-18
- Scope: `apps/desktop` at `restructure/apps-website-phased` (`129f405f`)
- Author: Software Architect agent (skills.md v2.3.0)
- Method: source read only. **The app was not launched** — the owner is using it and three other agents are in this tree. Every runtime claim below is derived from source, from `package.json`/`electron-builder.yml`, or from strings extracted out of the shipped `electron@43.6.0` binary. Claims I could not settle that way are marked **UNVERIFIED** and each names the 2-minute check that would settle it.

---

## 1. Top three recommendations

**1. Stop Cmd+W from quitting the app and killing every running site.** In the default (sites-home) boot mode there is exactly one window. `app.on("window-all-closed")` calls `app.quit()` unconditionally, with no `darwin` guard (`main.ts:1466`). `before-quit` then drains and stops every `tovu serve` child in `openSites` (`main.ts:1457`). And the `app.on("activate")` handler that would reopen a window from the dock is registered **only inside `bootOwnServerMode()`** (`main.ts:1266`) — the sites-home branch returns at `main.ts:1414` before ever reaching it. So on macOS: Cmd+W closes the only window, quits Tovu, and stops all of the user's sites, and clicking the dock icon afterward does nothing because the app is gone. This is the single highest value-per-hour item in the audit and it is the audit's clearest instance of the repo's signature defect — the primitive is written, correct, and registered in the branch nobody uses.

**2. Give the app a right-click context menu.** There is no `context-menu` handler anywhere in `apps/desktop`. No Copy/Paste, no Select All, no spellcheck suggestions, no "Open Link in Browser", no Inspect Element — not in the shell, not in any `<webview>` guest. This is what the approved "spellcheck" item actually needs (see §2.3): the spellchecker is already running, the suggestions menu is what's missing. There is already a correct place to hang it — `app.on("web-contents-created")` at `main.ts:966`, which `registerGuestNavigationPolicy` uses for exactly this "every guest, registered once" reason.

**3. Implement `runner:sites:stop`.** It is the last remaining `runner:sites:*` stub (`runner-ipc-stubs.ts:57`), and `SiteCardMenu` documents its own missing entry because of it (`SiteGrid.tsx:268-270`). Today the only ways to stop a running site are to delete it or to quit the whole app. It is also the cheapest real feature in this audit: `stopSite` is **already exposed on the preload** (`preload.mts:102`), already typed in `runner-api.ts`, and `server.stop()` already exists and is already called by `before-quit` and `handleDelete`. So it needs no preload change (see §6 for why that matters), no contract change, and no renderer plumbing beyond one menu entry.

---

## 2. Corrections to the eight already approved

This is the part worth reading twice. **Three of the eight are already built or nearly so, and one is several times harder than stated.**

### 2.1 Zoom in / out — ALREADY SHIPS. Do not build it.

`sitesHomeMenuTemplate` includes `{ role: "viewMenu" }` (`site-history-menu.ts:101`). Extracted from the shipped Electron 43.6.0 framework binary, that role expands to:

```
label:"View",submenu:[{role:"reload"},{role:"forceReload"},{role:"toggleDevTools"},
{type:"separator"},{role:"resetZoom"},{role:"zoomIn"},{role:"zoomOut"},
{type:"separator"},{role:"togglefullscreen"}]
```

So the default window already has Cmd+`+` / Cmd+`-` / Cmd+`0`, plus Reload, Force Reload, DevTools and Full Screen. Two real follow-ups remain:

- **UNVERIFIED:** whether Cmd+`+` reaches a project tab's `<webview>` guest or only the host shell. The roles are implemented as `webContentsMethod: e => { e.zoomLevel += .5 }`, which Electron dispatches against the *focused* webContents — and a focused guest is a focused webContents — so it plausibly does work. *Check:* open a project tab, click inside the embedded admin, press Cmd+`+`, see whether the site scales or only the Tovu chrome does.
- **Real gap:** the standalone site-admin window's menu (`buildAppMenu`, `main.ts:1029-1051`) is `appMenu / File / editMenu / windowMenu` — **no `viewMenu` at all**, so that mode has no zoom, no reload, no DevTools, no full screen, and no Find either. That mode is not the default, so this is low priority; but if the owner ever uses `TOVU_DESKTOP_URL` attach mode, Cmd+F silently does nothing there.

### 2.2 Open-in-default-browser — ALREADY SHIPS, three times over. Do not build it.

1. Workspace toolbar button per tab: `App.tsx:643-651`, calling `workspace.openInBrowser`.
2. Site card ⋮ menu, shown when the site is running: `SiteGrid.tsx:335`.
3. Automatically, for anything leaving the app's origin: `setWindowOpenHandler` in `createWindow` (`main.ts:454-458`) and `registerGuestNavigationPolicy`'s `will-navigate` + `setWindowOpenHandler` pair for every guest (`main.ts:962-987`).

The IPC behind (1) and (2) is real, not a stub: `runner:sites:open-external` → `handleOpenExternal` → `shell.openExternal` (`project-ipc.ts:761`, `:622`).

### 2.3 Spellcheck — the checker is already ON; rescope this to "add a context menu".

`webPreferences.spellcheck` defaults to `true` in Electron 43 (`node_modules/electron/electron.d.ts:19485-19488`: *"Whether to enable the builtin spellchecker. Default is `true`."*). It is never overridden: not in `createWindow` (`main.ts:424-435`), not in `openSitesHomeWindow` (`main.ts:506-512`), and not by the guest policy, which only assigns `preload`, `nodeIntegration` and `contextIsolation` (`webview-guest-policy.ts:54-61`). On macOS Electron delegates to the OS spellchecker, so no dictionary setup is needed either.

Red squiggles should therefore already appear in every text field, in the shell and in every embedded admin. **UNVERIFIED** — *check:* type "teh mistaek" into any admin text field and look for the underline.

What is genuinely missing is the right-click menu: Electron's default `editMenu` (also extracted from the binary) is Undo/Redo/─/Cut/Copy/Paste/Paste and Match Style/Delete/Select All/─/Substitutions/Speech — **no spellcheck entries**. Suggestions require a `context-menu` handler reading `params.misspelledWord` / `params.dictionarySuggestions` and calling `webContents.replaceMisspelling`. Electron also ships a `{ role: "toggleSpellChecker" }` item ("Check Spelling While Typing") that is not in any default menu, if the owner wants an off switch.

So: same user-visible outcome, different work. Build recommendation #2, not "spellcheck".

### 2.4 Native notification when a long agent run finishes — NOT a desktop-only change. Re-estimate.

The brief implies `new Notification(...)` in main. The desktop main process has no way to know a run finished:

- The only working agent chat is the **per-site assistant, which lives inside the `<webview>` guest** (stated outright at `App.tsx:181-186`). It is a web page served by that site's own `tovu serve`.
- That guest's preload is `src/speech/preload-speech.cts`, which exposes exactly two channels (`tovu:speech:isAvailable`, `tovu:speech:transcribe`). There is no channel on which a guest could tell main anything else.
- The fleet-level chat that *would* have been the desktop-side surface is entirely unimplemented — see §5.1.

So the options are (a) the admin page calls the **Web** `Notification` API itself, which is a change in `apps/admin`, not `apps/desktop`; or (b) add a notification channel to the guest preload and raise an Electron `Notification` in main. Neither is two lines. Note also that `new Notification(` appears **nowhere** in `apps/admin/src`, `apps/website/src` or `packages/`, and `setPermissionRequestHandler` appears nowhere in `apps/desktop` — so Electron's default permission behaviour for `notifications` in this app is **UNVERIFIED**.

**Re-estimate: 2-3 days, and it needs an ownership decision first (admin package or desktop package?).** I would defer it behind recommendations 1-3.

### 2.5 Session / tab restore — cheaper than implied. Confirmed worth doing.

`useProjectTabs` holds exactly `openTabs: readonly string[]` and `activeTab: string | null` (`App.hooks.ts:275-284`). Two facts make this small:

- A tab whose site is **not** running already renders `SiteStartPanel` instead of a guest (`App.tsx:664`, fallback at `:718`). So restore does not have to spawn servers at launch — it can restore the tab strip and let the user press Start.
- It can be pure `localStorage` in the renderer, exactly as `theme.ts:16,41` already does for the theme. **No preload change**, so it avoids the build tax in §6.

**Half a day.** Restoring each tab's `surface` (admin vs site) and scroll position is a second, optional step.

### 2.6 Cmd+K quick open, window geometry, auto-update

- **Cmd+K**: confirmed absent. One caveat: it must be a **menu accelerator**, not a `window` keydown listener, for the same reason Cmd+F was (`find-menu.ts:5-9`) — a keypress made while focus is inside a `<webview>` guest never reaches the host document. Budget a contract file + a menu module + a preload channel, i.e. the full Cmd+F shape.
- **Window size/position memory**: confirmed absent. Both windows are hardcoded `1360 x 900` with no `x`/`y` and no persisted state (`main.ts:421-422`, `:493-494`); the sites-home window adds `minWidth: 480, minHeight: 600`. Main-process only, no preload change. **3-4 hours.**
- **Auto-update**: see §7 — I recommend **not** building this yet.

---

## 3. What exists today (inventory)

**Boot modes (`main.ts` `whenReady` chain, ~`:1300-1425`).** Three: sites-home (the default since 2026-09-06), attach mode (`TOVU_DESKTOP_URL`), own-server mode. Sites-home is the only one that matters for this audit.

**Windows.** `openSitesHomeWindow` (`main.ts:493`) — one window, `sandbox: false` (forced by the native-ESM preload), `webviewTag: true`. `createWindow` (`main.ts:419`) — one window per site in the other two modes, `sandbox: true`, per-site cookie `partition`. Both pin their title against `page-title-updated` so the native Window menu works as a site switcher.

**Menus — two different ones, and they differ a lot.**

| | sites-home (`sitesHomeMenuTemplate`, `site-history-menu.ts:95-107`) | site window (`buildAppMenu`, `main.ts:1029-1051`) |
|---|---|---|
| App menu | yes (darwin) | yes (darwin) |
| File | `role: "fileMenu"` → **only "Close Window"** on darwin | custom: Open Site… (Cmd+O), Open Recent (MRU), Close |
| Edit | `role: "editMenu"` | `role: "editMenu"` |
| View | `role: "viewMenu"` → reload, force reload, DevTools, zoom ×3, full screen | **absent** |
| History | Back Cmd+`[`, Forward Cmd+`]` | absent |
| Find | Find in Page… Cmd+F | **absent** |
| Window | `role: "windowMenu"` | `role: "windowMenu"` |
| Help | `{ role: "help", submenu: [] }` — **empty** | absent |

Note the asymmetry: "Open Site…" and "Open Recent" exist only in the mode that is *not* the default. In the default mode the File menu is one item.

**Guest / webview model.** One `<webview>` per project tab, all kept mounted and hidden with CSS (`App.tsx:498`), `src` swapped rather than `key`-bumped for surface toggles. `will-attach-webview` hard-assigns the guest's `preload`/`nodeIntegration`/`contextIsolation` (`webview-guest-policy.ts`). `web-contents-created` denies every off-origin navigation and window-open inside the guest and hands supervised URLs to the OS browser (`main.ts:960-987`).

**Preload bridge (`src/preload/preload.mts`).** Two frozen globals: `tovuRunner` (37 methods) and `tovuVoice` (2). Guests get a different, much narrower preload (`src/speech/preload-speech.cts`, `tovuVoice` only).

**IPC — 24 invoke channels + 4 push channels.** Real handlers: 9, all in `project-ipc.ts:758-766` (`list`, `create`, `delete`, `open-external`, `start`, `rescan`, `rename`, `add-site`, `preview`) plus 2 find-in-page handlers (`find-in-page-ipc.ts:36,39`) and 2 speech channels. Push senders that exist: `runner:sites:history` (`site-history-menu.ts`), `runner:find:toggle` (`find-menu.ts`), the find-result relay (`main.ts:521`). Throwing stubs: **19** (`runner-ipc-stubs.ts:49-78`).

**Per-site UI that works today.** Workspace toolbar: Back / Forward / Reload / status dot / View admin ↔ View site / current URL / Open in browser / Expand to full window (`App.tsx:581-653`). Card ⋮ menu: Rename…, Start (stopped only), Open in browser (running only) (`SiteGrid.tsx:313-338`), plus a Delete affordance with a confirm overlay. Drag-a-folder onboarding, rescan, previews, create-website onboarding.

**Packaging.** `electron-builder.yml`: `appId: com.tovu.desktop`, mac dmg + dir, hardened runtime entitlements, `dmg.sign: true`, `notarize` deliberately unset so it engages only when Apple credentials are present. **No `publish:` block anywhere**, and `electron-updater` is not a dependency.

**Persistence.** The only renderer persistence in the whole app is the theme preference (`theme.ts:16,41`). Main-process state: the MRU site list, the projects registry, the preview cache, all under `userData`.

---

## 4. Ranked candidate features

Ranked by value per hour given what the code already contains. "Preload?" matters — see §6.

| # | Feature | Does any of it exist today? | Preload? | Cost | Why a user wants it |
|---|---|---|---|---|---|
| 1 | **Cmd+W must not quit the app; dock icon reopens the window** | The `activate` handler exists but is registered only in `bootOwnServerMode` (`main.ts:1266`); `window-all-closed` quits unconditionally (`main.ts:1466`) | no | **1-2 h** | Today, closing the window quits Tovu and stops every running site. Nothing else in the audit costs a user as much for as small a mistake. |
| 2 | **Right-click context menu (incl. spellcheck suggestions)** | Nothing. No `context-menu` handler anywhere. The spellchecker itself is already on (§2.3). Correct registration point already exists at `main.ts:966` | no | **~1 day** | Copy/Paste, Select All, spelling fixes, "Open Link in Browser", Inspect Element. The absence is conspicuous in a CMS where people write prose. |
| 3 | **Stop / Restart a site** | `stopSite` already on the preload (`preload.mts:102`) and in `runner-api.ts`; handler is the one remaining `runner:sites:*` stub (`runner-ipc-stubs.ts:57`); `server.stop()` already used by `before-quit` and `handleDelete` | **no** | **~half a day** | Today you cannot stop a site without quitting the app or deleting the site. Restart is the natural pair (memory records that restart currently means killing the server pid by hand). |
| 4 | **Session / tab restore on launch** *(approved)* | Nothing persisted; state is two serializable fields (`App.hooks.ts:275-284`); stopped-site tabs already render fine | no (localStorage) | **~half a day** | Reopen where you left off. Cheap because it does not have to start servers. |
| 5 | **Window size / position memory** *(approved)* | Nothing; hardcoded 1360×900 (`main.ts:421,493`) | no | **3-4 h** | Every desktop app does this. Conspicuous by absence on a second monitor. |
| 6 | **Help menu with About / version / "Reveal logs" / Docs** | `{ role: "help", submenu: [] }` — literally empty (`site-history-menu.ts:105`) | no | **~2 h** | **There is currently no way to see which version is running.** That is also a prerequisite for auto-update being meaningful. |
| 7 | **"Reveal site folder in Finder" for humans** | The primitive exists, is guarded and is tested — but only the *assistant* can reach it (`sites-mcp-tools.ts:239-254`, via `bin/mcp-bridge.ts:86`). No human call site | yes | **3-4 h** | People want to get at their site's files. The tracked-row safety check is already written; this is wiring, not design. |
| 8 | **Drag a folder onto the Websites grid to add a site** | `folderPathsFromDataTransfer` (`folder-drop.ts:87`) and `getPathForFile` (`preload.mts:130`) both exist and are tested; the only `onDropCapture` in the app is on the unrendered chat pane (`App.tsx:1159`); `addSite` works end-to-end | yes | **~1 day** | Fastest way to adopt an existing site. **Needs a decision:** `addSite` takes no argument *on purpose* — main owns the folder dialog so the renderer never names a path (`preload.mts:87-91`). A path-taking verb weakens that; it should be argued explicitly, not assumed. |
| 9 | **Cmd+K quick open** *(approved)* | Nothing | yes | **1-2 days** | Jumping between sites without the mouse. Must be a menu accelerator (§2.6). |
| 10 | **Find in Page in the standalone site window** | Find menu exists but only in `sitesHomeMenuTemplate`; `buildAppMenu` has none (§2.1) | no | **1 h** | Only matters if the owner uses attach / own-server mode. |
| 11 | **Print / Export current view to PDF** | Nothing. `webContents.printToPDF` / `.print()` unused | yes | **3-4 h** | Printing a post or a preview. Modest but real for a CMS. |
| 12 | **Notification when a long agent run finishes** *(approved)* | Nothing, and it is cross-package (§2.4) | yes, guest preload | **2-3 days + an ownership decision** | Real value once agent runs are long. Wrong to start before §5.1 is resolved. |
| 13 | **Auto-update** *(approved)* | No `publish:` config, no `electron-updater`, notarization credential-gated | n/a | **Needs a decision — see §7** | |

---

## 5. Stubs, half-built things and unwired call sites

### 5.1 The fleet chat: ~1,000 lines of renderer against 19 throwing stubs

The largest unwired thing in the app, and it is deliberate and well documented — `App.tsx:174-190` explains that the chat FAB was *removed* because a disabled placeholder was compositing over the working per-site assistant's FAB and swallowing its clicks ("an unbuilt placeholder was blocking the built feature").

`WorkspaceChatPane` (`App.tsx:1140`) has **zero call sites**. Everything reachable only from it is therefore dead:

| Module | Lines |
|---|---|
| `src/renderer/workspace-chat-transport.ts` | 422 |
| `src/renderer/use-workspace-chat-pane.hooks.ts` | 175 |
| `src/contracts/workspace-chat.ts` | 125 |
| `src/renderer/folder-drop.ts` | 99 |
| `src/renderer/chat-attachments.ts` | 59 |
| `src/contracts/workspace-conversations.ts` | 52 |
| `src/contracts/chat-attachments.ts` | 35 |
| `src/contracts/runtime-inventory.ts` | 28 |
| `src/renderer/persistable-messages.ts` | 19 |
| `src/contracts/working-directory.ts` | 17 |
| **Total** | **1,031** |

…plus `WorkspaceChatPane` itself, plus their tests, plus 22 of the 37 methods on the `tovuRunner` preload bridge.

The matching main-process half does not exist. `registerRunnerIpcStubs` registers 19 throwing handlers (`runner-ipc-stubs.ts:49-78`) covering `runner:agents:*`, `runner:daemon:online`, `runner:sites:stop`, all five `workspace:chat:*`, all four `runner:working-directory:*`, `runner:chat-attachments:save`, and all six `workspace:conversations:*`. Grepping the whole app confirms no real handler competes for any of them.

Two push channels are subscribed with **no sender at all**: `workspace:chat:event` and `workspace:chat:navigate`. `onNavigate` is wired through `useRunnerNavigation` in the renderer and can never fire. `runner-ipc-stubs.ts:17-20` states this outright.

**Correction to the dispatch brief:** the brief says "`runner:sites:*` IPC is all phase-2 stubs (`runner-ipc-stubs.ts:88`)". That is now out of date — nine `runner:sites:*` channels have real handlers in `project-ipc.ts:758-766`, and `stop` is the only one left stubbed. `runner-ipc-stubs.ts:54-56` records the change.

### 5.2 `runner:sites:stop` — preload method with a throwing handler

`stopSite` is exposed on the bridge (`preload.mts:102`) and typed in `runner-api.ts`, but no renderer code calls it (a repo scan of every bridge method returns 1 occurrence for `stopSite` — the type declaration alone). The absence is honest rather than accidental: `SiteGrid.tsx:268-270` explains that a disabled "Stop" entry would imply it was coming. This is the cheapest thing in the audit to finish (§4 row 3).

### 5.3 `app.on("activate")` registered in the wrong branch

Covered in §1. `main.ts:1266`, inside `bootOwnServerMode()`, which the default boot path never reaches. This is the audit's cleanest "correct primitive, unwired call site".

### 5.4 Reveal-in-Finder is agent-only

`revealSiteFolder` (`sites-mcp-tools.ts:239`) validates `siteDir` against the tracked-projects registry before revealing, and is implemented by `spawn`ing the platform's reveal command with an argv array in the bridge process (`bin/mcp-bridge.ts:86`, `:213`). The shell's own UI never calls it — there is no "Reveal in Finder" in the card menu or the workspace bar. Same primitive, no human call site.

### 5.5 `folder-drop.ts` — a drop handler with no drop target that users can reach

`folderPathsFromDataTransfer` is a careful, well-tested module that solves a genuinely subtle problem (Electron's `webUtils.getPathForFile` returns `''` for `File` objects synthesized by `FileSystemEntry` expansion, so the path must be read before any library touches the event). Its only consumer is `captureFolderDrop` → `WorkspaceChatPane`'s `onDropCapture` (`App.tsx:1159`) — which never renders. **There is no folder drop target anywhere in the app a user can reach.** Wiring it to the Websites grid (§4 row 8) recovers the whole module.

### 5.6 Placeholders in the nav

- **Marketplace** is visible but deliberately inert — `sections.ts:131-143` explains it is signposted-but-grayed until agent plugins/themes ship.
- **Seven of thirteen sections are `hidden: true`** (`templates`, `tasks`, `deploy`, `diagnostics`, `api-keys`, `settings`, `account`) — registered so their `RunnerSectionId` contract and tool names survive, but unrendered.
- **`AppearancePage`** is marked `TEMPORARY SCAFFOLD` in `App.hooks.ts:215-218` — not a real `RunnerSectionId` page, just enough state to judge whether "Settings dropdown → its own page" feels right.

These are all labelled placeholders rather than unwired call sites. I am flagging them so they are not mistaken for gaps.

### 5.7 Not a gap: no single-instance lock

There is no `requestSingleInstanceLock()`. That looks like an omission but is not: `project-ipc.ts`'s `handleDelete` deliberately consults `readRegistry`/`liveForeignServers` so it can see a **sibling app instance's** open sites before erasing a directory. Multiple instances are an anticipated condition, and macOS will not double-launch a packaged bundle from Finder anyway. Leave it alone.

---

## 6. The cost model this codebase actually has

Use Cmd+F as the calibration point, since it is the most recent feature and the owner has confirmed it works.

`f058a8ab` touched **12 files** and added roughly **740 lines**: a new contract file, a main-process IPC module, a menu module, a preload addition, a renderer hook, CSS, a JSX type widening, and three test files. The follow-up `129f405f` then fixed a live-breaking bug: `dist/preload/preload.mjs` had never been rebuilt after the bridge gained four methods, so the sites-home window rendered a **permanent blank white page** on every load — not only on Cmd+F.

That gives the sorting rule for everything above:

> **A feature that adds a method to the preload costs roughly twice one that does not, and carries a window-blanking failure mode.**

`package.json` has `watch:renderer` but **no `watch:preload`**; `build:preload` is a separate script that only `npm run build` chains. A regression test now exists (`src/preload/preload-staleness.test.ts`), so the failure is caught by `npm test` rather than shipping — but the tax is structural, not a one-off.

Hence the ranking in §4. Recommendations 1, 2 and 3 are all **main-process or already-exposed-preload** work. That is most of why they are on top.

Second multiplier: **any keyboard shortcut must be a menu accelerator.** A `window` keydown listener cannot see a keypress made while focus is inside a project tab's `<webview>` guest. This is documented three separate times in the codebase (`find-menu.ts:5-9`, `site-history-menu.ts:5-8`, `App.hooks.ts:492`) and it is why History, Find, and any future Cmd+K each need their own menu module. Budget a module + test per shortcut, not a line in a `switch`.

Third: **UI work is not done until it has been looked at.** `129f405f` exists only because someone opened the window after `f058a8ab` and saw white.

---

## 7. What I would NOT build, and why

**Auto-update — defer it. It is on the approved list; I think it is premature.**
Three things are missing, and one of them is an owner decision, not an engineering task:
- No `publish:` block in `electron-builder.yml` and no `electron-updater` dependency. A release host has to be chosen (GitHub Releases, S3, generic) and, once chosen, the app is fetching and executing signed code from it forever.
- Signing is configured but notarization is credential-gated (`notarize` deliberately unset so it engages only when `APPLE_API_KEY*` is present). Unnotarized auto-updates are refused by Gatekeeper on the user's machine, which is a worse failure than no auto-update.
- **There is currently no way for a user to see which version they are running** — the Help menu is empty and there is no About panel. Ship §4 row 6 first; it costs 2 hours and it is a genuine prerequisite.

For a single-developer, single-user app, "download the new dmg" already works. I would revisit this the first time a second person installs Tovu. Flagging, not designing, per the brief.

**A tray icon / "keep running in the background".**
It fights the app's whole lifecycle model: windows own the site servers and `before-quit` drains them (`main.ts:1442-1464`). A tray icon that keeps the process alive after the last window closes changes what "quit" means for every running `tovu serve`. Do not consider it until recommendation 1 has settled what closing a window means.

**A second/global chat FAB or panel.**
`App.tsx:174-190` already litigated this, and the last attempt actively broke the working per-site assistant by compositing over its FAB. The main-process half does not exist (§5.1). The comment's own conclusion is right: when a workspace-level chat is built it should be a panel in the app's chrome, not a floating button — and that is a phase-2 project, not a feature to slot into this list.

**Reviving `WorkspaceChatPane` "since the code is already there".**
1,031 lines of renderer against 19 throwing stubs is not a wiring job; it is the Tovu-Runner phase-2 port. Recommending it as a feature would misrepresent its size by an order of magnitude.

**Global shortcuts (`globalShortcut`).**
System-wide key capture from a CMS is an imposition on the user's whole machine, and there is no workflow here that needs the app to respond while it is not focused.

**Deep links / custom protocol (`tovu://`).**
No external surface currently links into the desktop app, so this would be a mechanism with no callers — the exact shape of defect §5 is full of.

**Single-instance lock.** See §5.7. Not a gap.

---

## 8. Verification status

Verified from source or from the shipped `electron@43.6.0` binary:
- `viewMenu` role composition, `fileMenu` role composition, `editMenu` role composition, `zoomIn`/`zoomOut` implementation (extracted from `Electron Framework`).
- `spellcheck` default `true` (`electron.d.ts:19485-19488`) and never overridden in this app.
- Every IPC channel's real-vs-stub status, by reading `runner-ipc-stubs.ts`, `project-ipc.ts`, `find-in-page-ipc.ts` and grepping the app for competing registrations.
- Call-site counts for all 37 preload bridge methods.
- `app.on("activate")` / `window-all-closed` registration sites.
- Absence of `spellcheck`, `setZoomLevel`, `printToPDF`, `Notification`, `autoUpdater`, `Tray`, `globalShortcut`, `setBadge`, `context-menu`, `clipboard`, `powerMonitor`, `protocol.handle`, `setAsDefaultProtocolClient`, `openPath`, `showItemInFolder`, `setRepresentedFilename` across `main.ts` and `src/`.
- No `publish:` key in `electron-builder.yml`; no `electron-updater` in `package.json`.

**UNVERIFIED — needs the app open, which I was told not to do:**
1. Whether Cmd+`+` zooms a `<webview>` guest or only the host shell (§2.1).
2. Whether spellcheck squiggles actually render in the embedded admin (§2.3).
3. Electron's default permission behaviour for the Web `Notification` API in a guest (§2.4).

All three are 2-minute checks next time the app is in front of someone.
