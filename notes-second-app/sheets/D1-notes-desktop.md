# D1: `examples/notes-desktop`, an Electron shell around notes-app by wiring

## Revision 3 corrections (authoritative; the Design and Steps below were rewritten to match)

**Ownership (coordinator, 2026-11-16).** This plan owns `examples/notes-desktop` (the desktop plan's D2 is withdrawn).
It **consumes** the desktop plan's surfaces and builds none of them:
- Prerequisites: desktop **D0d** (`@jini-ai/desktop-host/bridge`) and desktop **D1a** (`@jini-ai/desktop-host/electron/ipc`,
  `.../electron/ipc/preload`) merged, plus N5 and OD-N9. Landed check (Jini, all three print a line):
  `node -e 'const e=require("./packages/desktop-host/package.json").exports;for(const k of ["./bridge","./electron/ipc","./electron/ipc/preload"])console.log(k, k in e)'`
  with `true` three times. Otherwise STOP.
- **No `@jini-ai/node-adapters` prerequisite** (Opus review: the sheet named no fs/lock/process binding). The old
  landed check `test -f packages/node-adapters/package.json` is deleted.
- The child launcher is **today's** `createNodeSidecarLauncher` with an HTTP readiness probe; no `readyLine` option
  (withdrawn with old D0). Desktop D3c1 later switches this example to `launchChild` by editing only the launcher
  binding line(s) in `src/main.ts`; keep that binding on one clearly named line.
- **No `--web` flag.** N2 (revision 2) serves the admin at **`/admin/`** through the app's `onUnmatched` hook, not a
  `--web` static route. The child is started with `--port <allocated> --db <path>` and whatever bundle-location
  argument N2 actually landed: read `examples/notes-app/src/main.ts` argv parsing at dispatch and use that exact
  name; if N2 landed none and the bundle is not found from the package location: STOP. The window loads
  `origin + '/admin/'`.

**Judge 5 (kept):** the sandboxed preload is bundled to one CJS file with `electron` external, exactly as desktop
D1a decision 7 does for `examples/reference-desktop` (`esbuild ... --bundle --platform=node --format=cjs
--external:electron`); `esbuild` is a declared devDependency of the example. The gate runs the emitted preload in a
sandboxed window and asserts the bundle has no `require(` other than `electron`.

**Judge 24 (kept):** every use of `stop()` in this sheet is `shutdown({}, options)`. On readiness failure: keep the
handle, call `shutdown`, then show the dialog and quit. Tests: timeout, early exit, post-spawn failure → no child left
(`process.kill(pid, 0)` throws).

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-d1-desktop`. Estimate: ~120k Sonnet.
Creates `examples/notes-desktop/**`; may move one file into `packages/desktop-host` (step 1).
Prerequisites: desktop D0d + D1a merged (desktop-extraction plan), N5 merged; OD-N9 = sidecar.

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
  package.json   (@jini-example/notes-desktop; deps: @jini-ai/desktop-host, @jini-ai/sidecar (port allocation),
                  @jini-example/notes-app (workspace, for its path), @jini-example/notes-web (workspace, built dist);
                  dev: electron ^43.2, esbuild, vitest ^2.1, typescript; scripts: build = tsc + the esbuild preload line, test = vitest run)
  src/main.ts            composition root (<= 150 lines; helpers below keep functions <= 50)
  src/server-child.ts    startNotesServer({ launcher, allocatePort, nodePath, entry, dbPath, fetchStatus }, opts):
                         allocates a loopback port, launches `node <notes-app>/src/main.ts --port <port> --db <userData>/notes.db`
                         (+ N2's bundle argument if it has one), readiness = `handle.waitUntilReady({ probe: () => fetchStatus(origin + '/admin/'),
                         isReady: (status) => status === 200 }, { timeoutMs: 15000 })`; returns { origin, shutdown }
  src/ipc.ts             main side: createTrustedIpc({ ipcMain, messages, reportRefusal }).handle({ channel: 'notes:app-info',
                         policy: 'main-frame', isTrustedSender: isNotesOrigin, handler })   (one channel, to prove the kit)
  src/preload.cts        createPreloadBridge({ ipcRenderer }) behind contextBridge.exposeInMainWorld('__notesDesktop', frozen object)
  src/trust.ts           isNotesOrigin({ senderUrl }) = exact origin === server origin (pure function, tested); the main-frame
                         part is the kit's 'main-frame' policy, not re-implemented here
```

Rules:
- Window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no `webviewTag`, preload = the bundled CJS;
  `setWindowOpenHandler(() => ({ action: 'deny' }))`; navigation outside the server origin is prevented
  (use `@jini-ai/desktop-host/electron/navigation-policy` if it expresses this; say which export).
- The window loads `origin + '/admin/'` only after readiness resolved. On readiness rejection: show a native error
  dialog with the log path and quit with a non-zero code. Never load a URL read from the environment.
- The child listens on loopback only: the spawn plan never passes a host flag; read `examples/notes-app/src/main.ts`
  (prints `listening on http://127.0.0.1:<port>`); if it binds all interfaces, STOP (fix belongs to notes-app).
- Quit: stop accepting windows, `shutdown({}, options)` the child (graceful, then the launcher's kill backstop), then
  exit; use `@jini-ai/desktop-host/shutdown` if it provides the drain (name the export). A second instance focuses the
  first (`single-instance`), never starts a second server on the same db.
- Electron surface bindings: **step 1 decides** (G18).

## Steps (commit each)

1. **G18.** `examples/reference-desktop/src/electron-surfaces.ts` binds Electron objects to desktop-host ports and every
   Electron host needs it. If it imports only types from `electron` and its functions take the Electron objects as
   arguments: `git mv` it to `packages/desktop-host/src/electron/bind-electron.ts` with **structural local types**
   (no `electron` import, package rule), export from `@jini-ai/desktop-host/electron`, re-point reference-desktop,
   changeset (minor), tests moved with it, in one commit. `packages/desktop-host/**` is the desktop plan's lane: land
   this step only in a wave where no desktop-plan run edits `packages/desktop-host/package.json` or `src/electron/index.ts`
   (X4). If structural typing needs more than ~120 lines of type restatement: do not move; create
   `examples/notes-desktop/src/gaps/electron-surfaces.ts` as a copy with `// GAP: G18` and a `GAPS.json` budget (this
   one named file is exempt from COMMON's 10-line copy STOP), and report the reason.
2. Scaffold package, `tsc` build to `dist/` + the esbuild preload line, `main` = `dist/main.js` (no raw-TS shipping).
3. Tests first, then `trust.ts`: exact origin -> true; other origin, other port on the same host, origin prefix trick
   (`http://127.0.0.1:3000.evil.test`) -> false. Plus one wiring test through the kit with a fake `ipcMain`: a subframe
   with the right URL is refused (`'main-frame'`), a null frame is refused, the refusal reaches `reportRefusal`.
4. Tests first, then `server-child.ts` with a **fake `SidecarLauncherPort`**: builds the exact argv (`toEqual` literal;
   fails when `--port` or `--db` is dropped or reordered), readiness resolves only on a 200 from `/admin/`, rejects on
   timeout and on early exit (plain words, exit code in `details`), `shutdown` is called once even when stop is called
   twice; **Windows:** absolute paths, never a shell string; test with `platform: 'win32'` and a path containing a space.
5. `ipc.ts` + `preload.cts`; the bundle test (only `require("electron")` in the emitted preload).
6. `main.ts` wiring; `README.md` (run: build notes-web, `pnpm --filter @jini-example/notes-desktop dev`).
7. **Real launch smoke** `scripts/smoke.mjs` (skipped with a clear message when no display/Electron binary: say so in
   the report): launch with a temp `userData`, wait for the window, create a note through `fetch` in the page, quit,
   relaunch, assert the note is listed and no `node` child of the first run is left (`process.kill(pid, 0)` throws).

## Acceptance

Example-desktop gates; desktop-host gates if step 1 moved the file; `rg -n "http\.createServer|better-sqlite3"
examples/notes-desktop/src` empty; `gaps` script (empty ledger or the one G18 row). Report whether step 7 ran.

## Not verified by the planner

`createElectronDesktopHost`'s required surfaces; the exports of `shutdown` and `navigation-policy`; whether
Electron 43's bundled Node can run notes-app's `.ts` directly (the child must be started with a **system or
bundled Node** given by `nodePath`, see `@jini-ai/desktop-host/node-toolchain`; D2 settles packaging, OD-N11, which is
the same question as the desktop plan's OD-6).
