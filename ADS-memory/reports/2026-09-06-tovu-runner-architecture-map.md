# How Tovu Runner works, and how it connects to Tovu

**Date:** 2026-09-06 · **Method:** read-only source read of both checkouts (no `index_repository`, no
processes started or stopped, every SQLite open `mode=ro`) · **Verified independently** by the
coordinator for the load-bearing claims (the `<webview>` choice, the half-done port).

---

## The one-line answer

**Runner never imports Tovu.** It shells out to Tovu's CLI as a child process. The only code the two
repos genuinely share at runtime is **Jini**, which both symlink from a common sibling checkout.

## 1. Two separate apps

| | Tovu (`apps/desktop`) | Tovu Runner |
|---|---|---|
| Location | `/Users/la/Programming/Tovu/apps/desktop` | `/Users/la/Programming/Tovu-Runner` (own checkout) |
| `userData` | `~/Library/Application Support/tovu-desktop` | `…/tovu-runner` |
| Registry | flat `desktop-projects.json` | SQLite `runner-db/.jini/app.sqlite`, table `runner_projects` |
| Provisioner | **none** | full (`project-provisioner.ts`) |

Nothing is shared between their user-data directories.

## 2. Runner's UI — the part being ported

- **Tab strip:** `TabStrip` (`Tovu-Runner/src/renderer/App.tsx:394-445`), one tab per open project
  plus a permanent "All" fleet tab. `useProjectTabs()` (`App.hooks.ts:220-239`) holds
  `openTabs`/`activeTab`; `activeTab === null` is the fleet view.
- **Embedded site view: Electron `<webview>`** — not `WebContentsView`, not `BrowserView`, not an
  iframe. `App.tsx:652-658` renders
  `<webview ref={webviewRef} key={reloadNonce} src={url} allowpopups />`.
  **Why (`src/main/main.ts:69-87`):** the host renderer holds the privileged `window.tovuRunner`
  bridge, which can create/start/stop/delete any project. A site must not execute in that process,
  and `<webview>` gets its own OS process. An iframe would render fine — Tovu sends no
  `X-Frame-Options` — so this is a **process-isolation** choice, not a framing-permission one.
- **Open workspaces are hidden with CSS, never unmounted** (`App.tsx:454-481`). A `<webview>` is a
  live browsing context; unmounting throws away the guest's route, scroll and form state and forces a
  full reboot on every tab switch.
- **Per-project bar** lives inside `ProjectWorkspace` (`App.tsx:551-606`): status dot, admin/site
  toggle, URL, Reload, Open in browser, expand. URL is
  `http://127.0.0.1:${port}${view === 'site' ? '/' : '/admin/'}` — it opens on **admin** by design.
- **Expand mode:** `useExpandedMode` (`App.hooks.ts:430-458`) hides TopNav, TabStrip and the chat FAB,
  leaving the workspace bar as the only way out. Escape also collapses, but only while focus is in
  Runner's own document — a `<webview>` does not bubble keydown out. Auto-collapses if the tab goes.
- **"Open in browser" rebuilds the URL server-side from the registry row** rather than trusting one
  from the renderer (`main.ts:355-367`). Worth preserving in any port.
- `allowpopups` on the tag is load-bearing: without it Electron's guest-view manager eats
  `window.open` before main sees it, breaking the admin's "View site ↗" anchor.
- **Guest navigation policy** (`main.ts:143-173`): same-origin `will-navigate` allowed; cross-origin
  and every `window.open`/`target=_blank` denied in the guest and handed to `shell.openExternal`, and
  only when the host:port matches a currently-supervised project (`isSupervisedSiteUrl`, `:118-123`).

## 3. Provisioning a site

`createProjectUnserialized` (`project-provisioner.ts:334-434`):

1. `id = randomUUID()`, `slug = allocateSlug(name)` (dedupes `-2`, `-3`, …),
   `installDir = instancesRoot/<id>--<slug>`.
2. `allocatePort()` (`:132-138`) scans **3001–4000**, skipping ports the registry claims and probing
   the OS with a throwaway `net.createServer`.
3. Row inserted with `status: 'provisioning'`.
4. **`tovu init <dir> --name <name>` is spawned as a child process** (`tovu-cli.ts:293-315`). Tovu's
   own CLI writes `config.json` and `.site-meta.json`; Runner only reads `.site-meta.json` back to
   capture `siteId`/`templateVersion`.
5. `tovu serve <dir> --port <port> [--workspace <id>]` (`tovu-cli.ts:349-370`) is launched and
   supervised through `@jini-ai/desktop-host`'s sidecar launcher; stdout/stderr go to
   `logsRoot/<projectId>/<generation>.log`.
6. Readiness polled with `GET http://127.0.0.1:<port>/` (20s) before the row flips to `running`.

**The port lives only in Runner's registry**, never in Tovu's site config — the live project's
`config.json` reads `{"name":"Harbor & Vine","domain":null,"port":null}`. It is passed as a CLI flag
on every launch.

Cleanup uses `ps`/`lsof` argv matching (`isProjectSidecar`, `:712-716`) so it only ever kills a pid it
can prove is its own — it checks the command line contains both `installDir` and `--port <port>`.

## 4. The Tovu ↔ Runner connection

`Tovu-Runner/package.json:26-36` lists only `@jini-ai/*`, `better-sqlite3` and `yaml`. **No `tovu`
dependency and no `node_modules/tovu` symlink.** `tovu-cli.ts:1-5` states it outright: Runner never
imports Tovu as a library; every interaction shells out to its CLI.

