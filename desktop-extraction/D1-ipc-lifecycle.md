# D1: typed, sender-checked IPC kit; app-shell lifecycle; update lifecycle (5 runs)

Inherits `COMMON.md`. Survey step 1. Order inside: D1a -> D1b1 -> D1b2; D1c1 and D1c2 are independent of D1a/b and of each other, except that every one of them edits `apps/desktop/src/main/index.ts` (one at a time).

## Measured (reading tree)

| Fact | Count | How |
|---|---|---|
| `ipcMain.handle/on` registrations, non-test | **57** in 13 files: `project-ipc.ts` 23, `workspace-chat-ipc.ts` 18, `site-view-preference.ts` 4, `site-theme-preview-ipc.ts` 2, `app-version-ipc.ts` 2, and 1 each in `update-check-now.ts`, `speech/speech-ipc.ts`, `runner-ipc-stubs.ts`, `resources-ipc.ts`, `product-telemetry-ipc.ts`, `owner-store-ipc.ts`, `import-handoff-ipc.ts`, `find-in-page-ipc.ts` | command M1 below |
| Channel string literals in `src/contracts/*` | **70** (`runner:sites` 26, `workspace:chat` 8, `runner:owner-store` 6, `workspace:conversations` 6, `runner:site-view-preference` 5, `runner:find` 4, `runner:working-directory` 4, 11 others) | see INDEX section 2 |
| Preload: `ipcRenderer.invoke/send` call sites / `subscribe` uses | 60 / 7 (`src/preload/preload.mts`, 225 lines) | `rg -c` |
| Bridges exposed | 6 globals: `tovuRunner`, `tovuOwnerStore`, `tovuTelemetry` (ESM preload, sites-home window, unsandboxed), `tovuVoice`, `tovuFiles`, `tovuImport` (`speech/preload-speech.cts`, sandboxed site-admin windows; also read by `apps/admin`) | `rg -n exposeInMainWorld src` |
| Files that check the sender today | 8: `speech-ipc`, `import-handoff-ipc`, `owner-store-ipc`, `product-telemetry-ipc` (main frame **and** page URL), `resources-ipc`, `workspace-chat-ipc`, `find-in-page-ipc`, `main/index.ts`; in `project-ipc.ts` only `SITE_PRESENCE_CHANNEL` and `keepRunning` read `sender`; **21 of its 23 handlers take `_event`** | command M2 below |
| Existing Jini owner of the check | `desktop-host/src/speech/speech-ipc.ts:22` `assertTrustedSender` (private; refuses a null `senderFrame`). No general kit (`rg -n "ipcMain" packages/desktop-host/src` shows speech and find-in-page only). | |

```bash
# from apps/desktop
rg -n "ipcMain\.(handle|on|once)\(" src -g '!*.test.*'                    # M1
rg -n "isTrustedSender|senderFrame|event\.sender" src -g '!*.test.*'       # M2
```

---

## D1a: `desktop-host` IPC kit (Jini; ~160k; proof T) — **this plan is the one owner of the kit** (revision 3)

Coordinator decision (2026-11-16): one owner per shared surface. The IPC kit lives at **`./electron/ipc`** (main side) and **`./electron/ipc/preload`** (preload side). Neither name exists today (merge-final `packages/desktop-host/package.json` exports: `./electron`, `./electron/navigation-policy`, `./electron/updates`, `./electron/usability`, `./speech`, ...); `./electron/ipc` follows the existing `./electron/*` naming, so the notes plan's `./ipc` (`defineChannels`/`exposeBridge`/`handleTrusted`) is withdrawn and the notes plan consumes this kit.

