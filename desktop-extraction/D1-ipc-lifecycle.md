# D1: typed, sender-checked IPC kit; app-shell lifecycle; update lifecycle (5 runs)

Inherits `COMMON.md`. Survey step 1. Order inside: D1a -> D1b1 -> D1b2; D1c1 and D1c2 are independent of D1a/b and of each other, except that every one of them edits `apps/desktop/src/main/index.ts` (one at a time).

## Measured (reading tree)

| Fact | Count | How |
|---|---|---|
| `ipcMain.handle/on` registrations, non-test | **57** in 13 files: `project-ipc.ts` 23, `workspace-chat-ipc.ts` 18, `site-view-preference.ts` 4, `site-theme-preview-ipc.ts` 2, `app-version-ipc.ts` 2, and 1 each in `update-check-now.ts`, `speech/speech-ipc.ts`, `runner-ipc-stubs.ts`, `resources-ipc.ts`, `product-telemetry-ipc.ts`, `owner-store-ipc.ts`, `import-handoff-ipc.ts`, `find-in-page-ipc.ts` | `rg -n "ipcMain\.(handle\|on\|once)\(" src -g '!*.test.*'` |
| Channel string literals in `src/contracts/*` | **70** (`runner:sites` 26, `workspace:chat` 8, `runner:owner-store` 6, `workspace:conversations` 6, `runner:site-view-preference` 5, `runner:find` 4, `runner:working-directory` 4, 11 others) | see INDEX section 2 |
| Preload: `ipcRenderer.invoke/send` call sites / `subscribe` uses | 60 / 7 (`src/preload/preload.mts`, 225 lines) | `rg -c` |
| Bridges exposed | 6 globals: `tovuRunner`, `tovuOwnerStore`, `tovuTelemetry` (ESM preload, sites-home window, unsandboxed), `tovuVoice`, `tovuFiles`, `tovuImport` (`speech/preload-speech.cts`, sandboxed site-admin windows; also read by `apps/admin`) | `rg -n exposeInMainWorld src` |
| Files that check the sender today | 8: `speech-ipc`, `import-handoff-ipc`, `owner-store-ipc`, `product-telemetry-ipc` (main frame **and** page URL), `resources-ipc`, `workspace-chat-ipc`, `find-in-page-ipc`, `main/index.ts`; in `project-ipc.ts` only `SITE_PRESENCE_CHANNEL` and `keepRunning` read `sender`; **21 of its 23 handlers take `_event`** | `rg -n "isTrustedSender\|senderFrame\|event\.sender" src -g '!*.test.*'` |
| Existing Jini owner of the check | `desktop-host/src/speech/speech-ipc.ts:22` `assertTrustedSender` (private; refuses a null `senderFrame`). No general kit (`rg -n "ipcMain" packages/desktop-host/src` shows speech and find-in-page only). | |

---

## D1a: `desktop-host` IPC kit (Jini; ~150k; proof T)

