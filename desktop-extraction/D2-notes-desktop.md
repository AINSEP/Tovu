# D2: Notes desktop proof (`examples/notes-desktop`) and the packaging recipe (1 run, Jini only)

Inherits `COMMON.md`. Survey step 2. ~220k. Proof **T, then P and E** (this sheet exists to produce a packaged proof). Needs D0d (`./bridge` entry) and D1a (IPC kit). It does **not** need D3: it uses the launcher desktop-host already has.

**Purpose.** Show that a second desktop app needs only Jini: an Electron shell that starts `examples/notes-app` as a child, waits until it answers, shows it in a window, and stops it on quit; packaged with a native module. No Tovu file is touched.

## What exists (verified)

| Need | Owner today |
|---|---|
| Window, single instance, protocol, shell-open, host assembly | `@jini-ai/desktop-host/electron` `createElectronDesktopHost` (`create-electron-desktop-host.ts`, 35 lines; default `sidecarLauncher: createNodeSidecarLauncher({})`) |
| Launch a child, `waitUntilReady({ probe, isReady })`, `shutdown({ requestShutdown })` | `desktop-host/src/sidecar.ts` (202 lines) |
| Free port | `@jini-ai/sidecar` `port.ts` (113 lines) |
| Navigation and webview guest policy; find, zoom, spellcheck menus; window bounds | `desktop-host/electron/navigation-policy`, `electron/usability` |
| Quit drain | `desktop-host/shutdown` |
| Updates | `desktop-host/electron/updates` |
| Staged closure, asar checks, payload scan, isolation | `@jini-ai/devops/packaging/electron` |
| A loader-only example | `examples/reference-desktop` (`main.ts`, `security.ts`, `electron-surfaces.ts`, `preload.cts`) |
| The app to wrap | `examples/notes-app`: `node src/main.ts [--db path] [--port n]`, prints `listening on http://127.0.0.1:<port>`; depends on `better-sqlite3` (native) |

## Files

```
id: D2-notes-desktop
new (Jini): examples/notes-desktop/{package.json,tsconfig.json,README.md,electron-builder.yml}
            examples/notes-desktop/src/main.ts            composition root only (<= 150 lines)
            examples/notes-desktop/src/notes-child.ts     spawn plan + readiness + stop (ports in, no electron import)
            examples/notes-desktop/src/security.ts        navigation policy wiring (reuse reference-desktop's shape)
            examples/notes-desktop/src/preload.cts        D1a `createPreloadBridge`, bundled to CJS
            examples/notes-desktop/src/*.test.ts
            examples/notes-desktop/scripts/{stage.ts,smoke-packaged.ts}
            packages/devops/src/packaging/electron/README.md   recipe (only if the folder has none; else extend it)
no edit: packages/*/src (if you need one, STOP and report: the point of this run is that none is needed)
```

## Steps (each a commit, green alone)

1. **Decide how the child runs in a packaged app, in writing, before any code.** A packaged app has no system Node. Read how Tovu does it (`apps/desktop/src/tovu-server.ts` `buildCliSpawnPlan`, `resolveCliEntry`; `apps/desktop/src/packaged-paths.ts`; `packages/desktop-host/src/node-toolchain/`) and use the same mechanism. Two facts constrain the answer and neither was verified by the planner: (a) if the child runs on Electron's own Node (`ELECTRON_RUN_AS_NODE`), `better-sqlite3` must be built for Electron's ABI; (b) Node refuses to strip types from files under `node_modules`, so `notes-app`'s `.ts` sources must be staged **outside** `node_modules`, or built to `.js` first. Write the choice and its reason at the top of the README. If the only workable answer downloads or bundles a separate Node runtime: **STOP** and report (that is an owner decision, INDEX OD-6).
2. `notes-child.ts`, tests first. `startNotesChild(required: { launcher: SidecarLauncherPort; allocatePort; command; entry; dbPath; fetchStatus }, optional?: { readyTimeoutMs })` returns `{ url, stop }`. Readiness = HTTP GET of the allocated URL returns 200 through `waitUntilReady`. Tests with a fake launcher: passes `--port <allocated>` and `--db <path>` (fails when an argument is dropped or reordered); a child that exits before ready rejects with a plain-words error that carries the exit code in `details`; `stop` calls `shutdown` once even when called twice. **Windows:** the spawn plan uses `process.execPath`-style absolute paths, never a shell string; test with `platform: 'win32'` and a path containing a space.
3. `main.ts`: `createElectronDesktopHost` with the launcher passed **explicitly** (`sidecarLauncher: createNodeSidecarLauncher({})`), single instance, one window loading the child's URL, navigation policy (external links to the OS browser; the child's origin stays in-app), quit drain that stops the child, database under `app.getPath('userData')`. `sandbox: true`, `contextIsolation: true`, no `webviewTag`. The preload exposes one frozen bridge (`getVersion` via D1a's kit) to show the kit end to end; the main side registers it through `createTrustedIpc` with a predicate that accepts only the child's origin.
4. Packaging: `electron-builder.yml` as a **template**: `appId`, product name, publish feed, signing identity and entitlements are placeholders the README lists; entitlements start from `allow-jit` only (do not copy `disable-library-validation`). `scripts/stage.ts` uses `@jini-ai/devops/packaging/electron` for the staged closure and the native module. Build `dist/` with `tsc`; `main` points at `dist/main.js` (a second app cannot rely on shipping raw `.ts`).
5. `scripts/smoke-packaged.ts`: launch the `--dir` build, wait for the window's page to answer, create one note through the page's HTTP API, quit, relaunch, read the note back (proves the native module and the user-data path), assert no child process is left (by pid from the first launch).

## Security checks (class and location)

- Navigation: only the child's exact origin is in-app (`security.ts`); test with a same-host different-port URL (must leave).
- IPC: the handler refuses a frame whose URL is not the child's origin (D1a tests cover the kit; add one wiring test here).
- The child listens on loopback only: assert the spawn plan never passes a host flag, and that the notes app's listener address is `127.0.0.1` (read `notes-app/src/node-server.ts`; if it binds all interfaces, **STOP** and report: fix belongs to notes-app).

## Proof owed

T: `pnpm --filter @jini-example/notes-desktop... build && pnpm --filter @jini-example/notes-desktop test` (the example's `package.json` declares `"test": "vitest run"` in the commit that adds its first test; `test` alone is the shell builtin and always fails), `pnpm guard` (the example imports only `@jini-ai/*`, Electron and its own files). P: `electron-builder --dir` on macOS **and** Windows, then `scripts/smoke-packaged.ts` on each. E: one screenshot of the running window per OS. The report lists the total new line count against the survey's 600 to 1,100 estimate, and every place where a `packages/*` change would have made the example smaller (input for later sheets; do not make those changes here).