```
id: D1a-ipc-kit
new: packages/desktop-host/src/electron/ipc/trusted-sender.ts   (the one sender decision)
     packages/desktop-host/src/electron/ipc/trusted-ipc.ts      (main side)
     packages/desktop-host/src/electron/ipc/preload-bridge.ts   (preload side; ZERO imports)
edit: packages/desktop-host/src/speech/speech-ipc.ts            (uses trusted-sender.ts; its private copy is deleted)
      packages/desktop-host/package.json                        (exports + jini.entries: "./electron/ipc" -> trusted-ipc.js, "./electron/ipc/preload" -> preload-bridge.js; both "desktop")
      examples/reference-desktop/src/{main.ts,preload.cts,security.ts}  (adopts the kit)
      examples/reference-desktop/package.json                   (preload bundling step, below)
```
**Contract (revision 3: a `'main-frame'` policy; the policy is a required field of every registration; refusals are reported; no `electron` import, Electron objects arrive as structural ports):**
```ts
// trusted-sender.ts
export interface IpcSenderEvent { senderFrame?: { url: string; parent?: unknown | null } | null; sender?: { getURL(): string } }
export type SenderPolicy = 'frame' | 'main-frame' | 'main-frame-and-page';
export type SenderPredicate = (r: { senderUrl: string }) => boolean;
/** Refuses unless the event passes `policy` under `isTrustedSender`. A null or missing frame never passes. No default policy. */
export function isTrustedIpcSender(required: { event: IpcSenderEvent | undefined; isTrustedSender: SenderPredicate; policy: SenderPolicy }): boolean
// trusted-ipc.ts
export interface IpcMainPort {              // Electron's own positional shape (Electron-dictated, exempt from object args)
  handle(channel: string, listener: (event: IpcSenderEvent, ...args: unknown[]) => unknown): void
  on(channel: string, listener: (event: IpcSenderEvent, ...args: unknown[]) => void): unknown
  removeHandler(channel: string): void
  removeListener(channel: string, listener: (...args: never[]) => void): unknown }
export interface IpcRefusal { channel: string; kind: 'handle' | 'on'; policy: SenderPolicy; senderUrl: string | null }   // never the payload
export function createTrustedIpc(required: {
    ipcMain: IpcMainPort;
    messages: { senderRefused: string; missingSenderGuard: string; missingPolicy: string };
    reportRefusal: (r: IpcRefusal) => void }):
  { handle(r: { channel: string; policy: SenderPolicy; isTrustedSender: SenderPredicate; handler: (r: { event: IpcSenderEvent; args: readonly unknown[] }) => unknown }): void
    on(r: { channel: string; policy: SenderPolicy; isTrustedSender: SenderPredicate; listener: (r: { event: IpcSenderEvent; args: readonly unknown[] }) => void }): void
    dispose(): void }
// preload-bridge.ts
export function createPreloadBridge(required: { ipcRenderer: { invoke(channel: string, ...a: unknown[]): Promise<unknown>; send(channel: string, ...a: unknown[]): void; on(c: string, l: (...a: unknown[]) => void): unknown; removeListener(c: string, l: (...a: unknown[]) => void): unknown } }):
  { invoke(r: { channel: string; args?: readonly unknown[] }): Promise<unknown>; send(r: { channel: string; args?: readonly unknown[] }): void
    subscribe<P>(r: { channel: string; listener: (payload: P) => void }): () => void }   // never forwards the event object
```
Decisions:
1. **`handle` refuses by throwing** `messages.senderRefused` (the renderer's `invoke` rejects). **`on` refuses by not calling the listener** (a `send` has no reply). Both call `reportRefusal` once with the channel, kind, policy and the sender URL (or `null`); never the payload. Today's `product-telemetry-ipc.ts` drops a refused `send` silently; the owner rule is that errors are never swallowed, so the kit reports and Tovu binds `reportRefusal` to its diagnostics log (class and location only). Two contracts, kept apart (lesson 7).
2. Policy and predicate are **per registration** (a `handle`/`on` call), because one Tovu module registers channels with different gates (`project-ipc.ts`: presence vs `keepRunning` vs the rest). A registration with a missing `policy` throws `messages.missingPolicy`, with a missing `isTrustedSender` throws `messages.missingSenderGuard`, both at registration time: fail closed, as speech does today. There is no trust-all predicate, no default policy and no option to turn the check off.
3. Three policies, kept apart because today's handlers use three different gates (round-1 judge blocker 1): `'frame'` = the sender frame's URL passes (today's speech rule); `'main-frame'` = the sender frame exists, **has no parent**, and its URL passes (today's rule in `resources-ipc.ts:25-28` and `owner-store-ipc.ts:210-216`: "a subframe can share the file URL but is not the sites home document"); `'main-frame-and-page'` = main frame **and** both the frame URL and `event.sender.getURL()` pass (today's telemetry rule). A null `senderFrame` is refused under every policy.
4. **Parity path for handlers with no gate today** (the 21 `runner:sites` handlers that take `_event`, and any other row the D1b1 inventory marks "none"). The kit has no trust-all, so those rows are **not registered through the kit** in the parity commit: they stay on the raw `ipcMain` port, unchanged, and a characterization test pins the exact list of raw channels (adding or removing one fails it). Each moves onto the kit (`'main-frame'` + `isSitesHomePageUrl`) only in an OD-2 hardening commit after the owner's yes. Parity and "no trust-all" therefore both hold.
5. `dispose()` removes exactly the handlers and listeners this instance registered, in reverse order.
6. `preload-bridge.ts` has **no import at all**. A sandboxed preload can only `require('electron')`, so every sandboxed host **bundles** its preload: Tovu already bundles the speech preload with esbuild (`apps/desktop/package.json` `build:preload`). Test: the source has no `import`/`require`.
7. **`examples/reference-desktop` gets a bundling step (revision 3).** Its window is `sandbox: true` (`examples/reference-desktop/src/main.ts:59`) and it loads `preload.cjs` from the built main's directory (`:31`); today `preload.cts` only does `require('electron')` (`preload.cts:1`) and its `build` is `tsc -p tsconfig.json`. Once the preload imports the kit, `tsc` output would `require('@jini-ai/desktop-host/electron/ipc/preload')`, which a sandboxed preload cannot load. In the same commit: `build` becomes `tsc -p tsconfig.json && esbuild src/preload.cts --bundle --platform=node --format=cjs --external:electron --outfile=<the directory tsc emits main.js into>/preload.cjs`, and `esbuild` is declared in the example's `devDependencies` (it is already in the Jini lockfile through `agent-plugins`, `analytics`, `cookie-consent`, `provider-plugins`). Test (`examples/reference-desktop/src/__tests__/preload-bundle.test.ts`, runs after build): the built `preload.cjs` contains no `require(` call other than `require("electron")`/`require('electron')`. Red when the esbuild step is removed.
8. `speech-ipc.ts` keeps its object-shaped `SpeechIpcPort` and its messages; only `assertTrustedSender` is replaced by `isTrustedIpcSender({ ..., policy: 'frame' })` + throw. Its existing tests must pass unchanged.

**Tests first** (`electron/ipc/__tests__/`, fakes of `IpcMainPort`): refuses null frame under each of the three policies; refuses when the predicate is false; `'main-frame'` refuses a child frame whose URL passes and serves the main frame; `'main-frame-and-page'` refuses a child frame even when the URL passes, and refuses when the page URL fails but the frame URL passes; `'frame'` serves a child frame whose URL passes (so `'frame'` is not silently `'main-frame'`); `handle` rejects with the plain message and **the handler is not called** (assert a spy; fails when the gate is removed); `on` refused: the listener is not called **and `reportRefusal` is called once** with the channel and no payload (fails when the report is removed); a registration without `policy` throws `missingPolicy`; without `isTrustedSender` throws `missingSenderGuard`; `dispose` leaves the fake with zero registrations; `subscribe` passes the payload only and its teardown removes the same listener.
**Not in scope:** channel naming, schema validation of payloads (each handler keeps its own validation).

---

## D1b1 and D1b2: Tovu adopts the kit (Tovu; ~130k each; proof T, then **E** and **P**)

**Adoption is at parity (revision 3).** Every registration keeps exactly the gate it has today: rows with a gate move onto the kit with the policy that reproduces it; rows with no gate today stay on the raw `ipcMain` port (D1a decision 4). No sender becomes refused in D1b1 or D1b2. The hardening (adding a sender check to the ungated rows and narrowing `runner:*`/`workspace:*` to the sites-home page) is **not** part of these runs: it is INDEX OD-2, one commit per channel group after the owner's yes, each with its own E proof.

**Step 0 (both runs), before any edit: the channel table.** Produce `cloud-results/desktop-extraction/D1b-channels.tsv`: channel constant, literal, registering file:line, kind (handle/on), sender check today (none / frame / main-frame-and-page / reads sender for another purpose), which preload exposes it, which renderer or admin file calls it (`rg -n "tovuRunner|tovuOwnerStore|tovuTelemetry|tovuVoice|tovuFiles|tovuImport" apps/desktop/src/renderer apps/admin/src`). The 57 registrations and 70 literals must reconcile; say which literals are push channels (main to renderer) and so have no registration.

**Predicates (class: IPC trusted-sender; location: `main/index.ts` wiring and each `register*Ipc`).** `main/index.ts` `isShellPage` accepts the sites-home page **and every supervised site origin** (it is the speech rule: site admin pages may use the microphone). For the OD-2 hardening commits only (not D1b1/D1b2), `window-navigation-policy.ts` (already the owner of `isShellPageUrl`) gets a narrower `isSitesHomePageUrl` (renderer file URL or the attach URL; **not** supervised sites).

**Step 0 of D1b1 (before any adoption): the gate inventory.** One row per registration (57 at planning: `rg -n "ipcMain\.(handle|on)\(" apps/desktop/src -g '!*.test.*'`), written into the report: channel | file:line | the **complete** predicate today, including any wrapper the host puts around it at the call site (`rg -n "isShellPage|isTrustedSender|allowed:" apps/desktop/src/main -g '!*.test.*'`) | frame condition today (none / frame URL / main frame only / main frame + page) | policy after. **Adoption keeps each row's gate exactly**; a row may only become stricter through OD-2, listed separately and landed as its own commit after the parity commit. Rows whose gate today is "none" are listed as **raw** (they stay on `ipcMain`, D1a decision 4).
| Channel group | Predicate (complete, as wired today) | Policy |
|---|---|---|
| `tovu:speech`, `tovu:import`, files (the sandboxed admin preload's channels) | `isShellPage` | `frame` |
| `tovu:product-telemetry` | **`isShellPage({ url }) && url.startsWith("file:")`** — the host wrapper at `main/updates/product-telemetry-boot.ts:115-117` ("speech's shared predicate also admits supervised admin origins; product IPC is shell-only"); round 1 called this "`isShellPage` unchanged", which would have admitted supervised site origins | `main-frame-and-page` |
| resource monitor (`RUNNER_RESOURCES_GET_CHANNEL`, `resources-ipc.ts`) and every owner-store / shared-keys channel (`OWNER_STORE_CHANNELS`, `owner-store-ipc.ts`) | the `allowed` predicate each is wired with today | **`main-frame`** |
| the remaining `runner:*` / `workspace:*` channels | whatever step 0 finds per channel | the policy that reproduces today's gate; a row with **no** gate today (the 21 `runner:sites` handlers that take `_event`, at planning) stays **raw** on `ipcMain` and is pinned by the raw-channel test; it reaches the kit only via OD-2 |
Tests first, on today's handlers (GREEN), each RED when its one restriction is removed, GREEN again on the kit:
| # | Asserts | Fails when |
|---|---|---|
| G1 | resource monitor: a **subframe whose URL equals the sites-home URL** is refused; the main frame is served | the kit registers it as `frame` |
| G2 | one owner-store channel per action: same-URL subframe refused | same |
| G3 | telemetry: an event from a **supervised site origin** (passes `isShellPage`, not `file:`) is dropped; from the `file:` shell page it is recorded | the `file:` wrapper is lost in the move |
| G4 | telemetry: main frame whose page URL fails but frame URL passes is dropped | `main-frame-and-page` degrades to `main-frame` |
| G5 | a null `senderFrame` is refused for all three policies | a policy treats "no frame" as trusted |

**STOP** if the table shows any `runner:*`/`workspace:*` channel called from a page that is not the sites-home renderer (for example from `apps/admin` inside a site window): report the channel; do not widen the predicate.

**Binding trap already present in the inputs (lesson 12).** `registerSpeechIpc` and `registerImportHandoffIpc` take `isTrustedSender: (required: { senderUrl: string }) => boolean`. `refactor/desktop-args` wires `({ senderUrl }) => isShellPage({ raw: senderUrl })`; `fix/desktop-waveb` and merge-a still have `(raw) => isShellPage({ raw })`, which passes the **object** where the URL string is expected. `main/index.ts` is one of the 13 conflicted files. First check of this sheet: `rg -n "isTrustedSender: \(raw\)" apps/desktop/src/main/index.ts` prints nothing; if it prints, BASE was resolved to the wrong side: **STOP**.

**Tests first (characterization; node:test; one file per run).** For each registration: build the real `register*` function over a fake `ipcMain`, call the handler with (a) a sites-home frame, (b) a supervised-site frame, (c) a foreign frame, (d) a null frame. Record today's result on the old code and commit it green. The adoption commit must leave this file's expectations **unchanged** (parity): a changed expectation in D1b1/D1b2 is a STOP. A later OD-2 commit changes only its own rows (non-sites-home and null senders become refusals), and the diff of that test file is the reviewable statement of that hardening. A handler must not run its effect when refused (assert the injected port spy has zero calls). Plus one test that lists the raw (ungated) channels and fails when one is added or removed.

- **D1b1:** `project-ipc.ts` (23) + `site-view-preference.ts` (4) + `site-theme-preview-ipc.ts` (2). `project-ipc.ts`'s registration block is lines ~1528 to 1635 of a 1,730-line file listed in `size-debt.json`: do not grow the file; the registration function takes the `createTrustedIpc` result **and** the raw `ipcMain` port (for the ungated rows); the gated lines change shape only and the raw lines do not change. D4a1 splits this file later and assumes this run is merged.
- **D1b2:** `workspace-chat-ipc.ts` (18) + the nine single-registration files + `preload.mts` (its local `subscribe` at line 75 is replaced by the kit's; the 60 call sites keep their channel constants; the bridge objects stay frozen) + `speech/preload-speech.cts` if it has its own subscribe. Preload build: `tsconfig.preload.json` emits native ESM for the unsandboxed sites-home preload, so the kit import resolves from `node_modules` there; the `.cts` preload is bundled by the `build:preload` esbuild line, which already inlines `@jini-ai/desktop-host/speech`. `runner-ipc-stubs.ts` registers "not ported" answers: they also go through the kit.

**Proof owed.** E: in the running app, sites home (list, start, stop, rename, delete, add folder, chat send, find, zoom, settings), a site admin window (voice input, file drop, import hand-off). P: `smoke-bridge` on macOS and Windows (it exercises the preload bridge in a packaged app).

---

## D1c1: quit ask, move-to-Applications, history menu to `desktop-host` (Jini + Tovu pair; ~180k; proof T, then E)

```
id: D1c1-app-shell
moves:
  apps/desktop/src/main/windows/last-window-quit.ts (173) -> packages/desktop-host/src/electron/app-shell/last-window-quit.ts
  apps/desktop/src/move-to-applications.ts (241)          -> packages/desktop-host/src/electron/app-shell/move-to-applications.ts
  apps/desktop/src/site-history-menu.ts (151): `siteHistoryMenu`, `sendSiteHistoryCommand` and their types -> packages/desktop-host/src/electron/usability/history-menu.ts
                                              `viewMenu`, `sitesHomeMenuTemplate`, `SITE_HISTORY_CHANNEL` STAY in Tovu (they compose Tovu's menus and name Tovu's channel)
exports: "./electron/app-shell/last-window-quit", "./electron/app-shell/move-to-applications" (desktop); history menu joins the existing "./electron/usability" entry
```
Inventory first: exports and consumers of the three files, **and source-reading tests** (`rg -l "last-window-quit|move-to-applications|site-history-menu" apps/desktop/src -g '*.test.*'`; `last-window-quit.test.ts` holds a regular expression over `main/index.ts` source for `trackWindow:`; `site-history-menu.test.ts` reads the preload source). Each such test is updated in the commit that changes the text it reads.

**Split before moving (round-1 judge finding 17; S9).** Two functions are over 50 lines today and may not arrive in Jini that way: `createLastWindowQuitPrompt` (`main/windows/last-window-quit.ts:107-170`, 64 lines) and, for D1c2, `createDesktopUpdater` (`main/updates/desktop-updater.ts:81-193`, 113 lines). First commit of the run, in Tovu, under the existing tests (one refactor type): list the closure's state cells (`sed -n '<span>p' <file> | rg -n "\b(let|const) \w+ = "`) and the inner functions that read or write each; extract (a) pure decisions that touch no cell into module functions taking `(required, optional)`, (b) each event handler into a named function that receives the state object explicitly. State keeps **one owner** (the factory); extracted functions get the cell through an argument, never a second closure. Check: `npm run check:size && npm run check:complexity` no worse, tests unchanged and green. **STOP** if a cell is written by more than two extracted functions or the extraction changes the order of two side effects: that needs a design, report the cell.
What changes in the moved code (everything else moves with comments, after the split above):
1. `last-window-quit.ts` imports `type MessageBoxOptions` from `electron` and copy from `desktop-i18n.ts`. In Jini: a local structural `QuitDialogOptions` type (fields actually used) and a required `copy` argument (`{ title, message({ running }), detail, quit, cancel }`); Tovu passes its `desktop-i18n` strings. `quitSiteCounts` counts "sites": rename the generic notion to `children` in Jini; Tovu's wrapper maps sites to children. The generic file must not say "site".
2. `move-to-applications.ts` imports `readJsonFile`/`writeJsonFileAtomic` from Tovu's `durable-json-file.ts` (a shim over `@jini-ai/platform/fs/durable-json`). desktop-host may not import platform: take a required `declineStore: { read(): string | null; write(r: { version: string }): void }` port; Tovu builds it from `durable-json-file.ts` exactly as today (same file name `moveDeclineFilePath`, same JSON shape: test pins the bytes written). `MOVE_PROMPT` copy becomes a required argument. macOS-only by nature: `movePromptSkipReason` must return the existing skip reason on `win32` and `linux` (test with injected platform).
3. Lesson 3 check: none of the three reads a module-level value lazily (verify: `rg -n "^(let|const) " <file>` and read each); if one does, keep it a function argument evaluated at call time, not at construction.

Tests: the three existing desktop test files move to Jini (converted from `node:test` to vitest: assertions unchanged, count reported) with fakes for the new ports; Tovu keeps one wiring test per file proving its port bindings (declined version round-trips through the real durable file in a temp dir; quit dialog receives Tovu's copy).
Proof E: close the last window with a site running (prompt text, both buttons, Cmd+Q path); first launch from a disk image shows the move prompt once and remembers a decline.

## D1c2: update lifecycle and manifest merge (Jini + Tovu pair; ~170k; proof T, then **P**)

```
id: D1c2-updates
moves:
  apps/desktop/src/main/updates/desktop-updater.ts (193) -> packages/desktop-host/src/electron/updates/updater-lifecycle.ts
  apps/desktop/src/update-check-now.ts (176): `createUpdateCheckNow`, `updateCheckNotice`, `plainUpdateError`, types -> packages/desktop-host/src/electron/updates/check-now.ts
                                            `registerUpdateCheckIpc` STAYS (Tovu channel `RUNNER_APP_CHECK_FOR_UPDATES_CHANNEL`; registered through D1a's kit if D1b2 has landed)
  apps/desktop/src/update-manifest-merge.ts (105)        -> packages/devops/src/packaging/electron/update-manifest-merge.ts
stays: `electron-updater` STATIC import and `loadNativeUpdater` in main/index.ts; apps/desktop/scripts/merge-latest-mac.ts (calls the devops function); settings-menu.ts, native-notices.ts (Tovu copy)
```
1. **Re-read Jini first.** merge-b rewrote `electron/updates/auto-update-controller.ts` (about 285 changed lines). `desktop-updater.ts` binds to it through the Tovu shims `auto-update-controller.ts` (49) and `update-policy.ts` (21). Compare the controller's current deps type with what `createDesktopUpdater` passes, field by field and by position (lesson 12); write the comparison into the report before moving.
2. **No lazy import.** The Jini code receives `loadNativeUpdater: () => Promise<NativeUpdater>` as a required port and never names `electron-updater`. Tovu's `main/index.ts` keeps `import electronUpdater from "electron-updater"` at the top (declared dependency) and passes `async () => electronUpdater.autoUpdater`. `rg -n "import\(.electron-updater" apps/desktop/src` must print nothing at the end; `main-updater-wiring.test.ts` (a source-reading test, one of the 13 conflicted files) must assert the static form.
3. The skip gate **stays in Tovu** (round-1 judge finding 16): `desktopUpdaterSkipReason` reads the Tovu installation switch (`TOVU_DESKTOP_DISABLE_UPDATER`, `desktop-updater.ts:62-71`) and is host policy. The Jini lifecycle takes `skipReason: () => SkipReason | null` as a required port (typed union declared in Jini; the host maps its env and install facts onto it). The manual-check copy in `update-check-now.ts:53-56,128-130` is Tovu product text: it stays in Tovu and reaches the moved functions as a required `messages` argument. Test: with a fake `skipReason` returning each union member the lifecycle never calls the updater; no Jini file contains `TOVU_` (`rg -n "TOVU_|Tovu" <moved files>` prints nothing).
4. `desktop-updater.ts` has a `size-debt.json` key: delete it when the file is deleted. `devops` gets no new dependency (`update-manifest-merge.ts` has no imports).
5. Comments at lines 116 and 127 ("the operator may turn updates off while the import is resolving") describe a real race on the async port: keep the guard and the comments; test: preference flips to off between `loadNativeUpdater` resolving and the listener binding, no check runs.

Tests move with the files (`desktop-updater`, `update-check-now`, `update-manifest-merge` tests; count before/after). Proof P: a packaged build performs a manual "check for updates" against the real feed without `ERR_MODULE_NOT_FOUND` (the static import must be inside the asar closure: `verify-package` + a manual check on macOS and Windows), and `merge-latest-mac.ts` produces a byte-identical manifest for the last release's two inputs.