- **Dev:** `resolveTovuRoot()` returns `<appPath>/../Tovu` — a sibling checkout, which is this
  machine's real layout. It reads Tovu's `package.json` `bin.tovu` rather than hardcoding a path,
  specifically because a prior Tovu rename broke a hardcoded one.
- **Packaged:** `stage-tovu-runtime.mjs` copies Tovu's built `dist/` plus runtime `node_modules` into
  `Resources/tovu/`.
- **The child runs under system Node, never Electron's bundled Node** (`resolveNodeBinary`,
  `:189-223`) — `better-sqlite3` is compiled for system Node's ABI and would `ERR_DLOPEN_FAILED`.
- Runner injects env into that child: strips `ELECTRON_RUN_AS_NODE`/`PORT`/`TOVU_CONTENT_DB`/`TOVU_DB`,
  sets `TOVU_ADMIN_DIST` to Tovu's `apps/admin/dist`, and **mints a fresh `TOVU_AGENT_DAEMON_TOKEN`
  per spawn** — nothing else mints it for a site started outside `tovu serve`'s own `main()`, and
  without it every spawned site's `/api/agents` 401s.

**Shared at runtime: Jini only.** Both `Tovu/node_modules/@jini-ai/*` and
`Tovu-Runner/node_modules/@jini-ai/*` symlink the same sibling `Jini/packages/*`.

## 5. Jini's role inside Runner

- **Owns Runner's SQLite file.** `@jini-ai/sqlite`'s `openDatabase(dbDir)` (`project-registry.ts:21`)
  → `runner-db/.jini/app.sqlite`. Documented hazard (`:1-19`): `openDatabase` holds a **single
  module-level connection per process** and unconditionally migrates Jini's own fixed schema into
  whatever file it is given, with no opt-out. `openProjectRegistry` must therefore be the only caller
  in the process; Runner's own tables ride the same handle under a `runner_*` prefix.
- **Backs the fleet chat** — `@jini-ai/daemon` (run lifecycle + tool gate), `@jini-ai/agent-runtime`,
  `@jini-ai/http-kit`. These must be co-located in one process because `DelegatedToolBridge` calls
  `lifecycle.emit()` into the run's event log that the chat's SSE subscription watches.
- **Supplies the Electron shell** — `@jini-ai/desktop-host/electron`'s `createElectronDesktopHost`
  gives single-instance locking, window lifecycle, and the sidecar launcher.

## 6. The port into Tovu is already half-done — and the tabs were deliberately removed

`apps/desktop/src/runner-ipc-stubs.cjs:1-19`: **phase 1 brought the renderer, the shared contracts and
the preload across.** Phase 2 — Runner's `src/main/` (registry, provisioner, co-located Jini daemon,
fleet-chat IPC, conversation store) — has **not** landed.

Verified in Tovu's tree:
- `apps/desktop/src/renderer/` already holds `App.tsx`, `App.hooks.ts`, `ProjectGrid.tsx`;
  `apps/desktop/src/contracts/` holds the full `runner:*` contract set.
- `TabStrip` is defined at `renderer/App.tsx:348` and rendered at `:110`.
- **But Tovu's copy was converted to an N-BrowserWindow model.** `renderer/App.hooks.ts:208` — "N-BrowserWindow model … kept in the shape so `TabStrip` and …"; `:224` — "No `openProjectTab` here
  for exactly that reason: nothing calls it." `project-ipc.cjs:224` registers a real
  `RUNNER_PROJECT_CHANNELS.openWindow` handler.
- Real handlers today: `list`, `create`, `delete`, `openExternal`, `openWindow`. Everything else
  throws `RUNNER_MAIN_NOT_PORTED`.

**So restoring the single-window tab model is reversing a deliberate decision, not building a new
feature.** Whatever the N-window model was solving (process isolation around the privileged bridge is
the obvious candidate) must be understood before it is undone.

## 7. On-disk state, 2026-09-06

`~/Library/Application Support/tovu-runner/`: `chat-attachments/` (wiped every boot),
`fleet-workspace/`, `instances/` (one project), `logs/projects/<id>/` (32 generation logs),
`mcp-bridge/` (6 launcher scripts), `runner-db/.jini/app.sqlite`, and a stray **0-byte `runner.db`**
that no code found references.

One `runner_projects` row: `harbor-vine` / "Harbor & Vine", port 3001, `status=running`,
`tovu_workspace_id=workspace-local`, `last_pid=29393` — cross-checked with `lsof`, that pid really is
listening.

### Two Runner bugs found in passing (not fixed — Runner is a separate repo)

1. **`status=running` with `desired_state=stopped`.** `startProjectUnserialized`
   (`project-provisioner.ts:461-508`) never sets `desiredState` back to `'running'`; only
   `createProject` sets it once, and stop/shutdown set it to `'stopped'`. **Any project stopped once
   and restarted shows this mismatch permanently.**
2. **`mcp-bridge/` is never cleaned up.** Five `site-assistant-<uuid>.sh` launchers exist for one live
   project — four are orphans. `deleteProjectUnserialized` (`:551-600`) removes nothing there.

## Gaps

Not read: `runner-ipc-stubs.test.cjs` (said to parse the contract sources and fail on drift), and
nothing was found referencing the stray `runner.db`.
