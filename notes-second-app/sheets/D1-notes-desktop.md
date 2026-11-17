# D1: `examples/notes-desktop`, an Electron shell around notes-app by wiring

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 5:** the preload is built with D0's bundling step (one CJS file, `electron` external); `tsc` alone is not
enough with `sandbox: true`. The gate runs the emitted preload in a sandboxed window.

**Judge 24:** every use of `stop()` in this sheet is `shutdown({}, options)`. On readiness failure: keep the handle,
call `shutdown`, then show the dialog and quit. Tests: timeout, early exit, post-spawn failure → no child left
(`process.kill(pid, 0)` throws).

Node `fs` / lock / process bindings used by the shell come from `@jini-ai/node-adapters` (COMMON rule 5).
Landed check: `test -f packages/node-adapters/package.json`. Absent: STOP.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-d1-desktop`. Estimate: ~120k Sonnet.
Creates `examples/notes-desktop/**`; may move one file into `packages/desktop-host` (step 1).
Prerequisites: D0 and N5 merged; OD-N9 = sidecar.

## Goal

`electron .` opens a window on the notes admin, backed by a notes-app child process the shell started, and
quitting stops the child and keeps the data. No server code in the Electron main process; no copied glue.

## Inventory

```sh
wc -l examples/reference-desktop/src/*.ts examples/reference-desktop/src/*.cts          # main 150, security 89, electron-surfaces 102, preload 16
rg -n "^import" examples/reference-desktop/src/electron-surfaces.ts examples/reference-desktop/src/security.ts
rg -n "export (function|interface|type) " packages/desktop-host/src/electron/create-electron-desktop-host.ts packages/desktop-host/src/electron/index.ts | head -30
rg -n "export" packages/desktop-host/src/shutdown/*.ts packages/desktop-host/src/single-instance.ts packages/desktop-host/src/paths.ts | head -30
rg -n "listening on" examples/notes-app/src/main.ts                                      # the ready line: `listening on http://127.0.0.1:<port>`
node -e 'const j=require("./examples/reference-desktop/package.json");console.log(j.main,j.scripts,j.devDependencies)'
```

## Design

```
examples/notes-desktop/
  package.json   (@jini-example/notes-desktop; deps: @jini-ai/desktop-host, @jini-example/notes-app (workspace, for its path),
                  @jini-example/notes-web (workspace, built dist); dev: electron ^43.2, vitest ^2.1, typescript)
  src/main.ts            composition root (<= 150 lines; helpers below keep functions <= 50)
  src/server-child.ts    startNotesServer({ launcher, nodePath, entry, dbPath, webDir }, opts): launches
                         `node <notes-app>/src/main.ts --port 0 --db <userData>/notes.db --web <dist>` with
                         readyLine { pattern: /^listening on (http:\/\/127\.0\.0\.1:\d+)$/m, timeoutMs: 15000 };
                         returns { origin, stop() }
  src/channels.ts        defineChannels({ appInfo: { kind:'invoke', channel:'notes:app-info' } })   (one channel, to prove the kit)
  src/preload.cts        exposeBridge({ contextBridge, ipcRenderer, channels, globalName: '__notesDesktop' })
  src/trust.ts           isTrustedSender = main frame AND frame origin === server origin (pure function, tested)
```

Rules:
- Window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload = built CJS;
  `setWindowOpenHandler(() => ({ action: 'deny' }))`; navigation outside the server origin is prevented
  (use `@jini-ai/desktop-host/electron/navigation-policy` if it expresses this; say which export).
- The window loads `origin + '/'` only after `ready` resolved. On `ready` rejection: show a native error
  dialog with the log path and quit with a non-zero code. Never load a URL read from the environment.
- The origin guard in notes-app already admits only its own host:port; the renderer is same-origin with it.
- Quit: stop accepting windows, `stop()` the child (graceful signal, then the launcher's kill backstop),
  then exit; use `@jini-ai/desktop-host/shutdown` if it provides the drain (name the export). A second
  instance focuses the first (`single-instance`), never starts a second server on the same db.
- Electron surface bindings: **step 1 decides** (G18).

## Steps (commit each)

1. **G18.** `examples/reference-desktop/src/electron-surfaces.ts` binds Electron objects to desktop-host
   ports and every Electron host needs it. If it imports only types from `electron` and its functions take
   the Electron objects as arguments: `git mv` it to `packages/desktop-host/src/electron/bind-electron.ts`
   with **structural local types** (no `electron` import, package rule), export from
   `@jini-ai/desktop-host/electron`, re-point reference-desktop, changeset (minor), tests moved with it.
   If structural typing needs more than ~120 lines of type restatement: do not move; instead create
   `examples/notes-desktop/src/gaps/electron-surfaces.ts` as a copy with `// GAP: G18` and a `GAPS.json`
   budget (this one named file is exempt from COMMON's 10-line copy STOP), and report the reason.
2. Scaffold package, `tsc` build to `dist/`, `main` = `dist/main.js` (no raw-TS shipping).
3. Tests first, then `trust.ts`: main frame + exact origin -> true; sub-frame, other origin, `null` frame,
   origin prefix trick (`http://127.0.0.1:3000.evil.test`) -> false.
4. Tests first, then `server-child.ts` with a **fake `SidecarLauncherPort`**: builds the exact argv
   (`toEqual` literal), resolves `origin` from the ready line, rejects on timeout, `stop()` calls the handle's
   stop once and is idempotent; a ready line whose URL host is not `127.0.0.1` is rejected.
5. `channels.ts` + `preload.cts` + `handleTrusted` wiring; test with fake `ipcMain`: untrusted frame refused.
6. `main.ts` wiring; `README.md` (run: build notes-web, `pnpm --filter @jini-example/notes-desktop dev`).
7. **Real launch smoke** `scripts/smoke.mjs` (skipped with a clear message when no display/Electron binary:
   say so in the report): launch with a temp `userData`, wait for the window, read the page title via
   `webContents.executeJavaScript` from a test hook env var, create a note through `fetch` in the page,
   quit, relaunch, assert the note is listed and no `node` child of the first run is left
   (`process.kill(pid, 0)` throws).

## Acceptance

Example-desktop gates; desktop-host gates if step 1 moved the file; `rg -n "http\.createServer|better-sqlite3"
examples/notes-desktop/src` empty; `gaps` script (empty ledger or the one G18 row). Report whether step 7 ran.

## Not verified by the planner

`createElectronDesktopHost`'s required surfaces; the exports of `shutdown` and `navigation-policy`; whether
Electron 43's bundled Node can run notes-app's `.ts` directly (the child must be started with a **system or
bundled Node** given by `nodePath`, see `@jini-ai/desktop-host/node-toolchain`; D2 settles packaging).