```
id: D1a-ipc-kit
new: packages/desktop-host/src/electron/ipc/trusted-sender.ts   (the one sender decision)
     packages/desktop-host/src/electron/ipc/trusted-ipc.ts      (main side)
     packages/desktop-host/src/electron/ipc/preload-bridge.ts   (preload side; ZERO imports)
edit: packages/desktop-host/src/speech/speech-ipc.ts            (uses trusted-sender.ts; its private copy is deleted)
      packages/desktop-host/package.json                        (exports + jini.entries: "./electron/ipc" -> trusted-ipc.js, "./electron/ipc/preload" -> preload-bridge.js; both "desktop")
      examples/reference-desktop/src/{main.ts,preload.cts,security.ts}  (adopts the kit)
```
**Contract (no `electron` import; Electron objects arrive as structural ports):**
```ts
// trusted-sender.ts
export interface IpcSenderEvent { senderFrame?: { url: string; parent?: unknown | null } | null; sender?: { getURL(): string } }
export type SenderPolicy = 'frame' | 'main-frame-and-page';
/** Refuses unless the sender frame URL passes. A null or missing frame never passes. */
export function isTrustedIpcSender(required: { event: IpcSenderEvent | undefined; isTrustedSender: (r: { senderUrl: string }) => boolean }, optional?: { policy?: SenderPolicy }): boolean
// trusted-ipc.ts
export interface IpcMainPort {              // Electron's own positional shape (Electron-dictated, exempt from object args)
  handle(channel: string, listener: (event: IpcSenderEvent, ...args: unknown[]) => unknown): void
  on(channel: string, listener: (event: IpcSenderEvent, ...args: unknown[]) => void): unknown
  removeHandler(channel: string): void
  removeListener(channel: string, listener: (...args: never[]) => void): unknown }
export function createTrustedIpc(required: { ipcMain: IpcMainPort; isTrustedSender: (r: { senderUrl: string }) => boolean; messages: { senderRefused: string; missingSenderGuard: string } }, optional?: { policy?: SenderPolicy }):
  { handle(r: { channel: string; handler: (r: { event: IpcSenderEvent; args: readonly unknown[] }) => unknown }): void
    on(r: { channel: string; listener: (r: { event: IpcSenderEvent; args: readonly unknown[] }) => void }): void
    dispose(): void }
// preload-bridge.ts
export function createPreloadBridge(required: { ipcRenderer: { invoke(channel: string, ...a: unknown[]): Promise<unknown>; send(channel: string, ...a: unknown[]): void; on(c: string, l: (...a: unknown[]) => void): unknown; removeListener(c: string, l: (...a: unknown[]) => void): unknown } }):
  { invoke(r: { channel: string; args?: readonly unknown[] }): Promise<unknown>; send(r: { channel: string; args?: readonly unknown[] }): void
    subscribe<P>(r: { channel: string; listener: (payload: P) => void }): () => void }   // never forwards the event object
```
Decisions:
1. **`handle` refuses by throwing** `messages.senderRefused` (the renderer's `invoke` rejects); **`on` refuses by dropping silently** (a `send` has no reply; this matches `product-telemetry-ipc.ts` today). Two contracts, kept apart (lesson 7).
2. A missing `isTrustedSender` throws `missingSenderGuard` at construction: fail closed, as speech does today. There is no trust-all default and no option to turn the check off.
3. `'main-frame-and-page'` = frame has no parent **and** both the frame URL and `event.sender.getURL()` pass (today's telemetry rule). Default `'frame'` = today's speech rule.
4. `dispose()` removes exactly the handlers and listeners this instance registered, in reverse order.
5. `preload-bridge.ts` has **no import at all**: a sandboxed preload can only `require('electron')`, so hosts bundle this file into their CJS preload (Tovu already bundles the speech bridge with esbuild). Test: the source has no `import`/`require`.
6. `speech-ipc.ts` keeps its object-shaped `SpeechIpcPort` and its messages; only `assertTrustedSender` is replaced by `isTrustedIpcSender` + throw. Its existing tests must pass unchanged.

**Tests first** (`electron/ipc/__tests__/`, fakes of `IpcMainPort`): refuses null frame; refuses when the predicate is false; refuses a child frame under `'main-frame-and-page'` even when the URL passes; refuses when the page URL fails but the frame URL passes (same policy); `handle` rejects with the plain message and **the handler is not called** (assert a spy; fails when the gate is removed); `on` drops without calling; missing guard throws at construction; `dispose` leaves the fake with zero registrations; `subscribe` passes the payload only and its teardown removes the same listener.
**Not in scope:** channel naming, schema validation of payloads (each handler keeps its own validation).

---

## D1b1 and D1b2: Tovu adopts the kit (Tovu; ~130k each; proof T, then **E** and **P**)

This is a **security hardening**, not a pure move: 21 `runner:sites` handlers and others gain a sender check they do not have. It needs the owner's yes (INDEX OD-2) because a wrong predicate locks a real window out.

**Step 0 (both runs), before any edit: the channel table.** Produce `cloud-results/desktop-extraction/D1b-channels.tsv`: channel constant, literal, registering file:line, kind (handle/on), sender check today (none / frame / main-frame-and-page / reads sender for another purpose), which preload exposes it, which renderer or admin file calls it (`rg -n "tovuRunner|tovuOwnerStore|tovuTelemetry|tovuVoice|tovuFiles|tovuImport" apps/desktop/src/renderer apps/admin/src`). The 57 registrations and 70 literals must reconcile; say which literals are push channels (main to renderer) and so have no registration.

**Predicates (class: IPC trusted-sender; location: `main/index.ts` wiring and each `register*Ipc`).** `main/index.ts:658` `isShellPage` accepts the sites-home page **and every supervised site origin** (it is the speech rule: site admin pages may use the microphone). That is too wide for `runner:*` and `workspace:*`, which can create and delete projects. Add in `window-navigation-policy.ts` (already the owner of `isShellPageUrl`) a narrower `isSitesHomePageUrl` (renderer file URL or the attach URL; **not** supervised sites) and use:

| Channel group | Predicate | Policy |
|---|---|---|
| `tovu:speech`, `tovu:import`, files (the sandboxed admin preload's channels) | `isShellPage` (unchanged) | `frame` |
| `tovu:product-telemetry` | `isShellPage` (unchanged) | `main-frame-and-page` (unchanged) |
| everything exposed only by `preload.mts` (`runner:*`, `workspace:*`) | `isSitesHomePage` (new, narrower) | `frame` |

**STOP** if the table shows any `runner:*`/`workspace:*` channel called from a page that is not the sites-home renderer (for example from `apps/admin` inside a site window): report the channel; do not widen the predicate.

**Binding trap already present in the inputs (lesson 12).** `registerSpeechIpc` and `registerImportHandoffIpc` take `isTrustedSender: (required: { senderUrl: string }) => boolean`. `refactor/desktop-args` wires `({ senderUrl }) => isShellPage({ raw: senderUrl })`; `fix/desktop-waveb` and merge-a still have `(raw) => isShellPage({ raw })`, which passes the **object** where the URL string is expected. `main/index.ts` is one of the 13 conflicted files. First check of this sheet: `rg -n "isTrustedSender: \(raw\)" apps/desktop/src/main/index.ts` prints nothing; if it prints, BASE was resolved to the wrong side: **STOP**.

**Tests first (characterization; node:test; one file per run).** For each registration: build the real `register*` function over a fake `ipcMain`, call the handler with (a) a sites-home frame, (b) a supervised-site frame, (c) a foreign frame, (d) a null frame. Record today's result on the old code and commit it green. Then the adoption commit changes **only** the rows the table says change (non-shell and null senders become refusals), and the diff of that test file is the reviewable statement of the hardening. A handler must not run its effect when refused (assert the injected port spy has zero calls).

- **D1b1:** `project-ipc.ts` (23) + `site-view-preference.ts` (4) + `site-theme-preview-ipc.ts` (2). `project-ipc.ts`'s registration block is lines ~1528 to 1635 of a 1,730-line file listed in `size-debt.json`: do not grow the file; the registration function takes the `createTrustedIpc` result instead of `ipcMain` and the 23 lines change shape only. D4a1 splits this file later and assumes this run is merged.
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

What changes in the moved code (everything else moves verbatim, with comments):
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
3. The skip gate (`desktopUpdaterSkipReason`: dev launch, updates off, unsupported install) moves with the lifecycle; the reasons are a typed union, not strings compared by callers.
4. `desktop-updater.ts` has a `size-debt.json` key: delete it when the file is deleted. `devops` gets no new dependency (`update-manifest-merge.ts` has no imports).
5. Comments at lines 116 and 127 ("the operator may turn updates off while the import is resolving") describe a real race on the async port: keep the guard and the comments; test: preference flips to off between `loadNativeUpdater` resolving and the listener binding, no check runs.

Tests move with the files (`desktop-updater`, `update-check-now`, `update-manifest-merge` tests; count before/after). Proof P: a packaged build performs a manual "check for updates" against the real feed without `ERR_MODULE_NOT_FOUND` (the static import must be inside the asar closure: `verify-package` + a manual check on macOS and Windows), and `merge-latest-mac.ts` produces a byte-identical manifest for the last release's two inputs.
